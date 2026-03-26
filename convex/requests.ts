import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";

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
      v.literal("compute"),
      v.literal("both")
    ),
    computeAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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

    // If compute was already transferred (accepted compute request), reverse it
    if (
      request.status === "accepted" &&
      (request.requestType === "compute" || request.requestType === "both") &&
      request.computeAmount
    ) {
      const tables = await ctx.db
        .query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", request.gameId))
        .collect();
      // Return compute to the acceptor (giver)
      const giverTable = tables.find((t) => t.roleId === request.toRoleId);
      if (giverTable) {
        await ctx.db.patch(giverTable._id, {
          computeStock: (giverTable.computeStock ?? 0) + request.computeAmount,
        });
      }
      // Remove compute from requester
      const requesterTable = tables.find((t) => t.roleId === request.fromRoleId);
      if (requesterTable) {
        await ctx.db.patch(requesterTable._id, {
          computeStock: Math.max(0, (requesterTable.computeStock ?? 0) - request.computeAmount),
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
    status: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return;

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
      (proposal.requestType === "compute" || proposal.requestType === "both") &&
      proposal.computeAmount
    ) {
      const tables = await ctx.db
        .query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", proposal.gameId))
        .collect();
      const giverTable = tables.find((t) => t.roleId === proposal.toRoleId);
      const requesterTable = tables.find((t) => t.roleId === proposal.fromRoleId);

      // If was accepted and now declining — reverse the transfer
      if (oldStatus === "accepted" && args.status === "declined") {
        if (giverTable && proposal.computeAmount) {
          await ctx.db.patch(giverTable._id, {
            computeStock: (giverTable.computeStock ?? 0) + proposal.computeAmount,
          });
        }
        if (requesterTable && proposal.computeAmount) {
          await ctx.db.patch(requesterTable._id, {
            computeStock: Math.max(0, (requesterTable.computeStock ?? 0) - proposal.computeAmount),
          });
        }
      }

      // If accepting (from pending or declined) — do the transfer
      if (args.status === "accepted" && oldStatus !== "accepted") {
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
        if (giverTable) {
          await ctx.db.patch(giverTable._id, {
            computeStock: available - proposal.computeAmount,
          });
        }
        if (requesterTable) {
          await ctx.db.patch(requesterTable._id, {
            computeStock: (requesterTable.computeStock ?? 0) + proposal.computeAmount,
          });
        }
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
