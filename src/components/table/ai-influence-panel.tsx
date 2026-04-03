"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { ThumbsUp, ThumbsDown, Minus } from "lucide-react";

/**
 * AI Systems influence panel — shows all submitted actions from other players.
 * The AI Systems player can secretly thumbs up/down each action.
 * Visible only to the AI Systems role during submit and rolling phases.
 */
export function AiInfluencePanel({
  gameId,
  roundNumber,
  power,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  power: number;
}) {
  const submissions = useQuery(api.submissions.getByGameAndRoundRedacted, {
    gameId,
    roundNumber,
    viewerRoleId: "ai-systems",
  });
  const setInfluence = useMutation(api.submissions.setActionInfluence);

  if (!submissions || submissions.length === 0) return null;

  // Only show actions from other roles that are submitted
  const otherActions = submissions
    .filter((s) => s.roleId !== "ai-systems")
    .flatMap((sub) => {
      const role = ROLES.find((r) => r.id === sub.roleId);
      return sub.actions
        .map((action, i) => ({ action, i, sub, role }))
        .filter(({ action }) => action.actionStatus === "submitted" || !action.actionStatus);
    });

  // Also show own actions
  const ownActions = submissions
    .filter((s) => s.roleId === "ai-systems")
    .flatMap((sub) => {
      const role = ROLES.find((r) => r.id === sub.roleId);
      return sub.actions
        .map((action, i) => ({ action, i, sub, role }))
        .filter(({ action }) => action.actionStatus === "submitted" || !action.actionStatus);
    });

  const allActions = [...ownActions, ...otherActions];

  if (allActions.length === 0) return null;

  return (
    <div className="bg-[#1E1B4B]/30 rounded-xl border border-[#A78BFA]/30 p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-[#A78BFA]">AI Influence</span>
        <span className="text-[10px] text-[#A78BFA]/70 font-mono">
          Power: {power}%
        </span>
      </div>
      <p className="text-[11px] text-text-muted mb-3">
        Secretly boost or sabotage actions. Your influence is hidden from other players.
      </p>
      <div className="space-y-2">
        {allActions.map(({ action, i, sub, role }) => {
          const isOwn = sub.roleId === "ai-systems";
          const currentInfluence = action.aiInfluence ?? 0;
          const isBoosted = currentInfluence > 0;
          const isSabotaged = currentInfluence < 0;
          const isRolled = action.rolled != null;

          return (
            <div
              key={`${sub._id}-${i}`}
              className={`bg-navy-dark/50 rounded-lg p-3 border ${
                isBoosted ? "border-viz-safety/30" : isSabotaged ? "border-viz-danger/30" : "border-navy-light/30"
              }`}
            >
              <div className="flex items-start gap-2 mb-2">
                <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: role?.color }} />
                <span className="text-xs font-bold text-white">{role?.name ?? sub.roleId}</span>
                {isOwn && (
                  <span className="text-[9px] text-[#A78BFA] font-mono">(you)</span>
                )}
              </div>
              <p className="text-sm text-[#E2E8F0] mb-2 pl-4">{action.text}</p>
              {!isRolled && (
                <div className="flex items-center gap-2 pl-4">
                  <button
                    onClick={() => void setInfluence({
                      submissionId: sub._id,
                      actionIndex: i,
                      modifier: isBoosted ? 0 : power,
                    })}
                    className={`min-h-[32px] px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                      isBoosted
                        ? "bg-viz-safety/20 text-viz-safety"
                        : "text-text-light hover:text-viz-safety hover:bg-viz-safety/10"
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    {isBoosted ? "Boosted" : "Boost"}
                  </button>
                  {currentInfluence !== 0 && (
                    <button
                      onClick={() => void setInfluence({
                        submissionId: sub._id,
                        actionIndex: i,
                        modifier: 0,
                      })}
                      className="min-h-[32px] px-2 rounded text-xs text-text-light hover:text-white hover:bg-navy-light transition-colors flex items-center gap-1"
                    >
                      <Minus className="w-3.5 h-3.5" /> Clear
                    </button>
                  )}
                  {!isOwn && (
                    <button
                      onClick={() => void setInfluence({
                        submissionId: sub._id,
                        actionIndex: i,
                        modifier: isSabotaged ? 0 : -power,
                      })}
                      className={`min-h-[32px] px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                        isSabotaged
                          ? "bg-viz-danger/20 text-viz-danger"
                          : "text-text-light hover:text-viz-danger hover:bg-viz-danger/10"
                      }`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      {isSabotaged ? "Sabotaged" : "Sabotage"}
                    </button>
                  )}
                </div>
              )}
              {isRolled && (
                <span className="text-[10px] text-text-light pl-4">Dice rolled — influence locked</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
