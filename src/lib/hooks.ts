"use client";

import { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from "react";
import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";

/**
 * Detects in-app browsers that may have WebSocket issues.
 */
export function useInAppBrowserDetection() {
  const [isInApp] = useState(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /FBAN|FBAV|Instagram|LinkedIn|Twitter|MicroMessenger|Line\//i.test(ua);
  });

  return isInApp;
}

/**
 * Returns true when the browser tab is visible, false when hidden. Gates
 * expensive Convex subscriptions in background tabs. Behaves the same in dev
 * and prod — the previous dev override was the foot-gun that drove the Apr 23
 * dev-bandwidth spike.
 *
 * Uses `useSyncExternalStore` so that a tab loaded already-hidden hydrates to
 * the correct value without a one-frame `true → false` flicker (a `useEffect`
 * setState would lint-error and also miss the initial reconcile).
 */
export function usePageVisibility(): boolean {
  return useSyncExternalStore(
    pageVisibilitySubscribe,
    () => document.visibilityState === "visible",
    () => true, // SSR: assume visible — `useEffect` rehydration uses the client snapshot.
  );
}

function pageVisibilitySubscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * Client-side countdown timer derived from a server-authoritative phaseEndsAt timestamp.
 */
export function useCountdown(phaseEndsAt: number | undefined) {
  const computeRemaining = () => {
    if (!phaseEndsAt) return 0;
    return Math.max(0, Math.floor((phaseEndsAt - Date.now()) / 1000));
  };
  const [secondsLeft, setSecondsLeft] = useState(computeRemaining);

  useEffect(() => {
    if (!phaseEndsAt) return;

    const update = () =>
      setSecondsLeft(Math.max(0, Math.floor((phaseEndsAt - Date.now()) / 1000)));

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [phaseEndsAt]);

  // Derive display from secondsLeft, but show empty when no timer is active
  const hasTimer = phaseEndsAt != null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = hasTimer ? `${minutes}:${seconds.toString().padStart(2, "0")}` : "";
  const isExpired = secondsLeft <= 0 && phaseEndsAt != null;

  const isUrgent = secondsLeft > 0 && secondsLeft <= 60;
  return { secondsLeft, minutes, seconds, display, isExpired, isUrgent };
}

// ─── Player name persistence ────────────────────────────────────────────────

const PLAYER_NAME_KEY = "ttx-player-name";

export function getStoredPlayerName(): string {
  return typeof window !== "undefined" ? localStorage.getItem(PLAYER_NAME_KEY) ?? "" : "";
}

export function setStoredPlayerName(name: string): void {
  if (typeof window !== "undefined") localStorage.setItem(PLAYER_NAME_KEY, name);
}

/** Get or create a unique ID in the given storage (localStorage or sessionStorage). */
export function getOrCreateId(storage: Storage, key: string): string {
  let id = storage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem(key, id);
  }
  return id;
}

// ─── Session management ─────────────────────────────────────────────────────

export const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_CHECK_INTERVAL_MS = 60 * 1000; // check every 60s

/**
 * Session expiry — redirects to the given URL when the session expires.
 * Stores an expiry timestamp in localStorage on mount. Checks every 60s.
 * When expired, clears the session key and redirects (unmounting all components
 * and killing all Convex subscriptions).
 */
export function useSessionExpiry(storageKey: string, redirectTo: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Set expiry on first visit (don't overwrite if already set)
    const existing = localStorage.getItem(storageKey);
    if (!existing) {
      localStorage.setItem(storageKey, String(Date.now() + SESSION_TTL_MS));
    }

    const check = () => {
      const expiryStr = localStorage.getItem(storageKey);
      if (!expiryStr) {
        // Key was removed (by another tab or manual clear) — redirect
        window.location.href = redirectTo;
        return;
      }
      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) {
        localStorage.removeItem(storageKey);
        window.location.href = redirectTo;
      }
    };

    // Cross-tab sync: if another tab removes the session key, redirect this tab too
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue === null) {
        window.location.href = redirectTo;
      }
    };
    window.addEventListener("storage", onStorage);

    // Check immediately + on interval
    check();
    const interval = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey, redirectTo]);
}

/**
 * Scrolls the focused textarea into view when the mobile keyboard opens.
 */
export function useKeyboardScroll() {
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        setTimeout(() => {
          (e.target as HTMLElement).scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 300);
      }
    };
    document.addEventListener("focusin", handleFocus);
    return () => document.removeEventListener("focusin", handleFocus);
  }, []);
}

const FACILITATOR_TOKEN_KEY = "ttx-facilitator-token";
const FACILITATOR_TOKEN_EVENT = "ttx:facilitator-token-change";

/** Read the facilitator token from localStorage (SSR-safe, cross-tab sync). */
export function useFacilitatorToken(): string | undefined {
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", cb);
    window.addEventListener(FACILITATOR_TOKEN_EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(FACILITATOR_TOKEN_EVENT, cb);
    };
  }, []);

  const getSnapshot = useCallback(
    () => (typeof window === "undefined" ? undefined : localStorage.getItem(FACILITATOR_TOKEN_KEY) ?? undefined),
    [],
  );

  const getServerSnapshot = useCallback(() => undefined, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Store the facilitator token in localStorage. */
export function storeFacilitatorToken(passphrase: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FACILITATOR_TOKEN_KEY, passphrase);
  window.dispatchEvent(new Event(FACILITATOR_TOKEN_EVENT));
}

/**
 * Wraps a Convex mutation to automatically inject facilitatorToken.
 * Returns a function with the same signature, but `facilitatorToken` is added automatically.
 */
export function useAuthMutation<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends FunctionReference<"mutation", "public", any, any>,
>(mutation: T) {
  const token = useFacilitatorToken();
  const mutate = useMutation(mutation);
  return useMemo(() => {
    // Return a function that injects facilitatorToken into the first argument
    const wrapper = (args: Record<string, unknown>) =>
      mutate({ ...args, facilitatorToken: token } as Parameters<typeof mutate>[0]);
    return wrapper;
  }, [mutate, token]);
}

/**
 * Parses free text into individual action items.
 */
export function parseActionsFromText(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/[\n;]|(?:\d+[\.\)]\s*)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, 5);
}
