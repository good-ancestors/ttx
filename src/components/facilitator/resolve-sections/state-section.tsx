"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CheckCircle, Pencil, Plus, TrendingUp } from "lucide-react";
import { getCapabilityDescription, type Lab } from "@/lib/game-data";
import { useAuthMutation } from "@/lib/hooks";
import { RdProgressChart } from "@/components/rd-progress-chart";
import { ExpandableSection } from "../expandable-section";
import { NewComputeAcquired } from "../new-compute-acquired";
import { LabStateCard } from "./lab-state-card";
import type { Round } from "../types";
import type { Id } from "@convex/_generated/dataModel";

interface RoundLite {
  number: number;
  label: string;
  labsAfter?: Lab[];
}

/** Section 3 — "Where things are at". Only renders late in the resolve: during `narrate`
 *  phase, once growth + acquisition have run. Hidden during discuss/submit/rolling and
 *  the P7 `effect-review` pause so the reveal rhythm is preserved.
 *
 *  Layout (top → bottom):
 *    1. Lab state + allocations (combined per-lab cards, via LabStateCard)
 *    2. AI capabilities ("How Capable is AI?") for the leading lab
 *    3. Compute Stock and Flow (the stacked-column chart)
 *    4. R&D multiplier chart (historical trajectory)
 *    5. New Compute Acquired (per-role cards) */
export function StateSection({
  gameId,
  currentRound,
  currentRoundNumber,
  phase,
  isProjector,
  labs,
  rounds,
  onEditNarrative,
  onMerge,
  onAddLab,
}: {
  gameId: Id<"games">;
  currentRound: Round | undefined;
  currentRoundNumber: number;
  phase: string;
  isProjector: boolean;
  labs: Lab[];
  rounds: RoundLite[];
  onEditNarrative: () => void;
  onMerge?: (survivorName: string, absorbedName: string) => Promise<void>;
  onAddLab?: () => void;
}) {
  // Gate: section only appears in narrate phase (post-P7, after growth+acquisition land).
  if (phase !== "narrate") return null;
  if (!currentRound?.summary) return null;

  return (
    <>
      <LabStateAndAllocations
        gameId={gameId}
        currentRound={currentRound}
        currentRoundNumber={currentRoundNumber}
        isProjector={isProjector}
        labs={labs}
        onMerge={onMerge}
        onAddLab={onAddLab}
        onEditNarrative={onEditNarrative}
      />

      <RdProgressChart rounds={rounds} currentLabs={labs} currentRound={currentRoundNumber} />

      <NewComputeAcquired gameId={gameId} roundNumber={currentRoundNumber} />
    </>
  );
}

/** Combined lab state + allocations + AI capabilities + compute flow. One expandable card. */
function LabStateAndAllocations({
  gameId,
  currentRound,
  currentRoundNumber,
  isProjector,
  labs,
  onMerge,
  onAddLab,
  onEditNarrative,
}: {
  gameId: Id<"games">;
  currentRound: Round;
  currentRoundNumber: number;
  isProjector: boolean;
  labs: Lab[];
  onMerge?: (survivorName: string, absorbedName: string) => Promise<void>;
  onAddLab?: () => void;
  onEditNarrative: () => void;
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

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <ExpandableSection
        title="Where We Are Now"
        defaultOpen
        badge={<CheckCircle className="w-3.5 h-3.5 text-viz-safety" />}
      >
        <div className="flex items-center justify-end gap-1 mb-2 -mt-1">
          {onAddLab && (
            <button onClick={onAddLab} className="text-text-light hover:text-white p-0.5 transition-colors" title="Add lab">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {activeLabs.map((lab) => {
            const holder = lab.roleId ? holderView?.find((h) => h.roleId === lab.roleId) : undefined;
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
              />
            );
          })}
        </div>

        {cap && (
          <>
            <div className="bg-navy rounded-lg p-4 border border-navy-light mb-3">
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
              <div className="flex items-center gap-2 pt-2 border-t border-navy-light">
                <span className="text-base font-bold text-white">{cap.timeCompression}</span>
              </div>
            </div>
            <div className="bg-navy rounded-lg p-3 border border-navy-light mb-3">
              <p className={`${isProjector ? "text-base" : "text-sm"} text-[#E2E8F0]`}>{cap.implication}</p>
            </div>
          </>
        )}

        <ComputeFlowPanel
          currentRound={currentRound}
          currentRoundNumber={currentRoundNumber}
          gameId={gameId}
          isProjector={isProjector}
        />

        {!isProjector && (
          <div className="flex gap-2 mt-3">
            <button onClick={onEditNarrative} className="text-[10px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit narrative
            </button>
          </div>
        )}
      </ExpandableSection>
    </div>
  );
}

function ComputeFlowPanel({
  currentRound: _currentRound,
  currentRoundNumber,
  gameId,
  isProjector,
}: {
  currentRound: Round;
  currentRoundNumber: number;
  gameId: Id<"games">;
  isProjector: boolean;
}) {
  const view = useQuery(api.rounds.getComputeHolderView, { gameId, roundNumber: currentRoundNumber });
  if (!view) return null;

  const entries = view.filter((e) =>
    e.stockBefore !== 0 || e.acquired !== 0 || e.transferred !== 0 || e.adjusted !== 0 || e.merged !== 0 || e.facilitator !== 0,
  );
  if (entries.length === 0) return null;

  const totalBefore = entries.reduce((s, e) => s + e.stockBefore, 0);
  const totalAfter = entries.reduce((s, e) => s + e.stockAfter, 0);

  const totalAcquired = entries.reduce((s, e) => s + Math.max(0, e.acquired), 0);
  const chartEntries = entries.map((e) => {
    const gain = Math.max(0, e.acquired) + Math.max(0, e.transferred) + Math.max(0, e.adjusted) + Math.max(0, e.merged) + Math.max(0, e.facilitator);
    const loss = Math.max(0, -e.transferred) + Math.max(0, -e.adjusted) + Math.max(0, -e.merged) + Math.max(0, -e.facilitator);
    return {
      name: e.name,
      gain,
      loss,
      stockBefore: e.stockBefore,
      stockAfter: e.stockAfter,
      sharePct: totalAcquired > 0 ? Math.round((Math.max(0, e.acquired) / totalAcquired) * 100) : 0,
    };
  }).sort((a, b) => b.stockAfter - a.stockAfter);
  const maxTotal = Math.max(...chartEntries.map((e) => e.stockBefore + e.gain), 1);
  const maxLoss = Math.max(...chartEntries.map((e) => e.loss), 0);
  const scale = maxTotal + maxLoss || 1;
  const baselinePct = (maxLoss / scale) * 100;
  const aboveHeight = 120;
  const belowHeight = maxLoss > 0 ? 30 : 0;

  return (
    <div className="mt-3 mb-3 rounded-lg border border-navy-light bg-navy p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white">Compute Stock and Flow</div>
          <div className="text-xs text-text-light">
            Total {totalBefore}u {"→"} {totalAfter}u
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-text-light">
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-viz-safety" /> New</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#64748B]" /> Stock</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-viz-danger" /> Lost</span>
        </div>
      </div>

      <div className="flex gap-1.5" style={{ height: aboveHeight + belowHeight + 40 }}>
        {chartEntries.map((entry) => {
          const retained = Math.max(0, entry.stockBefore - entry.loss);
          const retainedPct = retained / scale * 100;
          const gainPct = entry.gain / scale * 100;
          const lossPct = entry.loss / scale * 100;

          return (
            <div key={entry.name} className="flex-1 flex flex-col items-center min-w-0">
              <div className="w-full flex flex-col justify-end" style={{ height: aboveHeight }}>
                {gainPct > 0 && (
                  <div className="w-full bg-viz-safety rounded-t-sm" style={{ height: `${(gainPct / (100 - baselinePct)) * 100}%` }} title={`+${entry.gain}u new`} />
                )}
                {retainedPct > 0 && (
                  <div className={`w-full bg-[#64748B] ${gainPct === 0 ? "rounded-t-sm" : ""}`} style={{ height: `${(retainedPct / (100 - baselinePct)) * 100}%` }} title={`${retained}u retained`} />
                )}
              </div>
              <div className="w-full" style={{ height: belowHeight }}>
                {lossPct > 0 && (
                  <div className="w-full bg-viz-danger rounded-b-sm" style={{ height: `${belowHeight > 0 ? (lossPct / baselinePct) * 100 : 0}%` }} title={`-${entry.loss}u lost`} />
                )}
              </div>
              <div className="text-center w-full overflow-hidden mt-1">
                <div className="text-[10px] font-bold text-white truncate">{entry.name}</div>
                <div className="text-[10px] font-mono text-text-light">{entry.stockAfter}u</div>
                {entry.sharePct > 0 && (
                  <div className="text-[9px] text-text-light/60">{entry.sharePct}%</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isProjector && (
        <ComputeDetailTable
          key={currentRoundNumber}
          entries={entries}
          gameId={gameId}
          roundNumber={currentRoundNumber}
        />
      )}
    </div>
  );
}

interface ComputeHolderEntry {
  roleId: string;
  name: string;
  stockBefore: number;
  acquired: number;
  transferred: number;
  adjusted: number;
  merged: number;
  facilitator: number;
  stockAfter: number;
}

function ComputeDetailTable({
  entries,
  gameId,
  roundNumber,
}: {
  entries: ComputeHolderEntry[];
  gameId: Id<"games">;
  roundNumber: number;
}) {
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, { gained: number; lost: number; reason: string }>>({});
  const overrideCompute = useAuthMutation(api.computeMutations.overrideHolderCompute);

  const handleSave = async () => {
    try {
      await Promise.all(
        Object.entries(overrides).map(([roleId, { gained, lost, reason }]) => {
          const entry = entries.find((e) => e.roleId === roleId);
          if (!entry) return Promise.resolve();
          const computeStock = Math.max(0, entry.stockBefore + gained - lost);
          return overrideCompute({ gameId, roundNumber, roleId, computeStock, reason: reason || undefined });
        })
      );
      setOverrides({});
      setEditing(false);
    } catch (err) {
      console.error("[ComputeDetailTable] Save failed:", err);
    }
  };

  return (
    <div className="mt-3 border-t border-navy-light pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-light">Detail</span>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-[10px] px-2 py-0.5 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-2.5 h-2.5" /> Edit
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={() => { setOverrides({}); setEditing(false); }} className="text-[10px] px-2 py-0.5 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={Object.keys(overrides).length === 0}
              className="text-[10px] px-2 py-0.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-light/60 text-left">
            <th className="pb-1 font-semibold">Entity</th>
            <th className="pb-1 font-semibold text-right">Start</th>
            <th className="pb-1 font-semibold text-right">New</th>
            <th className="pb-1 font-semibold text-right">Lost</th>
            <th className="pb-1 font-semibold text-right">After</th>
            <th className="pb-1 font-semibold text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const defaultGained = Math.max(0, e.acquired)
              + Math.max(0, e.transferred)
              + Math.max(0, e.adjusted)
              + Math.max(0, e.merged)
              + Math.max(0, e.facilitator);
            const defaultLost = Math.max(0, -e.transferred)
              + Math.max(0, -e.adjusted)
              + Math.max(0, -e.merged)
              + Math.max(0, -e.facilitator);
            const override = overrides[e.roleId];
            const isOverridden = e.roleId in overrides;
            const gained = override?.gained ?? defaultGained;
            const lost = override?.lost ?? defaultLost;
            const displayAfter = isOverridden
              ? Math.max(0, e.stockBefore + gained - lost)
              : e.stockAfter;

            return (
              <tr key={e.roleId} className="border-t border-navy-light/30">
                <td className="py-1 text-white font-medium truncate max-w-[120px]">{e.name}</td>
                <td className="py-1 text-right font-mono text-text-light">{e.stockBefore}</td>
                <td className="py-1 text-right font-mono">
                  {editing ? (
                    <input
                      type="number"
                      value={gained}
                      onChange={(ev) => {
                        const val = Math.max(0, parseInt(ev.target.value) || 0);
                        setOverrides((prev) => ({
                          ...prev,
                          [e.roleId]: { gained: val, lost: prev[e.roleId]?.lost ?? defaultLost, reason: prev[e.roleId]?.reason ?? "" },
                        }));
                      }}
                      className={`w-14 bg-navy-dark border rounded px-1 py-0.5 text-right font-mono text-viz-safety outline-none ${
                        isOverridden ? "border-[#FCD34D]" : "border-navy-light"
                      } focus:border-text-light`}
                    />
                  ) : (
                    <span className="text-viz-safety">{gained > 0 ? `+${gained}` : "—"}</span>
                  )}
                </td>
                <td className="py-1 text-right font-mono">
                  {editing ? (
                    <input
                      type="number"
                      value={lost}
                      onChange={(ev) => {
                        const val = Math.max(0, parseInt(ev.target.value) || 0);
                        setOverrides((prev) => ({
                          ...prev,
                          [e.roleId]: { gained: prev[e.roleId]?.gained ?? defaultGained, lost: val, reason: prev[e.roleId]?.reason ?? "" },
                        }));
                      }}
                      className={`w-14 bg-navy-dark border rounded px-1 py-0.5 text-right font-mono text-viz-danger outline-none ${
                        isOverridden ? "border-[#FCD34D]" : "border-navy-light"
                      } focus:border-text-light`}
                    />
                  ) : (
                    <span className="text-viz-danger">{lost > 0 ? `−${lost}` : "—"}</span>
                  )}
                </td>
                <td className="py-1 text-right font-mono">
                  <span className={isOverridden ? "text-[#FCD34D]" : e.facilitator !== 0 ? "text-[#FCD34D]" : "text-white"}>
                    {displayAfter}
                  </span>
                </td>
                <td className="py-1 text-right font-mono text-text-light/50">
                  {e.acquired > 0 ? `${e.acquired}u` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <div className="mt-2 text-[9px] text-text-light/60">
          Edit &quot;New&quot; and &quot;Lost&quot; values. &quot;After&quot; is calculated automatically.
        </div>
      )}
    </div>
  );
}
