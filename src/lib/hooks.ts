"use client";

import { useState, useEffect } from "react";

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
 * Returns true when the browser tab is visible, false when hidden.
 * Used to gate expensive Convex subscriptions when the tab is in the background.
 */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}

/**
 * Shows a syncing indicator when the tab becomes visible after being hidden.
 */
export function useVisibilitySync() {
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        setSyncing(true);
        const timeout = setTimeout(() => setSyncing(false), 2000);
        return () => clearTimeout(timeout);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return syncing;
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

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
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
      if (!expiryStr) return; // no session
      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) {
        localStorage.removeItem(storageKey);
        window.location.href = redirectTo;
      }
    };

    // Check immediately + on interval
    check();
    const interval = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
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
