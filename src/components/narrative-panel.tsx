"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

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
}: {
  round: Round | undefined;
}) {
  // Hooks must be called unconditionally (before any early returns)
  const [verbIdx, setVerbIdx] = useState(0);
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
      <div className="bg-navy-dark rounded-xl border border-navy-light p-6 mb-4">
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
    <div>
      {/* The Story */}
      {storyText && (
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white mb-3">
            The Story
          </h3>
          <p className="text-base text-[#E2E8F0] leading-relaxed">
            {storyText}
          </p>
        </div>
      )}

    </div>
  );
}
