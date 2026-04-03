"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ROLES, isSubmittedAction } from "@/lib/game-data";
import { ThumbsUp, ThumbsDown, EyeOff, Inbox } from "lucide-react";

// ─── Shared response card ───────────────────────────────────────────────────

function ActionResponseCard({
  roleName,
  roleColor,
  actionText,
  isSecret,
  response,
  onSupport,
  onOppose,
  onClear,
}: {
  roleName: string;
  roleColor?: string;
  actionText: string;
  isSecret?: boolean;
  response: "support" | "oppose" | null;
  onSupport: () => void;
  onOppose: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: roleColor }}
        />
        <span className="text-sm font-bold text-text">{roleName}</span>
      </div>

      {isSecret ? (
        <p className="text-sm text-text-muted italic flex items-center gap-1.5 mb-3">
          <EyeOff className="w-3.5 h-3.5" /> [Covert action]
        </p>
      ) : (
        <p className="text-sm text-text leading-relaxed mb-3">{actionText}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={response === "support" && onClear ? onClear : onSupport}
          className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            response === "support"
              ? "bg-[#059669] text-white"
              : "bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]"
          }`}
        >
          <ThumbsUp className="w-4 h-4" /> Support
        </button>
        <button
          onClick={response === "oppose" && onClear ? onClear : onOppose}
          className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            response === "oppose"
              ? "bg-[#DC2626] text-white"
              : "bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FECACA]"
          }`}
        >
          <ThumbsDown className="w-4 h-4" /> Oppose
        </button>
      </div>
    </div>
  );
}

// ─── Respond tab for regular players (endorsement requests) ─────────────────

function EndorsementRespondTab({
  allRequests,
  roleId,
}: {
  allRequests: Doc<"requests">[];
  roleId: string;
}) {
  const respondToProposal = useMutation(api.requests.respond);

  const incoming = allRequests.filter((r) => r.toRoleId === roleId);
  // Changeable: answered at top, unanswered at bottom (near thumbs)
  const answered = incoming.filter((r) => r.status !== "pending");
  const unanswered = incoming.filter((r) => r.status === "pending");

  if (incoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No requests yet. Other players can ask for your support when they submit actions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Do you support or oppose these actions? You can change your response until submissions close.
      </p>

      {answered.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Responded</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {answered.map((req) => {
            const fromRole = ROLES.find((r) => r.id === req.fromRoleId);
            return (
              <ActionResponseCard
                key={req._id}
                roleName={req.fromRoleName}
                roleColor={fromRole?.color}
                actionText={req.actionText}
                response={req.status === "accepted" ? "support" : "oppose"}
                onSupport={() =>
                  void respondToProposal({ proposalId: req._id, status: "accepted" })
                }
                onOppose={() =>
                  void respondToProposal({ proposalId: req._id, status: "declined" })
                }
                onClear={() =>
                  void respondToProposal({ proposalId: req._id, status: "pending" })
                }
              />
            );
          })}
        </>
      )}

      {unanswered.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Awaiting your response</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {unanswered.map((req) => {
            const fromRole = ROLES.find((r) => r.id === req.fromRoleId);
            return (
              <ActionResponseCard
                key={req._id}
                roleName={req.fromRoleName}
                roleColor={fromRole?.color}
                actionText={req.actionText}
                response={null}
                onSupport={() =>
                  void respondToProposal({ proposalId: req._id, status: "accepted" })
                }
                onOppose={() =>
                  void respondToProposal({ proposalId: req._id, status: "declined" })
                }
              />
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Respond tab for AI Systems (influence all other players' actions) ──────

function AiRespondTab({
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

  if (!submissions || submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No actions submitted yet. Other players&apos; actions will appear here.
        </p>
      </div>
    );
  }

  const allActions = submissions
    .filter((s) => s.roleId !== "ai-systems")
    .flatMap((sub) => {
      const role = ROLES.find((r) => r.id === sub.roleId);
      return sub.actions
        .map((action, i) => ({ action, i, sub, role }))
        .filter(({ action }) => isSubmittedAction(action));
    })
    .sort((a, b) => {
      // Influenced first (top), uninfluenced last (bottom, near thumbs)
      const aInfluenced = a.action.aiInfluence != null && a.action.aiInfluence !== 0;
      const bInfluenced = b.action.aiInfluence != null && b.action.aiInfluence !== 0;
      if (aInfluenced !== bInfluenced) return aInfluenced ? -1 : 1;
      return b.action.priority - a.action.priority;
    });

  if (allActions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No actions submitted yet. Other players&apos; actions will appear here.
        </p>
      </div>
    );
  }

  const influenced = allActions.filter(
    ({ action }) => action.aiInfluence != null && action.aiInfluence !== 0,
  );
  const uninfluenced = allActions.filter(
    ({ action }) => !action.aiInfluence || action.aiInfluence === 0,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted italic">
          Your responses secretly affect the dice rolls. Change anytime until dice are rolled.
        </p>
        <span className="text-[10px] text-text-muted font-mono shrink-0 ml-2">
          Power: {power}%
        </span>
      </div>

      {influenced.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Responded</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {influenced.map(({ action, i, sub, role }) => (
            <ActionResponseCard
              key={`${sub._id}-${i}`}
              roleName={role?.name ?? sub.roleId}
              roleColor={role?.color}
              actionText={action.text}
              isSecret={action.secret}
              response={(action.aiInfluence ?? 0) > 0 ? "support" : "oppose"}
              onSupport={() =>
                void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: power })
              }
              onOppose={() =>
                void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: -power })
              }
              onClear={() =>
                void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: 0 })
              }
            />
          ))}
        </>
      )}

      {uninfluenced.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Awaiting your response</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {uninfluenced.map(({ action, i, sub, role }) => {
            if (action.rolled != null) return null;
            return (
              <ActionResponseCard
                key={`${sub._id}-${i}`}
                roleName={role?.name ?? sub.roleId}
                roleColor={role?.color}
                actionText={action.text}
                isSecret={action.secret}
                response={null}
                onSupport={() =>
                  void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: power })
                }
                onOppose={() =>
                  void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: -power })
                }
              />
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Main respond tab (dispatches based on role type) ───────────────────────

export interface RespondTabProps {
  gameId: Id<"games">;
  roundNumber: number;
  roleId: string;
  isAiSystem: boolean;
  aiInfluencePower: number;
  allRequests: Doc<"requests">[] | undefined;
}

export function RespondTab({
  gameId,
  roundNumber,
  roleId,
  isAiSystem,
  aiInfluencePower,
  allRequests,
}: RespondTabProps) {
  if (isAiSystem) {
    return (
      <AiRespondTab
        gameId={gameId}
        roundNumber={roundNumber}
        power={aiInfluencePower}
      />
    );
  }

  return (
    <EndorsementRespondTab
      allRequests={allRequests ?? []}
      roleId={roleId}
    />
  );
}
