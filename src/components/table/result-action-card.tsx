"use client";

import { MAX_PRIORITY } from "@/lib/game-data";
import { CheckCircle2, XCircle } from "lucide-react";

export interface ResultAction {
  text: string;
  priority: number;
  probability?: number;
  rolled?: number;
  success?: boolean;
  reasoning?: string;
}

export function ResultActionCard({
  action,
  index,
}: {
  action: ResultAction;
  index: number;
}) {
  const isSuccess = action.success === true;
  const isFailed = action.success === false;
  const borderColor = isSuccess ? "#22C55E" : isFailed ? "#EF4444" : undefined;

  return (
    <div
      className="bg-white rounded-lg p-3 border border-border relative mb-2"
      style={borderColor ? { borderLeftWidth: "3px", borderLeftColor: borderColor } : undefined}
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[11px] bg-warm-gray text-text-muted rounded px-1.5 py-0.5 font-mono font-semibold shrink-0">
          #{index + 1}
        </span>
        <p className="text-sm text-text flex-1">{action.text}</p>
        {isSuccess && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#047857] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Success
          </span>
        )}
        {isFailed && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#B91C1C] bg-[#FEE2E2] px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-text-muted mb-1">
        <span className="font-mono">Priority: {action.priority}/{MAX_PRIORITY}</span>
        {action.probability != null && (
          <span className="font-mono">Probability: {action.probability}%</span>
        )}
      </div>

      {action.rolled != null && action.probability != null && (
        <p className="text-xs font-mono mt-1" style={{ color: isSuccess ? "#22C55E" : "#EF4444" }}>
          Needed ≤{action.probability}, rolled {action.rolled} — {isSuccess ? "Success!" : "Failed"}
        </p>
      )}
    </div>
  );
}
