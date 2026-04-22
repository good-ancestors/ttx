"use client";

import {
  Newspaper,
  BarChart3,
  Server,
  Cpu,
} from "lucide-react";

interface LabSnapshot {
  name: string;
  roleId?: string;
  labId?: string;
  computeStock: number;
  rdMultiplier: number;
  allocation?: { deployment: number; research: number; safety: number };
}

interface RoundData {
  number: number;
  label: string;
  summary?: {
    labs: string[];
    geopolitics: string[];
    publicAndMedia: string[];
    aiSystems: string[];
  };
  labsAfter?: LabSnapshot[];
  aiMeta?: {
    narrativeModel?: string;
    narrativeTimeMs?: number;
    narrativeTokens?: number;
  };
}

/** First non-empty line across sections, in priority order — for a timeline headline. */
function leadLine(summary: RoundData["summary"]): string | undefined {
  if (!summary) return undefined;
  return summary.labs[0] ?? summary.geopolitics[0] ?? summary.publicAndMedia[0] ?? summary.aiSystems[0];
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

      {/* One-line per round — first populated section line */}
      {completedRounds.some((r) => leadLine(r.summary)) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Newspaper className="w-4 h-4 text-text-light" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light">
              Round leads
            </span>
          </div>
          <div className="space-y-2">
            {completedRounds.map((r) => {
              const lead = leadLine(r.summary);
              if (!lead) return null;
              return (
                <div
                  key={r.number}
                  className="flex items-start gap-3 bg-navy-dark rounded-lg p-3 border border-navy-light"
                >
                  <span className="text-[11px] font-mono text-text-light shrink-0 mt-0.5">
                    R{r.number}
                  </span>
                  <span className="text-[13px] text-white leading-snug">{lead}</span>
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
                {initialLabs.map((lab) => {
                  // Follow the same lab through renames/merges by labId (preferred) or roleId.
                  const identityKey = lab.labId ?? lab.roleId ?? lab.name;
                  const matchLab = (l: LabSnapshot) => {
                    if (lab.labId && l.labId) return l.labId === lab.labId;
                    if (lab.roleId && l.roleId) return l.roleId === lab.roleId;
                    return l.name === lab.name;
                  };
                  const latestName = [...labProgressionRounds]
                    .reverse()
                    .map((r) => r.labsAfter?.find(matchLab)?.name)
                    .find((n): n is string => !!n);
                  return (
                    <tr key={identityKey} className="border-b border-navy-light/50">
                      <td className="py-2 pr-4 text-white font-bold">{latestName ?? lab.name}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="text-text-light font-mono">
                          {lab.computeStock}u / {lab.rdMultiplier}x
                        </span>
                      </td>
                      {labProgressionRounds.map((r) => {
                        const labAfter = r.labsAfter?.find(matchLab);
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
                  );
                })}
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
