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

    // table.computeStock is the single source of truth for all roles
    const table = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.roleId))
      .first();
    if (table) {
      await ctx.db.patch(table._id, { computeStock: args.computeStock });
    }

    // Also sync to game.labs[] cache if this role is a lab CEO
    const labIndex = game.labs.findIndex((l) => l.roleId === args.roleId);
    if (labIndex !== -1) {
      const updatedLabs = [...game.labs];
      updatedLabs[labIndex] = { ...updatedLabs[labIndex], computeStock: args.computeStock };
      await ctx.db.patch(args.gameId, { labs: updatedLabs });
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

/** Migration: populate table.computeStock for lab CEO tables from game.labs[].
 *  Idempotent — safe to run multiple times. Only sets compute if table has undefined. */
export const migrateLabComputeToTables = internalMutation({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    let migrated = 0;
    for (const game of games) {
      if (game.status === "finished") continue;
      const tables = await ctx.db.query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      const tableByRole = new Map(tables.map((t) => [t.roleId, t]));
      for (const lab of game.labs) {
        const table = tableByRole.get(lab.roleId);
        if (table && table.computeStock == null) {
          await ctx.db.patch(table._id, { computeStock: lab.computeStock });
          migrated++;
        }
      }
    }
    return { migrated };
  },
});
