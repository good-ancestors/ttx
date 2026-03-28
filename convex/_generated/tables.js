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
    args: {
        tableId: v.id("tables"),
        connected: v.boolean(),
        sessionId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        const patch = {
            connected: args.connected,
            controlMode: args.connected ? "human" : "ai",
        };
        // Track which browser session owns this seat
        if (args.connected && args.sessionId) {
            patch.activeSessionId = args.sessionId;
        }
        else if (!args.connected) {
            patch.activeSessionId = undefined;
        }
        await ctx.db.patch(args.tableId, patch);
        if (table) {
            await logEvent(ctx, table.gameId, args.connected ? "player_connect" : "player_disconnect", table.roleId, {
                sessionId: args.sessionId,
                previousSessionId: table.activeSessionId,
            });
        }
    },
});
export const setControlMode = mutation({
    args: {
        tableId: v.id("tables"),
        controlMode: v.union(v.literal("human"), v.literal("ai"), v.literal("npc")),
    },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        if (!table)
            return;
        await ctx.db.patch(args.tableId, { controlMode: args.controlMode });
    },
});
export const kickToAI = mutation({
    args: { tableId: v.id("tables") },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        if (!table)
            return;
        await ctx.db.patch(args.tableId, { controlMode: "ai", connected: false });
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
export const setDisposition = mutation({
    args: {
        tableId: v.id("tables"),
        disposition: v.string(),
    },
    handler: async (ctx, args) => {
        const table = await ctx.db.get(args.tableId);
        if (!table)
            return;
        if (table.aiDisposition) {
            throw new Error("AI disposition already set — cannot change");
        }
        await ctx.db.patch(args.tableId, { aiDisposition: args.disposition });
        await logEvent(ctx, table.gameId, "disposition_set", table.roleId, {
            disposition: args.disposition,
        });
    },
});
