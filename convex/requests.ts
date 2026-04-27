import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { logEvent, assertPhase, assertSubmitWindowOpen } from "./events";
import { emitPair, cancelPendingForAction, getAvailableStock } from "./computeLedger";

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
  return await ctx.db.insert("requests", {
    gameId: args.gameId,
    roundNumber: args.roundNumber,
    fromRoleId: args.fromRoleId,
    fromRoleName: args.fromRoleName,
    toRoleId: args.toRoleId,
    toRoleName: args.toRoleName,
    actionId: args.actionId,
    actionText: args.actionText,
    requestType: args.requestType,
    computeAmount: args.computeAmount,
    status: "pending",
  });
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

    // Use available stock (cache − pending own-negative rows) not raw cache —
    // otherwise a player could direct-transfer compute they've already escrowed
    // into pending action send-targets, over-committing the same 1u across paths.
    const available = await getAvailableStock(ctx, args.gameId, args.fromRoleId, game.currentRound);
    if (available < args.amount) {
      throw new Error(`Insufficient compute: have ${available}u available, tried to send ${args.amount}u`);
    }

    // Validate recipient exists and is enabled
    const recipientTable = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.toRoleId))
      .first();
    if (!recipientTable || !recipientTable.enabled) {
      throw new Error("Recipient role not found or not enabled");
    }

    await emitPair(ctx, {
      gameId: args.gameId,
      roundNumber: game.currentRound,
      type: "transferred",
      status: "settled",
      fromRoleId: args.fromRoleId,
      toRoleId: args.toRoleId,
      amount: args.amount,
      reason: "Direct transfer",
    });
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
    callerTableId: v.id("tables"),
  },
  handler: async (ctx, args) => {
    const game = await assertPhase(ctx, args.gameId, ["submit"], "send request");
    assertSubmitWindowOpen(game);

    // Authorize: caller must occupy the claimed sender role. Without this check
    // any client could forge fromRoleId to send requests impersonating any role.
    const callerTable = await ctx.db.get(args.callerTableId);
    if (!callerTable) throw new Error("Caller table not found");
    if (callerTable.gameId !== args.gameId) throw new Error("Caller table does not belong to this game");
    if (callerTable.roleId !== args.fromRoleId) {
      throw new Error("Only the sender role can send this request");
    }
    if (!callerTable.enabled) throw new Error("Sender role is not enabled in this game");

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
    await triggerAutoResponse(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      toRoleId: args.toRoleId,
      requestId: id,
    });

    return id;
  },
});

// Cancel a request (sender can withdraw it at any time during submit phase)
export const cancel = mutation({
  args: {
    requestId: v.id("requests"),
    callerTableId: v.id("tables"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return;

    // Authorize: caller must be the sender of this request.
    const callerTable = await ctx.db.get(args.callerTableId);
    if (!callerTable) throw new Error("Caller table not found");
    if (callerTable.gameId !== request.gameId) throw new Error("Caller table does not belong to this game");
    if (callerTable.roleId !== request.fromRoleId) {
      throw new Error("Only the request sender can cancel this request");
    }

    await assertPhase(ctx, request.gameId, ["submit"], "cancel requests");

    // If compute was escrowed (accepted compute request), cancel the pending ledger pair
    // tied to this action. This refunds the target and removes the pending credit to submitter.
    if (
      request.status === "accepted" &&
      request.requestType === "compute" &&
      request.actionId
    ) {
      await cancelPendingForAction(ctx, request.gameId, request.actionId, {
        involvingRoleId: request.toRoleId,
      });
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
    callerTableId: v.id("tables"),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return;

    // Authorize: caller must occupy the target role (only the recipient decides).
    const callerTable = await ctx.db.get(args.callerTableId);
    if (!callerTable) throw new Error("Caller table not found");
    if (callerTable.gameId !== proposal.gameId) throw new Error("Caller table does not belong to this game");
    if (callerTable.roleId !== proposal.toRoleId) {
      throw new Error("Only the target role can respond to this request");
    }

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

    // For compute requests: escrow from target on accept (as a pending ledger pair),
    // cancel the pair on decline. Settlement happens in rollAllInternal on action success.
    if (
      proposal.requestType === "compute" &&
      proposal.computeAmount &&
      proposal.actionId
    ) {
      // If was accepted and now moving away from accepted — cancel the pending escrow
      if (oldStatus === "accepted" && args.status !== "accepted") {
        await cancelPendingForAction(ctx, proposal.gameId, proposal.actionId, {
          involvingRoleId: proposal.toRoleId,
        });
      }

      // If accepting (from pending or declined) — emit pending transferred pair
      if (args.status === "accepted" && oldStatus !== "accepted") {
        const available = await getAvailableStock(ctx, proposal.gameId, proposal.toRoleId, proposal.roundNumber);
        if (available < proposal.computeAmount) {
          await ctx.db.patch(args.proposalId, { status: "declined" });
          await logEvent(ctx, proposal.gameId, "request_declined_insufficient", proposal.toRoleId, {
            fromRoleId: proposal.fromRoleId,
            requested: proposal.computeAmount,
            available,
          });
          return;
        }
        await emitPair(ctx, {
          gameId: proposal.gameId,
          roundNumber: proposal.roundNumber,
          type: "transferred",
          status: "pending",
          fromRoleId: proposal.toRoleId,     // target escrows
          toRoleId: proposal.fromRoleId,     // submitter to be credited
          amount: proposal.computeAmount,
          reason: `Compute request: ${proposal.actionText.slice(0, 80)}`,
          actionId: proposal.actionId,
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

export const batchEntryValidator = v.object({
  fromRoleId: v.string(),
  fromRoleName: v.string(),
  toRoleId: v.string(),
  toRoleName: v.string(),
  actionId: v.string(),
  actionText: v.string(),
  requestType: v.union(v.literal("endorsement"), v.literal("compute")),
  computeAmount: v.optional(v.number()),
});

/** Batched fan-out for `aiGenerate.fanOutHints`. Self-target entries are
 *  silently skipped (cf. `send`/`sendInternal`, which throw). */
export const sendBatchInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    requests: v.array(batchEntryValidator),
  },
  handler: async (ctx, args) => {
    // Pre-load tables once so triggerAutoResponse skips its per-request
    // by_game_and_role index lookup.
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const tableByRole = new Map(tables.map((t) => [t.roleId, t]));

    for (const entry of args.requests) {
      if (entry.fromRoleId === entry.toRoleId) continue;
      const requestId = await findOrUpsertRequest(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        ...entry,
      });
      await triggerAutoResponse(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        toRoleId: entry.toRoleId,
        requestId,
        table: tableByRole.get(entry.toRoleId),
      });
    }
  },
});

const NPC_ACCEPT_RATE = 0.7;

export async function triggerAutoResponse(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    roundNumber: number;
    toRoleId: string;
    requestId: Id<"requests">;
    table?: { _id: Id<"tables">; enabled: boolean; controlMode: string; computeStock?: number };
  },
) {
  const targetTable = args.table ?? await ctx.db
    .query("tables")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.toRoleId))
    .first();
  if (!targetTable || !targetTable.enabled || targetTable.controlMode === "human") return;

  if (targetTable.controlMode === "npc") {
    const accept = Math.random() < NPC_ACCEPT_RATE;
    if (accept) {
      const request = await ctx.db.get(args.requestId);
      if (request?.requestType === "compute" && request.computeAmount && request.actionId) {
        const available = await getAvailableStock(ctx, args.gameId, args.toRoleId, args.roundNumber);
        if (available >= request.computeAmount) {
          await emitPair(ctx, {
            gameId: args.gameId,
            roundNumber: args.roundNumber,
            type: "transferred",
            status: "pending",
            fromRoleId: request.toRoleId,
            toRoleId: request.fromRoleId,
            amount: request.computeAmount,
            reason: `NPC-accepted compute request: ${request.actionText.slice(0, 80)}`,
            actionId: request.actionId,
          });
        } else {
          await ctx.db.patch(args.requestId, { status: "declined" });
          return;
        }
      }
    }
    await ctx.db.patch(args.requestId, { status: accept ? "accepted" : "declined" });
  } else {
    await ctx.scheduler.runAfter(0, internal.aiProposals.respond, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      roleId: args.toRoleId,
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

    const game = await ctx.db.get(args.gameId);
    if (!game) return;

    // Validate sender has enough compute (use settled stock, not available — AI transfers are immediate)
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const senderTable = tables.find((t) => t.roleId === args.fromRoleId && t.enabled);
    if (!senderTable) return;
    if ((senderTable.computeStock ?? 0) < args.amount) return;

    const recipientTable = tables.find((t) => t.roleId === args.toRoleId && t.enabled);
    if (!recipientTable) return;

    await emitPair(ctx, {
      gameId: args.gameId,
      roundNumber: game.currentRound,
      type: "transferred",
      status: "settled",
      fromRoleId: args.fromRoleId,
      toRoleId: args.toRoleId,
      amount: args.amount,
      reason: "AI-initiated direct transfer",
    });
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

    // Escrow compute from target on acceptance as a pending ledger pair. Settlement
    // happens on action success in rollAllInternal.
    if (args.status === "accepted" && proposal.requestType === "compute" && proposal.computeAmount && proposal.actionId) {
      const available = await getAvailableStock(ctx, proposal.gameId, proposal.toRoleId, proposal.roundNumber);
      if (available < proposal.computeAmount) {
        await ctx.db.patch(args.proposalId, { status: "declined" });
        return;
      }
      await emitPair(ctx, {
        gameId: proposal.gameId,
        roundNumber: proposal.roundNumber,
        type: "transferred",
        status: "pending",
        fromRoleId: proposal.toRoleId,
        toRoleId: proposal.fromRoleId,
        amount: proposal.computeAmount,
        reason: `AI-accepted compute request: ${proposal.actionText.slice(0, 80)}`,
        actionId: proposal.actionId,
      });
    }

    await ctx.db.patch(args.proposalId, { status: args.status });
  },
});
