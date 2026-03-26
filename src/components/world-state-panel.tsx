"use client";

import { WORLD_STATE_INDICATORS } from "@/lib/game-data";

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
}: {
  worldState: WorldState;
  variant?: "dark" | "light";
}) {
  const isDark = variant === "dark";

  return (
    <div
      className={`rounded-xl border p-5 ${
        isDark
          ? "bg-navy-dark border-navy-light"
          : "bg-white border-border"
      }`}
    >
      <span
        className={`text-[11px] font-semibold uppercase tracking-wider mb-3 block ${
          isDark ? "text-text-light" : "text-text-muted"
        }`}
      >
        World State
      </span>
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
                className={`w-full h-1.5 rounded-full overflow-hidden ${
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
    </div>
  );
}
