/**
 * Companion table for the games row, carrying write-hot resolve fields:
 * `resolving`, `resolvingStartedAt`, `pipelineStatus`, `resolveNonce`.
 *
 * Why split: these patch ~8–10× per resolve cycle. Convex tracks reactive
 * reads at the doc level, so any query reading the games doc (player view,
 * facilitator panels, lab joins, lightweight rounds, …) re-fires on every
 * patch — even if its projection drops the field. Hosting them on a separate
 * row means only the facilitator's dedicated subscription invalidates.
 */

import { v } from "convex/values";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertFacilitator } from "./events";

/** Wire shape returned to callers — drops `gameId` and Convex system fields
 *  from the row. Derived from `Doc<"gameRuntime">` so a schema field add can
 *  only land on the wire by deliberate addition here too. */
export type RuntimeView = Omit<Doc<"gameRuntime">, "_id" | "_creationTime" | "gameId">;

const EMPTY: RuntimeView = {};

async function findRow(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<Doc<"gameRuntime"> | null> {
  return await ctx.db
    .query("gameRuntime")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .unique();
}

/** Read runtime fields for a game. Returns an empty view if no row exists. */
export async function readRuntime(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<RuntimeView> {
  const row = await findRow(ctx, gameId);
  if (!row) return EMPTY;
  const { resolving, resolvingStartedAt, pipelineStatus, resolveNonce } = row;
  return { resolving, resolvingStartedAt, pipelineStatus, resolveNonce };
}

/** Patch runtime fields for a game. Creates the row on first write so callers
 *  don't have to manage initialisation order.
 *
 *  Pass `undefined` to clear a field. The patch is shallow — fields not in
 *  `fields` are left as-is. */
export async function patchRuntime(
  ctx: MutationCtx,
  gameId: Id<"games">,
  fields: RuntimeView,
): Promise<void> {
  const row = await findRow(ctx, gameId);
  if (row) {
    await ctx.db.patch(row._id, fields);
    return;
  }
  await ctx.db.insert("gameRuntime", { gameId, ...fields });
}

/** Internal read used by pipeline mutations/actions that need
 *  `resolveNonce`/`resolving` from outside a transaction (i.e. via runQuery
 *  from an action). Returns the view shape, never null. */
export const getInternal = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args): Promise<RuntimeView> => {
    return await readRuntime(ctx, args.gameId);
  },
});

/** Public, facilitator-only view of pipeline progress + resolve lock. Players
 *  never call this — only the facilitator dashboard subscribes. */
export const getForFacilitator = query({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args): Promise<RuntimeView> => {
    assertFacilitator(args.facilitatorToken);
    return await readRuntime(ctx, args.gameId);
  },
});
