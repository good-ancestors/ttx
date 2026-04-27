/**
 * Companion table for the games row carrying write-hot resolve fields.
 * Convex invalidates queries at doc granularity, so housing these on a
 * separate row stops ~8–10 patches per resolve from re-pushing the games
 * doc to all 30+ subscribers.
 */

import { v } from "convex/values";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertFacilitator } from "./events";

/** Wire shape — explicit Pick allowlist so a schema field add doesn't land
 *  on the wire by accident; adding a new field requires a deliberate change
 *  here. */
export type RuntimeView = Pick<
  Doc<"gameRuntime">,
  "resolving" | "resolvingStartedAt" | "pipelineStatus" | "resolveNonce"
>;

async function findRow(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<Doc<"gameRuntime"> | null> {
  return await ctx.db
    .query("gameRuntime")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .unique();
}

export async function readRuntime(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<RuntimeView> {
  const row = await findRow(ctx, gameId);
  if (!row) return {};
  const { resolving, resolvingStartedAt, pipelineStatus, resolveNonce } = row;
  return { resolving, resolvingStartedAt, pipelineStatus, resolveNonce };
}

/** Creates the row on first write so callers don't have to manage init order. */
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

export const getInternal = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args): Promise<RuntimeView> => {
    return await readRuntime(ctx, args.gameId);
  },
});

export const getForFacilitator = query({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args): Promise<RuntimeView> => {
    assertFacilitator(args.facilitatorToken);
    return await readRuntime(ctx, args.gameId);
  },
});
