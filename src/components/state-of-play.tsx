"use client";

import { getCapabilityDescription, WORLD_STATE_INDICATORS } from "@/lib/game-data";
import { RdProgressChart } from "@/components/rd-progress-chart";
import { Cpu, Zap, AlertTriangle, TrendingUp } from "lucide-react";

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

interface Round {
  number: number;
  label: string;
  labsAfter?: Lab[];
}

interface Props {
  labs: Lab[];
  worldState: Record<string, number>;
  roundLabel: string;
  rounds?: Round[];
}

/**
 * "State of Play" panel — replaces the slides' end-of-round summary.
 * Shows lab stats + capability description immediately (no AI needed).
 * Facilitator narrates over this while narrative generates in background.
 */
export function StateOfPlay({ labs, worldState, roundLabel, rounds }: Props) {
  const leading = labs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b), labs[0]);
  const cap = getCapabilityDescription(leading?.rdMultiplier ?? 1);

  const alignmentColor = worldState.alignment <= 3 ? "#EF4444" : worldState.alignment >= 7 ? "#22C55E" : "#F59E0B";
  const trajectory = worldState.alignment <= 3 ? "RACE" : worldState.alignment >= 6 ? "SLOWDOWN" : "UNCERTAIN";

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light">
          State of Play — {roundLabel}
        </span>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${alignmentColor  }20`, color: alignmentColor }}
        >
          {trajectory} TRAJECTORY
        </span>
      </div>

      {/* Lab stats — like the slide's "What's the state of play with AI?" */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {labs.map((lab) => (
          <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
            <div className="text-sm font-bold text-white mb-1">{lab.name}</div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-black text-viz-capability font-mono">{lab.rdMultiplier}×</span>
              <span className="text-[11px] text-text-light">R&D</span>
            </div>
            <div className="text-[11px] text-text-light space-y-0.5">
              <div className="flex justify-between">
                <span>Compute</span>
                <span className="font-mono">{lab.computeStock}u</span>
              </div>
              <div className="flex justify-between">
                <span>Safety</span>
                <span className="font-mono" style={{ color: lab.allocation.safety >= 10 ? "#22C55E" : lab.allocation.safety >= 5 ? "#F59E0B" : "#EF4444" }}>
                  {lab.allocation.safety}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* R&D Progress Chart — shows trajectory across rounds */}
      {rounds && rounds.length > 0 && (
        <div className="mb-4">
          <RdProgressChart rounds={rounds} currentLabs={labs} />
        </div>
      )}

      {/* Capability description — like the slide's "How capable is AI?" */}
      <div className="bg-navy rounded-lg p-4 border border-navy-light mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-viz-capability" />
          <span className="text-base font-bold text-white">How Capable is AI?</span>
          <span className="text-xs text-viz-capability font-mono ml-auto">{cap.agent} — {cap.rdRange}</span>
        </div>

        <p className="text-sm text-[#E2E8F0] mb-3">{cap.generalCapability}</p>

        <div className="space-y-1.5 mb-3">
          {cap.specificCapabilities.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <Cpu className="w-3.5 h-3.5 text-viz-capability shrink-0 mt-0.5" />
              <span className="text-sm text-text-light">{c}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-3 mt-2 border-t border-navy-light">
          <TrendingUp className="w-5 h-5 text-viz-capability shrink-0" />
          <span className="text-base font-bold text-white">{cap.timeCompression}</span>
        </div>
      </div>

      {/* Implication callout */}
      <div className="flex items-start gap-2 bg-navy rounded-lg p-3 border border-navy-light">
        <AlertTriangle className="w-4 h-4 text-viz-warning shrink-0 mt-0.5" />
        <p className="text-sm text-[#E2E8F0]">{cap.implication}</p>
      </div>

      {/* Key world state highlights */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        {WORLD_STATE_INDICATORS.slice(0, 3).map((ind) => (
          <div key={ind.key} className="text-center">
            <div className="text-lg font-bold font-mono" style={{ color: ind.color }}>
              {worldState[ind.key]}/10
            </div>
            <div className="text-[10px] text-text-light">{ind.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
