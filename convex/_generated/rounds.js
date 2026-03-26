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
