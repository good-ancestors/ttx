"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import { useAuthMutation } from "@/lib/hooks";
import { api } from "@convex/_generated/api";
import { NarrativePanel } from "@/components/narrative-panel";
import { isResolvingPhase } from "@/lib/game-data";
import type { Round } from "../types";
import type { Id } from "@convex/_generated/dataModel";

/** Types emitted into round.appliedOps by the pipeline. Aggregate types
 *  (multiplierUpdate, productivityMod) roll up the underlying structured
 *  effects — pipeline.ts never pushes breakthrough/modelRollback/
 *  researchDisruption/researchBoost as appliedOps directly. */
type AppliedOpType =
  | "merge"
  | "decommission"
  | "transferOwnership"
  | "multiplierUpdate"
  | "productivityMod"
  | "computeDestroyed"
  | "computeTransfer"
  | "foundLab"
  | "rejected";

const TYPE_LABELS: Record<AppliedOpType, string> = {
  merge: "Merge",
  decommission: "Decommission",
  transferOwnership: "Ownership",
  multiplierUpdate: "R&D update",
  productivityMod: "Productivity",
  computeDestroyed: "Compute destroyed",
  computeTransfer: "Compute transfer",
  foundLab: "New Lab",
  rejected: "Rejected",
};

const TYPE_COLOURS: Record<AppliedOpType, string> = {
  merge: "bg-viz-capability/15 text-viz-capability",
  decommission: "bg-viz-danger/15 text-viz-danger",
  transferOwnership: "bg-viz-safety/15 text-viz-safety",
  multiplierUpdate: "bg-viz-capability/15 text-viz-capability",
  productivityMod: "bg-viz-warning/15 text-viz-warning",
  computeDestroyed: "bg-viz-danger/15 text-viz-danger",
  computeTransfer: "bg-viz-capability/15 text-viz-capability",
  foundLab: "bg-viz-safety/15 text-viz-safety",
  rejected: "bg-viz-danger/15 text-viz-danger",
};

/** invalid_reference (LLM emitted a target that doesn't exist) is scarier than
 *  precondition_failure (rule violation — often benign). */
type RejectionCategory = "invalid_reference" | "precondition_failure";

const CATEGORY_SEVERITY: Record<RejectionCategory, number> = {
  invalid_reference: 2,
  precondition_failure: 1,
};

const CATEGORY_LABELS: Record<RejectionCategory, string> = {
  invalid_reference: "invalid ref",
  precondition_failure: "precondition",
};

/** Section 2 — "What happened". Decide-LLM effect summaries + narrative prose.
 *  Appears once the pipeline has landed at P5 (effect-review) or later. */
export function HappenedSection({
  gameId,
  roundNumber,
  currentRound,
  phase,
  resolving,
  resolveStep,
  isProjector,
  forceClearLock,
  onEditNarrative,
}: {
  gameId: Id<"games">;
  roundNumber: number;
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

  // At the P7 effect-review pause the pipeline is idle waiting for Continue,
  // so the spinner would misread as "stuck". Only show it while actually working.
  const pipelineActivelyWorking = resolving && phase !== "effect-review";

  const appliedOps = currentRound?.appliedOps ?? [];
  const applied = appliedOps.filter((op) => op.status === "applied");
  const severity = (cat: string | undefined) => CATEGORY_SEVERITY[cat as RejectionCategory] ?? 0;
  const rejected = [...appliedOps.filter((op) => op.status === "rejected")]
    .sort((a, b) => severity(b.category) - severity(a.category));

  return (
    <>
      {pipelineActivelyWorking && resolveStep && (
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
       *  the causal order: apply → narrate. */}
      {appliedOps.length > 0 && (
        <AppliedOpsPanel
          applied={applied}
          rejected={rejected}
          mechanicsLog={currentRound?.mechanicsLog}
        />
      )}

      {/* Continue to Narrative bar — placed here (under Applied Effects, above
       *  the empty narrative slot) because clicking it triggers narrative
       *  generation for the effects that have just been reviewed. At any
       *  other phase this does nothing. */}
      {phase === "effect-review" && !isProjector && (
        <ContinueToNarrativeBar gameId={gameId} roundNumber={roundNumber} />
      )}

      {(pipelineActivelyWorking || currentRound?.summary) && (
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

/** Button that wraps up the round from the effect-review pause — triggers R&D
 *  growth, compute acquisition, and the prose summary in one click. "Finalise
 *  Round" reads plainly to a facilitator and avoids the pipeline-jargon word
 *  "narrative" that the code uses internally. */
function ContinueToNarrativeBar({
  gameId,
  roundNumber,
}: {
  gameId: Id<"games">;
  roundNumber: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerContinue = useAuthMutation(api.games.triggerContinueFromEffectReview);

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await triggerContinue({ gameId, roundNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
    // Leave submitting=true on success — the phase change re-renders us out of existence.
  };

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-3 p-2 bg-viz-danger/10 border border-viz-danger/30 rounded text-sm text-viz-danger">
          {error}
        </div>
      )}
      <button
        onClick={() => void handleContinue()}
        disabled={submitting}
        className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Finalising&hellip;
          </>
        ) : (
          <>
            Finalise Round <ChevronRight className="w-5 h-5" />
          </>
        )}
      </button>
      <p className="text-[11px] text-navy-muted text-center mt-2">
        Applies R&amp;D growth, distributes new compute, and writes the round summary.
      </p>
    </div>
  );
}

type AppliedOp = NonNullable<Round["appliedOps"]>[number];
type MechanicsLogEntry = NonNullable<Round["mechanicsLog"]>[number];

function AppliedOpsPanel({
  applied,
  rejected,
  mechanicsLog,
}: {
  applied: AppliedOp[];
  rejected: AppliedOp[];
  mechanicsLog?: MechanicsLogEntry[];
}) {
  if (applied.length === 0 && rejected.length === 0) return null;
  const log = mechanicsLog ?? [];

  return (
    <div className="bg-navy-dark/50 rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          Applied Effects
        </span>
      </div>

      {applied.length > 0 && (
        <div className={rejected.length > 0 ? "mb-4" : undefined}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-light block mb-2 flex items-center gap-1">
            Applied ({applied.length})
          </div>
          <ul className="space-y-1.5">
            {applied.map((op) => (
              <li key={op.summary} className="flex items-start gap-2 text-sm">
                <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mt-[3px] shrink-0 ${TYPE_COLOURS[op.type as AppliedOpType] ?? "bg-navy-light text-text-light"}`}>
                  {TYPE_LABELS[op.type as AppliedOpType] ?? op.type}
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
        <div className={log.length > 0 ? "mb-4" : undefined}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-viz-danger block mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Flagged &amp; rejected ({rejected.length})
          </div>
          <ul className="space-y-1.5">
            {rejected.map((op) => (
              <li key={op.summary} className="flex items-start gap-2 text-sm">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mt-[3px] shrink-0 bg-viz-danger/20 text-viz-danger">
                  {op.opType ?? "Flag"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-navy-muted">{op.summary}</div>
                  {op.category && (
                    <div className="text-[11px] text-viz-danger/80 mt-0.5 uppercase tracking-wider">
                      {CATEGORY_LABELS[op.category as RejectionCategory] ?? op.category}
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

      {log.length > 0 && <MechanicsLogPanel entries={log} />}
    </div>
  );
}

/** Collapsible chronological audit log — every mutation of rdMultiplier,
 *  computeStock, or productivity during phases 5 / 9 / 10. Closes the
 *  debuggability gap that surfaced in the DeepCent trajectory bug: when a
 *  multiplier moves unexpectedly, the facilitator can trace the exact chain
 *  of events that produced the final number before clicking Finalise. */
function MechanicsLogPanel({ entries }: { entries: MechanicsLogEntry[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);

  const fmt = (v: number): string => {
    // Multiplier + productivity render to 2 decimal places for readability;
    // compute stock is always whole units.
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  };
  const fieldLabel: Record<MechanicsLogEntry["field"], string> = {
    rdMultiplier: "R&D multiplier",
    computeStock: "compute",
    productivity: "productivity",
  };
  const phaseLabel: Record<MechanicsLogEntry["phase"], string> = {
    5: "P5 effect",
    9: "P9 growth",
    10: "P10 acquisition",
  };
  const sourceTone: Record<MechanicsLogEntry["source"], string> = {
    "grader-effect": "bg-viz-capability/15 text-viz-capability",
    "natural-growth": "bg-viz-safety/15 text-viz-safety",
    "acquisition": "bg-viz-safety/15 text-viz-safety",
    "player-pinned": "bg-viz-warning/15 text-viz-warning",
    "facilitator-edit": "bg-viz-warning/15 text-viz-warning",
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="mechanics-log-list"
        className="w-full flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-light hover:text-white transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <ClipboardList className="w-3 h-3" />
        Mechanics log ({sorted.length} {sorted.length === 1 ? "entry" : "entries"})
      </button>
      {open && (
        <>
          <ul id="mechanics-log-list" className="mt-2 space-y-1 font-mono text-[11px]">
            {sorted.map((entry) => (
              <li key={entry.sequence} className="flex items-start gap-2 text-text-light/90">
                <span className={`inline-block rounded px-1 py-0.5 shrink-0 text-[9px] uppercase tracking-wider ${sourceTone[entry.source]}`}>
                  {phaseLabel[entry.phase]}
                </span>
                <span className="text-navy-muted shrink-0">#{entry.sequence}</span>
                <span className="font-semibold shrink-0">{entry.subject}</span>
                <span className="text-navy-muted shrink-0">{fieldLabel[entry.field]}</span>
                <span className="shrink-0">{fmt(entry.before)} → {fmt(entry.after)}</span>
                <span className="text-navy-muted italic truncate">{entry.reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-navy-muted mt-2">
            Chronological log of every write to R&amp;D multiplier, compute stock, and
            productivity during this resolve. Phase 5 = grader effects applied; phase 9 =
            R&amp;D growth; phase 10 = compute acquisition for next round.
          </p>
        </>
      )}
    </div>
  );
}
