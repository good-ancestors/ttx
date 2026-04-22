"use client";

import { Merge } from "lucide-react";
import { COMPUTE_CATEGORIES, ROLE_MAP } from "@/lib/game-data";
import { ComputeDotsViz } from "@/components/lab-tracker";
import type { Lab } from "@/lib/game-data";

interface HolderEntry {
  roleId: string;
  stockBefore: number;
  stockAfter: number;
  acquired: number;
}

/** Combined lab state + allocations card. Shows per-lab name, R&D multiplier, compute
 *  stock (with before→after delta if available), share of new compute, spec, and the
 *  coloured allocation blocks + legend from the old LabTracker. One card per lab;
 *  replaces the two separate "Where We Are Now" lab cards and "Lab Allocations" grid. */
export function LabStateCard({
  lab,
  holder,
  totalAcquired,
  isProjector,
  mergeSource,
  onMergeStart,
  onMergeCancel,
  onMergeCommit,
}: {
  lab: Lab;
  holder: HolderEntry | undefined;
  totalAcquired: number;
  isProjector: boolean;
  mergeSource: string | null;
  onMergeStart?: (name: string) => void;
  onMergeCancel?: () => void;
  onMergeCommit?: (survivorName: string, absorbedName: string) => Promise<void>;
}) {
  const role = lab.roleId ? ROLE_MAP.get(lab.roleId) : undefined;
  const isMergeSource = mergeSource === lab.name;
  const isMergeTarget = mergeSource !== null && mergeSource !== lab.name;

  const stockBefore = holder?.stockBefore ?? lab.computeStock;
  const stockAfter = holder?.stockAfter ?? lab.computeStock;
  const stockChange = stockAfter - stockBefore;
  const labSharePct = holder && totalAcquired > 0
    ? Math.round((Math.max(0, holder.acquired) / totalAcquired) * 100)
    : 0;

  return (
    <div
      className={`bg-navy rounded-lg p-3 border transition-colors ${
        isMergeTarget
          ? "border-viz-warning cursor-pointer hover:bg-navy-light"
          : isMergeSource
            ? "border-viz-capability"
            : "border-navy-light"
      }`}
      onClick={isMergeTarget && onMergeCommit && mergeSource ? async () => {
        await onMergeCommit(lab.name, mergeSource);
        onMergeCancel?.();
      } : undefined}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role?.color }} />
        <span className={`${isProjector ? "text-base" : "text-sm"} font-bold text-white flex-1 truncate`}>
          {lab.name}
        </span>
        {onMergeStart && !mergeSource && (
          <button
            onClick={(e) => { e.stopPropagation(); onMergeStart(lab.name); }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted flex items-center gap-1"
            title={`Merge ${lab.name} into another lab`}
          >
            <Merge className="w-3 h-3" />
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
      {isMergeTarget && (
        <div className="text-[10px] text-viz-warning mb-1">
          Click to absorb {mergeSource} into {lab.name}
        </div>
      )}

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
            {cat.key === "deployment"
              ? "Deployment"
              : cat.key === "research"
                ? "Research"
                : "Safety"}{" "}
            {lab.allocation[cat.key]}%
          </span>
        ))}
      </div>

      {lab.spec && (
        <div className="text-[10px] text-text-light/70 mt-1.5 pt-1.5 border-t border-navy-light leading-relaxed line-clamp-3" title={lab.spec}>
          Spec: {lab.spec}
        </div>
      )}
    </div>
  );
}
