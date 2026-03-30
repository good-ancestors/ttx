"use client";

import { useState } from "react";
import { isLabCeo, hasCompute, type Role } from "@/lib/game-data";
import { Info, ChevronUp, ChevronDown, Cpu, MessageCircle, Send, Dices, BookOpen } from "lucide-react";

export function HowToPlaySection({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        How to Play
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm text-text-muted">
          {/* Goal */}
          <p className="text-text font-medium">
            Your objective is not to win, but to explore a plausible future. Simulate your role as
            best you can — what would your character really do?
          </p>

          {/* Phase flow */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-text uppercase tracking-wider">Each Round</p>
            <div className="grid gap-1.5">
              <div className="flex items-start gap-2">
                <MessageCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" />
                <p className="text-xs"><span className="font-bold text-text">Discuss</span> — Talk to other players. Form alliances, negotiate deals, gather intelligence. Get up and move around the room.</p>
              </div>
              <div className="flex items-start gap-2">
                <Send className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" />
                <p className="text-xs"><span className="font-bold text-text">Submit</span> — Write 1–5 actions using the form. Describe what you do and what you intend to achieve.</p>
              </div>
              <div className="flex items-start gap-2">
                <Dices className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" />
                <p className="text-xs"><span className="font-bold text-text">Resolve</span> — Each action{"'"}s probability is evaluated, then dice decide what succeeds. Results shape the world.</p>
              </div>
              <div className="flex items-start gap-2">
                <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" />
                <p className="text-xs"><span className="font-bold text-text">Narrate</span> — A narrative of what happened is generated. The world state updates and the next round begins.</p>
              </div>
            </div>
          </div>

          {/* Writing actions */}
          <div className="bg-warm-gray rounded-lg p-3 space-y-1.5 text-xs">
            <p className="font-bold text-text text-sm mb-1">Writing Actions</p>
            <p>Format: <span className="italic">&ldquo;I do [action] so that [outcome if successful]&rdquo;</span></p>
            <p><span className="font-bold text-text">Priority:</span> Order matters. Action #1 gets the most priority, #2 less, and so on.</p>
            <p><span className="font-bold text-text">Secret:</span> Toggle the secret switch to hide an action from other players on the projected screen. It is still resolved normally.</p>
            <p><span className="font-bold text-text">Support:</span> Request endorsement from other players — accepted support boosts your probability, declined support hurts it.</p>
          </div>
        </div>
      )}

      {isLabCeo(role) && (
        <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3 flex items-start gap-2">
          <Cpu className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-[#0284C7]">Compute Tip</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              As a lab CEO, you control a 3-way compute allocation: Users/Commercial,
              R&D/Capabilities, and Safety/Alignment. This shapes your lab&apos;s progress.
            </p>
          </div>
        </div>
      )}

      {hasCompute(role) && !isLabCeo(role) && (
        <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3 flex items-start gap-2">
          <Cpu className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-[#0284C7]">Compute Tip</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You have compute resources you can loan to labs. This gives you leverage
              and influences their capability trajectory.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
