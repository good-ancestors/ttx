"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Bug, ChevronDown, ChevronUp } from "lucide-react";

// Rough token pricing (USD per 1M tokens) — for cost estimation
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
  "anthropic/claude-haiku-4-5": { input: 0.8, output: 4 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "anthropic/claude-opus-4-6": { input: 15, output: 75 },
};

interface Props {
  gameId: Id<"games">;
  roundNumber: number;
  submissions?: { roleId: string; aiMeta?: { gradingModel?: string; gradingTimeMs?: number; gradingTokens?: number; playerModel?: string; playerTimeMs?: number } }[];
  round?: { aiMeta?: { narrativeModel?: string; narrativeTimeMs?: number; narrativeTokens?: number } };
}

export function DebugPanel({ gameId, roundNumber, submissions, round }: Props) {
  const [expanded, setExpanded] = useState(false);
  const events = useQuery(api.events.getByGame, { gameId, limit: 25 });

  // Calculate total tokens and estimated cost
  let totalTokens = 0;
  const models = new Set<string>();
  for (const sub of submissions ?? []) {
    if (sub.aiMeta?.gradingTokens) totalTokens += sub.aiMeta.gradingTokens;
    if (sub.aiMeta?.gradingModel) models.add(sub.aiMeta.gradingModel);
    if (sub.aiMeta?.playerModel) models.add(sub.aiMeta.playerModel);
  }
  if (round?.aiMeta?.narrativeTokens) totalTokens += round.aiMeta.narrativeTokens;
  if (round?.aiMeta?.narrativeModel) models.add(round.aiMeta.narrativeModel);

  // Rough cost estimate
  let estimatedCost = 0;
  for (const model of models) {
    const pricing = TOKEN_COSTS[model];
    if (pricing) {
      // Assume ~70% input, 30% output as rough split
      estimatedCost += (totalTokens * 0.7 * pricing.input + totalTokens * 0.3 * pricing.output) / 1_000_000;
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-navy-muted hover:text-text-light transition-colors"
      >
        <Bug className="w-3.5 h-3.5" />
        Debug
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 bg-navy-dark rounded-xl border border-navy-light p-4 text-[11px] font-mono">
          {/* AI metadata */}
          <div className="mb-3">
            <span className="text-text-light font-semibold uppercase tracking-wider block mb-1">
              AI Models — Round {roundNumber}
            </span>
            <div className="text-navy-muted">
              Tokens: {totalTokens > 0 ? totalTokens.toLocaleString() : "—"} |
              Est. cost: {estimatedCost > 0 ? `$${estimatedCost.toFixed(4)}` : "—"} |
              Models: {models.size > 0 ? [...models].map(m => m.split("/")[1]).join(", ") : "—"}
            </div>
          </div>

          {/* Per-submission AI info */}
          {(submissions ?? []).filter(s => s.aiMeta).length > 0 && (
            <div className="mb-3">
              <span className="text-text-light font-semibold block mb-1">Submissions</span>
              {(submissions ?? []).filter(s => s.aiMeta).map((sub, i) => (
                <div key={i} className="text-navy-muted">
                  {sub.roleId}: {sub.aiMeta?.playerModel?.split("/")[1] ?? "human"} ({sub.aiMeta?.playerTimeMs ?? "—"}ms)
                  {sub.aiMeta?.gradingModel && ` → graded by ${sub.aiMeta.gradingModel.split("/")[1]} (${sub.aiMeta.gradingTimeMs ?? "—"}ms)`}
                </div>
              ))}
            </div>
          )}

          {/* Narrative AI info */}
          {round?.aiMeta && (
            <div className="mb-3">
              <span className="text-text-light font-semibold block mb-1">Narrative</span>
              <div className="text-navy-muted">
                {round.aiMeta.narrativeModel?.split("/")[1] ?? "—"} |
                {round.aiMeta.narrativeTimeMs ? ` ${(round.aiMeta.narrativeTimeMs / 1000).toFixed(1)}s` : " —"} |
                {round.aiMeta.narrativeTokens ? ` ${round.aiMeta.narrativeTokens.toLocaleString()} tokens` : " —"}
              </div>
            </div>
          )}

          {/* Event log */}
          <div>
            <span className="text-text-light font-semibold block mb-1">Event Log (latest)</span>
            <div className="max-h-40 overflow-y-auto">
              {(events ?? []).slice(0, 15).map((evt, i) => (
                <div key={i} className="text-navy-muted py-0.5 border-b border-navy-light/30 last:border-0">
                  <span className="text-text-light">{new Date(evt.timestamp).toLocaleTimeString()}</span>{" "}
                  <span className={
                    evt.type.includes("fail") ? "text-viz-danger" :
                    evt.type.includes("connect") ? "text-viz-safety" :
                    "text-viz-capability"
                  }>{evt.type}</span>
                  {evt.roleId && <span> [{evt.roleId}]</span>}
                  {evt.data && <span className="text-navy-muted"> {evt.data.substring(0, 60)}</span>}
                </div>
              ))}
              {(!events || events.length === 0) && (
                <div className="text-navy-muted">No events yet</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
