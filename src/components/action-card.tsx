"use client";

import { getProbabilityCard } from "@/lib/game-data";
import { Check, XCircle } from "lucide-react";

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
