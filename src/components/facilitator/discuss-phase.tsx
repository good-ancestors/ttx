"use client";

import { MessageSquareText, SkipForward, FileText } from "lucide-react";
import type { FacilitatorPhaseProps } from "./types";
import type { Id } from "@convex/_generated/dataModel";

interface DiscussPhaseProps extends FacilitatorPhaseProps {
  submitDuration: number;
  setSubmitDuration: (val: number) => void;
  useSampleForAI: boolean;
  setUseSampleForAI: (val: boolean) => void;
  advancePhase: (args: { gameId: Id<"games">; phase: "discuss" | "submit" | "rolling" | "narrate"; durationSeconds?: number }) => Promise<unknown>;
  generateAndStaggerAI: (durationSeconds: number) => Promise<void>;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
}

export function DiscussPhase({
  gameId,
  game,
  isProjector,
  submitDuration,
  setSubmitDuration,
  useSampleForAI,
  setUseSampleForAI,
  advancePhase,
  generateAndStaggerAI,
  safeAction,
  skipTimer,
}: DiscussPhaseProps) {
  return (
    <div className="text-center py-16">
      <MessageSquareText className="w-12 h-12 text-text-light mx-auto mb-4" />
      <h3 className="text-xl font-bold mb-2">Tables are discussing</h3>
      <p className="text-text-light mb-6 text-sm">
        Each table: discuss what your actor does this quarter, then submit.
      </p>
      <div className="flex items-center justify-center gap-2 mb-3">
        {[2, 4, 6, 8, 10].map((min) => (
          <button
            key={min}
            onClick={() => setSubmitDuration(min)}
            className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${
              submitDuration === min
                ? "bg-white text-navy"
                : "bg-navy-light text-text-light hover:bg-navy-muted"
            }`}
          >
            {min}m
          </button>
        ))}
      </div>
      <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={useSampleForAI}
          onChange={(e) => setUseSampleForAI(e.target.checked)}
          className="w-4 h-4 rounded border-navy-light accent-viz-safety"
        />
        <FileText className="w-3.5 h-3.5 text-text-light" />
        <span className="text-sm text-text-light">
          Use sample actions for AI players
        </span>
      </label>
      <button
        onClick={async () => {
          await advancePhase({ gameId, phase: "submit", durationSeconds: submitDuration * 60 });
          void generateAndStaggerAI(submitDuration * 60);
        }}
        className="py-3 px-8 bg-white text-navy rounded-lg font-bold text-base hover:bg-off-white transition-colors"
      >
        Open Submissions ({submitDuration}min)
      </button>
      <button
        onClick={async () => {
          await advancePhase({ gameId, phase: "submit", durationSeconds: 120 });
          void generateAndStaggerAI(30);
        }}
        className="py-2 px-6 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors mt-3"
      >
        Demo: Skip to AI Submissions
      </button>
      {!isProjector && game.phaseEndsAt && (
        <button
          onClick={safeAction("Skip timer", () => skipTimer({ gameId }))}
          className="py-2 px-6 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors mt-3 ml-2"
        >
          <SkipForward className="w-4 h-4 inline mr-1" />Skip Timer
        </button>
      )}
    </div>
  );
}
