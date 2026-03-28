"use client";

import { WORLD_STATE_INDICATORS } from "@/lib/game-data";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShieldCheck,
  Newspaper,
  BarChart3,
  Server,
  Cpu,
} from "lucide-react";

interface WorldState {
  capability: number;
  alignment: number;
  tension: number;
  awareness: number;
  regulation: number;
  australia: number;
}

interface LabSnapshot {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation?: { users: number; capability: number; safety: number };
}

interface RoundData {
  number: number;
  label: string;
  title: string;
  summary?: {
    headlines: string[];
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
  };
  worldStateAfter?: WorldState;
  labsAfter?: LabSnapshot[];
  aiMeta?: {
    narrativeModel?: string;
    narrativeTimeMs?: number;
    narrativeTokens?: number;
  };
}

interface Props {
  rounds: RoundData[];
  initialWorldState: WorldState;
  initialLabs: LabSnapshot[];
}

type WSKey = keyof WorldState;

function getEndingAssessment(finalAlignment: number) {
  if (finalAlignment <= 3) {
    return { label: "RACE ENDING trajectory", color: "text-viz-danger", Icon: AlertTriangle };
  }
  if (finalAlignment >= 6) {
    return { label: "SLOWDOWN ENDING trajectory", color: "text-viz-safety", Icon: ShieldCheck };
  }
  return { label: "UNCERTAIN trajectory", color: "text-viz-warning", Icon: Minus };
}

function TrendIcon({ prev, curr }: { prev: number; curr: number }) {
  if (curr > prev) return <TrendingUp className="w-3 h-3 text-viz-safety" />;
  if (curr < prev) return <TrendingDown className="w-3 h-3 text-viz-danger" />;
  return <Minus className="w-3 h-3 text-text-light" />;
}

export function GameTimeline({ rounds, initialWorldState, initialLabs }: Props) {
  // Build the progression: initial + each round's worldStateAfter
  const completedRounds = rounds
    .filter((r) => r.worldStateAfter)
    .sort((a, b) => a.number - b.number);

  const worldStateProgression: { label: string; state: WorldState }[] = [
    { label: "Start", state: initialWorldState },
    ...completedRounds.map((r) => ({
      label: `R${r.number}`,
      state: r.worldStateAfter!,
    })),
  ];

  const labProgressionRounds = rounds
    .filter((r) => r.labsAfter)
    .sort((a, b) => a.number - b.number);

  // Final state for ending assessment
  const finalState =
    completedRounds.length > 0
      ? completedRounds[completedRounds.length - 1].worldStateAfter!
      : initialWorldState;
  const ending = getEndingAssessment(finalState.alignment);

  return (
    <div className="bg-navy rounded-xl border border-navy-light p-6 space-y-6">
      {/* Header + Ending Assessment */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-text-light" />
          <h3 className="text-lg font-extrabold text-white">Game Timeline</h3>
        </div>
        {completedRounds.length > 0 && (
          <div className={`flex items-center gap-2 ${ending.color}`}>
            <ending.Icon className="w-4 h-4" />
            <span className="text-sm font-bold">{ending.label}</span>
          </div>
        )}
      </div>

      {/* World State Progression Bars */}
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light mb-3 block">
          World State Progression
        </span>
        <div className="space-y-3">
          {WORLD_STATE_INDICATORS.map((ind) => {
            const key = ind.key as WSKey;
            const values = worldStateProgression.map((p) => p.state[key]);
            const isHighlighted = key === "capability" || key === "alignment";

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-xs ${isHighlighted ? "text-white font-bold" : "text-text-light"}`}
                  >
                    {ind.label}
                    {key === "capability" && (
                      <span className="text-[10px] text-text-light font-normal ml-1">
                        (should increase)
                      </span>
                    )}
                    {key === "alignment" && (
                      <span className="text-[10px] text-text-light font-normal ml-1">
                        (determines ending)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {values.map((v, i) => (
                      <span
                        key={`${key}-val-${i}`}
                        className="text-[11px] font-mono text-text-light flex items-center gap-0.5"
                      >
                        {i > 0 && <TrendIcon prev={values[i - 1]} curr={v} />}
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Multi-segment bar */}
                <div className="flex items-center gap-1">
                  {worldStateProgression.map((p, i) => (
                    <div key={`${key}-bar-${i}`} className="flex-1 flex items-center gap-1">
                      <div className="flex-1 h-2 bg-navy-light rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{
                            width: `${p.state[key] * 10}%`,
                            backgroundColor: ind.color,
                            opacity: isHighlighted ? 1 : 0.7,
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-navy-muted font-mono w-6 text-right shrink-0">
                        {p.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Headlines per Round */}
      {completedRounds.some((r) => r.summary?.headlines?.length) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Newspaper className="w-4 h-4 text-text-light" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light">
              Headlines
            </span>
          </div>
          <div className="space-y-2">
            {completedRounds.map((r) => {
              const headline = r.summary?.headlines?.[0];
              if (!headline) return null;
              return (
                <div
                  key={r.number}
                  className="flex items-start gap-3 bg-navy-dark rounded-lg p-3 border border-navy-light"
                >
                  <span className="text-[11px] font-mono text-text-light shrink-0 mt-0.5">
                    R{r.number}
                  </span>
                  <span className="text-[13px] text-white leading-snug">{headline}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lab Progression Table */}
      {(labProgressionRounds.length > 0 || initialLabs.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-text-light" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light">
              Lab Progression
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-navy-light">
                  <th className="text-left text-text-light font-semibold py-2 pr-4">Lab</th>
                  <th className="text-center text-text-light font-semibold py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <Cpu className="w-3 h-3" /> Start
                    </div>
                  </th>
                  {labProgressionRounds.map((r) => (
                    <th key={r.number} className="text-center text-text-light font-semibold py-2 px-3">
                      R{r.number}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initialLabs.map((lab) => (
                  <tr key={lab.name} className="border-b border-navy-light/50">
                    <td className="py-2 pr-4 text-white font-bold">{lab.name}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-text-light font-mono">
                        {lab.computeStock}u / {lab.rdMultiplier}x
                      </span>
                    </td>
                    {labProgressionRounds.map((r) => {
                      const labAfter = r.labsAfter?.find((l) => l.name === lab.name);
                      if (!labAfter) {
                        return (
                          <td key={r.number} className="py-2 px-3 text-center text-navy-muted">
                            --
                          </td>
                        );
                      }
                      return (
                        <td key={r.number} className="py-2 px-3 text-center">
                          <span className="text-white font-mono">
                            {labAfter.computeStock}u / {labAfter.rdMultiplier}x
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Meta (subtle) */}
      {completedRounds.some((r) => r.aiMeta?.narrativeModel) && (
        <div className="border-t border-navy-light pt-3">
          <div className="flex flex-wrap gap-4">
            {completedRounds.map((r) =>
              r.aiMeta?.narrativeModel ? (
                <span key={r.number} className="text-[10px] text-navy-muted font-mono">
                  R{r.number}: {r.aiMeta.narrativeModel}
                  {r.aiMeta.narrativeTimeMs
                    ? ` (${(r.aiMeta.narrativeTimeMs / 1000).toFixed(1)}s)`
                    : ""}
                  {r.aiMeta.narrativeTokens ? ` ${r.aiMeta.narrativeTokens}tok` : ""}
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
