"use client";

import { ROLES, cycleProbability } from "@/lib/game-data";
import {
  Lock,
  Dices,
  EyeOff,
  RefreshCw,
  CheckCircle,
  Clock,
} from "lucide-react";
import type { FacilitatorPhaseProps, Submission } from "./types";
import type { Id } from "@convex/_generated/dataModel";

interface RollingPhaseProps extends FacilitatorPhaseProps {
  submissions: Submission[];
  resolving: boolean;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  handleReResolve: () => Promise<void>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
}

export function RollingPhase({
  isProjector,
  submissions,
  resolving,
  revealedCount,
  revealedSecrets,
  toggleReveal,
  revealAllSecrets,
  handleReResolve,
  rerollAction,
  overrideProbability,
}: RollingPhaseProps) {
  const hasRolled = submissions.some((s) => s.actions.some((a) => a.rolled != null));
  const hasGraded = submissions.some((s) => s.actions.some((a) => a.probability != null));

  // Nothing to show yet
  if (!hasRolled && !hasGraded) return null;

  // Flatten and sort all actions by priority descending
  // Show graded actions (with probability) even before dice roll
  const allActions = submissions.flatMap((sub) => {
    const role = ROLES.find((r) => r.id === sub.roleId);
    return sub.actions
      .map((action, i) => ({ action, i, sub, role }))
      .filter(({ action }) => action.probability != null || action.rolled != null);
  }).sort((a, b) => b.action.priority - a.action.priority);

  const allRevealed = revealedCount >= allActions.length;

  return (
    <div className="bg-navy rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
            {hasRolled ? "Dice Results" : "Probabilities"}
          </span>
          {!hasRolled ? (
            <span className="text-xs text-viz-warning animate-pulse flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Evaluating...
            </span>
          ) : !allRevealed ? (
            <span className="text-xs text-viz-warning animate-pulse flex items-center gap-1">
              <Dices className="w-3.5 h-3.5" /> Rolling...
            </span>
          ) : (
            <span className="text-xs text-viz-safety flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> All actions resolved
            </span>
          )}
        </div>
        <button
          onClick={revealAllSecrets}
          className="text-[10px] text-viz-warning hover:text-white transition-colors flex items-center gap-1"
        >
          <EyeOff className="w-3 h-3" /> Reveal secrets
        </button>
      </div>
      <div className="space-y-1.5">
        {allActions.map(({ action, i, sub, role }, idx) => {
              const secretKey = `${sub.roleId}-${i}`;
              const isCovert = action.secret && !revealedSecrets.has(secretKey);
              const isRolled = action.rolled != null;
              return (
                <div
                  key={`${sub._id}-${i}`}
                  className={`py-2 border-b border-navy-light/50 last:border-0 transition-all duration-300 ${
                    idx < revealedCount ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                  }`}
                >
                  {/* Row 1: role + action text */}
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: role?.color }} />
                    <span className="text-xs font-bold text-white shrink-0">{role?.name ?? sub.roleId}</span>
                    {action.secret && (
                      <Lock
                        className="w-3 h-3 text-viz-warning shrink-0 mt-0.5 cursor-pointer"
                        onClick={() => toggleReveal(secretKey)}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-4">
                    <span
                      className={`text-sm flex-1 min-w-0 ${isCovert ? "text-text-light italic cursor-pointer" : "text-[#E2E8F0]"}`}
                      onClick={action.secret ? () => toggleReveal(secretKey) : undefined}
                    >
                      {isCovert ? "[Covert action]" : action.text}
                    </span>
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
                    ) : (
                      // Graded but not yet rolled — show probability only
                      <span className="text-xs font-mono shrink-0 text-text-light">
                        {action.probability}%
                      </span>
                    )}
                  </div>
                </div>
              );
        })}
      </div>
      {/* Re-resolve button if outcomes were changed */}
      {!isProjector && hasRolled && (
        <button
          onClick={handleReResolve}
          disabled={resolving}
          className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1 mt-3 disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" /> Re-resolve from dice
        </button>
      )}
    </div>
  );
}
