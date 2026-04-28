"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

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
  controlMode: "human" | "ai" | "npc";
  observerSessionId: string;
}

export function TakeoverBanner({
  gameId,
  roleId,
  tableId,
  driverLastSeenAt,
  controlMode,
  observerSessionId,
}: Props) {
  const promote = useMutation(api.observers.promoteToDriver);
  const router = useRouter();
  const computeActive = (lastSeen: number | undefined) =>
    controlMode === "human" && lastSeen != null && Date.now() - lastSeen >= SHOW_AT_MS;

  const [now, setNow] = useState(() => Date.now());
  const [isActive, setIsActive] = useState(() => computeActive(driverLastSeenAt));
  const [lastSeenKey, setLastSeenKey] = useState(driverLastSeenAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  if (sinceLastSeen < SHOW_AT_MS) return null;

  const remainingMs = Math.max(0, STALE_MS - sinceLastSeen);
  const ready = remainingMs === 0;

  const handlePromote = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await promote({ gameId, roleId, sessionId: observerSessionId });
      // Stash session ID under the driver-page key so setConnected reuses it.
      sessionStorage.setItem(`ttx-session-${tableId}`, observerSessionId);
      router.replace(`/game/${gameId}/table/${tableId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to take over");
      setSubmitting(false);
    }
  };

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-lg p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-[#EA580C] shrink-0" />
        <span className="text-sm font-bold text-[#9A3412]">
          {ready
            ? "Driver appears offline"
            : `Driver appears idle — takeover available in ${seconds}s`}
        </span>
      </div>
      <p className="text-xs text-[#C2410C] mb-2">
        {ready
          ? "You can take over driving for this table. The current driver will lose their seat if they return."
          : "If the driver returns and refocuses their tab, this banner will dismiss automatically."}
      </p>
      <button
        onClick={() => void handlePromote()}
        disabled={!ready || submitting}
        className="w-full min-h-[40px] rounded-lg text-sm font-bold bg-[#EA580C] text-white disabled:opacity-40 disabled:cursor-default flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {ready ? "Take over driving" : `Wait ${seconds}s`}
      </button>
      {error && <p className="text-xs text-viz-danger mt-2">{error}</p>}
    </div>
  );
}
