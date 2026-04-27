/**
 * Vitest setup — registered via `setupFiles` in vitest.config.ts. Runs once per
 * worker on import; the `afterAll` registered here applies to every test file
 * in that worker. Used to drain every game `createTestGame` recorded.
 *
 * `afterAll` (not `afterEach`): integration tests overwhelmingly use the
 * `beforeAll` pattern — one game shared by N `it()` blocks. Per-test cleanup
 * would delete the game after the first `it`, breaking the rest. `afterAll`
 * matches that lifecycle and still drains every tracked game once the file
 * finishes.
 *
 * The global registration means tests using `createTestGame` get cleanup for
 * free regardless of import path — eliminating the footgun where importing
 * `createTestGame` from the wrong module (without the auto-cleanup hook) would
 * silently leak games.
 */

import { afterAll } from "vitest";
import { cleanupTrackedGames } from "./convex-test-client";

afterAll(cleanupTrackedGames);
