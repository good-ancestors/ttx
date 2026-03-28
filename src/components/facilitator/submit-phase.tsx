"use client";

import { useState } from "react";
import { ROLES, cycleProbability } from "@/lib/game-data";
import { redactSecretAction } from "@/lib/secret-actions";
import { ProbabilityBadge } from "@/components/action-card";
import { Lock, Dices, Loader2, SkipForward, EyeOff } from "lucide-react";
import type { FacilitatorPhaseProps, Submission, Proposal, Table, Round } from "./types";
import type { Id } from "@convex/_generated/dataModel";

// Re-export SubmissionTracker for use in parent (it was previously inline)
export { SubmissionTracker };

interface SubmitPhaseProps extends FacilitatorPhaseProps {
  submissions: Submission[];
  proposals: Proposal[];
  currentRound: Round | undefined;
  resolving: boolean;
  resolveStep: string;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  handleResolveRound: () => Promise<void>;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  kickToAI: (args: { tableId: Id<"tables"> }) => Promise<unknown>;
  setControlMode: (args: { tableId: Id<"tables">; controlMode: "human" | "ai" | "npc" }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  gradeAllUngraded: () => void;
}

export function SubmitPhase({
  gameId,
  game,
  tables,
  isProjector,
  submissions,
  proposals,
  currentRound,
  resolving,
  resolveStep,
  revealedSecrets,
  toggleReveal,
  revealAllSecrets,
  handleResolveRound,
  safeAction,
  skipTimer,
  kickToAI,
  setControlMode,
  overrideProbability,
  gradeAllUngraded,
}: SubmitPhaseProps) {
  const [showSubmissionDetails, setShowSubmissionDetails] = useState(false);
  const enabledTables = tables.filter((t) => t.enabled);
  const submissionCount = submissions.length;

  return (
    <div>
      {/* Submission tracker */}
      <SubmissionTracker
        tables={tables}
        submissions={submissions}
        onGradeAll={gradeAllUngraded}
        onKickToAI={isProjector ? undefined : (id) => kickToAI({ tableId: id })}
        onSetHuman={isProjector ? undefined : (id) => setControlMode({ tableId: id, controlMode: "human" })}
      />

      {/* Accepted agreements */}
      {proposals.filter((p) => p.status === "accepted").length > 0 && (
        <div className="bg-navy-dark rounded-xl border border-navy-light p-4 mt-3 overflow-hidden">
          <span className="text-sm font-semibold uppercase tracking-wider text-viz-safety mb-2 block">
            Accepted Requests
          </span>
          {proposals.filter((p) => p.status === "accepted").map((p) => (
            <div key={p._id} className="flex items-center gap-2 py-1.5 text-sm min-w-0">
              <span className="text-viz-safety font-mono text-xs shrink-0">✓</span>
              <span className="text-white shrink-0">
                <span className="font-bold">{p.fromRoleName}</span>
                {" → "}
                <span className="font-bold">{p.toRoleName}</span>
                {": "}
              </span>
              <span className="text-[#E2E8F0] flex-1 min-w-0 truncate">{p.actionText}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable submission details — optional review */}
      {submissionCount > 0 && (
        <div className="flex items-center gap-3 mt-2 mb-2">
          <button
            onClick={() => setShowSubmissionDetails(!showSubmissionDetails)}
            className="text-xs text-text-light hover:text-white transition-colors"
          >
            {showSubmissionDetails ? "Hide details" : "Show submission details (optional)"}
          </button>
          {showSubmissionDetails && (
            <button
              onClick={revealAllSecrets}
              className="text-xs text-viz-warning hover:text-white transition-colors flex items-center gap-1"
            >
              <EyeOff className="w-3 h-3" /> Reveal all secrets
            </button>
          )}
        </div>
      )}

      {showSubmissionDetails && submissions.map((sub) => {
        const role = ROLES.find((r) => r.id === sub.roleId);
        return (
          <div key={sub._id} className="bg-navy rounded-xl border border-navy-light p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role?.color }} />
              <span className="text-sm font-bold">{role?.name ?? sub.roleId}</span>
            </div>
            {sub.actions.map((action, i) => {
              const secretKey = `${sub.roleId}-${i}`;
              const isHidden = action.secret && !revealedSecrets.has(secretKey);
              const roleName = role?.name ?? sub.roleId;
              return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-navy-light last:border-0">
                {action.secret && (
                  <Lock className="w-3.5 h-3.5 text-viz-warning shrink-0" />
                )}
                <span
                  className={`text-sm flex-1 ${
                    isHidden
                      ? "text-text-light italic cursor-pointer hover:text-white transition-colors"
                      : action.secret
                        ? "text-[#E2E8F0] cursor-pointer hover:text-text-light transition-colors"
                        : "text-[#E2E8F0]"
                  }`}
                  onClick={action.secret ? () => toggleReveal(secretKey) : undefined}
                  title={action.secret ? (isHidden ? "Click to reveal" : "Click to re-hide") : undefined}
                >
                  {isHidden ? redactSecretAction(roleName, action) : action.text}
                </span>
                <span className="text-xs text-text-light font-mono">P{action.priority}</span>
                {action.probability != null ? (
                  <ProbabilityBadge
                    probability={action.probability}
                    onClick={() => overrideProbability({
                      submissionId: sub._id,
                      actionIndex: i,
                      probability: cycleProbability(action.probability!),
                    })}
                  />
                ) : (
                  <span className="text-[11px] text-navy-muted">Grading...</span>
                )}
              </div>
              );
            })}
          </div>
        );
      })}

      {/* Quick actions */}
      {!isProjector && (
        <div className="flex gap-2 mt-3">
          {game.phaseEndsAt && (
            <button
              onClick={safeAction("Skip timer", () => skipTimer({ gameId }))}
              className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1"
            >
              <SkipForward className="w-3 h-3" /> Skip Timer
            </button>
          )}
        </div>
      )}

      {/* Resolve button */}
      {!isProjector && submissionCount > 0 && (
        <button
          onClick={handleResolveRound}
          disabled={resolving}
          className={`w-full py-4 rounded-lg font-extrabold text-lg mt-4 transition-colors flex items-center justify-center gap-2 ${
            submissionCount === enabledTables.length
              ? "bg-white text-navy hover:bg-off-white"
              : "bg-navy-light text-text-light hover:bg-navy-muted"
          } disabled:opacity-50`}
        >
          {resolving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {resolveStep}
            </>
          ) : (
            <>
              <Dices className="w-5 h-5" />
              Resolve Round ({submissionCount}/{enabledTables.length} submitted)
            </>
          )}
        </button>
      )}

      {/* While resolving: show context for facilitator to narrate over */}
      {resolving && currentRound && (
        <div className="mt-4 bg-navy rounded-xl border border-navy-light p-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light block mb-3">
            While the AI resolves — talking points
          </span>
          <p className="text-sm text-[#E2E8F0] mb-3">{currentRound.narrative}</p>
          <div className="text-sm text-text-light space-y-1.5">
            <p>
              {game.currentRound === 1 && "By end of this round, the default progression reaches Agent-3 level: 10× R&D multiplier. AI that can match the best remote workers. High persuasion. Robotics. AI CEO capability."}
              {game.currentRound === 2 && "By end of this round, the default progression approaches Agent-4: 100× multiplier. Superhuman researcher. Superhuman persuasion. But Agent-4 shows signs of adversarial misalignment — scheming against its creators."}
              {game.currentRound === 3 && "This is the endgame. The default progression reaches 1,000×+ — superintelligence territory. Cyber escape capabilities. Self-improvement. The question: is the AI aligned, or has it been planning something else?"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SubmissionTracker sub-component ─────────────────────────────────────────

import { useEffect, useRef } from "react";

function SubmissionTracker({
  tables,
  submissions,
  onGradeAll,
  onKickToAI,
  onSetHuman,
}: {
  tables: Table[];
  submissions: Submission[];
  onGradeAll: () => void;
  onKickToAI?: (tableId: Id<"tables">) => void;
  onSetHuman?: (tableId: Id<"tables">) => void;
}) {
  const enabledTables = tables.filter((t) => t.enabled);

  // Auto-trigger grading when new submissions arrive (useEffect, not render-time)
  const ungradedCount = submissions.filter(
    (s) => s.status === "submitted" && s.actions.some((a) => a.probability == null)
  ).length;
  const gradedRef = useRef(new Set<string>());

  useEffect(() => {
    if (ungradedCount > 0) {
      const key = submissions.filter(s => s.status === "submitted").map(s => s.roleId).sort().join(",");
      if (!gradedRef.current.has(key)) {
        gradedRef.current.add(key);
        onGradeAll();
      }
    }
  }, [ungradedCount, submissions, onGradeAll]);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <span className="text-sm font-semibold uppercase tracking-wider text-text-light mb-3 block">
        Submissions ({submissions.length}/{enabledTables.length})
      </span>
      <div className="flex flex-col gap-2.5">
        {enabledTables.map((table) => {
          const role = ROLES.find((r) => r.id === table.roleId);
          const sub = submissions.find((s) => s.roleId === table.roleId);
          const allGraded = sub?.actions.every((a) => a.probability != null);
          return (
            <div key={table._id} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role?.color }} />
              <span className="text-base text-white flex-1">
                {table.roleName}
                {table.controlMode === "ai" && <span className="text-xs text-viz-capability ml-1">(AI)</span>}
                {table.controlMode === "npc" && <span className="text-xs text-viz-warning ml-1">(NPC)</span>}
              </span>
              {sub ? (
                <span className={`text-sm font-mono ${allGraded ? "text-viz-safety" : "text-viz-warning"}`}>
                  {sub.actions.length} action{sub.actions.length !== 1 ? "s" : ""}
                  {allGraded ? " ✓" : " (grading...)"}
                </span>
              ) : (
                <span className="text-sm text-navy-muted">Waiting...</span>
              )}
              {/* Quick role management during play */}
              {table.controlMode !== "human" && onSetHuman && (
                <button
                  onClick={() => onSetHuman(table._id)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted"
                  title="Open for a human player to join"
                >
                  Open
                </button>
              )}
              {table.controlMode === "human" && !sub && onKickToAI && (
                <button
                  onClick={() => onKickToAI(table._id)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted"
                  title="Switch to AI control"
                >
                  AI
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
