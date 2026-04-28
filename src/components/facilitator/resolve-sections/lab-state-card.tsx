"use client";

import { useState } from "react";
import { Check, Merge, Pencil, Save, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { COMPUTE_CATEGORIES, ROLE_MAP } from "@/lib/game-data";
import { ComputeDotsViz } from "@/components/lab-tracker";
import { useAuthMutation } from "@/lib/hooks";
import type { Lab } from "@/lib/game-data";
import type { Id } from "@convex/_generated/dataModel";

interface HolderEntry {
  roleId: string;
  stockBefore: number;
  stockAfter: number;
  acquired: number;
}

/** Header row (colour dot + name + edit/merge/cancel buttons). */
function LabCardHeader({
  lab,
  isProjector,
  editable,
  gameId,
  editing,
  setEditing,
  mergeSource,
  isMergeSource,
  onMergeStart,
  onMergeCancel,
}: {
  lab: Lab;
  isProjector: boolean;
  editable?: boolean;
  gameId?: Id<"games">;
  editing: boolean;
  setEditing: (v: boolean) => void;
  mergeSource: string | null;
  isMergeSource: boolean;
  onMergeStart?: (name: string) => void;
  onMergeCancel?: () => void;
}) {
  const role = lab.roleId ? ROLE_MAP.get(lab.roleId) : undefined;
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role?.color }} />
      <span className={`${isProjector ? "text-base" : "text-sm"} font-bold text-white flex-1 truncate`}>
        {lab.name}
      </span>
      {editable && gameId && !editing && !mergeSource && (
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="text-[10px] p-1 rounded bg-navy-light text-text-light hover:bg-navy-muted"
          aria-label="Edit lab state"
          title="Edit lab state"
        >
          <Pencil className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
      {onMergeStart && !mergeSource && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onMergeStart(lab.name); }}
          className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted flex items-center gap-1"
          aria-label={`Merge ${lab.name} into another lab`}
          title={`Merge ${lab.name} into another lab`}
        >
          <Merge className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
      {isMergeSource && onMergeCancel && (
        <button
          onClick={(e) => { e.stopPropagation(); onMergeCancel(); }}
          className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-viz-warning"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/** Stock + share + allocation visualisation + legend + spec footer. The
 *  read-only body of the card; the editor replaces this when `editing`. */
function LabCardBody({
  lab,
  holder,
  totalAcquired,
  isProjector,
}: {
  lab: Lab;
  holder: HolderEntry | undefined;
  totalAcquired: number;
  isProjector: boolean;
}) {
  const stockBefore = holder?.stockBefore ?? lab.computeStock;
  const stockAfter = holder?.stockAfter ?? lab.computeStock;
  const stockChange = stockAfter - stockBefore;
  const labSharePct = holder && totalAcquired > 0
    ? Math.round((Math.max(0, holder.acquired) / totalAcquired) * 100)
    : 0;

  return (
    <>
      <div className="flex items-baseline gap-3 mb-1">
        <span className={`${isProjector ? "text-3xl" : "text-xl"} font-black font-mono text-[#06B6D4]`}>
          {lab.rdMultiplier}×
        </span>
        <span
          className="text-xs text-text-light font-mono"
          title={`${stockAfter} units (~${stockAfter}M H100e)`}
        >
          {stockBefore !== stockAfter ? (
            <>
              {stockBefore}u {"→"} {stockAfter}u
              {stockChange !== 0 && (
                <span className={`ml-1 ${stockChange > 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                  ({stockChange > 0 ? "+" : ""}{stockChange})
                </span>
              )}
            </>
          ) : (
            <>{stockAfter}u</>
          )}
        </span>
      </div>

      {holder && totalAcquired > 0 && (
        <div className="text-xs text-text-light mb-2">
          {labSharePct}% of new compute
        </div>
      )}

      <ComputeDotsViz allocation={lab.allocation} computeStock={stockAfter} />

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {COMPUTE_CATEGORIES.map((cat) => (
          <span
            key={cat.key}
            className="text-[10px] text-text-light flex items-center gap-1"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-[1px]"
              style={{ backgroundColor: cat.color }}
            />
            {cat.label} {lab.allocation[cat.key]}%
          </span>
        ))}
      </div>

      {lab.spec && (
        <div className="text-[10px] text-text-light/70 mt-1.5 pt-1.5 border-t border-navy-light leading-relaxed line-clamp-3" title={lab.spec}>
          Spec: {lab.spec}
        </div>
      )}
    </>
  );
}

/** Combined lab state + allocations card. Shows per-lab name, R&D multiplier, compute
 *  stock, share of new compute, spec, and the coloured allocation blocks + legend from
 *  the old LabTracker. When `editable`, a pencil icon opens an inline editor for R&D
 *  multiplier, allocation %, and compute stock — lab names and spec are edited via
 *  other UIs (merge dialog / player-facing spec editor). */
export function LabStateCard({
  lab,
  holder,
  totalAcquired,
  isProjector,
  mergeSource,
  onMergeStart,
  onMergeCancel,
  onMergeCommit,
  gameId,
  roundNumber,
  editable,
}: {
  lab: Lab;
  holder: HolderEntry | undefined;
  totalAcquired: number;
  isProjector: boolean;
  mergeSource: string | null;
  onMergeStart?: (name: string) => void;
  onMergeCancel?: () => void;
  onMergeCommit?: (survivorName: string, absorbedName: string) => Promise<void>;
  gameId?: Id<"games">;
  roundNumber?: number;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const isMergeSource = mergeSource === lab.name;
  const isMergeTarget = mergeSource !== null && mergeSource !== lab.name;
  const stockAfter = holder?.stockAfter ?? lab.computeStock;

  const handleClick = isMergeTarget && onMergeCommit && mergeSource
    ? async () => {
        await onMergeCommit(lab.name, mergeSource);
        onMergeCancel?.();
      }
    : undefined;

  const containerClass = `bg-navy rounded-lg p-3 border transition-colors ${
    isMergeTarget
      ? "border-viz-warning cursor-pointer hover:bg-navy-light focus-visible:outline-2 focus-visible:outline-viz-warning"
      : isMergeSource
        ? "border-viz-capability"
        : "border-navy-light"
  }`;

  return (
    <div
      className={containerClass}
      onClick={handleClick}
      role={isMergeTarget ? "button" : undefined}
      tabIndex={isMergeTarget ? 0 : undefined}
      aria-label={isMergeTarget && mergeSource ? `Merge ${mergeSource} into ${lab.name}` : undefined}
      onKeyDown={isMergeTarget && handleClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void handleClick();
        }
      } : undefined}
    >
      <LabCardHeader
        lab={lab}
        isProjector={isProjector}
        editable={editable}
        gameId={gameId}
        editing={editing}
        setEditing={setEditing}
        mergeSource={mergeSource}
        isMergeSource={isMergeSource}
        onMergeStart={onMergeStart}
        onMergeCancel={onMergeCancel}
      />
      {isMergeTarget && (
        <div className="text-[10px] text-viz-warning mb-1">
          Click to absorb {mergeSource} into {lab.name}
        </div>
      )}

      {editing && gameId ? (
        <LabStateEditor
          lab={lab}
          gameId={gameId}
          roundNumber={roundNumber}
          currentStock={stockAfter}
          onClose={() => setEditing(false)}
        />
      ) : (
        <LabCardBody lab={lab} holder={holder} totalAcquired={totalAcquired} isProjector={isProjector} />
      )}
    </div>
  );
}

function LabStateEditor({
  lab,
  gameId,
  roundNumber,
  currentStock,
  onClose,
}: {
  lab: Lab;
  gameId: Id<"games">;
  roundNumber?: number;
  currentStock: number;
  onClose: () => void;
}) {
  const [multiplier, setMultiplier] = useState(lab.rdMultiplier);
  const [stock, setStock] = useState(currentStock);
  const [deployment, setDeployment] = useState(lab.allocation.deployment);
  const [research, setResearch] = useState(lab.allocation.research);
  const [safety, setSafety] = useState(lab.allocation.safety);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiplierChanged = multiplier !== lab.rdMultiplier;

  const updateLabs = useAuthMutation(api.games.updateLabs);
  const overrideHolderCompute = useAuthMutation(api.computeMutations.overrideHolderCompute);

  const totalAlloc = deployment + research + safety;
  const allocOK = totalAlloc === 100;

  const save = async () => {
    if (!allocOK) { setError(`Allocation must sum to 100 (currently ${totalAlloc})`); return; }
    if (!lab.labId) { setError("Lab has no id"); return; }
    setSaving(true);
    setError(null);
    try {
      const patches: Array<{
        labId: Id<"labs">;
        rdMultiplier?: number;
        allocation?: { deployment: number; research: number; safety: number };
      }> = [{
        labId: lab.labId as Id<"labs">,
        rdMultiplier: multiplier,
        allocation: { deployment, research, safety },
      }];
      await updateLabs({
        gameId,
        patches,
        reason: multiplierChanged && reason.trim() ? reason.trim() : undefined,
      });
      if (stock !== currentStock && lab.roleId && roundNumber != null) {
        await overrideHolderCompute({
          gameId,
          roundNumber,
          roleId: lab.roleId,
          computeStock: Math.max(0, stock),
          reason: "facilitator edit via lab card",
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[11px] text-text-light">
        <span className="w-20">R&D ×</span>
        <input
          type="number"
          step="0.1"
          value={multiplier}
          onChange={(e) => setMultiplier(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono"
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] text-text-light">
        <span className="w-20">Stock (u)</span>
        <input
          type="number"
          value={stock}
          onChange={(e) => setStock(parseInt(e.target.value) || 0)}
          className="flex-1 bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono"
        />
      </label>
      <div className="grid grid-cols-3 gap-1.5 text-[11px] text-text-light">
        <label className="flex flex-col gap-1">
          <span>Deploy %</span>
          <input
            type="number"
            value={deployment}
            onChange={(e) => setDeployment(parseInt(e.target.value) || 0)}
            className="bg-navy-dark border border-navy-light rounded px-1.5 py-1 text-white font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Research %</span>
          <input
            type="number"
            value={research}
            onChange={(e) => setResearch(parseInt(e.target.value) || 0)}
            className="bg-navy-dark border border-navy-light rounded px-1.5 py-1 text-white font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Safety %</span>
          <input
            type="number"
            value={safety}
            onChange={(e) => setSafety(parseInt(e.target.value) || 0)}
            className="bg-navy-dark border border-navy-light rounded px-1.5 py-1 text-white font-mono"
          />
        </label>
      </div>
      <div className={`flex items-center gap-1 text-[10px] ${allocOK ? "text-text-light/60" : "text-viz-danger"}`}>
        <span>Total: {totalAlloc}%</span>
        {allocOK ? <Check className="w-3 h-3" /> : <span>(must = 100)</span>}
      </div>
      {multiplierChanged && (
        <label className="flex items-center gap-2 text-[11px] text-text-light">
          <span className="w-20">Reason</span>
          <input
            type="text"
            value={reason}
            placeholder="Why override?"
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 bg-navy-dark border border-navy-light rounded px-2 py-1 text-white"
          />
        </label>
      )}
      {error && (
        <div className="text-[11px] text-viz-danger">{error}</div>
      )}
      <div className="flex gap-1.5 mt-1">
        <button
          onClick={() => void save()}
          disabled={saving || !allocOK}
          className="flex-1 text-[11px] px-2 py-1 bg-white text-navy rounded font-bold hover:bg-off-white disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onClose}
          className="flex-1 text-[11px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
