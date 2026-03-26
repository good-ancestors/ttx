"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { WORLD_STATE_INDICATORS } from "@/lib/game-data";
import { Pencil, Save, Minus, Plus, AlertTriangle, Wand2, Loader2 } from "lucide-react";

// Manual world state editor — facilitator can tweak dials directly
export function WorldStateEditor({
  gameId,
  worldState,
}: {
  gameId: Id<"games">;
  worldState: Record<string, number>;
}) {
  const updateWorldState = useMutation(api.games.updateWorldState);
  const [editing, setEditing] = useState(false);
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
}: {
  gameId: Id<"games">;
  roundNumber: number;
  currentSummary?: {
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
    headlines: string[];
    facilitatorNotes?: string;
  };
}) {
  const applySummary = useMutation(api.rounds.applySummary);
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState(currentSummary?.geopoliticalEvents.join("\n") ?? "");
  const [aiState, setAiState] = useState(currentSummary?.aiStateOfPlay.join("\n") ?? "");
  const [headlines, setHeadlines] = useState(currentSummary?.headlines.join("\n") ?? "");
  const [notes, setNotes] = useState(currentSummary?.facilitatorNotes ?? "");

  const handleSave = async () => {
    await applySummary({
      gameId,
      roundNumber,
      summary: {
        geopoliticalEvents: events.split("\n").filter((s) => s.trim()),
        aiStateOfPlay: aiState.split("\n").filter((s) => s.trim()),
        headlines: headlines.split("\n").filter((s) => s.trim()),
        facilitatorNotes: notes || undefined,
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

      <label className="text-[11px] text-text-light block mb-1">Geopolitical Events (one per line)</label>
      <textarea
        value={events}
        onChange={(e) => setEvents(e.target.value)}
        rows={4}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-[13px] text-white resize-none outline-none mb-3"
      />

      <label className="text-[11px] text-text-light block mb-1">AI State of Play (one per line)</label>
      <textarea
        value={aiState}
        onChange={(e) => setAiState(e.target.value)}
        rows={3}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-[13px] text-white resize-none outline-none mb-3"
      />

      <label className="text-[11px] text-text-light block mb-1">Headlines (one per line)</label>
      <textarea
        value={headlines}
        onChange={(e) => setHeadlines(e.target.value)}
        rows={3}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-[13px] text-white resize-none outline-none mb-3"
      />

      <label className="text-[11px] text-text-light block mb-1">Facilitator Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-[13px] text-white resize-none outline-none"
      />
    </div>
  );
}

// AI-powered facilitator adjustment — type natural language instructions
export function FacilitatorAdjust({
  gameId,
}: {
  gameId: Id<"games">;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/facilitator-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, instruction: instruction.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setResult(data.explanation);
        setInstruction("");
      } else {
        setError(data.error ?? "Adjustment failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-text-light hover:text-white flex items-center gap-1 mt-2 transition-colors"
      >
        <Wand2 className="w-3 h-3" /> AI adjustment
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 bg-navy rounded-xl border border-navy-light">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-viz-capability" />
          <span className="text-xs font-semibold text-viz-capability uppercase tracking-wider">
            AI Adjustment
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-text-light hover:text-white"
        >
          Close
        </button>
      </div>

      <p className="text-[11px] text-text-light mb-2">
        Describe changes in plain English. The AI will update world state and lab values.
      </p>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder='e.g. "Reduce OpenBrain compute by 30% due to the bombing. Increase US-China tension to 8. DeepCent should be close behind OpenBrain now."'
        rows={3}
        disabled={loading}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-[13px] text-white resize-none outline-none mb-2 placeholder:text-navy-muted disabled:opacity-50"
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !instruction.trim()}
        className="w-full py-2 bg-viz-capability text-navy rounded font-bold text-xs
                   disabled:opacity-30 flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Adjusting...
          </>
        ) : (
          <>
            <Wand2 className="w-3.5 h-3.5" /> Apply Adjustment
          </>
        )}
      </button>

      {result && (
        <div className="mt-2 p-2 bg-navy-dark rounded border border-viz-safety/30 text-[11px] text-viz-safety">
          {result}
        </div>
      )}

      {error && (
        <div className="mt-2 p-2 bg-navy-dark rounded border border-viz-danger/30 text-[11px] text-viz-danger">
          {error}
        </div>
      )}
    </div>
  );
}
