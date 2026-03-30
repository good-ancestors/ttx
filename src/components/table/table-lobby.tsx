"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AI_DISPOSITIONS, getDisposition, type Role } from "@/lib/game-data";
import { HowToPlaySection } from "./how-to-play-section";
import { Target, Clock, EyeOff, Dices } from "lucide-react";

// ─── AI Systems disposition chooser ──────────────────────────────────────────

export function DispositionChooser({ tableId, onChosen }: { tableId: Id<"tables">; onChosen: () => void }) {
  const setDispositionMut = useMutation(api.tables.setDisposition);
  const [selected, setSelected] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rolled, setRolled] = useState<string | null>(null);

  const handleRoll = () => {
    setRolling(true);
    let ticks = 0;
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * AI_DISPOSITIONS.length);
      setRolled(AI_DISPOSITIONS[idx].id);
      ticks++;
      if (ticks >= 8) {
        clearInterval(interval);
        const final = AI_DISPOSITIONS[Math.floor(Math.random() * AI_DISPOSITIONS.length)];
        setRolled(final.id);
        setSelected(final.id);
        setRolling(false);
      }
    }, 150);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      await setDispositionMut({ tableId, disposition: selected });
      onChosen();
    } catch (err) {
      console.error("Failed to set disposition:", err);
    }
  };

  const activeDisposition = selected ? AI_DISPOSITIONS.find((d) => d.id === selected) : null;

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
            <p className="text-xs text-[#C4B5FD]">{activeDisposition.description}</p>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-white text-[#1E1B4B] rounded-lg font-bold text-sm
                       hover:bg-[#EDE9FE] transition-colors"
          >
            Confirm — Lock for Entire Game
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Lobby phase view ────────────────────────────────────────────────────────

export interface TableLobbyProps {
  role: Role;
  tableId: Id<"tables">;
  aiDisposition: string | undefined;
  handoutData: Record<string, string> | null;
}

export function TableLobby({ role, tableId, aiDisposition, handoutData }: TableLobbyProps) {
  return (
    <div>
      <div className="bg-white rounded-xl p-5 border border-border mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-text" />
          <h3 className="text-base font-bold text-text">Your Role</h3>
        </div>
        <p className="text-sm font-semibold text-text mb-1">{role.name}</p>
        <p className="text-[14px] text-text leading-relaxed mb-1">{role.brief}</p>
        {handoutData?.[role.id] && (
          <details className="mt-3">
            <summary className="text-xs font-semibold text-text-muted cursor-pointer hover:text-text">
              Full Brief
            </summary>
            <div className="mt-2 text-xs text-text-muted whitespace-pre-line leading-relaxed">
              {handoutData[role.id]}
            </div>
          </details>
        )}
        <HowToPlaySection role={role} />
      </div>

      {role.tags.includes("ai-system") && !aiDisposition && (
        <DispositionChooser tableId={tableId} onChosen={() => {}} />
      )}

      {role.tags.includes("ai-system") && aiDisposition && (() => {
        const disp = getDisposition(aiDisposition);
        return (
          <div className="bg-[#1E1B4B] rounded-xl p-4 mb-4 border border-[#4338CA]">
            <div className="flex items-center gap-2 mb-2">
              <EyeOff className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span className="text-sm font-bold text-white">{disp?.label}</span>
              <span className="text-[10px] text-[#A78BFA] ml-auto">Secret — locked for game</span>
            </div>
            {disp?.description && (
              <p className="text-xs text-[#C4B5FD] leading-relaxed">{disp.description}</p>
            )}
          </div>
        );
      })()}

      <div className="text-center py-8 text-text-muted">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium">Waiting for the facilitator to start the game...</p>
        <p className="text-xs mt-1">Read your brief above while you wait</p>
      </div>
    </div>
  );
}
