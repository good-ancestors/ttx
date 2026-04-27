"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Loader2, CheckCircle, ChevronDown, Bug, X, Pencil } from "lucide-react";
import { useFacilitatorToken } from "@/lib/hooks";

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

import {
  PROSE_SECTIONS,
  LEGACY_SECTIONS,
  hasProseNarrative,
  hasLegacyNarrative,
  type NarrativeSummary,
} from "@/lib/narrative-sections";

interface Round {
  number: number;
  summary?: NarrativeSummary;
}

type ResolveDebugData = FunctionReturnType<typeof api.rounds.getResolveDebug>;

export function NarrativePanel({
  round,
  defaultExpanded = true,
  isProjector = false,
  debugContext,
  onEditNarrative,
}: {
  round: Round | undefined;
  defaultExpanded?: boolean;
  isProjector?: boolean;
  /** Enables facilitator-only bug-icon overlay with the round's resolve LLM prompt+response. */
  debugContext?: { gameId: Id<"games"> };
  /** Facilitator-only edit action — renders a small pencil next to the debug button. */
  onEditNarrative?: () => void;
}) {
  const [verbIdx, setVerbIdx] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const summary = round?.summary;
  const hasProse = hasProseNarrative(summary);
  const hasLegacy = hasLegacyNarrative(summary);
  const hasContent = hasProse || hasLegacy;

  useEffect(() => {
    if (hasContent) return;
    const interval = setInterval(() => {
      setVerbIdx((prev) => (prev + 1) % LOADING_VERBS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [hasContent]);

  if (!round) return null;

  if (!hasContent) {
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
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5 relative">
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
      <div className="flex items-center gap-1 absolute top-4 right-4">
        {onEditNarrative && (
          <button
            onClick={onEditNarrative}
            className="text-text-light/60 hover:text-text-light transition-colors"
            aria-label="Edit summary"
            title="Edit summary"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        {debugContext && (
          <ResolveDebugButton gameId={debugContext.gameId} roundNumber={round.number} />
        )}
      </div>
      {expanded && hasContent && summary && (
        <div className="mt-4 space-y-4">
          {hasProse
            ? PROSE_SECTIONS.map(({ key, label }) => {
                const text = summary[key];
                if (!text) return null;
                // New format: bullets separated by newlines, each line starting with "- ".
                // Old format: a single prose paragraph. Detect and render appropriately.
                const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
                const isBulletList = lines.length > 1 && lines.every((l) => /^[-•*]\s/.test(l));
                return (
                  <div key={key}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-1.5">
                      {label}
                    </div>
                    {isBulletList ? (
                      <ul className="space-y-1.5">
                        {lines.map((line, i) => (
                          <li key={i} className={`${textSize} text-[#E2E8F0] leading-relaxed flex gap-2`}>
                            <span aria-hidden className="text-text-muted shrink-0 select-none">•</span>
                            <span className="flex-1">{line.replace(/^[-•*]\s+/, "")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`${textSize} text-[#E2E8F0] leading-relaxed`}>{text}</p>
                    )}
                  </div>
                );
              })
            : LEGACY_SECTIONS.map(({ key, label }) => {
                const lines = summary[key];
                if (!lines?.length) return null;
                return (
                  <div key={key}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-1.5">
                      {label}
                    </div>
                    <ul className="space-y-1.5">
                      {lines.map((line, i) => (
                        <li key={i} className={`${textSize} text-[#E2E8F0] leading-relaxed flex gap-2`}>
                          <span aria-hidden className="text-text-muted shrink-0 select-none">•</span>
                          <span className="flex-1">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}

function ResolveDebugButton({ gameId, roundNumber }: { gameId: Id<"games">; roundNumber: number }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"prompt" | "response">("response");
  const [debug, setDebug] = useState<ResolveDebugData | undefined>(undefined);
  // ResolveDebugData already includes `null` (no LLM debug captured); `undefined` means still loading.
  const [loadError, setLoadError] = useState<string | null>(null);
  const convex = useConvex();
  const facilitatorToken = useFacilitatorToken();
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const openDebug = () => {
    setOpen(true);
    setTab("response");
    setDebug(undefined);

    if (!facilitatorToken) {
      setLoadError("Facilitator authentication is missing. Refresh and sign in again.");
      return;
    }

    setLoadError(null);

    // Imperative convex.query (not useQuery) so auth errors surface inline in this modal
    // instead of throwing from a subscription and crashing the whole narrative tree.
    const requestId = ++requestIdRef.current;
    void convex
      .query(api.rounds.getResolveDebug, { gameId, roundNumber, facilitatorToken })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setDebug(result);
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        console.error("Failed to load resolve debug:", error);
        setLoadError(error instanceof Error ? error.message : "Failed to load resolve debug.");
      });
  };

  return (
    <>
      <button
        onClick={openDebug}
        className="text-text-light/60 hover:text-text-light transition-colors"
        title="Show LLM prompt and response for this round"
        aria-label="Show resolve-phase LLM debug"
      >
        <Bug className="w-4 h-4" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-navy-dark border border-navy-light rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy-light">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-light">
                <Bug className="w-4 h-4" /> Resolve LLM — Round {roundNumber}
              </div>
              <button onClick={() => setOpen(false)} className="text-text-light hover:text-white" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 pt-3 flex gap-2 text-xs">
              {(["response", "prompt"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded capitalize ${tab === t ? "bg-navy-light text-white" : "text-text-light hover:bg-navy-light/50"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto px-4 py-3">
              {loadError ? (
                <div className="rounded bg-viz-danger/20 border border-viz-danger/40 text-viz-danger text-xs px-3 py-2">
                  {loadError}
                </div>
              ) : debug === undefined ? (
                <div className="text-text-light text-xs">Loading…</div>
              ) : debug === null ? (
                <div className="text-text-light text-xs">No LLM debug captured for this round yet (will appear after the narrative runs).</div>
              ) : (
                <>
                  {debug.error && (
                    <div className="mb-3 rounded bg-viz-danger/20 border border-viz-danger/40 text-viz-danger text-xs px-3 py-2">
                      LLM error: {debug.error}
                    </div>
                  )}
                  <pre className="text-[11px] leading-relaxed text-[#E2E8F0] whitespace-pre-wrap font-mono">
                    {tab === "prompt" ? debug.prompt : debug.responseJson || "(no response captured)"}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
