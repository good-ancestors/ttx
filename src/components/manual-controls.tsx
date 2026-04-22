"use client";

import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthMutation } from "@/lib/hooks";
import { Pencil, Save, AlertTriangle } from "lucide-react";

type ProseSummary = {
  outcomes?: string;
  stateOfPlay?: string;
  pressures?: string;
  // Legacy 4-domain fields accepted for backward compat; the editor writes prose
  // fields only, but preserves legacy data on round documents that have it.
  labs?: string[];
  geopolitics?: string[];
  publicAndMedia?: string[];
  aiSystems?: string[];
};

const SECTION_ORDER: { key: "outcomes" | "stateOfPlay" | "pressures"; label: string; hint: string; rows: number }[] = [
  { key: "outcomes", label: "Outcomes", hint: "2-3 sentences: what the successful actions produced, meaning-level.", rows: 4 },
  { key: "stateOfPlay", label: "State of Play", hint: "1-2 sentences: where key players sit now, in relative terms.", rows: 3 },
  { key: "pressures", label: "Pressures", hint: "1-2 sentences: what's set up, contested, or at stake next round.", rows: 3 },
];

/** Seed the prose editor when the round only has legacy 4-domain data. Joins the
 *  bullet arrays into starting text the facilitator can edit down to the new shape. */
function seedFromLegacy(summary: ProseSummary | undefined): { outcomes: string; stateOfPlay: string; pressures: string } {
  if (!summary) return { outcomes: "", stateOfPlay: "", pressures: "" };
  if (summary.outcomes || summary.stateOfPlay || summary.pressures) {
    return {
      outcomes: summary.outcomes ?? "",
      stateOfPlay: summary.stateOfPlay ?? "",
      pressures: summary.pressures ?? "",
    };
  }
  // Legacy-only round: best-effort seeding so edits have a starting point.
  const labs = (summary.labs ?? []).join(" ");
  const geo = (summary.geopolitics ?? []).join(" ");
  const media = (summary.publicAndMedia ?? []).join(" ");
  const ai = (summary.aiSystems ?? []).join(" ");
  return {
    outcomes: [labs, geo].filter(Boolean).join(" ").trim(),
    stateOfPlay: media.trim(),
    pressures: ai.trim(),
  };
}

// Manual narrative editor — facilitator types the situation-briefing shape.
export function NarrativeEditor({
  gameId,
  roundNumber,
  currentSummary,
  startOpen = false,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  currentSummary?: ProseSummary;
  startOpen?: boolean;
}) {
  const applySummary = useAuthMutation(api.rounds.applySummary);
  const [editing, setEditing] = useState(startOpen);
  const seed = seedFromLegacy(currentSummary);
  const [outcomes, setOutcomes] = useState(seed.outcomes);
  const [stateOfPlay, setStateOfPlay] = useState(seed.stateOfPlay);
  const [pressures, setPressures] = useState(seed.pressures);

  // Sync when summary updates reactively (e.g. AI regenerates after editor was opened)
  const snapshotKey = `${seed.outcomes}|${seed.stateOfPlay}|${seed.pressures}`;
  const [lastSynced, setLastSynced] = useState(snapshotKey);
  if (snapshotKey !== lastSynced) {
    setOutcomes(seed.outcomes);
    setStateOfPlay(seed.stateOfPlay);
    setPressures(seed.pressures);
    setLastSynced(snapshotKey);
  }

  const values: Record<"outcomes" | "stateOfPlay" | "pressures", string> = {
    outcomes, stateOfPlay, pressures,
  };
  const setters: Record<"outcomes" | "stateOfPlay" | "pressures", (v: string) => void> = {
    outcomes: setOutcomes, stateOfPlay: setStateOfPlay, pressures: setPressures,
  };

  const handleSave = async () => {
    await applySummary({
      gameId,
      roundNumber,
      summary: {
        outcomes: outcomes.trim() || undefined,
        stateOfPlay: stateOfPlay.trim() || undefined,
        pressures: pressures.trim() || undefined,
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
        <Pencil className="w-3 h-3" /> {currentSummary ? "Edit summary" : "Write summary manually"}
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 bg-navy rounded-xl border border-navy-light">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-viz-warning" />
          <span className="text-xs font-semibold text-viz-warning uppercase tracking-wider">
            Manual Summary
          </span>
        </div>
        <button
          onClick={handleSave}
          className="text-xs text-viz-safety hover:text-white flex items-center gap-1 font-bold"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>

      <div className="space-y-3">
        {SECTION_ORDER.map(({ key, label, hint, rows }) => (
          <div key={key}>
            <label className="text-[11px] text-text-light block mb-1">
              {label}{" "}
              <span className="text-text-muted">— {hint}</span>
            </label>
            <textarea
              value={values[key]}
              onChange={(e) => setters[key](e.target.value)}
              rows={rows}
              className="w-full p-2 bg-navy-dark border border-navy-light rounded text-sm text-white resize-none outline-none"
              placeholder={hint}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

