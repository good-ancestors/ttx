import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";
export const getByGameAndRound = query({
    args: { gameId: v.id("games"), roundNumber: v.number() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("requests")
            .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
            .collect();
    },
});
export const getForRole = query({
    args: { gameId: v.id("games"), roundNumber: v.number(), roleId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("requests")
            .withIndex("by_to_role", (q) => q
            .eq("gameId", args.gameId)
            .eq("roundNumber", args.roundNumber)
            .eq("toRoleId", args.roleId))
            .collect();
    },
});
export const send = mutation({
    args: {
        gameId: v.id("games"),
        roundNumber: v.number(),
        fromRoleId: v.string(),
        fromRoleName: v.string(),
        toRoleId: v.string(),
        toRoleName: v.string(),
        actionText: v.string(),
        requestType: v.union(v.literal("endorsement"), v.literal("compute"), v.literal("both")),
        computeAmount: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Validate compute amount is positive
        if (args.computeAmount !== undefined && args.computeAmount <= 0) {
            throw new Error("Compute amount must be positive");
        }
        const id = await ctx.db.insert("requests", {
            ...args,
            status: "pending",
        });
        await logEvent(ctx, args.gameId, "request_sent", args.fromRoleId, {
            toRoleId: args.toRoleId,
            requestType: args.requestType,
            computeAmount: args.computeAmount,
            actionText: args.actionText,
        });
        return id;
    },
});
export const respond = mutation({
    args: {
        proposalId: v.id("requests"),
        status: v.union(v.literal("accepted"), v.literal("declined")),
    },
    handler: async (ctx, args) => {
        const proposal = await ctx.db.get(args.proposalId);
        if (!proposal)
            return;
        // Guard: only respond to pending proposals (prevents double-accept)
        if (proposal.status !== "pending")
            return;
        // If accepting a compute request, check funds first and deduct
        if (args.status === "accepted" &&
            (proposal.requestType === "compute" || proposal.requestType === "both") &&
            proposal.computeAmount) {
            const tables = await ctx.db
                .query("tables")
                .withIndex("by_game", (q) => q.eq("gameId", proposal.gameId))
                .collect();
            const acceptorTable = tables.find((t) => t.roleId === proposal.toRoleId);
            const available = acceptorTable?.computeStock ?? 0;
            if (available < proposal.computeAmount) {
                // Insufficient compute — force decline
                await ctx.db.patch(args.proposalId, { status: "declined" });
                await logEvent(ctx, proposal.gameId, "request_declined_insufficient", proposal.toRoleId, {
                    fromRoleId: proposal.fromRoleId,
                    requested: proposal.computeAmount,
                    available,
                });
                return;
            }
            // Deduct compute from giver
            if (acceptorTable) {
                await ctx.db.patch(acceptorTable._id, {
                    computeStock: available - proposal.computeAmount,
                });
            }
            // Credit compute to the requester's table (or their lab if they're a lab-ceo)
            const requesterTable = tables.find((t) => t.roleId === proposal.fromRoleId);
            if (requesterTable) {
                await ctx.db.patch(requesterTable._id, {
                    computeStock: (requesterTable.computeStock ?? 0) + proposal.computeAmount,
                });
            }
        }
        await ctx.db.patch(args.proposalId, { status: args.status });
        await logEvent(ctx, proposal.gameId, `request_${args.status}`, proposal.toRoleId, {
            fromRoleId: proposal.fromRoleId,
            requestType: proposal.requestType,
            computeAmount: proposal.computeAmount,
            actionText: proposal.actionText,
        });
    },
});
