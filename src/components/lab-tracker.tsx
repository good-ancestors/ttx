"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { COMPUTE_CATEGORIES, ROLES } from "@/lib/game-data";
import { Merge, Plus, Maximize2, X } from "lucide-react";

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

export function LabTracker({
  labs,
  onMerge,
  onAddLab,
}: {
  labs: Lab[];
  onMerge?: (survivorName: string, absorbedName: string) => Promise<void>;
  onAddLab?: () => void;
}) {
  const [mergeSourceRaw, setMergeSource] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  // Auto-clear if the source lab no longer exists (e.g., merged by another action)
  const mergeSource = mergeSourceRaw && labs.some(l => l.name === mergeSourceRaw) ? mergeSourceRaw : null;

  const labGrid = (
    <LabGrid labs={labs} mergeSource={mergeSource} setMergeSource={setMergeSource} onMerge={onMerge} />
  );

  if (fullScreen && typeof document !== "undefined") {
    return createPortal(
      <div className="fixed inset-0 bg-navy-dark z-[70] flex flex-col p-8 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg font-semibold uppercase tracking-wider text-text-light">Lab State</span>
          <button onClick={() => setFullScreen(false)} className="text-text-light hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{labGrid}</div>
      </div>,
      document.body,
    );
  }

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          Lab State
        </span>
        <div className="flex items-center gap-1">
          {onAddLab && (
            <button onClick={onAddLab} className="text-text-light hover:text-white p-0.5 transition-colors" title="Add lab">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setFullScreen(true)} className="text-text-light hover:text-white p-0.5 transition-colors" title="Full screen">
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {labGrid}
    </div>
  );
}

function LabGrid({
  labs,
  mergeSource,
  setMergeSource,
  onMerge,
}: {
  labs: Lab[];
  mergeSource: string | null;
  setMergeSource: (v: string | null) => void;
  onMerge?: (survivorName: string, absorbedName: string) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {labs.map((lab) => {
        const role = ROLES.find((r) => r.id === lab.roleId);
        const isMergeSource = mergeSource === lab.name;
        const isMergeTarget = mergeSource !== null && mergeSource !== lab.name;
        return (
          <div
            key={lab.name}
            className={`bg-navy-dark border rounded-lg p-3 transition-colors ${
              isMergeTarget
                ? "border-viz-warning cursor-pointer hover:bg-navy-light"
                : isMergeSource
                  ? "border-viz-capability"
                  : "border-navy-light"
            }`}
            onClick={isMergeTarget ? async () => {
              await onMerge?.(lab.name, mergeSource);
              setMergeSource(null);
            } : undefined}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: role?.color }}
              />
              <span className="text-sm font-bold text-white flex-1">
                {lab.name}
              </span>
              {onMerge && labs.length > 1 && !mergeSource && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMergeSource(lab.name); }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted flex items-center gap-1"
                  title={`Merge ${lab.name} into another lab`}
                >
                  <Merge className="w-3 h-3" />
                </button>
              )}
              {isMergeSource && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMergeSource(null); }}
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
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-xl font-black font-mono text-[#06B6D4]">
                {lab.rdMultiplier}×
              </span>
              <span className="text-xs text-text-light font-mono" title={`${lab.computeStock} units (~${lab.computeStock}M H100e)`}>
                {lab.computeStock}u
              </span>
            </div>
            <ComputeDotsViz allocation={lab.allocation} computeStock={lab.computeStock} />
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
                  {cat.key === "users"
                    ? "Users"
                    : cat.key === "capability"
                      ? "R&D"
                      : "Safety"}{" "}
                  {lab.allocation[cat.key]}%
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ComputeDotsViz({
  allocation,
  computeStock,
}: {
  allocation: { users: number; capability: number; safety: number };
  computeStock?: number;
}) {
  // If computeStock provided: 1 block = 1 unit (proportional). Otherwise: 20 blocks (player preview)
  const total = computeStock != null ? Math.max(1, Math.round(computeStock)) : 20;
  const dots: { color: string; key: string; idx: number }[] = [];
  let idx = 0;
  for (const cat of COMPUTE_CATEGORIES) {
    const count = Math.round((allocation[cat.key] / 100) * total);
    for (let i = 0; i < count && idx < total; i++) {
      dots.push({ color: cat.color, key: cat.key, idx: idx++ });
    }
  }
  // Fill remaining to ensure total blocks = computeStock
  while (dots.length < total) {
    const lastCat = COMPUTE_CATEGORIES[COMPUTE_CATEGORIES.length - 1];
    dots.push({ color: lastCat.color, key: lastCat.key, idx: dots.length });
  }

  return (
    <div className="flex flex-wrap gap-[2px] mb-2" style={{ maxWidth: 10 * 12 + 9 * 2 }}>
      {dots.map((dot) => (
        <div
          key={dot.idx}
          className="rounded-[2px] compute-dot"
          style={{
            width: 10,
            height: 10,
            backgroundColor: dot.color,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}
