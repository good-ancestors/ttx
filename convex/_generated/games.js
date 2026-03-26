import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES, ROUND_CONFIGS, DEFAULT_WORLD_STATE, DEFAULT_LABS } from "./gameData";
import { logEvent } from "./events";
function generateJoinCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
export const create = mutation({
    args: {
        tableCount: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const tableCount = Math.min(17, Math.max(1, args.tableCount ?? 6));
        const gameId = await ctx.db.insert("games", {
            status: "lobby",
            currentRound: 1,
            phase: "discuss",
            worldState: DEFAULT_WORLD_STATE,
            labs: DEFAULT_LABS,
            locked: false,
        });
        // Create tables for all roles — required roles are always enabled,
        // optional roles enabled up to tableCount. All start as AI-controlled
        // until a human joins. Roles are ordered by priority in the ROLES array.
        const requiredIds = new Set(["openbrain-ceo", "deepcent-ceo", "ai-systems"]);
        let enabledCount = 0;
        for (let i = 0; i < ROLES.length; i++) {
            const role = ROLES[i];
            const isRequired = requiredIds.has(role.id);
            const enabled = isRequired || enabledCount < tableCount;
            if (enabled && !isRequired)
                enabledCount++;
            if (isRequired)
                enabledCount++; // required count toward total
            await ctx.db.insert("tables", {
                gameId,
                roleId: role.id,
                roleName: role.name,
                joinCode: generateJoinCode(),
                connected: false,
                isAI: true,
                enabled,
                computeStock: ("startingComputeStock" in role ? role.startingComputeStock : undefined),
            });
        }
        // Create all 3 rounds
        for (const config of ROUND_CONFIGS) {
            await ctx.db.insert("rounds", {
                gameId,
                number: config.number,
                label: config.label,
                title: config.title,
                narrative: config.narrative,
                capabilityLevel: config.capabilityLevel,
            });
        }
        return gameId;
    },
});
export const get = query({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.gameId);
    },
});
export const advancePhase = mutation({
    args: {
        gameId: v.id("games"),
        phase: v.union(v.literal("discuss"), v.literal("submit"), v.literal("rolling"), v.literal("narrate")),
        durationSeconds: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const phaseEndsAt = args.durationSeconds
            ? Date.now() + args.durationSeconds * 1000
            : undefined;
        await ctx.db.patch(args.gameId, {
            phase: args.phase,
            phaseEndsAt,
        });
        await logEvent(ctx, args.gameId, "phase_change", undefined, { phase: args.phase, durationSeconds: args.durationSeconds });
    },
});
export const updateWorldState = mutation({
    args: {
        gameId: v.id("games"),
        worldState: v.object({
            capability: v.number(),
            alignment: v.number(),
            tension: v.number(),
            awareness: v.number(),
            regulation: v.number(),
            australia: v.number(),
        }),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, { worldState: args.worldState });
    },
});
export const updateLabs = mutation({
    args: {
        gameId: v.id("games"),
        labs: v.array(v.object({
            name: v.string(),
            roleId: v.string(),
            computeStock: v.number(),
            rdMultiplier: v.number(),
            allocation: v.object({
                users: v.number(),
                capability: v.number(),
                safety: v.number(),
            }),
        })),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, { labs: args.labs });
    },
});
export const updateTableCompute = mutation({
    args: {
        tableId: v.id("tables"),
        computeStock: v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.tableId, { computeStock: args.computeStock });
    },
});
export const lock = mutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, { locked: true });
    },
});
export const startGame = mutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, {
            status: "playing",
            phase: "discuss",
            phaseEndsAt: Date.now() + 8 * 60 * 1000, // 8 minutes
        });
        await logEvent(ctx, args.gameId, "game_start");
    },
});
export const advanceRound = mutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || game.currentRound >= 3)
            return;
        const nextRound = game.currentRound + 1;
        await ctx.db.patch(args.gameId, {
            currentRound: nextRound,
            phase: "discuss",
            phaseEndsAt: Date.now() + 8 * 60 * 1000,
        });
        await logEvent(ctx, args.gameId, "round_advance", undefined, { round: nextRound });
    },
});
export const skipTimer = mutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, { phaseEndsAt: undefined });
        await logEvent(ctx, args.gameId, "timer_skipped");
    },
});
export const addLab = mutation({
    args: {
        gameId: v.id("games"),
        name: v.string(),
        roleId: v.string(),
        computeStock: v.number(),
        rdMultiplier: v.number(),
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game)
            return;
        const newLab = {
            name: args.name,
            roleId: args.roleId,
            computeStock: args.computeStock,
            rdMultiplier: args.rdMultiplier,
            allocation: { users: 34, capability: 33, safety: 33 },
        };
        await ctx.db.patch(args.gameId, { labs: [...game.labs, newLab] });
        await logEvent(ctx, args.gameId, "lab_added", args.roleId, { name: args.name, computeStock: args.computeStock });
    },
});
export const finishGame = mutation({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.gameId, { status: "finished" });
        await logEvent(ctx, args.gameId, "game_finish");
    },
});
