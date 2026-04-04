"use client";

import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthMutation } from "@/lib/hooks";

export function ComputeEditor({ labs, gameId, computeChanges, onClose }: {
  labs: { name: string; roleId: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];
  gameId: Id<"games">;
  computeChanges?: {
    distribution: {
      labName: string;
      stockBefore: number;
      stockAfter: number;
      stockChange: number;
      baseline: number;
      modifier: number;
      newTotal: number;
    }[];
  };
  onClose: () => void;
}) {
  const updateLabs = useAuthMutation(api.games.updateLabs);
  const [stocks, setStocks] = useState<Record<string, number>>(
    Object.fromEntries(labs.map((l) => [l.name, l.computeStock]))
  );
  const handleSave = async () => {
    const updated = labs.map((l) => ({
      name: l.name, roleId: l.roleId, computeStock: stocks[l.name] ?? l.computeStock,
      rdMultiplier: l.rdMultiplier, allocation: l.allocation,
    }));
    await updateLabs({ gameId, labs: updated });
    onClose();
  };
  return (
    <div>
      <p className="text-xs text-text-light mb-3">Adjust compute stock for each lab. Each unit ≈ 1M H100e.</p>
      <div className="space-y-3">
        {labs.map((lab) => {
          const change = computeChanges?.distribution.find((d) => d.labName === lab.name);
          return (
            <div key={lab.name} className="flex items-center gap-3">
              <span className="text-sm text-white min-w-[120px]">{lab.name}</span>
              {change && (
                <span className="text-[10px] text-navy-muted font-mono w-16 text-right">was {change.stockBefore}u</span>
              )}
              {change && (
                <span className={`text-[10px] font-mono ${change.stockChange >= 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                  {change.stockChange >= 0 ? "+" : ""}{change.stockChange}
                </span>
              )}
              <span className="text-navy-muted">→</span>
              <input
                type="number"
                value={stocks[lab.name] ?? lab.computeStock}
                onChange={(e) => setStocks({ ...stocks, [lab.name]: parseInt(e.target.value) || 0 })}
                className="w-20 text-sm bg-navy border border-navy-light rounded px-2 py-1 text-white font-mono text-right focus:outline-none focus:border-text-light"
              />
              <span className="text-[10px] text-navy-muted">units</span>
            </div>
          );
        })}
      </div>
      <button onClick={() => void handleSave()} className="mt-4 text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors">
        Save
      </button>
    </div>
  );
}
