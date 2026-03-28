import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

export const getCurrent = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return rounds.find((r) => r.number === game.currentRound) ?? null;
  },
});

export const applySummary = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    summary: v.object({
      narrative: v.optional(v.string()),
      geopoliticalEvents: v.array(v.string()),
      aiStateOfPlay: v.array(v.string()),
      headlines: v.array(v.string()),
      facilitatorNotes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { summary: args.summary });
  },
});

export const snapshotState = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    worldStateAfter: v.object({
      capability: v.number(),
      alignment: v.number(),
      tension: v.number(),
      awareness: v.number(),
      regulation: v.number(),
      australia: v.number(),
    }),
    labsAfter: v.array(
      v.object({
        name: v.string(),
        roleId: v.string(),
        computeStock: v.number(),
        rdMultiplier: v.number(),
        allocation: v.object({
          users: v.number(),
          capability: v.number(),
          safety: v.number(),
        }),
      })
    ),
    roleComputeAfter: v.optional(
      v.array(
        v.object({
          roleId: v.string(),
          roleName: v.string(),
          computeStock: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, {
      worldStateAfter: args.worldStateAfter,
      labsAfter: args.labsAfter,
      roleComputeAfter: args.roleComputeAfter,
    });
  },
});

export const applyResolution = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    resolvedEvents: v.array(
      v.object({
        id: v.string(),
        description: v.string(),
        visibility: v.union(v.literal("public"), v.literal("covert")),
        actors: v.array(v.string()),
        worldImpact: v.optional(v.string()),
        sourceActions: v.optional(v.array(v.string())),
      })
    ),
    facilitatorNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, {
      resolvedEvents: args.resolvedEvents,
      facilitatorNotes: args.facilitatorNotes,
    });
  },
});

export const setAiMeta = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiMeta: v.object({
      resolveModel: v.optional(v.string()),
      resolveTimeMs: v.optional(v.number()),
      resolveTokens: v.optional(v.number()),
      narrativeModel: v.optional(v.string()),
      narrativeTimeMs: v.optional(v.number()),
      narrativeTokens: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { aiMeta: args.aiMeta });
  },
});

export const updateFallbackNarrative = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    fallbackNarrative: v.string(),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { fallbackNarrative: args.fallbackNarrative });
  },
});
