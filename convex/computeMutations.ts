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

/** Facilitator-edit path: write a `facilitator` ledger row for the delta to a role's
 *  compute stock. Caller passes an absolute target `computeStock`; the mutation reads
 *  the current table stock and emits a delta ledger row. The ledger row updates
 *  table.computeStock cache; labs table doesn't store compute. */
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
    // Target stock must be a finite non-negative number. The facilitator editor
    // clamps with Math.max(0, ...) on the client, but direct API calls would
    // otherwise drive table.computeStock below zero via the ledger delta.
    if (!Number.isFinite(args.computeStock)) throw new Error("overrideHolderCompute: target computeStock must be a finite number");
    if (args.computeStock < 0) throw new Error(`overrideHolderCompute: target computeStock must be >= 0 (got ${args.computeStock})`);
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

