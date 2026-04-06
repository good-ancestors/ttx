import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { assertFacilitator, logEvent } from "./events";

export const updateNonLabComputeInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    updates: v.array(v.object({ roleId: v.string(), computeStock: v.number() })),
  },
  handler: async (ctx, args) => {
    const tables = await ctx.db.query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const tableByRole = new Map(tables.map((t) => [t.roleId, t._id]));
    for (const update of args.updates) {
      const tableId = tableByRole.get(update.roleId);
      if (tableId) {
        await ctx.db.patch(tableId, { computeStock: update.computeStock });
      }
    }
  },
});

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
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    // Update the underlying compute storage
    const lab = game.labs.find((l) => l.roleId === args.roleId);
    if (lab) {
      // Lab: update game.labs[]
      const updatedLabs = game.labs.map((l) =>
        l.roleId === args.roleId ? { ...l, computeStock: args.computeStock } : l
      );
      await ctx.db.patch(args.gameId, { labs: updatedLabs });
    } else {
      // Non-lab: update table
      const tables = await ctx.db.query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect();
      const table = tables.find((t) => t.roleId === args.roleId);
      if (table) {
        await ctx.db.patch(table._id, { computeStock: args.computeStock });
      }
    }

    // Update the computeHolders record with override
    const rounds = await ctx.db.query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (round?.computeHolders) {
      const updatedHolders = round.computeHolders.map((h) =>
        h.roleId === args.roleId
          ? { ...h, override: args.computeStock, overrideReason: args.reason }
          : h
      );
      await ctx.db.patch(round._id, { computeHolders: updatedHolders });
    }

    await logEvent(ctx, args.gameId, "compute_override", args.roleId, {
      computeStock: args.computeStock,
      reason: args.reason,
    });
  },
});
