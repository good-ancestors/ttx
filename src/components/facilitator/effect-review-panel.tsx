"use client";

import { useState } from "react";
import { CheckCircle, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { useAuthMutation } from "@/lib/hooks";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Round } from "./types";

/** P7 — facilitator review of structural effects applied by the decide LLM.
 *
 *  The decide pass has landed: merges, decommissions, ownership transfers, compute
 *  adjustments, and LLM multiplier overrides have been applied to lab state. The
 *  facilitator sees a compact summary (and any rejected ops as flags) and either
 *  clicks "Continue to Narrative" — which triggers R&D growth, new-compute
 *  acquisition, and the narrative LLM — or leaves the game paused here while they
 *  manually adjust state via the edit modals.
 *
 *  This is a mandatory pause per docs/resolve-pipeline.md. In a clean round most
 *  facilitators will scan and continue in under 10 seconds.
 */
interface Props {
  gameId: Id<"games">;
  round: Round | undefined;
  roundNumber: number;
  isProjector: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  merge: "Merge",
  decommission: "Decommission",
  transferOwnership: "Ownership",
  multiplierOverride: "R&D Override",
  computeChange: "Compute",
  rejected: "Flag",
};

const TYPE_COLOURS: Record<string, string> = {
  merge: "bg-viz-capability/15 text-viz-capability",
  decommission: "bg-viz-danger/15 text-viz-danger",
  transferOwnership: "bg-viz-safety/15 text-viz-safety",
  multiplierOverride: "bg-viz-capability/15 text-viz-capability",
  computeChange: "bg-viz-capability/15 text-viz-capability",
  foundLab: "bg-viz-safety/15 text-viz-safety",
  rejected: "bg-viz-danger/20 text-viz-danger",
};

/** Severity order for rejected ops — higher = render first. invalid_reference
 *  (LLM emitted a target that doesn't exist) is scarier than precondition_failure
 *  (rule violation, often benign). */
const CATEGORY_SEVERITY: Record<string, number> = {
  invalid_reference: 2,
  precondition_failure: 1,
};

const CATEGORY_LABELS: Record<string, string> = {
  invalid_reference: "invalid ref",
  precondition_failure: "precondition",
};

export function EffectReviewPanel({ gameId, round, roundNumber, isProjector }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerContinue = useAuthMutation(api.games.triggerContinueFromEffectReview);

  const appliedOps = round?.appliedOps ?? [];
  const applied = appliedOps.filter((op) => op.status === "applied");
  // Sort rejections by severity — invalid_reference first (LLM error, could land on
  // wrong lab if re-resolved), then precondition_failure (rule violation).
  const rejected = [...appliedOps.filter((op) => op.status === "rejected")]
    .sort((a, b) => (CATEGORY_SEVERITY[b.category ?? ""] ?? 0) - (CATEGORY_SEVERITY[a.category ?? ""] ?? 0));

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await triggerContinue({ gameId, roundNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
    // Leave submitting=true on success so the button stays disabled until the phase
    // change re-renders this panel out of existence.
  };

  return (
    <div className="mt-6 bg-navy-dark/50 rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-viz-safety" />
          <h2 className="text-lg font-bold text-text-light">Review Effects — Round {roundNumber}</h2>
        </div>
        {applied.length === 0 && rejected.length === 0 && (
          <span className="text-xs text-navy-muted">Routine round — no structural changes</span>
        )}
      </div>

      <p className="text-[13px] text-navy-muted mb-4">
        The decide pass has applied structural effects and compute adjustments. R&amp;D
        growth and new compute will land next — along with the player-facing narrative.
      </p>

      {applied.length > 0 && (
        <div className="mb-4">
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
        <div className="mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-viz-danger block mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Flagged &amp; rejected ({rejected.length})
          </span>
          <ul className="space-y-1.5">
            {rejected.map((op, i) => (
              <li key={`rejected-${i}`} className="flex items-start gap-2 text-sm">
                <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 mt-[3px] shrink-0 ${TYPE_COLOURS.rejected}`}>
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
            These ops were proposed by the decide LLM but failed validation (e.g. referenced
            an inactive lab, invalid roleId, or tried to decommission the last active lab).
            The round can continue as-is — these ops simply did not apply.
          </p>
        </div>
      )}

      {!isProjector && (
        <div className="mt-5">
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
                Continuing...
              </>
            ) : (
              <>
                Continue to Narrative <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
          <p className="text-[11px] text-navy-muted text-center mt-2">
            This will apply R&amp;D growth, distribute new compute, and generate the
            player-facing narrative.
          </p>
        </div>
      )}
    </div>
  );
}
