"use client";

import { useVisibilitySync } from "@/lib/hooks";

type Status = "connected" | "reconnecting" | "disconnected";

export function ConnectionIndicator({ status }: { status: Status }) {
  const syncing = useVisibilitySync();
  const effectiveStatus = syncing ? "reconnecting" : status;

  return (
    <div className="flex items-center gap-1.5">
      <div className={`connection-dot ${effectiveStatus}`} />
      {effectiveStatus === "reconnecting" && (
        <span className="text-[11px] text-text-light">Syncing...</span>
      )}
      {effectiveStatus === "disconnected" && (
        <span className="text-[11px] text-viz-danger">Offline</span>
      )}
    </div>
  );
}
