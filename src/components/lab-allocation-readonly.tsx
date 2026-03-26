"use client";

import { COMPUTE_CATEGORIES } from "@/lib/game-data";

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

interface Props {
  labId: string;
  labs: Lab[];
}

export function LabAllocationReadOnly({ labId, labs }: Props) {
  const lab = labs.find((l) => l.name.toLowerCase().includes(labId));
  if (!lab) return null;

  return (
    <div className="bg-white rounded-xl border border-border p-4 mb-4">
      <h3 className="text-sm font-bold text-text mb-1">{lab.name} — Current Allocation</h3>
      <p className="text-[11px] text-text-muted mb-3">
        Set by {lab.name}&apos;s CEO. Your actions can influence this.
      </p>

      <div className="flex items-center gap-1 mb-3 h-4 rounded-full overflow-hidden">
        {COMPUTE_CATEGORIES.map((cat) => {
          const pct = lab.allocation[cat.key];
          return (
            <div
              key={cat.key}
              style={{ width: `${pct}%`, backgroundColor: cat.color }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {COMPUTE_CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <div className="text-lg font-bold" style={{ color: cat.color }}>
              {lab.allocation[cat.key]}%
            </div>
            <div className="text-[10px] text-text-muted">{cat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
        <span>Compute stock: {lab.computeStock}u</span>
        <span>R&D multiplier: {lab.rdMultiplier}×</span>
      </div>
    </div>
  );
}
