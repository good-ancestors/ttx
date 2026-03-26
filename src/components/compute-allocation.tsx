"use client";

import { COMPUTE_CATEGORIES } from "@/lib/game-data";
import { ComputeDotsViz } from "./lab-tracker";
import { Minus, Plus } from "lucide-react";

interface Allocation {
  users: number;
  capability: number;
  safety: number;
}

export function ComputeAllocation({
  allocation,
  onChange,
  isSubmitted,
  roleName,
}: {
  allocation: Allocation;
  onChange: (a: Allocation) => void;
  isSubmitted: boolean;
  roleName: string;
}) {
  const total = Object.values(allocation).reduce((s, v) => s + v, 0);

  const handleChange = (key: keyof Allocation, newVal: number) => {
    if (isSubmitted) return;
    const clamped = Math.max(0, Math.min(100, newVal));
    const others = COMPUTE_CATEGORIES.filter((c) => c.key !== key);
    const otherTotal = others.reduce((s, c) => s + allocation[c.key], 0);
    const next = { ...allocation, [key]: clamped } as Allocation;

    if (otherTotal > 0) {
      let remaining = 100 - clamped;
      others.forEach((c, i) => {
        if (i === others.length - 1) {
          next[c.key] = Math.max(0, remaining);
        } else {
          const proportion = allocation[c.key] / otherTotal;
          const val = Math.max(0, Math.round(proportion * remaining));
          next[c.key] = val;
          remaining -= val;
        }
      });
    }
    onChange(next);
  };

  return (
    <div className="bg-white rounded-xl border border-navy p-5 mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-bold text-text">Compute Allocation</span>
        <span
          className="text-[11px] font-mono"
          style={{ color: total === 100 ? "#22C55E" : "#EF4444" }}
        >
          {total}%
        </span>
      </div>
      <p className="text-xs text-text-muted mb-3">
        How does {roleName} allocate its compute this quarter?
      </p>

      <ComputeDotsViz allocation={allocation} />

      {/* Stacked bar */}
      <div className="flex h-3 rounded-md overflow-hidden mb-4 bg-warm-gray">
        {COMPUTE_CATEGORIES.map((cat) => {
          const pct = allocation[cat.key] || 0;
          if (pct === 0) return null;
          return (
            <div
              key={cat.key}
              className="bar-segment flex items-center justify-center"
              style={{ width: `${pct}%`, backgroundColor: cat.color }}
            >
              {pct >= 12 && (
                <span className="text-[9px] font-bold text-white">{pct}%</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {COMPUTE_CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-text font-medium">{cat.label}</span>
              <div className="flex items-center gap-1">
                {!isSubmitted && (
                  <>
                    <button
                      onClick={() => handleChange(cat.key, allocation[cat.key] - 5)}
                      className="w-8 h-8 rounded-md border border-border bg-warm-gray text-text
                                 flex items-center justify-center active:bg-border-dark"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleChange(cat.key, allocation[cat.key] + 5)}
                      className="w-8 h-8 rounded-md border border-border bg-warm-gray text-text
                                 flex items-center justify-center active:bg-border-dark"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <span className="text-[13px] font-mono font-bold text-text w-8 text-right">
                  {allocation[cat.key]}%
                </span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={allocation[cat.key]}
              onChange={(e) => handleChange(cat.key, parseInt(e.target.value))}
              disabled={isSubmitted}
              style={{ accentColor: cat.color }}
              className="w-full"
            />
            <p className="text-[11px] text-text-muted mt-0.5">{cat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
