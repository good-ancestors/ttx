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
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only run a per-second interval inside the active countdown window
  // (SHOW_AT_MS..STALE_MS). Outside that window: schedule a one-shot to wake
  // up at the next interesting boundary, or no timer at all once past STALE_MS.
  useEffect(() => {
    if (controlMode !== "human" || driverLastSeenAt == null) return;
    const sinceLastSeen = Date.now() - driverLastSeenAt;
    if (sinceLastSeen < SHOW_AT_MS) {
      const t = setTimeout(() => setNow(Date.now()), SHOW_AT_MS - sinceLastSeen + 100);
      return () => clearTimeout(t);
    }
    if (sinceLastSeen < STALE_MS) {
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [controlMode, driverLastSeenAt, now]);

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
