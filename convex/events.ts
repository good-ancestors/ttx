import { v } from "convex/values";
import { mutation, query, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Validate facilitator token against env var. Throws if invalid, or if the secret
 *  itself is not configured — silently bypassing auth on a missing env var has
 *  bitten prod deploys before; require the secret to be set so a deployment
 *  misstep fails loud instead of leaving every facilitator mutation open. */
export function assertFacilitator(token: string | undefined) {
  const secret = process.env.FACILITATOR_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: FACILITATOR_SECRET not set — refusing facilitator-gated mutation");
  }
  if (!token || token !== secret) {
    throw new Error("Unauthorized: invalid facilitator token");
  }
}

/** Assert the game isn't currently resolving. 3-minute TTL on the lock so a
 *  crashed pipeline doesn't permanently block subsequent actions. Shared helper
 *  to avoid circular imports between games / computeLedger / submissions. */
const RESOLVE_LOCK_TTL_MS = 3 * 60 * 1000;
export function assertNotResolving(game: { resolving?: boolean; resolvingStartedAt?: number }) {
  if (game.resolving && game.resolvingStartedAt && Date.now() - game.resolvingStartedAt < RESOLVE_LOCK_TTL_MS) {
    throw new Error("Resolution already in progress");
  }
}

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

/** Plain-English rendering for event `data.reason` codes emitted by the player
 *  action path (lab_merge_failed etc.). Used by P7 applied-ops summaries. */
export function plainEventReason(code: string): string {
  switch (code) {
    case "rolled_failure": return "dice roll failed";
    case "lab_already_decommissioned": return "target lab was already absorbed earlier this round";
    case "unknown": return "unknown reason";
    default: return code.replace(/_/g, " ");
  }
}

/** Internal query for the resolve pipeline: fetch events logged since a timestamp,
 *  filtered by type. Used by rollAndApplyEffects to surface player-originated
 *  structural ops (lab_founded / lab_merged / lab_merge_failed) that landed during
 *  the roll phase, for inclusion in the P7 appliedOps review list. */
export const getSinceForRound = internalQuery({
  args: {
    gameId: v.id("games"),
    sinceTimestamp: v.number(),
    types: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const typeSet = new Set(args.types);
    // Range-scan from sinceTimestamp forward — avoids collecting every event
    // logged for the game and filtering in-memory.
    const events = await ctx.db
      .query("events")
      .withIndex("by_game_and_timestamp", (q) => q.eq("gameId", args.gameId).gte("timestamp", args.sinceTimestamp))
      .collect();
    return events.filter((e) => typeSet.has(e.type));
  },
});

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
