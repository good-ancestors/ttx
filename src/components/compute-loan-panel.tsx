"use client";

import { useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

interface ComputeLoan {
  targetLab: string;
  amount: number;
}

interface Props {
  computeStock: number;
  labs: Lab[];
  loans: ComputeLoan[];
  onChange: (loans: ComputeLoan[]) => void;
  isSubmitted: boolean;
}

export function ComputeLoanPanel({ computeStock, labs, loans, onChange, isSubmitted }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTarget, setNewTarget] = useState(labs[0]?.name ?? "");
  const [newAmount, setNewAmount] = useState(1);

  const totalLoaned = loans.reduce((s, l) => s + l.amount, 0);
  const remaining = computeStock - totalLoaned;

  if (computeStock <= 0) return null;

  const addLoan = () => {
    if (newAmount > 0 && newAmount <= remaining && newTarget) {
      const existing = loans.findIndex((l) => l.targetLab === newTarget);
      if (existing >= 0) {
        const updated = [...loans];
        updated[existing] = { ...updated[existing], amount: updated[existing].amount + newAmount };
        onChange(updated);
      } else {
        onChange([...loans, { targetLab: newTarget, amount: newAmount }]);
      }
      setShowAdd(false);
      setNewAmount(1);
    }
  };

  const removeLoan = (index: number) => {
    onChange(loans.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-white rounded-xl border border-border p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-text">Compute Resources</h3>
        <span className="text-xs font-mono text-text-muted">
          {remaining}/{computeStock} available
        </span>
      </div>
      <p className="text-[11px] text-text-muted mb-3">
        Direct your compute to support a lab&apos;s work this quarter.
      </p>

      {loans.map((loan, i) => (
        <div key={i} className="flex items-center gap-2 mb-2 bg-warm-gray rounded-lg p-2">
          <ArrowRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <span className="text-[13px] text-text flex-1">
            {loan.amount}u → {loan.targetLab}
          </span>
          {!isSubmitted && (
            <button onClick={() => removeLoan(i)} className="text-text-muted hover:text-viz-danger">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {!isSubmitted && remaining > 0 && (
        <>
          {showAdd ? (
            <div className="flex items-center gap-2 mt-2">
              <select
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="flex-1 p-2 bg-warm-gray border border-border rounded-lg text-[13px] text-text"
              >
                {labs.map((lab) => (
                  <option key={lab.name} value={lab.name}>
                    {lab.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={remaining}
                value={newAmount}
                onChange={(e) => setNewAmount(Math.min(remaining, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-16 p-2 bg-warm-gray border border-border rounded-lg text-[13px] text-text text-center"
              />
              <button
                onClick={addLoan}
                className="px-3 py-2 bg-navy text-white rounded-lg text-[13px] font-bold"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-[13px] text-navy font-medium mt-1 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Direct compute to a lab
            </button>
          )}
        </>
      )}
    </div>
  );
}
