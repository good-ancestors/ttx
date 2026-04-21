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
  summary?: {
    labs: string[];
    geopolitics: string[];
    publicAndMedia: string[];
    aiSystems: string[];
    facilitatorNotes?: string;
  };
  fallbackNarrative?: string;
}

const SECTIONS: { key: keyof NonNullable<Round["summary"]>; label: string }[] = [
  { key: "labs", label: "Labs" },
  { key: "geopolitics", label: "Geopolitics" },
  { key: "publicAndMedia", label: "Public & Media" },
  { key: "aiSystems", label: "AI Systems" },
];

export function NarrativePanel({
  round,
  defaultExpanded = true,
  isProjector = false,
}: {
  round: Round | undefined;
  defaultExpanded?: boolean;
  isProjector?: boolean;
}) {
  const [verbIdx, setVerbIdx] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const summary = round?.summary;
  const hasContent = summary
    ? SECTIONS.some(({ key }) => (summary[key] as string[] | undefined)?.length)
    : false;

  useEffect(() => {
    if (hasContent || round?.fallbackNarrative) return;
    const interval = setInterval(() => {
      setVerbIdx((prev) => (prev + 1) % LOADING_VERBS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [hasContent, round?.fallbackNarrative]);

  if (!round) return null;

  if (!hasContent && !round.fallbackNarrative) {
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

  const textSize = isProjector ? "text-xl" : "text-base";

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2"
      >
        <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${expanded ? "" : "-rotate-90"}`} />
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          What Happened
        </span>
        {hasContent && (
          <CheckCircle className="w-3.5 h-3.5 text-viz-safety" />
        )}
      </button>
      {expanded && (
        <div className="mt-4 space-y-4">
          {hasContent && summary ? (
            SECTIONS.map(({ key, label }) => {
              const lines = summary[key] as string[] | undefined;
              if (!lines?.length) return null;
              return (
                <div key={key}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-1.5">
                    {label}
                  </div>
                  <ul className="space-y-1.5">
                    {lines.map((line, i) => (
                      <li key={i} className={`${textSize} text-[#E2E8F0] leading-relaxed`}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          ) : round.fallbackNarrative ? (
            <p className={`${textSize} text-[#E2E8F0] leading-relaxed`}>{round.fallbackNarrative}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
