import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { worldStateValidator, labSnapshotValidator } from "./schema";
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
        if (!game)
            return null;
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
        if (!round)
            return;
        await ctx.db.patch(round._id, { summary: args.summary });
    },
});
export const snapshotBefore = mutation({
    args: {
        gameId: v.id("games"),
        roundNumber: v.number(),
        worldStateBefore: worldStateValidator,
        labsBefore: v.array(labSnapshotValidator),
    },
    handler: async (ctx, args) => {
        const rounds = await ctx.db
            .query("rounds")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();
        const round = rounds.find((r) => r.number === args.roundNumber);
        if (!round)
            throw new Error(`Round ${args.roundNumber} not found for game ${args.gameId}`);
        if (round.worldStateBefore)
            return; // Already snapshotted — idempotent no-op
        await ctx.db.patch(round._id, {
            worldStateBefore: args.worldStateBefore,
            labsBefore: args.labsBefore,
        });
    },
});
export const snapshotState = mutation({
    args: {
        gameId: v.id("games"),
        roundNumber: v.number(),
        worldStateAfter: worldStateValidator,
        labsAfter: v.array(labSnapshotValidator),
        roleComputeAfter: v.optional(v.array(v.object({
            roleId: v.string(),
            roleName: v.string(),
            computeStock: v.number(),
        }))),
    },
    handler: async (ctx, args) => {
        const rounds = await ctx.db
            .query("rounds")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();
        const round = rounds.find((r) => r.number === args.roundNumber);
        if (!round)
            return;
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
        resolvedEvents: v.array(v.object({
            id: v.string(),
            description: v.string(),
            visibility: v.union(v.literal("public"), v.literal("covert")),
            actors: v.array(v.string()),
            worldImpact: v.optional(v.string()),
            sourceActions: v.optional(v.array(v.string())),
        })),
        facilitatorNotes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const rounds = await ctx.db
            .query("rounds")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();
        const round = rounds.find((r) => r.number === args.roundNumber);
        if (!round)
            return;
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
        if (!round)
            return;
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
        if (!round)
            return;
        await ctx.db.patch(round._id, { fallbackNarrative: args.fallbackNarrative });
    },
});
