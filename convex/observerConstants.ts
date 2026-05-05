// Shared observer-related constants. Kept free of `_generated/server` imports
// so the file is safe to import from browser bundles without triggering the
// "Convex functions should not be imported in the browser" warning.

// Driver is considered offline once their last heartbeat is older than this.
// Observer takeover is gated on this threshold + controlMode === "human".
export const TAKEOVER_STALE_MS = 90_000;

// Public-facing label used when an observer has no stored player name. It's
// intentionally generic so the observer-count badge can show "Observer" rather
// than blank, but it's not a valid driver identity — see promoteToDriver.
export const OBSERVER_FALLBACK_NAME = "Observer";
