"use client";

import { useState, useMemo, useCallback } from "react";
import { ROLE_MAP, AI_SYSTEMS_ROLE_ID, isSubmittedAction, isResolvingPhase, type Lab } from "@/lib/game-data";
import {
  Dices,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
} from "lucide-react";
import type { Submission, Proposal, Table } from "./types";
import type { StructuredEffect } from "@/lib/ai-prompts";
import type { Id } from "@convex/_generated/dataModel";
import { ActionRow, InlineRollStatus } from "./action-row";

/**
 * "What was attempted" panel — shows actions as they are submitted, graded, and rolled.
 *
 * Renders in three modes depending on phase:
 *   - discuss: hidden (component returns null in parent).
 *   - submit / rolling: flat list, staggered reveal animation.
 *   - effect-review / narrate: two-column succeeded/failed split.
 *
 * The "Continue to Narrative" button lives in the HappenedSection, not here —
 * it reads the applied effects to trigger narrative generation for them.
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
  overrideStructuredEffect,
  ungradeAction,
  phase,
  hasNarrative,
  narrativeStale,
  onDiceChanged,
  isTimerExpired,
  labs,
  tables,
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
  overrideStructuredEffect: (args: {
    submissionId: Id<"submissions">;
    actionIndex: number;
    structuredEffect?: StructuredEffect;
    acknowledge?: boolean;
  }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  phase: string;
  hasNarrative: boolean;
  narrativeStale: boolean;
  onDiceChanged: () => void;
  isTimerExpired: boolean;
  labs: Lab[];
  tables: Table[];
}) {
  // Tri-state: null = follow default (open during rolling/narrate, closed otherwise);
  // boolean = user's explicit choice for the current resolving cycle.
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  const hasRolled = submissions.some((s) => s.actions.some((a) => a.rolled != null));
  const hasGraded = submissions.some((s) => s.actions.some((a) => a.probability != null));
  const hasSubmissions = submissions.length > 0;
  const isRollingOrNarrate = isResolvingPhase(phase);
  // Split-view phases: dice are in, so we can group by succeeded/failed.
  const isSplitPhase = phase === "effect-review" || phase === "narrate";

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
    const filtered = isRollingOrNarrate
      ? allActions.filter(({ action }) => action.probability != null || action.rolled != null)
      : allActions;
    const sorted = [...filtered];
    sorted.sort((a, b) => b.action.priority - a.action.priority);
    return sorted;
  }, [allActions, isRollingOrNarrate]);

  // Succeeded / failed lists for the split view.
  const { succeeded, failed } = useMemo(() => {
    const s: typeof displayActions = [];
    const f: typeof displayActions = [];
    for (const entry of displayActions) {
      if (entry.action.rolled == null) continue;
      if (entry.action.success) s.push(entry);
      else f.push(entry);
    }
    return { succeeded: s, failed: f };
  }, [displayActions]);

  // During narrate phase OR the P7 effect-review pause, all actions are already revealed
  // — dice have fully rolled by the time we land on effect-review. The staggered reveal
  // animation only matters during the rolling→effect-review transition itself.
  const effectiveRevealedCount = isSplitPhase ? allActions.length : revealedCount;
  const allRevealed = isRollingOrNarrate && effectiveRevealedCount >= allActions.length;

  // Default open during rolling/narrate/effect-review with submissions, OR when the submit
  // timer has expired (so the facilitator can scan submitted actions before grading).
  // User's explicit toggle still overrides via userExpanded tri-state.
  const defaultExpanded = (isRollingOrNarrate && hasSubmissions)
    || (phase === "submit" && isTimerExpired && hasSubmissions);
  const isExpanded = userExpanded ?? defaultExpanded;
  const setExpanded = (next: boolean) => setUserExpanded(next === defaultExpanded ? null : next);

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

  const getEndorsements = useCallback((roleId: string, actionText: string): Proposal[] => {
    const aText = actionText.toLowerCase().trim();
    return endorsementsByOwner.get(`${roleId}::${aText}`) ?? [];
  }, [endorsementsByOwner]);

  // Derive the lab/role option lists used by the effect editor dropdowns.
  // Labs are filtered to active-only — the editor forbids operating on
  // decommissioned labs. Roles are from enabled tables. Memoised above the
  // early return below so hook order stays consistent across renders.
  const labOptions = useMemo(
    () => labs.filter((l) => l.status !== "decommissioned").map((l) => ({ labId: String(l.labId), name: l.name })),
    [labs],
  );
  // Note: `tables` here is already pre-filtered to enabled tables by the
  // getFacilitatorState query projection — the `enabled` field is not
  // included on the returned docs, so filtering again would always return [].
  const roleOptions = useMemo(
    () => tables.map((t) => ({ roleId: t.roleId, name: t.roleName })),
    [tables],
  );

  if (!hasSubmissions) return null;

  const rowProps = {
    isProjector,
    isRollingOrNarrate,
    revealedCount: effectiveRevealedCount,
    revealedSecrets,
    toggleReveal,
    getEndorsements,
    rerollAction: wrappedReroll,
    overrideProbability: wrappedOverrideProbability,
    overrideStructuredEffect,
    ungradeAction,
    labs: labOptions,
    roles: roleOptions,
    allowPregrade: !isProjector && !isRollingOrNarrate,
  };

  return (
    <div className="bg-navy rounded-xl border border-navy-light p-5">
      <PanelHeader
        isExpanded={isExpanded}
        setExpanded={setExpanded}
        allRevealed={allRevealed}
        isRollingOrNarrate={isRollingOrNarrate}
        hasRolled={hasRolled}
        hasGraded={hasGraded}
        hasSubmissions={hasSubmissions}
        submissionCount={submissions.length}
        showRevealToggle={!isProjector && isExpanded && hasSecrets}
        allSecretsRevealed={allSecretsRevealed}
        revealAllSecrets={revealAllSecrets}
        hideAllSecrets={hideAllSecrets}
      />

      {isExpanded && (
        <div id="attempted-panel-content">
          {isSplitPhase && hasRolled ? (
            <SucceededFailedSplit
              succeeded={succeeded}
              failed={failed}
              rowProps={rowProps}
            />
          ) : (
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
                  {...rowProps}
                />
              ))}
            </div>
          )}

          <RegenerateAffordance
            narrativeStale={narrativeStale}
            hasNarrative={hasNarrative}
            isProjector={isProjector}
            resolving={resolving}
            onReResolve={handleReResolve}
          />
        </div>
      )}
    </div>
  );
}

/** Header row: collapse toggle + status badges + reveal-secrets toggle. */
function PanelHeader({
  isExpanded,
  setExpanded,
  allRevealed,
  isRollingOrNarrate,
  hasRolled,
  hasGraded,
  hasSubmissions,
  submissionCount,
  showRevealToggle,
  allSecretsRevealed,
  revealAllSecrets,
  hideAllSecrets,
}: {
  isExpanded: boolean;
  setExpanded: (v: boolean) => void;
  allRevealed: boolean;
  isRollingOrNarrate: boolean;
  hasRolled: boolean;
  hasGraded: boolean;
  hasSubmissions: boolean;
  submissionCount: number;
  showRevealToggle: boolean;
  allSecretsRevealed: boolean;
  revealAllSecrets: () => void;
  hideAllSecrets: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="attempted-panel-content"
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
            {submissionCount} submitted
          </span>
        )}
      </div>
      {showRevealToggle && (
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
  );
}

/** Trailing "Regenerate" button — variant depends on whether the narrative is
 *  stale. Hidden in projector mode and when no narrative has been generated. */
function RegenerateAffordance({
  narrativeStale,
  hasNarrative,
  isProjector,
  resolving,
  onReResolve,
}: {
  narrativeStale: boolean;
  hasNarrative: boolean;
  isProjector: boolean;
  resolving: boolean;
  onReResolve: () => Promise<void>;
}) {
  if (!hasNarrative || isProjector) return null;
  if (narrativeStale) {
    return (
      <div className="mt-3 rounded-lg border border-viz-warning/30 bg-viz-warning/10 px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-viz-warning">
          Results changed since the summary was generated
        </span>
        <button
          onClick={onReResolve}
          disabled={resolving}
          className="text-[11px] px-3 py-1 rounded font-semibold bg-viz-warning text-navy-dark hover:bg-viz-warning/80 transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
        >
          <RefreshCw className="w-3 h-3" /> Regenerate
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onReResolve}
      disabled={resolving}
      className="text-[11px] px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1 mt-3 disabled:opacity-50 bg-viz-warning/20 text-viz-warning hover:bg-viz-warning/30 border border-viz-warning/30"
    >
      <RefreshCw className="w-3 h-3" /> Regenerate summary
    </button>
  );
}

type SplitEntry = {
  action: Submission["actions"][number];
  i: number;
  sub: Submission;
  role: { name: string; color: string } | undefined;
};

function SucceededFailedSplit({
  succeeded,
  failed,
  rowProps,
}: {
  succeeded: SplitEntry[];
  failed: SplitEntry[];
  rowProps: {
    isProjector: boolean;
    isRollingOrNarrate: boolean;
    revealedCount: number;
    revealedSecrets: Set<string>;
    toggleReveal: (key: string) => void;
    getEndorsements: (roleId: string, actionText: string) => Proposal[];
    rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
    overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
    overrideStructuredEffect: (args: {
      submissionId: Id<"submissions">;
      actionIndex: number;
      structuredEffect?: StructuredEffect;
      acknowledge?: boolean;
    }) => Promise<unknown>;
    ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
    labs: { labId: string; name: string }[];
    roles: { roleId: string; name: string }[];
    allowPregrade: boolean;
  };
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div role="group" aria-labelledby="succeeded-heading">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-3.5 h-3.5 text-viz-safety" aria-hidden="true" />
          <h3 id="succeeded-heading" className="text-[11px] font-semibold uppercase tracking-wider text-viz-safety">
            Succeeded ({succeeded.length})
          </h3>
        </div>
        {succeeded.length === 0 ? (
          <div className="text-xs text-navy-muted py-2">None</div>
        ) : (
          <div className="space-y-1.5">
            {succeeded.map(({ action, i, sub, role }, idx) => (
              <ActionRow
                key={`succeeded-${sub._id}-${i}`}
                action={action}
                actionIndex={i}
                sub={sub}
                role={role}
                idx={idx}
                {...rowProps}
              />
            ))}
          </div>
        )}
      </div>
      <div role="group" aria-labelledby="failed-heading">
        <div className="flex items-center gap-2 mb-2">
          <XCircle className="w-3.5 h-3.5 text-viz-danger" aria-hidden="true" />
          <h3 id="failed-heading" className="text-[11px] font-semibold uppercase tracking-wider text-viz-danger">
            Failed ({failed.length})
          </h3>
        </div>
        {failed.length === 0 ? (
          <div className="text-xs text-navy-muted py-2">None</div>
        ) : (
          <div className="space-y-1.5 opacity-80">
            {failed.map(({ action, i, sub, role }, idx) => (
              <ActionRow
                key={`failed-${sub._id}-${i}`}
                action={action}
                actionIndex={i}
                sub={sub}
                role={role}
                idx={idx}
                {...rowProps}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

