import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";
export const getByGame = query({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("tables")
            .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
            .collect();
    },
});
export const getByJoinCode = query({
    args: { joinCode: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("tables")
            .withIndex("by_joinCode", (q) => q.eq("joinCode", args.joinCode.toUpperCase()))
            .first();
    },
});
export const get = query({
    args: { tableId: v.id("tables") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.tableId);
    },
});
export const setConnected = mutation({
    args: { tableId: v.id("tables"), connected: v.boolean() },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        // When a human connects, switch from AI to human control
        await ctx.db.patch(args.tableId, {
            connected: args.connected,
            isAI: args.connected ? false : true,
        });
        if (table) {
            await logEvent(ctx, table.gameId, args.connected ? "player_connect" : "player_disconnect", table.roleId);
        }
    },
});
export const toggleAI = mutation({
    args: { tableId: v.id("tables") },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        if (!table)
            return;
        await ctx.db.patch(args.tableId, { isAI: !table.isAI });
    },
});
export const kickToAI = mutation({
    args: { tableId: v.id("tables") },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        if (!table)
            return;
        await ctx.db.patch(args.tableId, { isAI: true, connected: false });
        await logEvent(ctx, table.gameId, "kick_to_ai", table.roleId);
    },
});
export const toggleEnabled = mutation({
    args: { tableId: v.id("tables") },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        if (!table)
            return;
        await ctx.db.patch(args.tableId, { enabled: !table.enabled });
    },
});
