/**
 * Vitest setup — registered via `setupFiles` in vitest.config.ts. Runs once per
 * test file, BEFORE any test executes. Used here to register a global
 * `afterEach` that drains every game `createTestGame` recorded during the test.
 *
 * The global registration means tests using `createTestGame` get cleanup for
 * free regardless of import path — eliminating the footgun where importing
 * `createTestGame` from the wrong module (without the auto-cleanup hook) would
 * silently leak games.
 */

import { afterEach } from "vitest";
import { cleanupTrackedGames } from "./convex-test-client";

afterEach(cleanupTrackedGames);
