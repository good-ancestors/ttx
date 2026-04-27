/**
 * Vitest-only auto-cleanup hook. Tests that import `createTestGame` from
 * `convex-test-client.ts` get free `afterEach` cleanup as long as this module
 * is loaded — which happens transitively through the import below in any test
 * file that imports `createTestGame`.
 *
 * Why split: CLI scripts (`tests/scenarios/harness.ts`, `tests/scenario-runner.ts`)
 * also use `createTestGame` for tracking but cannot depend on vitest's
 * `afterEach`. Those scripts call `cleanupTrackedGames()` themselves from a
 * `try/finally`. Tests do nothing — this hook covers them.
 *
 * Re-exports `createTestGame` so test files can write a single import:
 *
 *     import { createTestGame } from "./test-game";
 *
 * which both pulls in the helper and registers the auto-cleanup hook.
 */

import { afterEach } from "vitest";
import { cleanupTrackedGames } from "./convex-test-client";

afterEach(cleanupTrackedGames);

export { createTestGame } from "./convex-test-client";
