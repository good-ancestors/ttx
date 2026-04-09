"use client";

import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthMutation } from "@/lib/hooks";
import { Pencil, Save, AlertTriangle } from "lucide-react";
import { CopilotChat } from "@/components/copilot-chat";
import type { Snapshot } from "@/components/copilot-chat";

// Manual narrative editor — facilitator can type/edit narrative
export function NarrativeEditor({
  gameId,
  roundNumber,
  currentSummary,
  startOpen = false,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  currentSummary?: {
    narrative?: string;
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
    headlines: string[];
  };
  startOpen?: boolean;
}) {
  const applySummary = useAuthMutation(api.rounds.applySummary);
  const [editing, setEditing] = useState(startOpen);
  // Derive current narrative from summary, updating when summary changes reactively
  const existingNarrative = currentSummary?.narrative
    ?? (currentSummary ? [...currentSummary.geopoliticalEvents, ...currentSummary.aiStateOfPlay].join("\n") : "");
  const [narrative, setNarrative] = useState(existingNarrative);
  // Sync state when summary updates (e.g., AI generates narrative after editor was opened)
  const [lastSynced, setLastSynced] = useState(existingNarrative);
  if (existingNarrative !== lastSynced) {
    setNarrative(existingNarrative);
    setLastSynced(existingNarrative);
  }

  const handleSave = async () => {
    await applySummary({
      gameId,
      roundNumber,
      summary: {
        narrative: narrative || undefined,
        geopoliticalEvents: [],
        aiStateOfPlay: [],
        headlines: [],
      },
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[11px] text-text-light hover:text-white flex items-center gap-1 mt-2 transition-colors"
      >
        <Pencil className="w-3 h-3" /> {currentSummary ? "Edit narrative" : "Write narrative manually"}
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 bg-navy rounded-xl border border-navy-light">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-viz-warning" />
          <span className="text-xs font-semibold text-viz-warning uppercase tracking-wider">
            Manual Narrative
          </span>
        </div>
        <button
          onClick={handleSave}
          className="text-xs text-viz-safety hover:text-white flex items-center gap-1 font-bold"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>

      <label className="text-[11px] text-text-light block mb-1">Narrative (the story read aloud)</label>
      <textarea
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        rows={8}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-sm text-white resize-none outline-none"
        placeholder="Enter the narrative for this round..."
      />
    </div>
  );
}

/** Persistent copilot — always visible during gameplay */
export function FacilitatorCopilot({
  gameId,
  currentLabs,
}: {
  gameId: Id<"games">;
  currentLabs: Snapshot["labs"];
}) {
  return (
    <CopilotChat gameId={gameId} currentLabs={currentLabs} variant="bar" />
  );
}
