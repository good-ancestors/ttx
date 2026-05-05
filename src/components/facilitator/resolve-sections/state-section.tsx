"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CheckCircle, Plus } from "lucide-react";
import { getCapabilityDescription, type Lab } from "@/lib/game-data";
import { RdProgressChart } from "@/components/rd-progress-chart";
import { ExpandableSection } from "../expandable-section";
import { NewComputeAcquired } from "../new-compute-acquired";
import { LabStateCard } from "./lab-state-card";
import type { CurrentRound, RoundLite } from "../types";
import type { Id } from "@convex/_generated/dataModel";

/** Section 3 — "Where things are at". Only renders in narrate phase, once growth +
 *  acquisition have run (post-P7). Hidden during discuss/submit/rolling and the P7
 *  `effect-review` pause so the reveal rhythm is preserved.
 *
 *  Layout (top → bottom):
 *    1. Lab state + allocations (combined per-lab cards, editable)
 *    2. AI capabilities ("How Capable is AI?") for the leading lab
 *    3. R&D multiplier chart (historical trajectory)
 *    4. New Compute Acquired — applied at start of next round, editable */
export function StateSection({
  gameId,
  currentRound,
  currentRoundNumber,
  phase,
  isProjector,
  labs,
  rounds,
  onMerge,
  onAddLab,
}: {
  gameId: Id<"games">;
  currentRound: CurrentRound | undefined;
  currentRoundNumber: number;
  phase: string;
  isProjector: boolean;
  labs: Lab[];
  rounds: RoundLite[];
  onMerge?: (survivorName: string, absorbedName: string) => Promise<void>;
  onAddLab?: () => void;
}) {
  // Gate: section only appears in narrate phase.
  if (phase !== "narrate") return null;
  if (!currentRound?.summary) return null;

  return (
    <>
      <LabStateAndAllocations
        gameId={gameId}
        currentRoundNumber={currentRoundNumber}
        isProjector={isProjector}
        labs={labs}
        rounds={rounds}
        onMerge={onMerge}
        onAddLab={onAddLab}
      />

      <NewComputeAcquired gameId={gameId} roundNumber={currentRoundNumber} isProjector={isProjector} />
    </>
  );
}

/** Combined lab state + allocations + R&D chart + AI capabilities. One expandable card. */
function LabStateAndAllocations({
  gameId,
  currentRoundNumber,
  isProjector,
  labs,
  rounds,
  onMerge,
  onAddLab,
}: {
  gameId: Id<"games">;
  currentRoundNumber: number;
  isProjector: boolean;
  labs: Lab[];
  rounds: RoundLite[];
  onMerge?: (survivorName: string, absorbedName: string) => Promise<void>;
  onAddLab?: () => void;
}) {
  const [mergeSourceRaw, setMergeSource] = useState<string | null>(null);
  const mergeSource = mergeSourceRaw && labs.some((l) => l.name === mergeSourceRaw) ? mergeSourceRaw : null;

  const activeLabs = labs.filter((l) => l.status !== "decommissioned");
  const leading = activeLabs.length > 0
    ? activeLabs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b))
    : null;
  const cap = leading ? getCapabilityDescription(leading.rdMultiplier) : null;

  const holderView = useQuery(api.rounds.getComputeHolderView, { gameId, roundNumber: currentRoundNumber });
  const totalAcquired = (holderView ?? []).reduce((s, h) => s + Math.max(0, h.acquired), 0);
  // O(1) roleId lookup so the activeLabs.map below doesn't quadratically scan
  // holderView on every render tick.
  const holderByRoleId = useMemo(
    () => new Map((holderView ?? []).map((h) => [h.roleId, h] as const)),
    [holderView],
  );

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <ExpandableSection
        title="Where We Are Now"
        defaultOpen
        badge={<CheckCircle className="w-3.5 h-3.5 text-viz-safety" />}
      >
        {onAddLab && (
          <div className="flex items-center justify-end gap-1 mb-2 -mt-1">
            <button onClick={onAddLab} className="text-text-light hover:text-white p-0.5 transition-colors" title="Add lab">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {activeLabs.map((lab) => {
            const holder = lab.roleId ? holderByRoleId.get(lab.roleId) : undefined;
            return (
              <LabStateCard
                key={lab.labId ?? lab.name}
                lab={lab}
                holder={holder}
                totalAcquired={totalAcquired}
                isProjector={isProjector}
                mergeSource={mergeSource}
                onMergeStart={onMerge ? (name) => setMergeSource(name) : undefined}
                onMergeCancel={onMerge ? () => setMergeSource(null) : undefined}
                onMergeCommit={onMerge}
                gameId={gameId}
                roundNumber={currentRoundNumber}
                editable={!isProjector}
              />
            );
          })}
        </div>

        {/* R&D progress chart — inside the "Where We Are Now" card, above the
         *  capability block so the trajectory precedes the "so what" interpretation.
         *  Rendered flat (no inner card) — the outer ExpandableSection already
         *  carries the panel framing. */}
        <div className="mb-3">
          <RdProgressChart rounds={rounds} currentLabs={labs} currentRound={currentRoundNumber} isProjector={isProjector} compact={isProjector} />
        </div>

        {cap && (
          <div className="bg-navy rounded-lg p-4 border border-navy-light">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-white">How Capable is AI?</span>
              <span className="text-xs text-viz-capability font-mono ml-auto">{cap.agent} · {cap.rdRange}</span>
            </div>
            <p className={`${isProjector ? "text-base" : "text-sm"} text-[#E2E8F0] mb-2`}>{cap.generalCapability}</p>
            <div className="space-y-1 mb-2">
              {cap.specificCapabilities.map((c: string, i: number) => (
                <p key={`cap-${i}`} className={`${isProjector ? "text-base" : "text-sm"} text-text-light flex items-start gap-1.5`}>
                  <span className="text-viz-capability mt-0.5">●</span> {c}
                </p>
              ))}
            </div>
            <div className="pt-2 border-t border-navy-light space-y-1">
              <div className="text-base font-bold text-white">{cap.timeCompression}</div>
              <div className={`${isProjector ? "text-sm" : "text-[11px]"} text-text-light/80 italic`}>{cap.implication}</div>
            </div>
          </div>
        )}
      </ExpandableSection>
    </div>
  );
}
