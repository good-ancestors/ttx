"use client";

import { useEffect, useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp, EyeOff } from "lucide-react";
import { hasCompute, isLabCeo, type Role } from "@/lib/game-data";
import {
  loadSampleActions,
  getSampleActions,
  pickRandom,
  type SampleAction,
} from "@/lib/sample-actions";

interface Props {
  role: Role;
  roundNumber: number;
}

// Read-only brainstorming aid for observers. They don't compose actions
// themselves — they suggest verbally to the driver — so this surfaces the
// "what can this role do" menu and a few sample actions for the round.
export function ObserverActionGuide({ role, roundNumber }: Props) {
  const [open, setOpen] = useState(true);
  const [suggestions, setSuggestions] = useState<SampleAction[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadSampleActions()
      .then((data) => {
        if (cancelled) return;
        const all = getSampleActions(data, role.id, roundNumber);
        if (all.length === 0) return;
        setSuggestions(pickRandom(all, 3));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role.id, roundNumber]);

  const isCeo = isLabCeo(role);
  const canSendCompute = hasCompute(role);

  return (
    <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Lightbulb className="w-4 h-4 text-[#2563EB] shrink-0" />
        <span className="text-sm font-semibold text-[#1D4ED8]">
          Help the driver brainstorm
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#2563EB] ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#2563EB] ml-auto" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div>
            <p className="text-[11px] text-[#3B82F6] font-semibold uppercase tracking-wider mb-1.5">
              What this role can do
            </p>
            <ul className="text-xs text-text space-y-1 leading-snug">
              <li>
                Submit up to <strong>5 actions per round</strong>;
                first-submitted gets highest priority.
              </li>
              <li>
                Mark any action <strong>secret</strong> &mdash; opponents see only &ldquo;[Covert action]&rdquo;.
              </li>
              <li>
                Request <strong>endorsements</strong> from other roles to boost (or sabotage) dice rolls.
              </li>
              {canSendCompute && (
                <li>
                  Send or request <strong>compute</strong> from other compute-holders.
                </li>
              )}
              {isCeo && (
                <li>
                  <strong>Found a new lab</strong> (min 10u seed) or <strong>merge</strong> with another lab.
                </li>
              )}
            </ul>
            <p className="text-[11px] text-[#3B82F6] mt-2">
              Talk it through with the driver &mdash; only they can submit, edit, or respond.
            </p>
          </div>

          {suggestions.length > 0 && (
            <div>
              <p className="text-[11px] text-[#3B82F6] font-semibold uppercase tracking-wider mb-1.5">
                Action ideas for {role.name}
              </p>
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div
                    key={`obs-suggestion-${i}`}
                    className="bg-white rounded-lg p-3 border border-[#DBEAFE]"
                  >
                    <p className="text-sm text-text leading-snug">{s.text}</p>
                    {s.secret && (
                      <span className="text-[10px] text-viz-warning font-medium flex items-center gap-0.5 mt-1.5">
                        <EyeOff className="w-3 h-3" /> Secret
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
