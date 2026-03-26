"use client";

import { ROLES, getProbabilityCard } from "@/lib/game-data";
import { Check, XCircle, Newspaper, Globe, Cpu, FileText, Loader2 } from "lucide-react";

interface Round {
  _id: string;
  label: string;
  title: string;
  summary?: {
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
    headlines: string[];
    facilitatorNotes?: string;
  };
  fallbackNarrative?: string;
}

interface Submission {
  _id: string;
  roleId: string;
  actions: {
    text: string;
    priority: number;
    probability?: number;
    rolled?: number;
    success?: boolean;
  }[];
  artifact?: string;
}

export function NarrativePanel({
  round,
  submissions,
}: {
  round: Round | undefined;
  submissions: Submission[];
}) {
  if (!round) return null;

  const summary = round.summary;
  const allActions = submissions.flatMap((sub) => {
    const role = ROLES.find((r) => r.id === sub.roleId);
    return sub.actions
      .filter((a) => a.rolled != null)
      .map((a) => ({
        ...a,
        roleName: role?.name ?? sub.roleId,
        roleColor: role?.color ?? "#94A3B8",
      }));
  });

  return (
    <div>
      {/* End-of-turn summary */}
      {summary ? (
        <div className="bg-navy-dark rounded-xl border border-navy-light p-5 mb-4">
          <h3 className="text-lg font-bold text-white mb-1">
            {round.label} — End of Turn
          </h3>
          <p className="text-xs text-text-light mb-4">{round.title}</p>

          {summary.geopoliticalEvents.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Globe className="w-4 h-4 text-viz-capability" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-viz-capability">
                  Geopolitical Events
                </span>
              </div>
              {summary.geopoliticalEvents.map((evt, i) => (
                <p
                  key={i}
                  className="text-[13px] text-[#E2E8F0] mb-1.5 pl-3 border-l-2 border-viz-capability"
                >
                  {evt}
                </p>
              ))}
            </div>
          )}

          {summary.aiStateOfPlay.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu className="w-4 h-4 text-role-ai" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-role-ai">
                  AI State of Play
                </span>
              </div>
              {summary.aiStateOfPlay.map((evt, i) => (
                <p
                  key={i}
                  className="text-[13px] text-[#E2E8F0] mb-1.5 pl-3 border-l-2 border-role-ai"
                >
                  {evt}
                </p>
              ))}
            </div>
          )}

          {summary.headlines.length > 0 && (
            <div className="bg-navy-light rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Newspaper className="w-4 h-4 text-viz-warning" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-viz-warning">
                  News Headlines
                </span>
              </div>
              {summary.headlines.map((h, i) => (
                <p
                  key={i}
                  className="text-[13px] text-[#E2E8F0] italic mb-1"
                >
                  {h}
                </p>
              ))}
            </div>
          )}

          {summary.facilitatorNotes && (
            <div className="mt-4 p-3 bg-navy rounded-lg border border-navy-light">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light mb-1 block">
                Facilitator Notes
              </span>
              <p className="text-[13px] text-[#E2E8F0] italic">
                {summary.facilitatorNotes}
              </p>
            </div>
          )}
        </div>
      ) : round.fallbackNarrative ? (
        <div className="bg-navy-dark rounded-xl border border-navy-light p-5 mb-4">
          <h3 className="text-lg font-bold text-white mb-2">
            {round.label} — End of Turn
          </h3>
          <p className="text-sm text-[#E2E8F0] leading-relaxed whitespace-pre-line">
            {round.fallbackNarrative}
          </p>
        </div>
      ) : null}

      {!summary && !round.fallbackNarrative && (
        <div className="bg-navy-dark rounded-xl border border-navy-light p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="w-5 h-5 text-viz-capability animate-spin" />
            <span className="text-sm font-medium text-text-light">Generating narrative...</span>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-navy-light rounded animate-pulse w-3/4" />
            <div className="h-4 bg-navy-light rounded animate-pulse w-full" />
            <div className="h-4 bg-navy-light rounded animate-pulse w-5/6" />
            <div className="h-4 bg-navy-light rounded animate-pulse w-2/3" />
          </div>
        </div>
      )}

      {/* Action results */}
      <div className="bg-navy-dark rounded-xl border border-navy-light p-5 mb-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light mb-3 block">
          Action Results
        </span>
        <div className="flex flex-col gap-1.5">
          {allActions.map((a, i) => {
            const _prob = a.probability ? getProbabilityCard(a.probability) : null;
            return (
              <div key={i} className="flex items-center gap-2.5 text-[13px]">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: a.roleColor }}
                />
                <span className="text-[#E2E8F0] flex-1">{a.text}</span>
                <span className="font-mono text-[11px] text-text-light">
                  d100:{a.rolled}
                </span>
                {a.success ? (
                  <Check className="w-4 h-4 text-viz-safety" />
                ) : (
                  <XCircle className="w-4 h-4 text-viz-danger" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Creative artifacts */}
      {submissions.some((s) => s.artifact) && (
        <div className="bg-navy-dark rounded-xl border border-navy-light p-5 mb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <FileText className="w-4 h-4 text-viz-warning" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-viz-warning">
              Creative Artifacts
            </span>
          </div>
          {submissions
            .filter((s) => s.artifact)
            .map((s) => {
              const role = ROLES.find((r) => r.id === s.roleId);
              return (
                <div
                  key={s._id}
                  className="bg-navy-light rounded-lg p-3 mb-2"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: role?.color }}
                    />
                    <span className="text-xs font-bold text-text-light">
                      {role?.name}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#E2E8F0] italic">
                    {s.artifact}
                  </p>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
