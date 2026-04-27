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

const LOCAL_URL_PATTERN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

export const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET ?? "coral-ember-drift-sage";

function resolveConvexTestUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
  if (process.env.ALLOW_CLOUD_TESTS === "1") return url;
  if (!LOCAL_URL_PATTERN.test(url)) {
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
