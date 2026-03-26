import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
const actionValidator = v.object({
    text: v.string(),
    priority: v.number(),
    probability: v.optional(v.number()),
    reasoning: v.optional(v.string()),
    rolled: v.optional(v.number()),
    success: v.optional(v.boolean()),
});
export const getByGameAndRound = query({
    args: { gameId: v.id("games"), roundNumber: v.number() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("submissions")
            .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
            .collect();
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
        const existing = await ctx.db
            .query("submissions")
            .withIndex("by_table_and_round", (q) => q.eq("tableId", args.tableId).eq("roundNumber", args.roundNumber))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                actions: args.actions,
                computeAllocation: args.computeAllocation,
                artifact: args.artifact,
                status: "submitted",
            });
            return existing._id;
        }
        return await ctx.db.insert("submissions", {
            tableId: args.tableId,
            gameId: args.gameId,
            roundNumber: args.roundNumber,
            roleId: args.roleId,
            actions: args.actions,
            computeAllocation: args.computeAllocation,
            artifact: args.artifact,
            status: "submitted",
        });
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
            const actions = sub.actions.map((action) => {
                const probability = action.probability ?? defaultProbability(action.priority);
                const roll = Math.floor(Math.random() * 100) + 1;
                return { ...action, probability, rolled: roll, success: roll <= probability };
            });
            await ctx.db.patch(sub._id, { actions, status: "resolved" });
        }
    },
});
