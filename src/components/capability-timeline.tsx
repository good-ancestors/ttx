"use client";

import { CAPABILITY_PROGRESSION } from "@/lib/game-data";

export function CapabilityTimeline({ currentRound }: { currentRound: number }) {
  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light mb-3 block">
        AI Capability Progression
      </span>
      <div className="pt-2">
        <div className="flex items-center gap-0.5 mb-1">
          {CAPABILITY_PROGRESSION.map((_, i) => {
            const active = i <= currentRound;
            const current = i === currentRound;
            return (
              <div key={`bar-${i}`} className="flex-1">
                <div
                  className={`h-1.5 rounded-full transition-all duration-1000 ${!active ? "bg-navy-light" : ""}`}
                  style={{
                    ...(active
                      ? { background: `linear-gradient(90deg, #22C55E, ${i >= 2 ? "#EF4444" : "#06B6D4"})` }
                      : {}),
                    opacity: active ? 1 : 0.3,
                    boxShadow: current ? "0 0 12px rgba(6,182,212,0.25)" : "none",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-0.5">
          {CAPABILITY_PROGRESSION.map((level, i) => {
            const active = i <= currentRound;
            const current = i === currentRound;
            return (
              <div key={`label-${i}`} className="flex-1 text-center pt-1 px-0.5">
                <div
                  className="text-base font-extrabold font-mono transition-colors duration-500"
                  style={{ color: current ? "#06B6D4" : active ? "#FFFFFF" : "#475569" }}
                >
                  {level.multiplier}
                </div>
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: current ? "#FFFFFF" : active ? "#94A3B8" : "#475569" }}
                >
                  {level.label}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: current ? "#94A3B8" : "#475569" }}
                >
                  {level.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
