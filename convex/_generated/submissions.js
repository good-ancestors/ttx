import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent, assertPhase } from "./events";
const actionValidator = v.object({
    text: v.string(),
    priority: v.number(),
    secret: v.optional(v.boolean()),
    probability: v.optional(v.number()),
    reasoning: v.optional(v.string()),
    rolled: v.optional(v.number()),
    success: v.optional(v.boolean()),
});
// Full query — facilitator only (includes secret action text)
export const getByGameAndRound = query({
    args: { gameId: v.id("games"), roundNumber: v.number() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("submissions")
            .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
            .collect();
    },
});
// Player-safe query — strips text from secret actions
export const getByGameAndRoundRedacted = query({
    args: { gameId: v.id("games"), roundNumber: v.number(), viewerRoleId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const subs = await ctx.db
            .query("submissions")
            .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
            .collect();
        return subs.map((sub) => ({
            ...sub,
            actions: sub.actions.map((a) => {
                if (a.secret && sub.roleId !== args.viewerRoleId) {
                    return { ...a, text: "[Covert action]", reasoning: undefined };
                }
                return a;
            }),
        }));
    },
});
export const getForTable = query({
    args: { tableId: v.id("tables"), roundNumber: v.number() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("submissions")
            .withIndex("by_table_and_round", (q) => q.eq("tableId", args.tableId).eq("roundNumber", args.roundNumber))
            .first();
    },
});
export const submit = mutation({
    args: {
        tableId: v.id("tables"),
        gameId: v.id("games"),
        roundNumber: v.number(),
        roleId: v.string(),
        actions: v.array(actionValidator),
        computeAllocation: v.optional(v.object({
            users: v.number(),
            capability: v.number(),
            safety: v.number(),
        })),
        artifact: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Check game is in submit phase (or rolling — AI players submit during resolve)
        const game = await ctx.db.get(args.gameId);
        if (game && game.phase !== "submit" && game.phase !== "rolling") {
            throw new Error(`Cannot submit during ${game.phase} phase`);
        }
        // Enforce action limit (max 5) and sanity-check priority budget
        // Auto-decay always sums to 10, but allow tolerance for edge cases
        const totalPriority = args.actions.reduce((s, a) => s + a.priority, 0);
        if (totalPriority > 12) {
            throw new Error(`Priority budget exceeded: ${totalPriority}/10`);
        }
        if (args.actions.length > 5) {
            throw new Error(`Too many actions: ${args.actions.length}/5`);
        }
        const existing = await ctx.db
            .query("submissions")
            .withIndex("by_table_and_round", (q) => q.eq("tableId", args.tableId).eq("roundNumber", args.roundNumber))
            .first();
        if (existing) {
            // Don't overwrite already-graded or resolved submissions
            if (existing.status === "graded" || existing.status === "resolved") {
                return existing._id;
            }
            await ctx.db.patch(existing._id, {
                actions: args.actions,
                computeAllocation: args.computeAllocation,
                artifact: args.artifact,
                status: "submitted",
            });
            await logEvent(ctx, args.gameId, "submission", args.roleId, { round: args.roundNumber, actionCount: args.actions.length });
            return existing._id;
        }
        const id = await ctx.db.insert("submissions", {
            tableId: args.tableId,
            gameId: args.gameId,
            roundNumber: args.roundNumber,
            roleId: args.roleId,
            actions: args.actions,
            computeAllocation: args.computeAllocation,
            artifact: args.artifact,
            status: "submitted",
        });
        await logEvent(ctx, args.gameId, "submission", args.roleId, { round: args.roundNumber, actionCount: args.actions.length });
        return id;
    },
});
export const applyGrading = mutation({
    args: {
        submissionId: v.id("submissions"),
        gradedActions: v.array(v.object({
            text: v.string(),
            priority: v.number(),
            probability: v.number(),
            reasoning: v.string(),
        })),
    },
    handler: async (ctx, args) => {
        const sub = await ctx.db.get(args.submissionId);
        if (!sub)
            return;
        await assertPhase(ctx, sub.gameId, ["submit", "rolling"], "apply grading");
        const actions = sub.actions.map((a, i) => ({
            ...a,
            probability: args.gradedActions[i]?.probability ?? a.probability,
            reasoning: args.gradedActions[i]?.reasoning ?? a.reasoning,
        }));
        await ctx.db.patch(args.submissionId, {
            actions,
            status: "graded",
        });
    },
});
export const setAiMeta = mutation({
    args: {
        submissionId: v.id("submissions"),
        aiMeta: v.object({
            gradingModel: v.optional(v.string()),
            gradingTimeMs: v.optional(v.number()),
            gradingTokens: v.optional(v.number()),
            playerModel: v.optional(v.string()),
            playerTimeMs: v.optional(v.number()),
        }),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.submissionId, { aiMeta: args.aiMeta });
    },
});
export const overrideProbability = mutation({
    args: {
        submissionId: v.id("submissions"),
        actionIndex: v.number(),
        probability: v.number(),
    },
    handler: async (ctx, args) => {
        const sub = await ctx.db.get(args.submissionId);
        if (!sub)
            return;
        const actions = [...sub.actions];
        if (actions[args.actionIndex]) {
            actions[args.actionIndex] = {
                ...actions[args.actionIndex],
                probability: args.probability,
            };
        }
        await ctx.db.patch(args.submissionId, { actions });
    },
});
export const rerollAction = mutation({
    args: {
        submissionId: v.id("submissions"),
        actionIndex: v.number(),
    },
    handler: async (ctx, args) => {
        const sub = await ctx.db.get(args.submissionId);
        if (!sub)
            return;
        const actions = [...sub.actions];
        const action = actions[args.actionIndex];
        if (!action || action.probability == null)
            return;
        const newRoll = Math.floor(Math.random() * 100) + 1;
        actions[args.actionIndex] = {
            ...action,
            rolled: newRoll,
            success: newRoll <= (action.probability ?? 50),
        };
        await ctx.db.patch(args.submissionId, { actions });
        await logEvent(ctx, sub.gameId, "reroll", sub.roleId, {
            actionIndex: args.actionIndex,
            oldRoll: action.rolled,
            newRoll,
            probability: action.probability,
        });
    },
});
export const overrideOutcome = mutation({
    args: {
        submissionId: v.id("submissions"),
        actionIndex: v.number(),
        success: v.boolean(),
    },
    handler: async (ctx, args) => {
        const sub = await ctx.db.get(args.submissionId);
        if (!sub)
            return;
        const actions = [...sub.actions];
        if (actions[args.actionIndex]) {
            actions[args.actionIndex] = {
                ...actions[args.actionIndex],
                success: args.success,
            };
        }
        await ctx.db.patch(args.submissionId, { actions });
        await logEvent(ctx, sub.gameId, "override_outcome", sub.roleId, {
            actionIndex: args.actionIndex,
            success: args.success,
        });
    },
});
// Fallback probability based on priority when AI grading hasn't happened
function defaultProbability(priority) {
    if (priority >= 8)
        return 70;
    if (priority >= 5)
        return 50;
    if (priority >= 3)
        return 30;
    return 10;
}
export const rollAllActions = mutation({
    args: { gameId: v.id("games"), roundNumber: v.number() },
    handler: async (ctx, args) => {
        const subs = await ctx.db
            .query("submissions")
            .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
            .collect();
        for (const sub of subs) {
            // Skip already-resolved submissions (prevents double-roll)
            if (sub.status === "resolved")
                continue;
            const actions = sub.actions.map((action) => {
                const probability = action.probability ?? defaultProbability(action.priority);
                const roll = Math.floor(Math.random() * 100) + 1;
                return { ...action, probability, rolled: roll, success: roll <= probability };
            });
            await ctx.db.patch(sub._id, { actions, status: "resolved" });
            const successes = actions.filter((a) => a.success).length;
            await logEvent(ctx, args.gameId, "roll", sub.roleId, { round: args.roundNumber, total: actions.length, successes });
        }
    },
});
