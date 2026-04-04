import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { worldStateValidator, labSnapshotValidator } from "./schema";
import { assertFacilitator } from "./events";

export const getByGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

// Lightweight version for facilitator sidebar — only fields needed by
// RdProgressChart, GameTimeline chart, and snapshot restore dropdown.
export const getByGameLightweight = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return rounds.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      gameId: r.gameId,
      number: r.number,
      label: r.label,
      worldStateAfter: r.worldStateAfter,
      labsAfter: r.labsAfter,
      // Just the narrative string from summary (not full headlines/events arrays)
      summaryNarrative: r.summary?.narrative,
      // Minimal flags for snapshot restore dropdown
      hasWorldStateBefore: r.worldStateBefore != null,
    }));
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

    const round = rounds.find((r) => r.number === game.currentRound);
    if (!round) return null;

    const { facilitatorNotes: _, summary, ...rest } = round;
    if (!summary) return { ...rest, summary: undefined };
    const { facilitatorNotes: __, ...summaryRest } = summary;
    return { ...rest, summary: summaryRest };
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
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { summary: args.summary });
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
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
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

export const clearResolution = mutation({
  args: { gameId: v.id("games"), roundNumber: v.number(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;
    await ctx.db.patch(round._id, { resolvedEvents: [], summary: undefined });
  },
});

export const setAiMeta = internalMutation({
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
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { fallbackNarrative: args.fallbackNarrative });
  },
});

// ─── Pipeline internal mutations ──────────────────────────────────────────────

const resolvedEventValidator = v.object({
  id: v.string(),
  description: v.string(),
  visibility: v.union(v.literal("public"), v.literal("covert")),
  actors: v.array(v.string()),
  worldImpact: v.optional(v.string()),
  sourceActions: v.optional(v.array(v.string())),
});

export const getForPipeline = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    return rounds.find((r) => r.number === args.roundNumber) ?? null;
  },
});

export const getAllForPipeline = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
  },
});

export const setResolveNonce = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number(), nonce: v.string() },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (round) await ctx.db.patch(round._id, { resolveNonce: args.nonce });
  },
});

export const writePartialEvents = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number(), events: v.array(resolvedEventValidator) },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (round) await ctx.db.patch(round._id, { partialEvents: args.events });
  },
});

export const applyResolutionInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    nonce: v.string(),
    resolvedEvents: v.array(resolvedEventValidator),
  },
  handler: async (ctx, args) => {
    // Check nonce to prevent double-execution
    const game = await ctx.db.get(args.gameId);
    if (game?.resolveNonce !== args.nonce) return;

    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, {
      resolvedEvents: args.resolvedEvents,
      partialEvents: undefined,
    });
  },
});

export const applySummaryInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    summary: v.object({
      narrative: v.optional(v.string()),
      headlines: v.array(v.string()),
      geopoliticalEvents: v.array(v.string()),
      aiStateOfPlay: v.array(v.string()),
      facilitatorNotes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (round) await ctx.db.patch(round._id, { summary: args.summary });
  },
});

export const snapshotBeforeInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    worldStateBefore: worldStateValidator,
    labsBefore: v.array(labSnapshotValidator),
    roleComputeBefore: v.array(v.object({ roleId: v.string(), roleName: v.string(), computeStock: v.number() })),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round || round.worldStateBefore) return; // Already snapshotted
    await ctx.db.patch(round._id, {
      worldStateBefore: args.worldStateBefore,
      labsBefore: args.labsBefore,
      roleComputeBefore: args.roleComputeBefore,
    });
  },
});

export const snapshotAfterInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    worldStateAfter: worldStateValidator,
    labsAfter: v.array(labSnapshotValidator),
    roleComputeAfter: v.array(v.object({ roleId: v.string(), roleName: v.string(), computeStock: v.number() })),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;
    await ctx.db.patch(round._id, {
      worldStateAfter: args.worldStateAfter,
      labsAfter: args.labsAfter,
      roleComputeAfter: args.roleComputeAfter,
    });
  },
});

export const setAiMetaInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    meta: v.object({
      resolveModel: v.optional(v.string()),
      resolveTimeMs: v.optional(v.number()),
      resolveTokens: v.optional(v.number()),
      narrativeModel: v.optional(v.string()),
      narrativeTimeMs: v.optional(v.number()),
      narrativeTokens: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;
    // Merge with existing meta
    const existing = round.aiMeta ?? {};
    await ctx.db.patch(round._id, {
      aiMeta: { ...existing, ...Object.fromEntries(Object.entries(args.meta).filter(([, v]) => v !== undefined)) },
    });
  },
});

export const setComputeChanges = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    computeChanges: v.object({
      newComputeTotal: v.number(),
      baselineTotal: v.number(),
      stockBeforeTotal: v.number(),
      stockAfterTotal: v.number(),
      distribution: v.array(v.object({
        labName: v.string(),
        stockBefore: v.number(),
        stockAfter: v.number(),
        stockChange: v.number(),
        baseline: v.number(),
        modifier: v.number(),
        sharePct: v.number(),
        active: v.boolean(),
        reason: v.optional(v.string()),
        newTotal: v.number(),
      })),
      nonCompetitive: v.array(v.object({
        roleId: v.string(),
        roleName: v.string(),
        stockBefore: v.number(),
        stockAfter: v.number(),
        stockChange: v.number(),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (round) await ctx.db.patch(round._id, { computeChanges: args.computeChanges });
  },
});
