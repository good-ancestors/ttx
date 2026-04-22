import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertFacilitator, logEvent } from "./events";
import { emitTransaction } from "./computeLedger";

export const setComputeShareOverrides = mutation({
  args: {
    gameId: v.id("games"),
    overrides: v.record(v.string(), v.number()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    await ctx.db.patch(args.gameId, { computeShareOverrides: args.overrides });
    await logEvent(ctx, args.gameId, "share_override", undefined, args.overrides);
  },
});

/** Adjust a role's compute by a delta. Writes a `facilitator` ledger row for the delta
 *  amount directly — caller supplies the delta (no need to know current stock). */
export const adjustHolderCompute = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    delta: v.number(),
    reason: v.optional(v.string()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    if (args.delta === 0) return;
    await emitTransaction(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      type: "facilitator",
      status: "settled",
      roleId: args.roleId,
      amount: args.delta,
      reason: args.reason ?? "Facilitator compute adjustment",
    });
    await logEvent(ctx, args.gameId, "compute_override", args.roleId, {
      delta: args.delta,
      reason: args.reason,
    });
  },
});

/** Facilitator-edit path: write a `facilitator` ledger row for the delta. The ledger
 *  updates table.computeStock cache; labs table doesn't store compute. */
export const overrideHolderCompute = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    computeStock: v.number(),
    reason: v.optional(v.string()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const table = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.roleId))
      .first();
    const currentStock = table?.computeStock ?? 0;
    const delta = args.computeStock - currentStock;

    if (delta !== 0) {
      await emitTransaction(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "facilitator",
        status: "settled",
        roleId: args.roleId,
        amount: delta,
        reason: args.reason ?? "Facilitator compute edit",
      });
    }

    await logEvent(ctx, args.gameId, "compute_override", args.roleId, {
      computeStock: args.computeStock,
      reason: args.reason,
    });
  },
});

