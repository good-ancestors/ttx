"use client";

import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthMutation } from "@/lib/hooks";
import { Pencil, Save, AlertTriangle } from "lucide-react";

type DomainKey = "labs" | "geopolitics" | "publicAndMedia" | "aiSystems";

type Summary = {
  labs?: string[];
  geopolitics?: string[];
  publicAndMedia?: string[];
  aiSystems?: string[];
  facilitatorNotes?: string;
  // Transitional 3-field shape from prior prompt version — still present on
  // older round docs. Seeded into the four-domain editor for continuity.
  outcomes?: string;
  stateOfPlay?: string;
  pressures?: string;
};

const SECTION_ORDER: { key: DomainKey; label: string; hint: string; rows: number }[] = [
  { key: "labs",           label: "Labs",             hint: "Lab-level outcomes: mergers, transfers, safety moves, revenue shocks.", rows: 4 },
  { key: "geopolitics",    label: "Geopolitics",      hint: "Government actions, diplomacy, regulation, intel ops, alliances.",      rows: 4 },
  { key: "publicAndMedia", label: "Public & Media",   hint: "Press framing, public sentiment, NGO / protest / civil-society.",       rows: 3 },
  { key: "aiSystems",      label: "AI Systems",       hint: "Observable AI behaviour: evals, incidents, pauses, demonstrations.",    rows: 3 },
];

/** Seed one textarea per domain as a newline-separated bullet list. If the
 *  round only has legacy 3-field data, dump the old fields into labs so edits
 *  have a starting point rather than a blank slate. */
function seedFromSummary(summary: Summary | undefined): Record<DomainKey, string> {
  if (!summary) return { labs: "", geopolitics: "", publicAndMedia: "", aiSystems: "" };
  const hasFourDomain = SECTION_ORDER.some(({ key }) => (summary[key] ?? []).length > 0);
  if (hasFourDomain) {
    return {
      labs: (summary.labs ?? []).join("\n"),
      geopolitics: (summary.geopolitics ?? []).join("\n"),
      publicAndMedia: (summary.publicAndMedia ?? []).join("\n"),
      aiSystems: (summary.aiSystems ?? []).join("\n"),
    };
  }
  // Legacy 3-field prose — dump everything into labs for manual re-bucketing.
  const merged = [summary.outcomes, summary.stateOfPlay, summary.pressures]
    .filter(Boolean)
    .join("\n");
  return { labs: merged, geopolitics: "", publicAndMedia: "", aiSystems: "" };
}

/** Textarea value (newline-separated) → array of non-empty bullet strings. */
function bullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s+/, "").trim()).filter(Boolean);
}

// Manual narrative editor — facilitator types one bullet per line for each of
// the four domain buckets. Bullets are normalised at save time.
export function NarrativeEditor({
  gameId,
  roundNumber,
  currentSummary,
  startOpen = false,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  currentSummary?: Summary;
  startOpen?: boolean;
}) {
  const applySummary = useAuthMutation(api.rounds.applySummary);
  const [editing, setEditing] = useState(startOpen);
  const seed = seedFromSummary(currentSummary);
  const [values, setValues] = useState<Record<DomainKey, string>>(seed);

  // Sync when summary updates reactively (e.g. AI regenerates after editor was opened)
  const snapshotKey = SECTION_ORDER.map(({ key }) => seed[key]).join("||");
  const [lastSynced, setLastSynced] = useState(snapshotKey);
  if (snapshotKey !== lastSynced) {
    setValues(seed);
    setLastSynced(snapshotKey);
  }

  const setField = (key: DomainKey, next: string) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const handleSave = async () => {
    await applySummary({
      gameId,
      roundNumber,
      summary: {
        labs: bullets(values.labs),
        geopolitics: bullets(values.geopolitics),
        publicAndMedia: bullets(values.publicAndMedia),
        aiSystems: bullets(values.aiSystems),
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

      <p className="text-[11px] text-text-muted mb-3">
        One bullet per line in each section. Leave a section empty if nothing fits.
      </p>
      <div className="space-y-3">
        {SECTION_ORDER.map(({ key, label, hint, rows }) => (
          <div key={key}>
            <label className="text-[11px] text-text-light block mb-1">
              {label}{" "}
              <span className="text-text-muted">— {hint}</span>
            </label>
            <textarea
              value={values[key]}
              onChange={(e) => setField(key, e.target.value)}
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

