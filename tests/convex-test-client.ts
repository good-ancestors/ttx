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
 *  are swallowed (game may already be deleted, or partially deleted from a
 *  prior failure). Safe to call multiple times.
 *
 *  Parallel: `splice(0)` atomically claims the queue, then all removes fire
 *  concurrently via `allSettled`. Saves N round-trips of latency per cleanup
 *  versus a sequential loop. */
export async function cleanupTrackedGames(): Promise<void> {
  const drained = trackedGames.splice(0);
  await Promise.allSettled(
    drained.map(({ client, gameId }) =>
      client.mutation(api.games.remove, {
        gameId,
        confirmation: "DELETE",
        facilitatorToken: FACILITATOR_TOKEN,
      }),
    ),
  );
}
