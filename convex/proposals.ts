import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByGameAndRound = query({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("proposals")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      )
      .collect();
  },
});

export const getForRole = query({
  args: { gameId: v.id("games"), roundNumber: v.number(), roleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("proposals")
      .withIndex("by_to_role", (q) =>
        q
          .eq("gameId", args.gameId)
          .eq("roundNumber", args.roundNumber)
          .eq("toRoleId", args.roleId)
      )
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("proposals", {
      ...args,
      status: "pending",
    });
  },
});

export const respond = mutation({
  args: {
    proposalId: v.id("proposals"),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.proposalId, { status: args.status });
  },
});
