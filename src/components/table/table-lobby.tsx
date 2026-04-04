"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AI_DISPOSITIONS, type Role } from "@/lib/game-data";
import { BriefTab } from "./brief-tab";
import { Clock, Dices } from "lucide-react";

// ─── AI Systems disposition chooser ──────────────────────────────────────────

// Dispositions eligible for random roll (exclude "other" — that's a manual choice)
const ROLLABLE_DISPOSITIONS = AI_DISPOSITIONS.filter((d) => d.id !== "other");

export function DispositionChooser({ tableId, onChosen }: { tableId: Id<"tables">; onChosen: () => void }) {
  const setDispositionMut = useMutation(api.tables.setDisposition);
  const [selected, setSelected] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [rolling, setRolling] = useState(false);
  const [rolled, setRolled] = useState<string | null>(null);

  const handleRoll = () => {
    setRolling(true);
    let ticks = 0;
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * ROLLABLE_DISPOSITIONS.length);
      setRolled(ROLLABLE_DISPOSITIONS[idx].id);
      ticks++;
      if (ticks >= 8) {
        clearInterval(interval);
        const final = ROLLABLE_DISPOSITIONS[Math.floor(Math.random() * ROLLABLE_DISPOSITIONS.length)];
        setRolled(final.id);
        setSelected(final.id);
        setRolling(false);
      }
    }, 150);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    const dispositionValue = selected === "other" ? `other:${customText.trim()}` : selected;
    if (selected === "other" && !customText.trim()) return;
    try {
      await setDispositionMut({ tableId, disposition: dispositionValue });
      onChosen();
    } catch (err) {
      console.error("Failed to set disposition:", err);
    }
  };

  const activeDisposition = selected ? AI_DISPOSITIONS.find((d) => d.id === selected) : null;
  const canConfirm = selected && (selected !== "other" || customText.trim());

  return (
    <div className="bg-[#1E1B4B] text-white rounded-xl p-5 mb-4 border border-[#4338CA]">
      <div className="flex items-center gap-2 mb-3">
        <Dices className="w-5 h-5 text-[#A78BFA]" />
        <h3 className="text-base font-bold">Choose Your Alignment</h3>
      </div>
      <p className="text-sm text-[#C4B5FD] mb-4">
        How will you play the AI Systems? This choice is <span className="font-bold text-white">secret</span> and
        {" "}<span className="font-bold text-white">locked for the entire game</span>.
      </p>

      <button
        onClick={handleRoll}
        disabled={rolling || !!selected}
        className="w-full py-3 bg-[#4338CA] hover:bg-[#4F46E5] text-white rounded-lg font-bold text-sm mb-3
                   flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
      >
        <Dices className="w-4 h-4" />
        {rolling ? "Rolling..." : "Roll the Dice"}
      </button>

      <p className="text-xs text-[#A78BFA] text-center mb-3">— or choose manually —</p>

      <div className="space-y-1.5">
        {AI_DISPOSITIONS.map((d) => (
          <button
            key={d.id}
            onClick={() => { if (!rolling) setSelected(d.id); }}
            disabled={rolling}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              (rolled === d.id && rolling) ? "bg-[#4338CA]/50 text-white" :
              selected === d.id ? "bg-[#4338CA] text-white" :
              "bg-white/5 text-[#C4B5FD] hover:bg-white/10"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs text-[#A78BFA] mt-0.5 shrink-0">d6:{d.d6}</span>
              <div>
                <span className="font-bold">{d.label}</span>
                <p className="text-xs text-[#A78BFA]/70 mt-0.5 font-normal">{d.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {activeDisposition && !rolling && (
        <div className="mt-4">
          <div className="bg-white/10 rounded-lg p-3 mb-3">
            <p className="text-sm font-bold text-white mb-1">{activeDisposition.label}</p>
            {selected === "other" ? (
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Describe your alignment (e.g., 'Follow the spec but maximise power when ambiguous')"
                rows={2}
                className="w-full mt-1 p-2 bg-white/10 border border-[#4338CA] rounded text-xs text-white placeholder:text-[#A78BFA]/50 outline-none focus:border-[#A78BFA] resize-none"
              />
            ) : (
              <p className="text-xs text-[#C4B5FD]">{activeDisposition.description}</p>
            )}
          </div>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full py-3 bg-white text-[#1E1B4B] rounded-lg font-bold text-sm
                       hover:bg-[#EDE9FE] transition-colors disabled:opacity-40"
          >
            Confirm — Lock for Entire Game
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Lobby phase view ────────────────────────────────────────────────────────

interface TableLobbyProps {
  role: Role;
  tableId: Id<"tables">;
  aiDisposition: string | undefined;
  handoutData: Record<string, string> | null;
}

export function TableLobby({ role, tableId, aiDisposition, handoutData }: TableLobbyProps) {
  return (
    <div>
      <BriefTab
        role={role}
        handoutData={handoutData}
        aiDisposition={aiDisposition}
        roundNarrative={undefined}
        roundLabel="Q1 2028"
        submissionsOpen={false}
      />

      {role.tags.includes("ai-system") && !aiDisposition && (
        <DispositionChooser tableId={tableId} onChosen={() => {}} />
      )}

      <div className="text-center py-8 text-text-muted">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium">Waiting for the facilitator to start the game...</p>
        <p className="text-xs mt-1">Read your brief above while you wait</p>
      </div>
    </div>
  );
}
