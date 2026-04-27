/**
 * One-shot data migrations. Run via `npx convex run migrations:<name>`
 * with the facilitator token, e.g.:
 *
 *   npx convex run migrations:clearLegacyResolveFields \
 *     --args='{"facilitatorToken":"<secret>"}' --prod
 *
 * Migrations should be idempotent: running them twice must be a no-op
 * once the first run completes successfully.
 */

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertFacilitator } from "./events";

/** Clears the four deprecated resolve fields on the `games` table. They're
 *  no longer written by any code path post-PR #23 (state lives in the
 *  `gameRuntime` companion row), but existing rows still carry their
 *  pre-split values and `api.games.get` ships them on the wire. Idempotent. */
export const clearLegacyResolveFields = mutation({
  args: { facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const games = await ctx.db.query("games").collect();
    let cleared = 0;
    for (const game of games) {
      if (
        game.resolving === undefined &&
        game.resolvingStartedAt === undefined &&
        game.pipelineStatus === undefined &&
        game.resolveNonce === undefined
      ) continue;
      await ctx.db.patch(game._id, {
        resolving: undefined,
        resolvingStartedAt: undefined,
        pipelineStatus: undefined,
        resolveNonce: undefined,
      });
      cleared += 1;
    }
    return { totalGames: games.length, cleared };
  },
});
