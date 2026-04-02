"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, ChevronDown } from "lucide-react";

const LOADING_VERBS = [
  "Simulating geopolitics...",
  "Modelling AI capabilities...",
  "Assessing alignment trajectories...",
  "Computing power dynamics...",
  "Weighing diplomatic consequences...",
  "Calibrating risk scenarios...",
  "Projecting capability curves...",
  "Evaluating safety margins...",
  "Tracking intelligence operations...",
  "Forecasting technology diffusion...",
  "Analysing coalition stability...",
  "Updating world model...",
];

interface Round {
  _id: string;
  label: string;
  title: string;
  summary?: {
    narrative?: string;
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
    headlines: string[];
    facilitatorNotes?: string;
  };
  fallbackNarrative?: string;
}

export function NarrativePanel({
  round,
  defaultExpanded = true,
}: {
  round: Round | undefined;
  defaultExpanded?: boolean;
}) {
  const [verbIdx, setVerbIdx] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [readChecked, setReadChecked] = useState(false);
  const summary = round?.summary;
  const storyText = summary?.narrative
    ?? (summary
      ? [...summary.geopoliticalEvents, ...summary.aiStateOfPlay].join(" ")
      : round?.fallbackNarrative);

  useEffect(() => {
    if (storyText || round?.fallbackNarrative) return;
    const interval = setInterval(() => {
      setVerbIdx((prev) => (prev + 1) % LOADING_VERBS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [storyText, round?.fallbackNarrative]);

  if (!round) return null;

  if (!storyText && !round.fallbackNarrative) {
    return (
      <div className="bg-navy-dark rounded-xl border border-navy-light p-6">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="w-5 h-5 text-viz-capability animate-spin" />
          <span className="text-sm font-medium text-text-light transition-opacity duration-300">
            {LOADING_VERBS[verbIdx]}
          </span>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-navy-light rounded animate-pulse w-3/4" />
          <div className="h-4 bg-navy-light rounded animate-pulse w-full" />
          <div className="h-4 bg-navy-light rounded animate-pulse w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2"
        >
          <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${expanded ? "" : "-rotate-90"}`} />
          <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
            What Happened
          </span>
          {storyText && (
            <span className="text-xs text-viz-safety flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
        {storyText && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={readChecked}
              onChange={(e) => setReadChecked(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-navy-light accent-viz-safety"
            />
            <span className="text-[10px] text-text-light">Read aloud</span>
          </label>
        )}
      </div>
      {expanded && storyText && (
        <p className="text-base text-[#E2E8F0] leading-relaxed mt-3">
          {storyText}
        </p>
      )}
    </div>
  );
}
