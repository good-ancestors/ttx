"use client";

import { useState } from "react";
import { WORLD_STATE_INDICATORS } from "@/lib/game-data";
import { FullScreenOverlay } from "@/components/full-screen-overlay";
import { Pencil, Maximize2 } from "lucide-react";

interface WorldState {
  capability: number;
  alignment: number;
  tension: number;
  awareness: number;
  regulation: number;
  australia: number;
}

export function WorldStatePanel({
  worldState,
  variant = "dark",
  onEdit,
}: {
  worldState: WorldState;
  variant?: "dark" | "light";
  onEdit?: () => void;
}) {
  const isDark = variant === "dark";
  const [fullScreen, setFullScreen] = useState(false);

  const indicators = (
    <div className="flex flex-col gap-2.5">
      {WORLD_STATE_INDICATORS.map((ind) => {
        const val = worldState[ind.key] || 0;
        return (
          <div key={ind.key}>
            <div className="flex justify-between items-center mb-1">
              <span
                className={`text-xs ${isDark ? "text-text-light" : "text-text-muted"}`}
              >
                {ind.label}
              </span>
              <span
                className={`text-[11px] font-mono ${isDark ? "text-text-light" : "text-text-muted"}`}
              >
                {val}/10
              </span>
            </div>
            <div
              className={`w-full h-2.5 rounded-full overflow-hidden ${
                isDark ? "bg-navy-light" : "bg-warm-gray"
              }`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{
                  width: `${val * 10}%`,
                  backgroundColor: ind.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
    {fullScreen && (
      <FullScreenOverlay title="World State" onClose={() => setFullScreen(false)} bodyClassName="flex-1 max-w-3xl mx-auto w-full flex flex-col justify-center gap-5">
        {indicators}
      </FullScreenOverlay>
    )}

    <div
      className={`rounded-xl border p-5 ${
        isDark
          ? "bg-navy-dark border-navy-light"
          : "bg-white border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-[11px] font-semibold uppercase tracking-wider ${
            isDark ? "text-text-light" : "text-text-muted"
          }`}
        >
          World State
        </span>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button onClick={onEdit} className="text-text-light hover:text-white p-0.5 transition-colors" title="Edit dials">
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => setFullScreen(true)} className="text-text-light hover:text-white p-0.5 transition-colors" title="Full screen">
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {indicators}
    </div>
    </>
  );
}
