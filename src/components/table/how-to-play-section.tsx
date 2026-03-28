"use client";

import { useState } from "react";
import { isLabCeo, hasCompute, type Role } from "@/lib/game-data";
import { Info, ChevronUp, ChevronDown, Cpu } from "lucide-react";

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
        <div className="mt-2 space-y-2 text-sm text-text-muted">
          <ul className="space-y-1.5 pl-5 list-disc">
            <li>Describe 1-5 actions: <span className="italic">&ldquo;I do [action] so that [outcome if successful]&rdquo;</span></li>
            <li>AI grades probability of success, then dice decide outcomes</li>
          </ul>
          <div className="bg-warm-gray rounded-lg p-3 space-y-1.5 text-xs">
            <p><span className="font-bold text-text">Priority:</span> Order matters. Action #1 gets the most priority, #2 less, and so on. Priority is assigned automatically.</p>
            <p><span className="font-bold text-text">Secret:</span> Mark an action secret to hide it from other players on the projected screen</p>
            <p><span className="font-bold text-text">Support:</span> Request endorsement from other players — accepted support boosts probability, declined hurts it</p>
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
