"use client";

import { useState, useMemo } from "react";
import { ROLES, cycleProbability } from "@/lib/game-data";
import { redactSecretAction } from "@/lib/secret-actions";
import { ProbabilityBadge } from "@/components/action-card";
import {
  Lock,
  Dices,
  EyeOff,
  RefreshCw,
  CheckCircle,
  Clock,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import type { Submission, Proposal } from "./types";
import type { Id } from "@convex/_generated/dataModel";

/**
 * "What was attempted" panel — shows actions as they are submitted and graded.
 * Collapsed by default; starts populating when submissions arrive.
 * Endorsement chips are shown inline on relevant actions.
 */
export function AttemptedPanel({
  submissions,
  proposals,
  isProjector,
  resolving,
  revealedCount,
  revealedSecrets,
  toggleReveal,
  revealAllSecrets,
  handleReResolve,
  rerollAction,
  overrideProbability,
  phase,
}: {
  submissions: Submission[];
  proposals: Proposal[];
  isProjector: boolean;
  resolving: boolean;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  handleReResolve: () => Promise<void>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  phase: string;
}) {
  // Collapsed by default — opens when there's content to show
  const [expanded, setExpanded] = useState(false);

  const hasRolled = submissions.some((s) => s.actions.some((a) => a.rolled != null));
  const hasGraded = submissions.some((s) => s.actions.some((a) => a.probability != null));
  const hasSubmissions = submissions.length > 0;
  const isRollingOrNarrate = phase === "rolling" || phase === "narrate";

  const allActions = useMemo(() =>
    submissions.flatMap((sub) => {
      const role = ROLES.find((r) => r.id === sub.roleId);
      return sub.actions
        .map((action, i) => ({ action, i, sub, role }))
        .filter(({ action }) => action.actionStatus === "submitted" || !action.actionStatus);
    }),
  [submissions]);

  const displayActions = useMemo(() => {
    if (isRollingOrNarrate) {
      return [...allActions]
        .filter(({ action }) => action.probability != null || action.rolled != null)
        .sort((a, b) => b.action.priority - a.action.priority);
    }
    return [...allActions].sort((a, b) => b.action.priority - a.action.priority);
  }, [allActions, isRollingOrNarrate]);

  const allRevealed = isRollingOrNarrate && revealedCount >= allActions.length;

  const { endorsementsByRole, endorsementsByText } = useMemo(() => {
    const byRole = new Map<string, Proposal[]>();
    const byText = new Map<string, Proposal[]>();
    for (const p of proposals.filter((p) => p.status === "accepted")) {
      for (const rId of [p.fromRoleId, p.toRoleId]) {
        const list = byRole.get(rId) ?? [];
        list.push(p);
        byRole.set(rId, list);
      }
      const key = p.actionText.toLowerCase().trim();
      const textList = byText.get(key) ?? [];
      textList.push(p);
      byText.set(key, textList);
    }
    return { endorsementsByRole: byRole, endorsementsByText: byText };
  }, [proposals]);

  function getEndorsements(roleId: string, actionText: string): Proposal[] {
    const aText = actionText.toLowerCase().trim();
    const seen = new Set<string>();
    const matches: Proposal[] = [];
    for (const p of endorsementsByRole.get(roleId) ?? []) {
      const pText = p.actionText.toLowerCase().trim();
      if (pText === aText || aText.includes(pText) || pText.includes(aText)) {
        if (!seen.has(p._id)) { seen.add(p._id); matches.push(p); }
      }
    }
    for (const p of endorsementsByText.get(aText) ?? []) {
      if (!seen.has(p._id)) { seen.add(p._id); matches.push(p); }
    }
    return matches;
  }

  if (!hasSubmissions) return null;

  return (
    <div className="bg-navy rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2"
          >
            <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${expanded ? "" : "-rotate-90"}`} />
            <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
              What Was Attempted
            </span>
            {allRevealed && (
              <CheckCircle className="w-3.5 h-3.5 text-viz-safety" />
            )}
          </button>
          {isRollingOrNarrate && !hasRolled && hasGraded && (
            <span className="text-xs text-viz-warning animate-pulse flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Evaluating...
            </span>
          )}
          {isRollingOrNarrate && hasRolled && !allRevealed && (
            <span className="text-xs text-viz-warning animate-pulse flex items-center gap-1">
              <Dices className="w-3.5 h-3.5" /> Rolling...
            </span>
          )}
          {!isRollingOrNarrate && hasSubmissions && (
            <span className="text-xs text-text-light">
              {submissions.length} submitted
            </span>
          )}
        </div>
        {expanded && (
          <button
            onClick={revealAllSecrets}
            className="text-[10px] text-viz-warning hover:text-white transition-colors flex items-center gap-1"
          >
            <EyeOff className="w-3 h-3" /> Reveal secrets
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className="space-y-1.5">
            {displayActions.map(({ action, i, sub, role }, idx) => {
              const secretKey = `${sub.roleId}-${i}`;
              const isCovert = action.secret && !revealedSecrets.has(secretKey);
              const isRolled = action.rolled != null;
              const roleName = role?.name ?? sub.roleId;
              const endorsements = getEndorsements(sub.roleId, action.text);

              // During rolling/narrate, stagger reveal animation
              const shouldAnimate = isRollingOrNarrate;
              const isVisible = !shouldAnimate || idx < revealedCount;

              return (
                <div
                  key={`${sub._id}-${i}`}
                  className={`py-2 border-b border-navy-light/50 last:border-0 transition-all duration-300 ${
                    isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: role?.color }} />
                    <span className="text-xs font-bold text-white shrink-0">{roleName}</span>
                    {action.secret && (
                      <Lock
                        className="w-3 h-3 text-viz-warning shrink-0 mt-0.5 cursor-pointer"
                        onClick={() => toggleReveal(secretKey)}
                      />
                    )}
                    {/* Endorsement chips */}
                    {endorsements.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-1">
                        {endorsements.map((p) => (
                          <span
                            key={p._id}
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-viz-safety/20 text-viz-safety font-semibold"
                            title={`${p.fromRoleName} \u2192 ${p.toRoleName}: ${p.actionText}`}
                          >
                            {p.fromRoleName} \u2713
                          </span>
                        ))}
                      </div>
                    )}
                    {/* AI Systems influence indicator (facilitator only) */}
                    {!isProjector && action.aiInfluence != null && action.aiInfluence !== 0 && (
                      <span
                        className={`flex items-center gap-0.5 text-[9px] font-mono ${
                          action.aiInfluence > 0 ? "text-viz-safety" : "text-viz-danger"
                        }`}
                        title={`AI influence: ${action.aiInfluence > 0 ? "+" : ""}${action.aiInfluence}`}
                      >
                        {action.aiInfluence > 0 ? (
                          <ThumbsUp className="w-2.5 h-2.5" />
                        ) : (
                          <ThumbsDown className="w-2.5 h-2.5" />
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-4">
                    <span
                      className={`text-sm flex-1 min-w-0 ${
                        isCovert
                          ? "text-text-light italic cursor-pointer hover:text-white transition-colors"
                          : action.secret
                            ? "text-[#E2E8F0] cursor-pointer hover:text-text-light transition-colors"
                            : "text-[#E2E8F0]"
                      }`}
                      onClick={action.secret ? () => toggleReveal(secretKey) : undefined}
                      title={action.secret ? (isCovert ? "Click to reveal" : "Click to re-hide") : undefined}
                    >
                      {isCovert ? redactSecretAction(roleName, action) : action.text}
                    </span>
                    {/* Probability / roll display */}
                    {isRolled ? (
                      !isProjector ? (
                        <span className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => void rerollAction({ submissionId: sub._id, actionIndex: i })}
                            className={`text-xs font-mono px-1 rounded hover:bg-navy-light ${action.success ? "text-viz-safety" : "text-viz-danger"}`}
                            title="Click to reroll"
                          >
                            {action.rolled}
                          </button>
                          <span className={`text-xs ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>/</span>
                          <button
                            onClick={() => void overrideProbability({
                              submissionId: sub._id,
                              actionIndex: i,
                              probability: cycleProbability(action.probability ?? 50),
                            })}
                            className="text-xs font-mono px-1 rounded hover:bg-navy-light text-text-light"
                            title="Click to cycle probability"
                          >
                            {action.probability}%
                          </button>
                        </span>
                      ) : (
                        <span className={`text-xs font-mono shrink-0 ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>
                          {action.rolled}/{action.probability}%
                        </span>
                      )
                    ) : action.probability != null ? (
                      <ProbabilityBadge
                        probability={action.probability}
                        onClick={!isProjector ? () => overrideProbability({
                          submissionId: sub._id,
                          actionIndex: i,
                          probability: cycleProbability(action.probability!),
                        }) : undefined}
                      />
                    ) : (
                      <span className="text-xs text-text-light font-mono">P{action.priority}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!isProjector && hasRolled && isRollingOrNarrate && (
            <button
              onClick={handleReResolve}
              disabled={resolving}
              className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1 mt-3 disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" /> Re-resolve from dice
            </button>
          )}
        </>
      )}
    </div>
  );
}
