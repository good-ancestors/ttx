import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { DatabaseWriter, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { logEvent, assertPhase, assertSubmitWindowOpen } from "./events";

/** Transfer compute between two roles' tables. Positive amount = giver→requester, negative = reverse. */
async function transferCompute(
  db: DatabaseWriter,
  gameId: Id<"games">,
  giverRoleId: string,
  requesterRoleId: string,
  amount: number,
) {
  const tables = await db
    .query("tables")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  const giverTable = tables.find((t) => t.roleId === giverRoleId);
  const requesterTable = tables.find((t) => t.roleId === requesterRoleId);
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
async function findOrUpsertRequest(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    roundNumber: number;
    fromRoleId: string;
    fromRoleName: string;
    toRoleId: string;
    toRoleName: string;
    actionText: string;
    requestType: "endorsement" | "compute";
    computeAmount?: number;
  },
): Promise<Id<"requests">> {
  const existing = await ctx.db
    .query("requests")
    .withIndex("by_game_and_round", (q) =>
      q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
    )
    .collect();
  const match = existing.find((request) =>
    request.fromRoleId === args.fromRoleId &&
    request.toRoleId === args.toRoleId &&
    request.actionText === args.actionText &&
    request.requestType === args.requestType
  );
  if (match) {
    await ctx.db.patch(match._id, {
      fromRoleName: args.fromRoleName,
      toRoleName: args.toRoleName,
      computeAmount: args.computeAmount,
      status: "pending",
    });
    return match._id;
  }
  return await ctx.db.insert("requests", { ...args, status: "pending" });
}

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
    return await ctx.db
      .query("requests")
      .withIndex("by_to_role", (q) =>
        q
          .eq("gameId", args.gameId)
          .eq("roundNumber", args.roundNumber)
          .eq("toRoleId", args.roleId)
      )
      .collect();
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
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const senderTable = tables.find((t) => t.roleId === args.fromRoleId);
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

    // If compute was already transferred (accepted compute request), reverse it
    if (
      request.status === "accepted" &&
      request.requestType === "compute" &&
      request.computeAmount
    ) {
      await transferCompute(ctx.db, request.gameId, request.toRoleId, request.fromRoleId, -request.computeAmount);
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

    // For compute requests: handle transfer/reversal
    if (
      proposal.requestType === "compute" &&
      proposal.computeAmount
    ) {
      // If was accepted and now declining — reverse the transfer
      if (oldStatus === "accepted" && args.status === "declined") {
        await transferCompute(ctx.db, proposal.gameId, proposal.toRoleId, proposal.fromRoleId, -proposal.computeAmount);
      }

      // If accepting (from pending or declined) — do the transfer
      if (args.status === "accepted" && oldStatus !== "accepted") {
        // Check giver has enough compute
        const tables = await ctx.db
          .query("tables")
          .withIndex("by_game", (q) => q.eq("gameId", proposal.gameId))
          .collect();
        const giverTable = tables.find((t) => t.roleId === proposal.toRoleId);
        const available = giverTable?.computeStock ?? 0;
        if (available < proposal.computeAmount) {
          await ctx.db.patch(args.proposalId, { status: "declined" });
          await logEvent(ctx, proposal.gameId, "request_declined_insufficient", proposal.toRoleId, {
            fromRoleId: proposal.fromRoleId,
            requested: proposal.computeAmount,
            available,
          });
          return;
        }
        await transferCompute(ctx.db, proposal.gameId, proposal.toRoleId, proposal.fromRoleId, proposal.computeAmount);
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

async function triggerAutoResponse(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
  toRoleId: string,
  requestId: Id<"requests">,
) {
  const tables = await ctx.db
    .query("tables")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  const targetTable = tables.find((t) => t.roleId === toRoleId && t.enabled);
  if (!targetTable || targetTable.controlMode === "human") return;

  if (targetTable.controlMode === "npc") {
    const accept = Math.random() < NPC_ACCEPT_RATE;
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

export const respondInternal = internalMutation({
  args: {
    proposalId: v.id("requests"),
    status: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.status !== "pending") return;
    await ctx.db.patch(args.proposalId, { status: args.status });
  },
});
