"use client";

import { MessageSquareText, SkipForward } from "lucide-react";
import type { FacilitatorPhaseProps } from "./types";
import type { Id } from "@convex/_generated/dataModel";

interface DiscussPhaseProps extends FacilitatorPhaseProps {
  submitDuration: number;
  setSubmitDuration: (val: number) => void;
  openSubmissions: (args: { gameId: Id<"games">; durationSeconds: number }) => Promise<unknown>;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
}

export function DiscussPhase({
  gameId,
  game,
  isProjector,
  submitDuration,
  setSubmitDuration,
  safeAction,
  skipTimer,
  openSubmissions,
}: DiscussPhaseProps) {
  return (
    <div className="text-center py-16">
      <MessageSquareText className="w-12 h-12 text-text-light mx-auto mb-4" />
      <h3 className="text-xl font-bold mb-2">Tables are discussing</h3>
      <p className="text-text-light mb-6 text-sm">
        Each table: discuss what your actor does this quarter, then submit.
      </p>
      <div className="flex items-center justify-center gap-2 mb-4">
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
      <button
        onClick={() => void openSubmissions({ gameId, durationSeconds: submitDuration * 60 })}
        className="py-3 px-8 bg-white text-navy rounded-lg font-bold text-base hover:bg-off-white transition-colors"
      >
        Open Submissions ({submitDuration}min)
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
