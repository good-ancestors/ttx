"use client";

import {
  Newspaper,
  BarChart3,
  Server,
  Cpu,
} from "lucide-react";

interface LabSnapshot {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation?: { users: number; capability: number; safety: number };
}

interface RoundData {
  number: number;
  label: string;
  summary?: {
    headlines: string[];
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
  };
  labsAfter?: LabSnapshot[];
  aiMeta?: {
    narrativeModel?: string;
    narrativeTimeMs?: number;
    narrativeTokens?: number;
  };
}

interface Props {
  rounds: RoundData[];
  initialLabs: LabSnapshot[];
}

export function GameTimeline({ rounds, initialLabs }: Props) {
  const completedRounds = rounds
    .filter((r) => r.labsAfter)
    .sort((a, b) => a.number - b.number);

  const labProgressionRounds = rounds
    .filter((r) => r.labsAfter)
    .sort((a, b) => a.number - b.number);

  return (
    <div className="bg-navy rounded-xl border border-navy-light p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-text-light" />
        <h3 className="text-lg font-extrabold text-white">Game Timeline</h3>
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
