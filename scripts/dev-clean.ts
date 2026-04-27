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

async function main() {
  let drained = 0;
  // games.list caps at 10; loop until empty. Bounded at 50 iterations (500
  // games) so a buggy fixture doesn't burn forever.
  for (let i = 0; i < 50; i++) {
    const games = await convex.query(api.games.list, {});
    if (games.length === 0) {
      console.log(drained === 0 ? "Already clean — no games to drain." : `Drained ${drained} game(s).`);
      return;
    }
    await Promise.all(
      games.map((g) =>
        convex.mutation(api.games.remove, {
          gameId: g._id,
          confirmation: "DELETE",
          facilitatorToken: FACILITATOR_TOKEN,
        }).then(() => { drained++; }).catch(() => { /* already gone — fine */ }),
      ),
    );
  }
  const remaining = await convex.query(api.games.list, {});
  if (remaining.length > 0) {
    throw new Error(`Stalled — ${remaining.length} game(s) still listing after 50 iterations. Inspect manually.`);
  }
  console.log(`Drained ${drained} game(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
