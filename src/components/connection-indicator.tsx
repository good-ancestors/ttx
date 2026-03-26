"use client";

import { useVisibilitySync } from "@/lib/hooks";

export function ConnectionIndicator() {
  const syncing = useVisibilitySync();
  const status = syncing ? "reconnecting" : "connected";

  return (
    <div className="flex items-center gap-1.5">
      <div className={`connection-dot ${status}`} />
      {status === "reconnecting" && (
        <span className="text-[11px] text-text-light">Syncing...</span>
      )}
    </div>
  );
}
