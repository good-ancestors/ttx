"use client";

import { ResultActionCard, type ResultAction } from "./result-action-card";
import {
  PROSE_SECTIONS,
  LEGACY_SECTIONS,
  hasProseNarrative,
  hasLegacyNarrative,
  type NarrativeSummary,
} from "@/lib/narrative-sections";

interface TableResolvingProps {
  // effect-review is a facilitator-only pause; from the player table view it
  // should render the same as narrate would before the narrative lands.
  phase: "rolling" | "effect-review" | "narrate";
  round: {
    label: string;
    summary?: NarrativeSummary;
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
  const summary = round?.summary;
  const hasProse = hasProseNarrative(summary);
  const hasLegacy = hasLegacyNarrative(summary);
  const hasSummary = hasProse || hasLegacy;
  return (
    <div>
      {/* Sectioned summary */}
      {showNarrative && phase === "narrate" && hasSummary && summary && (
        <div className="bg-navy rounded-xl p-4 border border-navy-light mb-4 text-white break-words overflow-hidden">
          <h3 className="text-base font-bold mb-3">{round.label} — What Happened</h3>
          <div className="space-y-3">
            {hasProse
              ? PROSE_SECTIONS.map(({ key, label }) => {
                  const text = summary[key];
                  if (!text) return null;
                  return (
                    <div key={key}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-1">
                        {label}
                      </div>
                      <p className="text-sm text-[#E2E8F0] leading-relaxed">{text}</p>
                    </div>
                  );
                })
              : LEGACY_SECTIONS.map(({ key, label }) => {
                  const lines = summary[key] ?? [];
                  if (!lines.length) return null;
                  return (
                    <div key={key}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-1">
                        {label}
                      </div>
                  <ul className="space-y-1">
                    {lines.map((line, i) => (
                      <li key={i} className="text-sm text-[#E2E8F0] leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
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
