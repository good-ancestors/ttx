"use client";

import { useState, useEffect, useMemo } from "react";
import { ROLES, AI_SYSTEMS_ROLE_ID, cycleProbability, isSubmittedAction, isResolvingPhase } from "@/lib/game-data";
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
  ChevronRight,
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
  const isRollingOrNarrate = isResolvingPhase(phase);

  const allActions = useMemo(() =>
    submissions.flatMap((sub) => {
      const role = ROLES.find((r) => r.id === sub.roleId);
      return sub.actions
        .map((action, i) => ({ action, i, sub, role }))
        .filter(({ action }) => isSubmittedAction(action));
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

  const isExpanded = isRollingOrNarrate && hasSubmissions ? true : expanded;

  const endorsementsByOwner = useMemo(() => {
    const map = new Map<string, Proposal[]>();
    // Self-endorsement is rejected server-side (requests.ts send/sendInternal).
    // The toRoleId !== fromRoleId check below is kept as a safety net.
    for (const proposal of proposals.filter((item) => (
      item.status === "accepted" &&
      item.requestType === "endorsement" &&
      item.toRoleId !== item.fromRoleId &&
      item.toRoleId !== AI_SYSTEMS_ROLE_ID
    ))) {
      const key = `${proposal.fromRoleId}::${proposal.actionText.toLowerCase().trim()}`;
      const list = map.get(key) ?? [];
      list.push(proposal);
      map.set(key, list);
    }
    return map;
  }, [proposals]);

  function getEndorsements(roleId: string, actionText: string): Proposal[] {
    const aText = actionText.toLowerCase().trim();
    return endorsementsByOwner.get(`${roleId}::${aText}`) ?? [];
  }

  if (!hasSubmissions) return null;

  return (
    <div className="bg-navy rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!isExpanded)}
            className="flex items-center gap-2"
          >
            <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
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
        {isExpanded && (
          <button
            onClick={revealAllSecrets}
            className="text-[10px] text-viz-warning hover:text-white transition-colors flex items-center gap-1"
          >
            <EyeOff className="w-3 h-3" /> Reveal secrets
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="space-y-1.5">
            {isRollingOrNarrate && !allRevealed && (
              <InlineRollStatus />
            )}
            {displayActions.map(({ action, i, sub, role }, idx) => (
              <ActionRow
                key={`${sub._id}-${i}`}
                action={action}
                actionIndex={i}
                sub={sub}
                role={role}
                idx={idx}
                isProjector={isProjector}
                isRollingOrNarrate={isRollingOrNarrate}
                revealedCount={revealedCount}
                revealedSecrets={revealedSecrets}
                toggleReveal={toggleReveal}
                getEndorsements={getEndorsements}
                rerollAction={rerollAction}
                overrideProbability={overrideProbability}
                allowPregrade={!isProjector && !isRollingOrNarrate}
              />
            ))}
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

function ActionRow({
  action,
  actionIndex: i,
  sub,
  role,
  idx,
  isProjector,
  isRollingOrNarrate,
  revealedCount,
  revealedSecrets,
  toggleReveal,
  getEndorsements,
  rerollAction,
  overrideProbability,
  allowPregrade,
}: {
  action: Submission["actions"][number];
  actionIndex: number;
  sub: Submission;
  role: { name: string; color: string } | undefined;
  idx: number;
  isProjector: boolean;
  isRollingOrNarrate: boolean;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  getEndorsements: (roleId: string, actionText: string) => Proposal[];
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  allowPregrade: boolean;
}) {
  const secretKey = `${sub.roleId}-${i}`;
  const isCovert = action.secret && !revealedSecrets.has(secretKey);
  const roleName = role?.name ?? sub.roleId;
  const endorsements = getEndorsements(sub.roleId, action.text);
  const isVisible = !isRollingOrNarrate || idx < revealedCount;

  return (
    <div
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
        {endorsements.length > 0 && (
          <div className="flex flex-wrap gap-1 ml-1">
            {endorsements.map((p) => (
              <span
                key={p._id}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-viz-safety/20 text-viz-safety font-semibold"
                title={`${p.toRoleName} endorsed ${p.fromRoleName}: ${p.actionText}`}
              >
                {p.toRoleName} {"\u2713"}
              </span>
            ))}
          </div>
        )}
        {/* AI influence is secret — not shown on facilitator view */}
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
        <ActionOutcome
          action={action}
          submissionId={sub._id}
          actionIndex={i}
          isProjector={isProjector}
          rerollAction={rerollAction}
          overrideProbability={overrideProbability}
          allowPregrade={allowPregrade}
        />
      </div>
    </div>
  );
}

function ActionOutcome({
  action,
  submissionId,
  actionIndex,
  isProjector,
  rerollAction,
  overrideProbability,
  allowPregrade,
}: {
  action: Submission["actions"][number];
  submissionId: Id<"submissions">;
  actionIndex: number;
  isProjector: boolean;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  allowPregrade: boolean;
}) {
  if (action.rolled != null) {
    if (!isProjector) {
      return (
        <span className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => void rerollAction({ submissionId, actionIndex })}
            className={`text-xs font-mono px-1 rounded hover:bg-navy-light ${action.success ? "text-viz-safety" : "text-viz-danger"}`}
            title="Click to reroll"
          >
            {action.rolled}
          </button>
          <span className={`text-xs ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>/</span>
          <button
            onClick={() => void overrideProbability({
              submissionId,
              actionIndex,
              probability: cycleProbability(action.probability ?? 50),
            })}
            className="text-xs font-mono px-1 rounded hover:bg-navy-light text-text-light"
            title="Click to cycle probability"
          >
            {action.probability}%
          </button>
        </span>
      );
    }
    return (
      <span className={`text-xs font-mono shrink-0 ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>
        {action.rolled}/{action.probability}%
      </span>
    );
  }

  if (action.probability != null) {
    return (
      <ProbabilityBadge
        probability={action.probability}
        onClick={!isProjector ? () => overrideProbability({
          submissionId,
          actionIndex,
          probability: cycleProbability(action.probability!),
        }) : undefined}
      />
    );
  }

  if (allowPregrade) {
    return (
      <button
        onClick={() => void overrideProbability({
          submissionId,
          actionIndex,
          probability: 50,
        })}
        className="shrink-0 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#92400E] hover:bg-[#FDE68A] transition-colors flex items-center gap-1"
      >
        <ChevronRight className="w-3 h-3" /> Grade
      </button>
    );
  }

  return null;
}

function InlineRollStatus() {
  const [displayNumber, setDisplayNumber] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 100) + 1);
    }, 90);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-navy-light bg-navy-dark px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-light text-white">
        <Dices className="h-4 w-4 animate-pulse" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-light/70">Rolling</div>
        <div className="font-mono text-lg font-black text-white tabular-nums">{displayNumber}</div>
      </div>
    </div>
  );
}
