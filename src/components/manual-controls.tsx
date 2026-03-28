"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { WORLD_STATE_INDICATORS } from "@/lib/game-data";
import { Pencil, Save, Minus, Plus, AlertTriangle } from "lucide-react";
import { CopilotChat } from "@/components/copilot-chat";
import type { Snapshot } from "@/components/copilot-chat";

// Manual world state editor — facilitator can tweak dials directly
export function WorldStateEditor({
  gameId,
  worldState,
  startOpen = false,
}: {
  gameId: Id<"games">;
  worldState: Record<string, number>;
  startOpen?: boolean;
}) {
  const updateWorldState = useMutation(api.games.updateWorldState);
  const [editing, setEditing] = useState(startOpen);
  const [local, setLocal] = useState(worldState);

  const handleSave = async () => {
    await updateWorldState({
      gameId,
      worldState: local as {
        capability: number;
        alignment: number;
        tension: number;
        awareness: number;
        regulation: number;
        australia: number;
      },
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setLocal({ ...worldState });
          setEditing(true);
        }}
        className="text-[11px] text-text-light hover:text-white flex items-center gap-1 mt-2 transition-colors"
      >
        <Pencil className="w-3 h-3" /> Edit dials
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-navy rounded-lg border border-navy-light">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-viz-warning uppercase tracking-wider">
          Manual Override
        </span>
        <button
          onClick={handleSave}
          className="text-xs text-viz-safety hover:text-white flex items-center gap-1 font-bold"
        >
          <Save className="w-3 h-3" /> Save
        </button>
      </div>
      {WORLD_STATE_INDICATORS.map((ind) => (
        <div key={ind.key} className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-text-light flex-1">{ind.label}</span>
          <button
            onClick={() =>
              setLocal((prev) => ({ ...prev, [ind.key]: Math.max(0, (prev[ind.key] ?? 0) - 1) }))
            }
            className="w-6 h-6 rounded bg-navy-light flex items-center justify-center text-text-light hover:text-white"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-xs font-mono text-white w-6 text-center">
            {local[ind.key]}
          </span>
          <button
            onClick={() =>
              setLocal((prev) => ({ ...prev, [ind.key]: Math.min(10, (prev[ind.key] ?? 0) + 1) }))
            }
            className="w-6 h-6 rounded bg-navy-light flex items-center justify-center text-text-light hover:text-white"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

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
  const applySummary = useMutation(api.rounds.applySummary);
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

// ─── Facilitator AI Copilot ─────────────────────────────────────────────────
// Thin wrappers around CopilotChat for modal and bar variants.

/** Modal version — for use inside edit modals */
export function FacilitatorAdjust({
  gameId,
  currentWorldState,
  currentLabs,
}: {
  gameId: Id<"games">;
  currentWorldState: Snapshot["worldState"];
  currentLabs: Snapshot["labs"];
}) {
  return (
    <CopilotChat gameId={gameId} currentWorldState={currentWorldState} currentLabs={currentLabs} variant="modal" />
  );
}

/** Persistent copilot — always visible during gameplay */
export function FacilitatorCopilot({
  gameId,
  currentWorldState,
  currentLabs,
}: {
  gameId: Id<"games">;
  currentWorldState: Snapshot["worldState"];
  currentLabs: Snapshot["labs"];
}) {
  return (
    <CopilotChat gameId={gameId} currentWorldState={currentWorldState} currentLabs={currentLabs} variant="bar" />
  );
}
