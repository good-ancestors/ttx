import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
/** Assert the game is in one of the allowed phases. Throws descriptive error if not. */
export async function assertPhase(ctx, gameId, allowedPhases, action) {
    const game = await ctx.db.get(gameId);
    if (!game)
        throw new Error("Game not found");
    if (!allowedPhases.includes(game.phase)) {
        throw new Error(`Cannot ${action} during ${game.phase} phase — only allowed during ${allowedPhases.join("/")}`);
    }
    return game;
}
// Internal helper — call from other mutations to log events
export async function logEvent(ctx, gameId, type, roleId, data) {
    await ctx.db.insert("events", {
        gameId,
        timestamp: Date.now(),
        type,
        roleId,
        data: data ? JSON.stringify(data) : undefined,
    });
}
// Query for facilitator debug panel — returns latest events for a game
export const getByGame = query({
    args: { gameId: v.id("games"), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query("events")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();
        // Return newest first, limited
        return events.reverse().slice(0, args.limit ?? 50);
    },
});
// Mutation for logging from API routes via ConvexHttpClient
export const log = mutation({
    args: {
        gameId: v.id("games"),
        type: v.string(),
        roleId: v.optional(v.string()),
        data: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("events", {
            gameId: args.gameId,
            timestamp: Date.now(),
            type: args.type,
            roleId: args.roleId,
            data: args.data,
        });
    },
});
