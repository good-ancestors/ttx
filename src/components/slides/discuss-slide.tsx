"use client";

import { useCallback, useEffect, useReducer } from "react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { SlideShell } from "@/components/presentation/primitives";

const DEFAULT_SECONDS = 30 * 60;

type TimerState = { secondsLeft: number; running: boolean };
type TimerAction =
  | { type: "tick" }
  | { type: "toggle" }
  | { type: "reset" }
  | { type: "adjust"; delta: number };

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "tick":
      if (state.secondsLeft <= 1) return { secondsLeft: 0, running: false };
      return { ...state, secondsLeft: state.secondsLeft - 1 };
    case "toggle":
      if (state.secondsLeft === 0) return state;
      return { ...state, running: !state.running };
    case "reset":
      return { secondsLeft: DEFAULT_SECONDS, running: false };
    case "adjust":
      return { ...state, secondsLeft: Math.max(0, state.secondsLeft + action.delta) };
  }
}

export function makeDiscussSlide(turnLabel: string) {
  function DiscussSlide() {
    const [{ secondsLeft, running }, dispatch] = useReducer(timerReducer, {
      secondsLeft: DEFAULT_SECONDS,
      running: false,
    });

    useEffect(() => {
      if (!running) return;
      const id = setInterval(() => dispatch({ type: "tick" }), 1000);
      return () => clearInterval(id);
    }, [running]);

    const adjust = useCallback((delta: number) => {
      dispatch({ type: "adjust", delta });
    }, []);

    const reset = useCallback(() => {
      dispatch({ type: "reset" });
    }, []);

    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    const timerColor =
      secondsLeft < 60 ? "text-viz-danger" : secondsLeft < 3 * 60 ? "text-viz-warning" : "text-off-white";

    // Final-minute siren: flash the whole screen red while the clock runs down.
    const sirenActive = running && secondsLeft > 0 && secondsLeft <= 60;

    const btnBase =
      "flex h-12 items-center justify-center rounded-full bg-navy-light/60 text-off-white transition hover:bg-navy-light px-5 gap-2 font-semibold";

    return (
      <SlideShell>
        {sirenActive && (
          <div
            aria-hidden
            className="animate-siren-flash pointer-events-none fixed inset-0 z-0 bg-viz-danger/35"
          />
        )}
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-text-light">
          {turnLabel}
        </p>
        <h2 className="text-5xl font-bold text-off-white md:text-7xl">Discuss</h2>
        <p className="max-w-2xl text-center text-xl text-text-light md:text-2xl">
          Make deals, hold discussions, and negotiate with other stakeholders to advance your objectives.
        </p>

        <div
          className={`font-mono text-[10rem] font-bold leading-none tabular-nums md:text-[14rem] ${timerColor}`}
        >
          {timeStr}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => adjust(-30)}
            aria-label="Subtract 30 seconds"
            className={btnBase}
          >
            <Minus className="h-4 w-4" aria-hidden />
            30s
          </button>

          <button
            type="button"
            onClick={() => dispatch({ type: "toggle" })}
            aria-label={running ? "Pause timer" : "Start timer"}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-viz-safety text-navy-dark transition hover:opacity-90"
          >
            {running ? (
              <Pause className="h-7 w-7" aria-hidden />
            ) : (
              <Play className="h-7 w-7 translate-x-0.5" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={reset}
            aria-label="Reset timer"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-light/60 text-off-white transition hover:bg-navy-light"
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => adjust(30)}
            aria-label="Add 30 seconds"
            className={btnBase}
          >
            <Plus className="h-4 w-4" aria-hidden />
            30s
          </button>
        </div>
      </SlideShell>
    );
  }
  DiscussSlide.displayName = `DiscussSlide(${turnLabel})`;
  return DiscussSlide;
}
