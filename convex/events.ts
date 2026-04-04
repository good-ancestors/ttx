import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Assert the submission window hasn't closed (5s grace for clock drift). */
export function assertSubmitWindowOpen(game: { phase: string; phaseEndsAt?: number | null }) {
  if (game.phase !== "submit") return;
  if (game.phaseEndsAt != null && Date.now() > game.phaseEndsAt + 5000) {
    throw new Error("Submission deadline has passed");
  }
}

/** Assert the game is in one of the allowed phases. Throws descriptive error if not. */
export async function assertPhase(
  ctx: MutationCtx,
  gameId: Id<"games">,
  allowedPhases: string[],
  action: string,
) {
  const game = await ctx.db.get(gameId);
  if (!game) throw new Error("Game not found");
  if (!allowedPhases.includes(game.phase)) {
    throw new Error(`Cannot ${action} during ${game.phase} phase — only allowed during ${allowedPhases.join("/")}`);
  }
  return game;
}

// Internal helper — call from other mutations to log events
export async function logEvent(
  ctx: MutationCtx,
  gameId: Id<"games">,
  type: string,
  roleId?: string,
  data?: Record<string, unknown>
) {
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
