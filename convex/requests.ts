import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { DatabaseWriter, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { logEvent, assertPhase, assertSubmitWindowOpen } from "./events";

/** Transfer compute between two roles via table.computeStock (single source of truth).
 *  Used for direct transfers only (not escrow). game.labs[].computeStock is a derived
 *  cache synced at pipeline resolution time. */
async function transferCompute(
  db: DatabaseWriter,
  gameId: Id<"games">,
  giverRoleId: string,
  requesterRoleId: string,
  amount: number,
) {
  const [giverTable, requesterTable] = await Promise.all([
    db.query("tables").withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", giverRoleId)).first(),
    db.query("tables").withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", requesterRoleId)).first(),
  ]);
  if (giverTable) {
    await db.patch(giverTable._id, {
      computeStock: Math.max(0, (giverTable.computeStock ?? 0) - amount),
    });
  }
  if (requesterTable) {
    await db.patch(requesterTable._id, {
      computeStock: Math.max(0, (requesterTable.computeStock ?? 0) + amount),
    });
  }
}

/** Find an existing request matching the key fields, or insert a new one. Returns the request ID. */
export async function findOrUpsertRequest(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    roundNumber: number;
    fromRoleId: string;
    fromRoleName: string;
    toRoleId: string;
    toRoleName: string;
    actionId: string;
    actionText: string;
    requestType: "endorsement" | "compute";
    computeAmount?: number;
  },
): Promise<Id<"requests">> {
  const existing = await ctx.db
    .query("requests")
    .withIndex("by_from_role", (q) =>
      q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber).eq("fromRoleId", args.fromRoleId)
    )
    .collect();
  const match = existing.find((request) =>
    request.toRoleId === args.toRoleId &&
    request.requestType === args.requestType &&
    request.actionId === args.actionId
  );
  if (match) {
    await ctx.db.patch(match._id, {
      fromRoleName: args.fromRoleName,
      toRoleName: args.toRoleName,
      actionId: args.actionId,
      actionText: args.actionText, // Update text in case action was edited
      computeAmount: args.computeAmount,
      status: "pending",
    });
    return match._id;
  }
  return await ctx.db.insert("requests", { ...args, status: "pending" });
}

export const directTransfer = mutation({
  args: {
    gameId: v.id("games"),
    tableId: v.id("tables"),
    fromRoleId: v.string(),
    toRoleId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await assertPhase(ctx, args.gameId, ["submit"], "direct transfer");
    assertSubmitWindowOpen(game);

    // Validate table ownership
    const senderTable = await ctx.db.get(args.tableId);
    if (!senderTable) throw new Error("Table not found");
    if (senderTable.gameId !== args.gameId) throw new Error("Table does not belong to this game");
    if (senderTable.roleId !== args.fromRoleId) throw new Error("Role does not match table assignment");

    if (args.amount <= 0) {
      throw new Error("Transfer amount must be positive");
    }
    if (args.fromRoleId === args.toRoleId) {
      throw new Error("Cannot transfer compute to yourself");
    }

    const available = senderTable.computeStock ?? 0;
    if (available < args.amount) {
      throw new Error(`Insufficient compute: have ${available}u, tried to send ${args.amount}u`);
    }

    // Validate recipient exists and is enabled
    const recipientTable = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.toRoleId))
      .first();
    if (!recipientTable || !recipientTable.enabled) {
      throw new Error("Recipient role not found or not enabled");
    }

    await transferCompute(ctx.db, args.gameId, args.fromRoleId, args.toRoleId, args.amount);
    await logEvent(ctx, args.gameId, "compute_direct_transfer", args.fromRoleId, {
      toRoleId: args.toRoleId,
      amount: args.amount,
    });
  },
});

export const getByGameAndRound = query({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("requests")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      )
      .collect();
  },
});

export const getForRole = query({
  args: { gameId: v.id("games"), roundNumber: v.number(), roleId: v.string() },
  handler: async (ctx, args) => {
    // Two targeted index queries instead of one broad scan of all requests
    const [toMe, fromMe] = await Promise.all([
      ctx.db.query("requests")
        .withIndex("by_to_role", (q) =>
          q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber).eq("toRoleId", args.roleId))
        .collect(),
      ctx.db.query("requests")
        .withIndex("by_from_role", (q) =>
          q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber).eq("fromRoleId", args.roleId))
        .collect(),
    ]);
    // Deduplicate (a request where from===to would appear in both, though self-requests are blocked)
    const seen = new Set(toMe.map((r) => r._id));
    return [...toMe, ...fromMe.filter((r) => !seen.has(r._id))];
  },
});

export const send = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    fromRoleId: v.string(),
    fromRoleName: v.string(),
    toRoleId: v.string(),
    toRoleName: v.string(),
    actionId: v.string(),
    actionText: v.string(),
    requestType: v.union(
      v.literal("endorsement"),
      v.literal("compute")
    ),
    computeAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const game = await assertPhase(ctx, args.gameId, ["submit"], "send request");
    assertSubmitWindowOpen(game);

    // Verify the sender's table exists and is enabled
    const senderTable = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.fromRoleId))
      .first();
    if (!senderTable || !senderTable.enabled) {
      throw new Error("Sender role not found or not enabled in this game");
    }

    // Reject self-endorsement / self-requests
    if (args.fromRoleId === args.toRoleId) {
      throw new Error("Cannot send a request to yourself");
    }

    // Validate compute amount is positive
    if (args.computeAmount !== undefined && args.computeAmount <= 0) {
      throw new Error("Compute amount must be positive");
    }
    const id = await findOrUpsertRequest(ctx, args);
    await logEvent(ctx, args.gameId, "request_sent", args.fromRoleId, {
      toRoleId: args.toRoleId,
      requestType: args.requestType,
      computeAmount: args.computeAmount,
      actionText: args.actionText,
    });

    // Auto-respond if target is AI/NPC
    await triggerAutoResponse(ctx, args.gameId, args.roundNumber, args.toRoleId, id);

    return id;
  },
});

// Cancel a request (sender can withdraw it at any time during submit phase)
export const cancel = mutation({
  args: {
    requestId: v.id("requests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return;

    await assertPhase(ctx, request.gameId, ["submit"], "cancel requests");

    // If compute was escrowed (accepted compute request), refund to the target
    if (
      request.status === "accepted" &&
      request.requestType === "compute" &&
      request.computeAmount
    ) {
      const targetTable = await ctx.db.query("tables")
        .withIndex("by_game_and_role", (q) => q.eq("gameId", request.gameId).eq("roleId", request.toRoleId))
        .first();
      if (targetTable) {
        await ctx.db.patch(targetTable._id, {
          computeStock: (targetTable.computeStock ?? 0) + request.computeAmount,
        });
      }
    }

    await ctx.db.delete(args.requestId);
    await logEvent(ctx, request.gameId, "request_cancelled", request.fromRoleId, {
      toRoleId: request.toRoleId,
      actionText: request.actionText,
    });
  },
});

// Respond to a request — can change response at any time during submit phase
export const respond = mutation({
  args: {
    proposalId: v.id("requests"),
    status: v.union(v.literal("accepted"), v.literal("declined"), v.literal("pending")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return;

    const game = await assertPhase(ctx, proposal.gameId, ["submit"], "respond to requests");
    assertSubmitWindowOpen(game);

    // Allow changing response (pending→accepted, pending→declined, accepted↔declined)
    const oldStatus = proposal.status;

    // Handle compute for endorsement-type requests (no compute transfer)
    if (proposal.requestType === "endorsement") {
      await ctx.db.patch(args.proposalId, { status: args.status });
      await logEvent(ctx, proposal.gameId, `request_${args.status}`, proposal.toRoleId, {
        fromRoleId: proposal.fromRoleId,
        requestType: proposal.requestType,
        actionText: proposal.actionText,
        previousStatus: oldStatus,
      });
      return;
    }

    // For compute requests: escrow from target on accept, refund on decline.
    // The actual transfer to the requester happens in rollAllInternal on action success.
    if (
      proposal.requestType === "compute" &&
      proposal.computeAmount
    ) {
      // If was accepted and now declining — refund the escrowed compute to the target
      if (oldStatus === "accepted" && args.status === "declined") {
        const targetTable = await ctx.db.query("tables")
          .withIndex("by_game_and_role", (q) => q.eq("gameId", proposal.gameId).eq("roleId", proposal.toRoleId))
          .first();
        if (targetTable) {
          await ctx.db.patch(targetTable._id, {
            computeStock: (targetTable.computeStock ?? 0) + proposal.computeAmount,
          });
        }
      }

      // If accepting (from pending or declined) — escrow from target (deduct, don't credit requester yet)
      if (args.status === "accepted" && oldStatus !== "accepted") {
        const targetTable = await ctx.db.query("tables")
          .withIndex("by_game_and_role", (q) => q.eq("gameId", proposal.gameId).eq("roleId", proposal.toRoleId))
          .first();
        const available = targetTable?.computeStock ?? 0;
        if (available < proposal.computeAmount) {
          await ctx.db.patch(args.proposalId, { status: "declined" });
          await logEvent(ctx, proposal.gameId, "request_declined_insufficient", proposal.toRoleId, {
            fromRoleId: proposal.fromRoleId,
            requested: proposal.computeAmount,
            available,
          });
          return;
        }
        await ctx.db.patch(targetTable!._id, {
          computeStock: available - proposal.computeAmount,
        });
      }
    }

    await ctx.db.patch(args.proposalId, { status: args.status });
    await logEvent(ctx, proposal.gameId, `request_${args.status}`, proposal.toRoleId, {
      fromRoleId: proposal.fromRoleId,
      requestType: proposal.requestType,
      computeAmount: proposal.computeAmount,
      actionText: proposal.actionText,
      previousStatus: oldStatus,
    });
  },
});

export const getByGameAndRoundInternal = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("requests")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
      .collect();
  },
});

export const sendInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    fromRoleId: v.string(),
    fromRoleName: v.string(),
    toRoleId: v.string(),
    toRoleName: v.string(),
    actionId: v.string(),
    actionText: v.string(),
    requestType: v.union(v.literal("endorsement"), v.literal("compute")),
    computeAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Reject self-endorsement / self-requests
    if (args.fromRoleId === args.toRoleId) {
      throw new Error("Cannot send a request to yourself");
    }

    const requestId = await findOrUpsertRequest(ctx, args);

    // Auto-respond if target is AI/NPC (reactive — no waiting for scheduled poll)
    await triggerAutoResponse(ctx, args.gameId, args.roundNumber, args.toRoleId, requestId);
  },
});

const NPC_ACCEPT_RATE = 0.7;

export async function triggerAutoResponse(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
  toRoleId: string,
  requestId: Id<"requests">,
  prefetchedTable?: { _id: Id<"tables">; enabled: boolean; controlMode: string; computeStock?: number },
) {
  const targetTable = prefetchedTable ?? await ctx.db
    .query("tables")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", toRoleId))
    .first();
  if (!targetTable || !targetTable.enabled || targetTable.controlMode === "human") return;

  if (targetTable.controlMode === "npc") {
    const accept = Math.random() < NPC_ACCEPT_RATE;
    if (accept) {
      // Escrow compute from target on acceptance (transfer happens on action success in rollAllInternal)
      const request = await ctx.db.get(requestId);
      if (request?.requestType === "compute" && request.computeAmount) {
        const available = targetTable.computeStock ?? 0;
        if (available >= request.computeAmount) {
          await ctx.db.patch(targetTable._id, { computeStock: available - request.computeAmount });
        } else {
          await ctx.db.patch(requestId, { status: "declined" });
          return;
        }
      }
    }
    await ctx.db.patch(requestId, { status: accept ? "accepted" : "declined" });
  } else {
    // AI: schedule LLM response immediately (runs in action context)
    await ctx.scheduler.runAfter(0, internal.aiProposals.respond, {
      gameId,
      roundNumber,
      roleId: toRoleId,
    });
  }
}

export const directTransferInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    fromRoleId: v.string(),
    toRoleId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || args.fromRoleId === args.toRoleId) return;

    // Validate sender has enough compute
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const senderTable = tables.find((t) => t.roleId === args.fromRoleId && t.enabled);
    if (!senderTable) return;
    const available = senderTable.computeStock ?? 0;
    if (available < args.amount) return;

    // Validate recipient exists
    const recipientTable = tables.find((t) => t.roleId === args.toRoleId && t.enabled);
    if (!recipientTable) return;

    await transferCompute(ctx.db, args.gameId, args.fromRoleId, args.toRoleId, args.amount);
    await logEvent(ctx, args.gameId, "compute_direct_transfer", args.fromRoleId, {
      toRoleId: args.toRoleId,
      amount: args.amount,
      source: "ai_generated",
    });
  },
});

export const respondInternal = internalMutation({
  args: {
    proposalId: v.id("requests"),
    status: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.status !== "pending") return;

    // Escrow compute from target on acceptance (transfer happens on action success in rollAllInternal)
    if (args.status === "accepted" && proposal.requestType === "compute" && proposal.computeAmount) {
      const targetTable = await ctx.db.query("tables")
        .withIndex("by_game_and_role", (q) => q.eq("gameId", proposal.gameId).eq("roleId", proposal.toRoleId))
        .first();
      const available = targetTable?.computeStock ?? 0;
      if (available < proposal.computeAmount) {
        await ctx.db.patch(args.proposalId, { status: "declined" });
        return;
      }
      await ctx.db.patch(targetTable!._id, { computeStock: available - proposal.computeAmount });
    }

    await ctx.db.patch(args.proposalId, { status: args.status });
  },
});
