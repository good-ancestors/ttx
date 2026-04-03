"use client";

import { useState } from "react";
import { FullScreenOverlay } from "@/components/full-screen-overlay";
import { Clock, Maximize2, Pause, Plus, Minus } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Timer display in the nav bar with full-screen expand capability.
 * Full-screen mode shows a large countdown with pause and +/- 30s controls.
 */
export function TimerDisplay({
  timerDisplay,
  isExpired,
  isUrgent,
  isProjector,
  gameId,
  hasTimer,
  skipTimer,
  adjustTimer,
}: {
  timerDisplay: string;
  isExpired: boolean;
  isUrgent: boolean;
  isProjector: boolean;
  gameId: Id<"games">;
  hasTimer: boolean;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  adjustTimer: (args: { gameId: Id<"games">; deltaSeconds: number }) => Promise<unknown>;
}) {
  const [fullScreen, setFullScreen] = useState(false);

  if (!hasTimer || timerDisplay === "0:00") return null;

  return (
    <>
    {fullScreen && (
      <FullScreenOverlay title="Timer" onClose={() => setFullScreen(false)} bodyClassName="flex-1 flex flex-col items-center justify-center">
        {/* Large countdown */}
        <span className={`text-[12rem] font-mono font-black leading-none ${
          isExpired ? "text-viz-danger" : isUrgent ? "text-viz-danger animate-pulse" : "text-white"
        }`}>
          {timerDisplay}
        </span>

        {/* Controls */}
        {!isProjector && (
          <div className="flex items-center gap-4 mt-12">
            <button
              onClick={() => void adjustTimer({ gameId, deltaSeconds: -30 })}
              className="flex items-center gap-2 px-6 py-3 bg-navy-light text-text-light rounded-lg font-bold text-lg hover:bg-navy-muted transition-colors"
            >
              <Minus className="w-5 h-5" /> 30s
            </button>
            <button
              onClick={() => void skipTimer({ gameId })}
              className="flex items-center gap-2 px-8 py-3 bg-viz-danger/20 text-viz-danger rounded-lg font-bold text-lg hover:bg-viz-danger/30 transition-colors"
            >
              <Pause className="w-5 h-5" /> End Timer
            </button>
            <button
              onClick={() => void adjustTimer({ gameId, deltaSeconds: 30 })}
              className="flex items-center gap-2 px-6 py-3 bg-navy-light text-text-light rounded-lg font-bold text-lg hover:bg-navy-muted transition-colors"
            >
              <Plus className="w-5 h-5" /> 30s
            </button>
          </div>
        )}
      </FullScreenOverlay>
    )}

    <button
      onClick={() => setFullScreen(true)}
      className={`text-sm font-mono flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${
        isExpired ? "text-viz-danger" : isUrgent ? "text-viz-danger animate-pulse" : "text-text-light"
      }`}
      title="Click to expand timer"
    >
      <Clock className="w-4 h-4" /> {timerDisplay}
      <Maximize2 className="w-3 h-3 ml-0.5 opacity-50" />
    </button>
    </>
  );
}
