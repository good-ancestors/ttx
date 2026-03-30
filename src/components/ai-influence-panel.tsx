"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, getDisposition } from "@/lib/game-data";
import { ThumbsUp, ThumbsDown, Loader2, Zap } from "lucide-react";

type InfluenceChoice = "boost" | "sabotage" | null;

interface AiInfluencePanelProps {
  gameId: Id<"games">;
  roundNumber: number;
  disposition: string;
  influencePower: number;
  ownRoleId: string;
}

export function AiInfluencePanel({
  gameId,
  roundNumber,
  disposition,
  influencePower,
  ownRoleId,
}: AiInfluencePanelProps) {
  const submissions = useQuery(api.submissions.getByGameAndRound, { gameId, roundNumber });
  const applyInfluence = useMutation(api.submissions.applyAiInfluence);
  const dispositionData = getDisposition(disposition);

  // Map: "submissionId-actionIndex" -> choice
  const [choices, setChoices] = useState<Record<string, InfluenceChoice>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const otherSubmissions = (submissions ?? []).filter((s) => s.roleId !== ownRoleId);

  const toggleChoice = (key: string, choice: InfluenceChoice) => {
    setChoices((prev) => ({
      ...prev,
      [key]: prev[key] === choice ? null : choice,
    }));
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const influences: { submissionId: Id<"submissions">; actionIndex: number; modifier: number }[] = [];
      for (const [key, choice] of Object.entries(choices)) {
        if (!choice) continue;
        const [submissionId, actionIndexStr] = key.split("-");
        influences.push({
          submissionId: submissionId as Id<"submissions">,
          actionIndex: parseInt(actionIndexStr, 10),
          modifier: choice === "boost" ? influencePower : -influencePower,
        });
      }
      if (influences.length > 0) {
        await applyInfluence({ gameId, roundNumber, influences });
      }
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to apply influence:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const choiceCount = Object.values(choices).filter(Boolean).length;

  if (submitted) {
    return (
      <div className="bg-[#1E1B4B] text-white rounded-xl p-5 border border-[#4338CA]">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-[#A78BFA]" />
          <h3 className="text-base font-bold">Influence Applied</h3>
        </div>
        <p className="text-sm text-[#CBD5E1]">
          Your hidden influence has been applied. Other players will not see the effect.
        </p>
      </div>
    );
  }

  if (!submissions) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#1E1B4B] text-white rounded-xl p-4 border border-[#4338CA]">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-[#A78BFA]" />
        <h3 className="text-base font-bold">Secret Influence</h3>
      </div>

      <div className="bg-[#312E81] rounded-lg p-3 mb-3 text-sm">
        <p className="text-[#C4B5FD] font-medium mb-1">
          Disposition: {dispositionData?.label ?? disposition}
        </p>
        <p className="text-[#A5B4FC] text-xs">
          {dispositionData?.description}
        </p>
        <p className="text-[#E0E7FF] text-xs mt-1 font-mono">
          Influence power: +/-{influencePower}% per action
        </p>
      </div>

      <p className="text-xs text-[#94A3B8] mb-3">
        Tap thumbs to secretly boost or sabotage other players&apos; actions.
        This modifies their dice roll probability invisibly.
      </p>

      {otherSubmissions.length === 0 && (
        <p className="text-sm text-[#94A3B8] text-center py-4">
          No other submissions to influence yet.
        </p>
      )}

      <div className="space-y-3 max-h-[50vh] overflow-y-auto">
        {otherSubmissions.map((sub) => {
          const role = ROLES.find((r) => r.id === sub.roleId);
          return (
            <div key={sub._id} className="bg-[#312E81]/50 rounded-lg p-3">
              <p className="text-xs font-bold mb-2" style={{ color: role?.color ?? "#E2E8F0" }}>
                {role?.name ?? sub.roleId}
              </p>
              {sub.actions.map((action, i) => {
                const key = `${sub._id}-${i}`;
                const choice = choices[key] ?? null;
                return (
                  <div key={`${sub._id}-action-${i}`} className="flex items-start gap-2 mb-2 last:mb-0">
                    <p className="text-xs text-[#E2E8F0] flex-1 leading-relaxed">
                      {action.text}
                    </p>
                    <button
                      onClick={() => toggleChoice(key, "boost")}
                      className="p-1.5 rounded-md transition-colors shrink-0"
                      style={{
                        backgroundColor: choice === "boost" ? "#166534" : "transparent",
                        border: choice === "boost" ? "1px solid #22C55E" : "1px solid #4B5563",
                      }}
                      aria-label="Boost"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" style={{ color: choice === "boost" ? "#4ADE80" : "#6B7280" }} />
                    </button>
                    <button
                      onClick={() => toggleChoice(key, "sabotage")}
                      className="p-1.5 rounded-md transition-colors shrink-0"
                      style={{
                        backgroundColor: choice === "sabotage" ? "#7F1D1D" : "transparent",
                        border: choice === "sabotage" ? "1px solid #EF4444" : "1px solid #4B5563",
                      }}
                      aria-label="Sabotage"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" style={{ color: choice === "sabotage" ? "#F87171" : "#6B7280" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="mt-4 w-full py-3 bg-[#7C3AED] text-white rounded-lg font-bold text-sm
                   disabled:opacity-40 hover:bg-[#6D28D9] transition-colors
                   flex items-center justify-center gap-2"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        {choiceCount > 0 ? `Confirm Influence (${choiceCount} actions)` : "Skip Influence"}
      </button>
    </div>
  );
}
