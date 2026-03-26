"use client";

import { MAX_PRIORITY, getProbabilityCard } from "@/lib/game-data";
import { X, Check, XCircle, Info, EyeOff, Eye } from "lucide-react";

interface Action {
  text: string;
  priority: number;
  secret?: boolean;
  probability?: number;
  rolled?: number;
  success?: boolean;
}

export function ActionCard({
  action,
  index,
  onPriorityChange,
  onRemove,
  onToggleSecret,
  totalPriorityUsed,
  isSubmitted,
}: {
  action: Action;
  index: number;
  onPriorityChange: (index: number, val: number) => void;
  onRemove: (index: number) => void;
  onToggleSecret?: (index: number) => void;
  totalPriorityUsed: number;
  isSubmitted: boolean;
}) {
  const remaining = MAX_PRIORITY - totalPriorityUsed + action.priority;
  const maxSlider = Math.min(remaining, MAX_PRIORITY);

  return (
    <div className="bg-white rounded-lg p-3 border border-border relative mb-2">
      {!isSubmitted && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-2">
          {onToggleSecret && (
            <button
              onClick={() => onToggleSecret(index)}
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${action.secret ? "text-viz-warning bg-[#FFF7ED]" : "text-text-light hover:text-text-muted hover:bg-warm-gray"}`}
              title={action.secret ? "Secret action — hidden from other players" : "Make secret"}
            >
              {action.secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => onRemove(index)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-text-light hover:text-viz-danger hover:bg-[#FEF2F2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-start gap-2 mb-2 pr-20">
        <span className="text-[11px] bg-warm-gray text-text-muted rounded px-1.5 py-0.5 font-mono font-semibold shrink-0">
          #{index + 1}
        </span>
        {action.secret && (
          <span className="text-[10px] bg-[#FFF7ED] text-viz-warning rounded px-1.5 py-0.5 font-bold shrink-0">
            SECRET
          </span>
        )}
        <p className="text-sm text-text">{action.text}</p>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-[11px] text-text-muted mb-1">
          <span className="flex items-center gap-1" title="How many resources your actor commits to this action. Higher priority = better odds of success.">
            Priority <Info className="w-3 h-3" />
          </span>
          <span className="font-mono">
            {action.priority}/{MAX_PRIORITY}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={maxSlider}
          value={action.priority}
          onChange={(e) => onPriorityChange(index, parseInt(e.target.value))}
          disabled={isSubmitted}
          className="w-full"
        />
      </div>

      {action.probability != null && (
        <ProbabilityBadge
          probability={action.probability}
          rolled={action.rolled}
          success={action.success}
        />
      )}
    </div>
  );
}

export function ProbabilityBadge({
  probability,
  rolled,
  success,
  onClick,
}: {
  probability: number;
  rolled?: number;
  success?: boolean;
  onClick?: () => void;
}) {
  const prob = getProbabilityCard(probability);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className={`text-[11px] font-bold py-0.5 px-2.5 rounded-full ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
        style={{ backgroundColor: prob.bgColor, color: prob.color }}
        onClick={onClick}
      >
        {prob.label} ({prob.pct}%)
      </span>
      {rolled != null && (
        <span
          className="text-[11px] font-mono flex items-center gap-1"
          style={{ color: success ? "#22C55E" : "#EF4444" }}
        >
          d100: {rolled}
          {success ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
        </span>
      )}
    </div>
  );
}
