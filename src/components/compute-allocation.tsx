"use client";

import { COMPUTE_CATEGORIES } from "@/lib/game-data";
import { balanceAllocation } from "@/lib/allocation";
import { ComputeDotsViz } from "./lab-tracker";
import { Check, Minus, Plus, Save, AlertCircle } from "lucide-react";

interface Allocation {
  deployment: number; research: number;
  safety: number;
}

export function ComputeAllocation({
  allocation,
  onChange,
  isSubmitted,
  roleName,
  saved,
  unsaved,
  onSave,
}: {
  allocation: Allocation;
  onChange: (a: Allocation) => void;
  isSubmitted: boolean;
  roleName: string;
  saved?: boolean;
  unsaved?: boolean;
  onSave?: () => void;
}) {
  const total = Object.values(allocation).reduce((s, v) => s + v, 0);

  const handleChange = (key: keyof Allocation, newVal: number) => {
    if (isSubmitted) return;
    onChange(balanceAllocation({ ...allocation, [key]: newVal }, key));
  };

  return (
    <div className="bg-white rounded-xl border border-navy p-5 mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-bold text-text">Your Lab&apos;s Compute Allocation</span>
        <span
          className="text-[11px] font-mono"
          style={{ color: total === 100 ? "#22C55E" : "#EF4444" }}
        >
          {total}%
        </span>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Set how {roleName} distributes compute this round. This takes effect from the start of the round — it&apos;s not an action, just a standing decision.
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
                      aria-label={`Decrease ${cat.label}`}
                      className="w-11 h-11 rounded-md border border-border bg-warm-gray text-text
                                 flex items-center justify-center active:bg-border-dark"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleChange(cat.key, allocation[cat.key] + 5)}
                      aria-label={`Increase ${cat.label}`}
                      className="w-11 h-11 rounded-md border border-border bg-warm-gray text-text
                                 flex items-center justify-center active:bg-border-dark"
                    >
                      <Plus className="w-4 h-4" />
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

      {!isSubmitted && onSave && (
        <>
          <button
            onClick={onSave}
            disabled={total !== 100}
            className="mt-4 w-full h-12 rounded-lg border border-navy bg-navy text-white font-bold text-sm
                       flex items-center justify-center gap-2 active:bg-navy-dark disabled:opacity-40 transition-colors"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" /> Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Changes
              </>
            )}
          </button>
          {unsaved && !saved && (
            <p className="mt-1.5 text-xs text-[#D97706] font-medium flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> Unsaved changes
            </p>
          )}
        </>
      )}
    </div>
  );
}
