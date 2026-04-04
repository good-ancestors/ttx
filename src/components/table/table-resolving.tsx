"use client";

import { ResultActionCard, type ResultAction } from "./result-action-card";

interface TableResolvingProps {
  phase: "rolling" | "narrate";
  round: {
    label: string;
    summary?: {
      narrative?: string;
      headlines: string[];
      geopoliticalEvents: string[];
    };
  };
  sortedResultActions: ResultAction[];
  showNarrative?: boolean;
  showResults?: boolean;
}

export function TableResolving({
  phase,
  round,
  sortedResultActions,
  showNarrative = true,
  showResults = true,
}: TableResolvingProps) {
  return (
    <div>
      {/* Narrative summary */}
      {showNarrative && phase === "narrate" && round?.summary && (
        <div className="bg-navy rounded-xl p-4 border border-navy-light mb-4 text-white break-words overflow-hidden">
          <h3 className="text-base font-bold mb-3">{round.label} — What Happened</h3>

          {round.summary.narrative && (
            <p className="text-sm text-[#E2E8F0] leading-relaxed mb-3">
              {round.summary.narrative}
            </p>
          )}

          {round.summary.geopoliticalEvents.length > 0 && (
            <div className="mt-3">
              {round.summary.geopoliticalEvents.map((evt, i) => (
                <p key={`geo-evt-${i}`} className="text-sm text-[#CBD5E1] mb-1">
                  {evt}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Own action results — grouped by success/fail */}
      {showResults && (
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold text-text mb-3">
            {phase === "rolling" ? "Resolving..." : "Your Results"}
          </h3>
          {sortedResultActions.map((a, i) => (
            <ResultActionCard
              key={`result-${i}`}
              action={a}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
