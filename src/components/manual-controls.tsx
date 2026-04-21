"use client";

import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthMutation } from "@/lib/hooks";
import { Pencil, Save, AlertTriangle } from "lucide-react";
import { CopilotChat } from "@/components/copilot-chat";
import type { Snapshot } from "@/components/copilot-chat";

type SectionedSummary = {
  labs: string[];
  geopolitics: string[];
  publicAndMedia: string[];
  aiSystems: string[];
};

const SECTION_ORDER: { key: keyof SectionedSummary; label: string; hint: string }[] = [
  { key: "labs", label: "Labs", hint: "Lab outcomes, mergers, failed deals — one line each." },
  { key: "geopolitics", label: "Geopolitics", hint: "Government, diplomatic, regulatory moves." },
  { key: "publicAndMedia", label: "Public & Media", hint: "Press framing, sentiment, NGO positions." },
  { key: "aiSystems", label: "AI Systems", hint: "Observable AI behaviour only — not alignment secrets." },
];

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinLines(lines: string[] | undefined): string {
  return (lines ?? []).join("\n");
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
  currentSummary?: SectionedSummary;
  startOpen?: boolean;
}) {
  const applySummary = useAuthMutation(api.rounds.applySummary);
  const [editing, setEditing] = useState(startOpen);
  const [labs, setLabs] = useState(joinLines(currentSummary?.labs));
  const [geopolitics, setGeopolitics] = useState(joinLines(currentSummary?.geopolitics));
  const [publicAndMedia, setPublicAndMedia] = useState(joinLines(currentSummary?.publicAndMedia));
  const [aiSystems, setAiSystems] = useState(joinLines(currentSummary?.aiSystems));

  // Sync when summary updates reactively (e.g. AI regenerates after editor was opened)
  const snapshotKey = `${joinLines(currentSummary?.labs)}|${joinLines(currentSummary?.geopolitics)}|${joinLines(currentSummary?.publicAndMedia)}|${joinLines(currentSummary?.aiSystems)}`;
  const [lastSynced, setLastSynced] = useState(snapshotKey);
  if (snapshotKey !== lastSynced) {
    setLabs(joinLines(currentSummary?.labs));
    setGeopolitics(joinLines(currentSummary?.geopolitics));
    setPublicAndMedia(joinLines(currentSummary?.publicAndMedia));
    setAiSystems(joinLines(currentSummary?.aiSystems));
    setLastSynced(snapshotKey);
  }

  const values: Record<keyof SectionedSummary, string> = {
    labs, geopolitics, publicAndMedia, aiSystems,
  };
  const setters: Record<keyof SectionedSummary, (v: string) => void> = {
    labs: setLabs, geopolitics: setGeopolitics, publicAndMedia: setPublicAndMedia, aiSystems: setAiSystems,
  };

  const handleSave = async () => {
    await applySummary({
      gameId,
      roundNumber,
      summary: {
        labs: splitLines(labs),
        geopolitics: splitLines(geopolitics),
        publicAndMedia: splitLines(publicAndMedia),
        aiSystems: splitLines(aiSystems),
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
        {SECTION_ORDER.map(({ key, label, hint }) => (
          <div key={key}>
            <label className="text-[11px] text-text-light block mb-1">
              {label}{" "}
              <span className="text-text-muted">— {hint}</span>
            </label>
            <textarea
              value={values[key]}
              onChange={(e) => setters[key](e.target.value)}
              rows={3}
              className="w-full p-2 bg-navy-dark border border-navy-light rounded text-sm text-white resize-none outline-none"
              placeholder="One sentence per line"
            />
          </div>
        ))}
      </div>
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
