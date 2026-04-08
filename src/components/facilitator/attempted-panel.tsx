"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ROLE_MAP, AI_SYSTEMS_ROLE_ID, PROBABILITY_CARDS, isSubmittedAction, isResolvingPhase } from "@/lib/game-data";
import { redactSecretAction } from "@/lib/secret-actions";
import { ProbabilityBadge } from "@/components/action-card";
import {
  Lock,
  Dices,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  MessageSquare,
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
  hideAllSecrets,
  handleReResolve,
  rerollAction,
  overrideProbability,
  ungradeAction,
  phase,
  hasNarrative,
  narrativeStale,
  onDiceChanged,
}: {
  submissions: Submission[];
  proposals: Proposal[];
  isProjector: boolean;
  resolving: boolean;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  hideAllSecrets: () => void;
  handleReResolve: () => Promise<void>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  phase: string;
  hasNarrative: boolean;
  narrativeStale: boolean;
  onDiceChanged: () => void;
}) {
  // Collapsed by default — opens when there's content to show
  const [expanded, setExpanded] = useState(false);

  const hasRolled = submissions.some((s) => s.actions.some((a) => a.rolled != null));
  const hasGraded = submissions.some((s) => s.actions.some((a) => a.probability != null));
  const hasSubmissions = submissions.length > 0;
  const isRollingOrNarrate = isResolvingPhase(phase);

  const allSecretKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const sub of submissions) {
      sub.actions.forEach((a, i) => {
        if (a.secret) keys.add(`${sub.roleId}-${i}`);
      });
    }
    return keys;
  }, [submissions]);
  const hasSecrets = allSecretKeys.size > 0;
  const allSecretsRevealed = hasSecrets && [...allSecretKeys].every((k) => revealedSecrets.has(k));

  const allActions = useMemo(() =>
    submissions.flatMap((sub) => {
      const role = ROLE_MAP.get(sub.roleId);
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

  // During narrate phase, all actions are already revealed — skip staggered animation.
  // The stagger only matters during rolling→narrate transition, not on page reload.
  const effectiveRevealedCount = phase === "narrate" ? allActions.length : revealedCount;
  const allRevealed = isRollingOrNarrate && effectiveRevealedCount >= allActions.length;

  const isExpanded = isRollingOrNarrate && hasSubmissions ? true : expanded;

  // Flag narrative as stale when dice/probability change after narrative is generated
  const wrappedReroll: typeof rerollAction = useCallback(async (args) => {
    const result = await rerollAction(args);
    if (hasNarrative) onDiceChanged();
    return result;
  }, [rerollAction, hasNarrative, onDiceChanged]);
  const wrappedOverrideProbability: typeof overrideProbability = useCallback(async (args) => {
    const result = await overrideProbability(args);
    if (hasNarrative) onDiceChanged();
    return result;
  }, [overrideProbability, hasNarrative, onDiceChanged]);

  const endorsementsByOwner = useMemo(() => {
    const map = new Map<string, Proposal[]>();
    for (const proposal of proposals.filter((item) => (
      (item.status === "accepted" || item.status === "declined") &&
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
        {isExpanded && hasSecrets && (
          <button
            onClick={allSecretsRevealed ? hideAllSecrets : revealAllSecrets}
            className="text-[10px] text-viz-warning hover:text-white transition-colors flex items-center gap-1"
          >
            {allSecretsRevealed ? (
              <><Eye className="w-3 h-3" /> Hide secrets</>
            ) : (
              <><EyeOff className="w-3 h-3" /> Reveal secrets</>
            )}
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
                revealedCount={effectiveRevealedCount}
                revealedSecrets={revealedSecrets}
                toggleReveal={toggleReveal}
                getEndorsements={getEndorsements}
                rerollAction={wrappedReroll}
                overrideProbability={wrappedOverrideProbability}
                ungradeAction={ungradeAction}
                allowPregrade={!isProjector && !isRollingOrNarrate}
              />
            ))}
          </div>
          {narrativeStale && hasNarrative && !isProjector && (
            <div className="mt-3 rounded-lg border border-viz-warning/30 bg-viz-warning/10 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-viz-warning">
                Results changed since narrative was generated
              </span>
              <button
                onClick={handleReResolve}
                disabled={resolving}
                className="text-[11px] px-3 py-1 rounded font-semibold bg-viz-warning text-navy-dark hover:bg-viz-warning/80 transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate
              </button>
            </div>
          )}
          {!narrativeStale && hasNarrative && !isProjector && (
            <button
              onClick={handleReResolve}
              disabled={resolving}
              className="text-[11px] px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1 mt-3 disabled:opacity-50 bg-viz-warning/20 text-viz-warning hover:bg-viz-warning/30 border border-viz-warning/30"
            >
              <RefreshCw className="w-3 h-3" /> Regenerate narrative
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
  ungradeAction,
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
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  allowPregrade: boolean;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
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
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  p.status === "accepted"
                    ? "bg-viz-safety/20 text-viz-safety"
                    : "bg-viz-danger/20 text-viz-danger"
                }`}
                title={`${p.toRoleName} ${p.status} ${p.fromRoleName}'s request`}
              >
                {p.toRoleName} {p.status === "accepted" ? "\u2713" : "\u2717"}
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
          ungradeAction={ungradeAction}
          allowPregrade={allowPregrade}
        />
      </div>
      {/* Reasoning — facilitator click-to-reveal for inspecting AI grading */}
      {!isProjector && action.reasoning && (
        <div className="pl-4 mt-0.5">
          <button
            onClick={() => setReasoningOpen(!reasoningOpen)}
            className="flex items-center gap-1 text-[10px] text-navy-muted hover:text-text-light transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            {reasoningOpen ? "Hide reasoning" : "Show reasoning"}
          </button>
          {reasoningOpen && (
            <p className="text-xs text-text-light/70 mt-1 leading-relaxed">
              {action.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProbabilityDropdown({
  current,
  submissionId,
  actionIndex,
  overrideProbability,
  ungradeAction,
  allowUngrade = true,
}: {
  current: number;
  submissionId: Id<"submissions">;
  actionIndex: number;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  allowUngrade?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const card = PROBABILITY_CARDS.find((p) => p.pct === current) ?? PROBABILITY_CARDS[2];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] font-bold py-0.5 px-2.5 rounded-full flex items-center gap-1"
        style={{ backgroundColor: card.bgColor, color: card.color }}
      >
        {card.label} ({card.pct}%)
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-navy-dark border border-navy-light rounded-lg shadow-xl py-1 min-w-[160px]">
          {PROBABILITY_CARDS.map((p) => (
            <button
              key={p.pct}
              onClick={() => {
                void overrideProbability({ submissionId, actionIndex, probability: p.pct });
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-navy-light transition-colors ${
                p.pct === current ? "font-bold" : ""
              }`}
              style={{ color: p.color }}
            >
              <span>{p.label}</span>
              <span className="font-mono">{p.pct}%</span>
            </button>
          ))}
          {allowUngrade && (
            <>
              <div className="border-t border-navy-light my-1" />
              <button
                onClick={() => {
                  void ungradeAction({ submissionId, actionIndex });
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-light hover:bg-navy-light transition-colors"
              >
                Ungrade
              </button>
            </>
          )}
        </div>
      )}
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
  ungradeAction,
  allowPregrade,
}: {
  action: Submission["actions"][number];
  submissionId: Id<"submissions">;
  actionIndex: number;
  isProjector: boolean;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
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
          <ProbabilityDropdown
            current={action.probability ?? 50}
            submissionId={submissionId}
            actionIndex={actionIndex}
            overrideProbability={overrideProbability}
            ungradeAction={ungradeAction}
            allowUngrade={false}
          />
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
    if (!isProjector) {
      return (
        <ProbabilityDropdown
          current={action.probability}
          submissionId={submissionId}
          actionIndex={actionIndex}
          overrideProbability={overrideProbability}
          ungradeAction={ungradeAction}
        />
      );
    }
    return <ProbabilityBadge probability={action.probability} />;
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
