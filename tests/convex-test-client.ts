/**
 * Shared Convex test client + URL guard. Imported by every integration test
 * and ad-hoc scenario script that hits Convex over the wire.
 *
 * Why this exists: integration tests create games and don't reliably clean up.
 * If `NEXT_PUBLIC_CONVEX_URL` points at the cloud dev backend (which `.env.local`
 * does for the running app), `npm run test:integration` leaks games into the
 * shared dev deployment, and reactive subscribers hammer the bandwidth budget.
 *
 * Default behaviour: refuse to run unless the URL points at localhost.
 * Override: set `ALLOW_CLOUD_TESTS=1` (used by intentional one-shot prod-shape
 * verification runs).
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET ?? "coral-ember-drift-sage";

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch {
    return false;
  }
}

function resolveConvexTestUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
  if (process.env.ALLOW_CLOUD_TESTS === "1") return url;
  if (!isLocalUrl(url)) {
    throw new Error(
      `Refusing to run tests against ${url}.\n\n` +
        `Integration tests create games and don't always clean up. Running them against a cloud Convex deployment leaks state and burns bandwidth.\n\n` +
        `Either:\n` +
        `  • Run \`npx convex dev\` and set NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 in your shell before running tests, or\n` +
        `  • Set ALLOW_CLOUD_TESTS=1 if you really mean it (one-shot prod-shape verification only).\n`,
    );
  }
  return url;
}

export function getConvexTestClient(): ConvexHttpClient {
  return new ConvexHttpClient(resolveConvexTestUrl());
}

// ─── Game-creation tracking (test isolation) ──────────────────────────────────
//
// `createTestGame` records every game it creates so a single drain call can
// clean them up at the end of a test or scenario. Vitest tests use the
// `afterEach` hook in `test-game.ts` (which calls `cleanupTrackedGames`); CLI
// scripts (`tests/scenarios/harness.ts`, `tests/scenario-runner.ts`) call it
// from their own `try/finally`. Both routes share the same tracking list.

interface TrackedGame {
  client: ConvexHttpClient;
  gameId: Id<"games">;
}

/** Per-worker process state. Vitest's default `pool: "forks"` means each test
 *  file runs in its own worker process, so this list is naturally scoped. If
 *  the project ever switches to threads or `--no-isolate`, switch to a vitest
 *  beforeEach-bound list (or a context map keyed by test ID) — otherwise
 *  parallel files could clobber each other's tracked games. */
const trackedGames: TrackedGame[] = [];

export async function createTestGame(
  client: ConvexHttpClient,
  opts: { tableCount?: number } = {},
): Promise<Id<"games">> {
  const gameId = await client.mutation(api.games.create, {
    ...opts,
    facilitatorToken: FACILITATOR_TOKEN,
  });
  trackedGames.push({ client, gameId });
  return gameId;
}

/** Drain every game `createTestGame` recorded. Best-effort: errors per game
 *  are tolerated (game may already be deleted, or partially deleted from a
 *  prior failure). Safe to call multiple times.
 *
 *  Parallel: `splice(0)` atomically claims the queue, then all removes fire
 *  concurrently via `allSettled`. Saves N round-trips of latency per cleanup
 *  versus a sequential loop.
 *
 *  Logs a warning if any removal failed. Doesn't throw — would mask the actual
 *  test failure that probably caused the leak. But silent on a wrong-token CI
 *  regression would leak games until someone notices the bandwidth bill. */
export async function cleanupTrackedGames(): Promise<void> {
  const drained = trackedGames.splice(0);
  if (drained.length === 0) return;
  const results = await Promise.allSettled(
    drained.map(({ client, gameId }) =>
      client.mutation(api.games.remove, {
        gameId,
        confirmation: "DELETE",
        facilitatorToken: FACILITATOR_TOKEN,
      }),
    ),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length > 0) {
    const reasons = failures.slice(0, 3).map((f) => String(f.reason)).join(" · ");
    console.warn(`[cleanupTrackedGames] ${failures.length}/${drained.length} game(s) failed to delete: ${reasons}`);
  }
}
