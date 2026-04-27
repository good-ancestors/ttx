/**
 * Drain every game from the local Convex dev backend. Safe by design — the
 * shared `convex-test-client` URL guard refuses to run against a non-localhost
 * URL unless `ALLOW_CLOUD_TESTS=1` is set.
 *
 * Usage:
 *   npm run dev:clean
 *
 * Or directly:
 *   npx tsx scripts/dev-clean.ts
 */

import { api } from "../convex/_generated/api";
import { getConvexTestClient, FACILITATOR_TOKEN } from "../tests/convex-test-client";

const convex = getConvexTestClient();

/** `games.list` caps at 10 docs per call. The loop's `games.length < 10`
 *  early-out skips the redundant trailing list query when we know the last
 *  batch drained the tail. Bounded at 50 iterations (500 games max) as a
 *  safety net against a buggy backend. */
const LIST_BATCH_CAP = 10;
const MAX_ITERATIONS = 50;

async function main() {
  let drained = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const games = await convex.query(api.games.list, {});
    if (games.length === 0) {
      console.log(drained === 0 ? "Already clean — no games to drain." : `Drained ${drained} game(s).`);
      return;
    }
    await Promise.all(games.map((g) => removeQuiet(g._id)));
    drained += games.length;
    if (games.length < LIST_BATCH_CAP) {
      console.log(`Drained ${drained} game(s).`);
      return;
    }
  }
  throw new Error(`Stalled after ${MAX_ITERATIONS} iterations (${drained} drained). Inspect manually.`);
}

/** Distinguish "already gone" (success) from auth/transport errors (must surface).
 *  The previous swallow-everything handler hid wrong-token failures behind a
 *  silent "Drained 0 games" exit. */
async function removeQuiet(gameId: Parameters<typeof convex.mutation<typeof api.games.remove>>[1]["gameId"]) {
  try {
    await convex.mutation(api.games.remove, {
      gameId,
      confirmation: "DELETE",
      facilitatorToken: FACILITATOR_TOKEN,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/nonexistent document|already deleted|not found/i.test(msg)) return;
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
