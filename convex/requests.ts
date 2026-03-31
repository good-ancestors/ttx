import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import type { DatabaseWriter } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { logEvent, assertPhase } from "./events";

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
    await assertPhase(ctx, args.gameId, ["submit"], "send request");

    // Validate compute amount is positive
    if (args.computeAmount !== undefined && args.computeAmount <= 0) {
      throw new Error("Compute amount must be positive");
    }
    const id = await ctx.db.insert("requests", {
      ...args,
      status: "pending",
    });
    await logEvent(ctx, args.gameId, "request_sent", args.fromRoleId, {
      toRoleId: args.toRoleId,
      requestType: args.requestType,
      computeAmount: args.computeAmount,
      actionText: args.actionText,
    });
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
    status: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return;

    await assertPhase(ctx, proposal.gameId, ["submit"], "respond to requests");

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
