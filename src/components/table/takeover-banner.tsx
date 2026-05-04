"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut } from "lucide-react";

import { OBSERVER_FALLBACK_NAME } from "@convex/observers";
import { getStoredPlayerName, setStoredPlayerName } from "@/lib/hooks";

// Banner appears at SHOW_AT_MS, button enables at STALE_MS (mirrors
// TAKEOVER_STALE_MS in convex/observers.ts; constant duplication is a small
// price for not coupling client to server-only modules).
const STALE_MS = 90_000;
const SHOW_AT_MS = 30_000;

interface Props {
  gameId: Id<"games">;
  roleId: string;
  tableId: Id<"tables">;
  driverLastSeenAt: number | undefined;
  driverLeftAt: number | undefined;
  controlMode: "human" | "ai" | "npc";
  observerSessionId: string;
}

export function TakeoverBanner({
  gameId,
  roleId,
  tableId,
  driverLastSeenAt,
  driverLeftAt,
  controlMode,
  observerSessionId,
}: Props) {
  const promote = useMutation(api.observers.promoteToDriver);
  const router = useRouter();
  const driverLeft = driverLeftAt != null;

  const computeActive = (lastSeen: number | undefined) =>
    controlMode === "human" && lastSeen != null && Date.now() - lastSeen >= SHOW_AT_MS;

  const [now, setNow] = useState(() => Date.now());
  const [isActive, setIsActive] = useState(() => computeActive(driverLastSeenAt));
  const [lastSeenKey, setLastSeenKey] = useState(driverLastSeenAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const [pendingName, setPendingName] = useState(() => {
    const stored = getStoredPlayerName();
    return stored && stored !== OBSERVER_FALLBACK_NAME ? stored : "";
  });

  // Reset gate when the heartbeat updates (driver returned, or first arrival).
  // React-blessed "derive state from prop change" pattern — gated on the prev-
  // state comparison so it only fires once per change, not every render.
  if (lastSeenKey !== driverLastSeenAt) {
    setLastSeenKey(driverLastSeenAt);
    setIsActive(computeActive(driverLastSeenAt));
  }

  // Bridge fresh→active with a one-shot timeout. Once `isActive` flips, the
  // interval effect below keys on it (not on `now`) so it ticks to completion
  // without tearing down each second.
  useEffect(() => {
    if (controlMode !== "human" || driverLastSeenAt == null) return;
    const elapsed = Date.now() - driverLastSeenAt;
    if (elapsed >= SHOW_AT_MS) return;
    const t = setTimeout(() => setIsActive(true), SHOW_AT_MS - elapsed + 100);
    return () => clearTimeout(t);
  }, [controlMode, driverLastSeenAt]);

  // Per-second tick during the active countdown window. Self-cancels once
  // past STALE_MS so we don't keep ticking with the button enabled.
  useEffect(() => {
    if (!isActive || driverLastSeenAt == null) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - driverLastSeenAt >= STALE_MS) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, driverLastSeenAt]);

  if (controlMode !== "human") return null;
  if (driverLastSeenAt == null) return null;

  const sinceLastSeen = now - driverLastSeenAt;
  // Explicit leave skips the 30s "appears idle" window — observers shouldn't
  // wait for a countdown that's purely about distinguishing brief tab blurs
  // from real disconnects.
  if (!driverLeft && sinceLastSeen < SHOW_AT_MS) return null;

  const remainingMs = Math.max(0, STALE_MS - sinceLastSeen);
  const ready = driverLeft || remainingMs === 0;

  const submitTakeover = async (name: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await promote({ gameId, roleId, sessionId: observerSessionId, playerName: name });
      setStoredPlayerName(name);
      // Stash session ID under the driver-page key so setConnected reuses it.
      sessionStorage.setItem(`ttx-session-${tableId}`, observerSessionId);
      router.replace(`/game/${gameId}/table/${tableId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to take over");
      setSubmitting(false);
    }
  };

  const handleClick = () => {
    if (!ready) return;
    if (showNameInput) {
      const trimmed = pendingName.trim();
      if (!trimmed) {
        setError("Please enter a name");
        return;
      }
      void submitTakeover(trimmed);
    } else {
      setShowNameInput(true);
    }
  };

  const seconds = Math.ceil(remainingMs / 1000);
  const stage: "left" | "stale" | "idle" = driverLeft ? "left" : ready ? "stale" : "idle";
  const COPY = {
    left: {
      headline: "Driver left the table",
      subhead: "Take the seat to keep playing this role.",
      action: "Take seat",
      Icon: LogOut,
    },
    stale: {
      headline: "Driver appears offline",
      subhead: "You can take over driving for this table. The current driver will lose their seat if they return.",
      action: "Take over driving",
      Icon: AlertTriangle,
    },
    idle: {
      headline: `Driver appears idle — takeover available in ${seconds}s`,
      subhead: "If the driver returns and refocuses their tab, this banner will dismiss automatically.",
      action: `Wait ${seconds}s`,
      Icon: AlertTriangle,
    },
  } as const;
  const { headline, subhead, action, Icon } = COPY[stage];
  const buttonLabel = ready && showNameInput ? "Confirm and take seat" : action;

  return (
    <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-[#EA580C] shrink-0" />
        <span className="text-sm font-bold text-[#9A3412]">{headline}</span>
      </div>
      <p className="text-xs text-[#C2410C] mb-2">{subhead}</p>
      {showNameInput && (
        <input
          type="text"
          value={pendingName}
          onChange={(e) => setPendingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleClick();
            }
          }}
          placeholder="Your name"
          autoFocus
          maxLength={40}
          disabled={submitting}
          className="w-full min-h-[40px] rounded-lg border border-[#FED7AA] bg-white px-3 text-sm text-[#9A3412] placeholder:text-[#FB923C] mb-2 focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
        />
      )}
      <button
        onClick={handleClick}
        disabled={!ready || submitting}
        className="w-full min-h-[40px] rounded-lg text-sm font-bold bg-[#EA580C] text-white disabled:opacity-40 disabled:cursor-default flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {buttonLabel}
      </button>
      {error && <p className="text-xs text-viz-danger mt-2">{error}</p>}
    </div>
  );
}
