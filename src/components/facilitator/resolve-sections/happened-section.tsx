"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { NarrativePanel } from "@/components/narrative-panel";
import { isResolvingPhase } from "@/lib/game-data";
import type { Round } from "../types";
import type { Id } from "@convex/_generated/dataModel";

const TYPE_LABELS: Record<string, string> = {
  merge: "Merge",
  decommission: "Decommission",
  transferOwnership: "Ownership",
  multiplierOverride: "R&D Override",
  computeChange: "Compute",
  foundLab: "New Lab",
};

const TYPE_COLOURS: Record<string, string> = {
  merge: "bg-viz-capability/15 text-viz-capability",
  decommission: "bg-viz-danger/15 text-viz-danger",
  transferOwnership: "bg-viz-safety/15 text-viz-safety",
  multiplierOverride: "bg-viz-capability/15 text-viz-capability",
  computeChange: "bg-viz-capability/15 text-viz-capability",
  foundLab: "bg-viz-safety/15 text-viz-safety",
};

/** invalid_reference (LLM emitted a target that doesn't exist) is scarier than
 *  precondition_failure (rule violation — often benign). */
const CATEGORY_SEVERITY: Record<string, number> = {
  invalid_reference: 2,
  precondition_failure: 1,
};

const CATEGORY_LABELS: Record<string, string> = {
  invalid_reference: "invalid ref",
  precondition_failure: "precondition",
};

/** Section 2 — "What happened". Decide-LLM effect summaries + narrative prose.
 *  Appears once the pipeline has landed at P5 (effect-review) or later. */
export function HappenedSection({
  gameId,
  currentRound,
  phase,
  resolving,
  resolveStep,
  isProjector,
  forceClearLock,
  onEditNarrative,
}: {
  gameId: Id<"games">;
  currentRound: Round | undefined;
  phase: string;
  resolving: boolean;
  resolveStep: string;
  isProjector: boolean;
  forceClearLock: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  onEditNarrative?: () => void;
}) {
  const inResolvingPhase = isResolvingPhase(phase);
  if (!inResolvingPhase) return null;

  const hasError = resolveStep && (
    resolveStep.toLowerCase().includes("error") ||
    resolveStep.toLowerCase().includes("failed")
  );

  const appliedOps = currentRound?.appliedOps ?? [];
  const applied = appliedOps.filter((op) => op.status === "applied");
  const rejected = [...appliedOps.filter((op) => op.status === "rejected")]
    .sort((a, b) => (CATEGORY_SEVERITY[b.category ?? ""] ?? 0) - (CATEGORY_SEVERITY[a.category ?? ""] ?? 0));

  return (
    <>
      {resolving && resolveStep && (
        <div className="flex items-center gap-2 py-2 text-sm text-text-light">
          <Loader2 className="w-4 h-4 animate-spin" />
          {resolveStep}
        </div>
      )}
      {!isProjector && hasError && (
        <button
          onClick={() => void forceClearLock({ gameId })}
          className="text-[11px] px-3 py-1.5 bg-viz-danger/20 text-viz-danger rounded font-medium hover:bg-viz-danger/30 transition-colors flex items-center gap-1 mt-2"
        >
          Clear Lock &amp; Retry
        </button>
      )}

      {/* Applied effects first — these are the mechanical changes the narrate LLM
       *  consumes to produce the prose. Showing them before the narrative matches
       *  the causal order: decide → apply → narrate. */}
      {appliedOps.length > 0 && (
        <AppliedOpsPanel applied={applied} rejected={rejected} />
      )}

      {(resolving || currentRound?.summary) && (
        <NarrativePanel
          round={currentRound}
          isProjector={isProjector}
          debugContext={!isProjector ? { gameId } : undefined}
          onEditNarrative={!isProjector && currentRound?.summary ? onEditNarrative : undefined}
        />
      )}
    </>
  );
}

type AppliedOp = NonNullable<Round["appliedOps"]>[number];

function AppliedOpsPanel({ applied, rejected }: { applied: AppliedOp[]; rejected: AppliedOp[] }) {
  if (applied.length === 0 && rejected.length === 0) return null;

  return (
    <div className="bg-navy-dark/50 rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          Applied Effects
        </span>
        {applied.length === 0 && rejected.length === 0 && (
          <span className="text-xs text-navy-muted">Routine round — no structural changes</span>
        )}
      </div>

      {applied.length > 0 && (
        <div className={rejected.length > 0 ? "mb-4" : undefined}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light block mb-2">
            Applied ({applied.length})
          </span>
          <ul className="space-y-1.5">
            {applied.map((op, i) => (
              <li key={`applied-${i}`} className="flex items-start gap-2 text-sm">
                <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mt-[3px] shrink-0 ${TYPE_COLOURS[op.type] ?? "bg-navy-light text-text-light"}`}>
                  {TYPE_LABELS[op.type] ?? op.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-text-light">{op.summary}</div>
                  {op.reason && <div className="text-[12px] text-navy-muted mt-0.5 italic">{op.reason}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-viz-danger block mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Flagged &amp; rejected ({rejected.length})
          </span>
          <ul className="space-y-1.5">
            {rejected.map((op, i) => (
              <li key={`rejected-${i}`} className="flex items-start gap-2 text-sm">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mt-[3px] shrink-0 bg-viz-danger/20 text-viz-danger">
                  {op.opType ?? "Flag"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-navy-muted">{op.summary}</div>
                  {op.category && (
                    <div className="text-[11px] text-viz-danger/80 mt-0.5 uppercase tracking-wider">
                      {CATEGORY_LABELS[op.category] ?? op.category}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-navy-muted mt-2">
            These ops were proposed but failed validation (e.g. referenced an inactive lab,
            invalid roleId, or tried to decommission the last active lab). The round can
            continue as-is — these ops simply did not apply.
          </p>
        </div>
      )}
    </div>
  );
}
