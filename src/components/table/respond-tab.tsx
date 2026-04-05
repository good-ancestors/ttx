"use client";

import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ROLES, AI_SYSTEMS_ROLE_ID, isSubmittedAction } from "@/lib/game-data";
import { ThumbsUp, ThumbsDown, EyeOff, Inbox, CheckCircle2, XCircle, MinusCircle, Zap } from "lucide-react";

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
  disabled,
}: {
  roleName: string;
  roleColor?: string;
  actionText: string;
  isSecret?: boolean;
  response: "support" | "oppose" | null;
  onSupport: () => void;
  onOppose: () => void;
  onClear?: () => void;
  disabled?: boolean;
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
          disabled={disabled}
          className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            response === "support"
              ? "bg-[#059669] text-white"
              : "bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]"
          } disabled:opacity-50 disabled:cursor-default`}
        >
          <ThumbsUp className="w-4 h-4" /> Support
        </button>
        <button
          onClick={response === "oppose" && onClear ? onClear : onOppose}
          disabled={disabled}
          className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            response === "oppose"
              ? "bg-[#DC2626] text-white"
              : "bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FECACA]"
          } disabled:opacity-50 disabled:cursor-default`}
        >
          <ThumbsDown className="w-4 h-4" /> Oppose
        </button>
      </div>
    </div>
  );
}

// ─── Compute request response card ─────────────────────────────────────────

function ComputeResponseCard({
  roleName,
  roleColor,
  actionText,
  computeAmount,
  response,
  onAccept,
  onDecline,
  onClear,
  disabled,
}: {
  roleName: string;
  roleColor?: string;
  actionText: string;
  computeAmount: number;
  response: "accept" | "decline" | null;
  onAccept: () => void;
  onDecline: () => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#FED7AA] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: roleColor }}
        />
        <span className="text-sm font-bold text-text">{roleName}</span>
        <span className="text-xs font-mono text-[#D97706] bg-[#FFF7ED] px-2 py-0.5 rounded-full flex items-center gap-1">
          <Zap className="w-3 h-3" /> {computeAmount}u
        </span>
      </div>

      <p className="text-sm text-text leading-relaxed mb-1">
        requests {computeAmount}u of compute for:
      </p>
      <p className="text-sm text-text-muted leading-relaxed mb-3 italic">{actionText}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={response === "accept" && onClear ? onClear : onAccept}
          disabled={disabled}
          className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            response === "accept"
              ? "bg-[#059669] text-white"
              : "bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]"
          } disabled:opacity-50 disabled:cursor-default`}
        >
          <ThumbsUp className="w-4 h-4" /> Accept
        </button>
        <button
          onClick={response === "decline" && onClear ? onClear : onDecline}
          disabled={disabled}
          className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
            response === "decline"
              ? "bg-[#DC2626] text-white"
              : "bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FECACA]"
          } disabled:opacity-50 disabled:cursor-default`}
        >
          <ThumbsDown className="w-4 h-4" /> Decline
        </button>
      </div>
    </div>
  );
}

// ─── Respond tab for regular players (endorsement + compute requests) ──────

function EndorsementRespondTab({
  allRequests,
  roleId,
  allowEdits,
}: {
  allRequests: Doc<"requests">[];
  roleId: string;
  allowEdits: boolean;
}) {
  const respondToProposal = useMutation(api.requests.respond);

  const endorsements = allRequests.filter((r) => r.toRoleId === roleId && r.requestType === "endorsement");
  const computeRequests = allRequests.filter((r) => r.toRoleId === roleId && r.requestType === "compute");
  // Changeable: answered at top, unanswered at bottom (near thumbs)
  const answeredEndorsements = endorsements.filter((r) => r.status !== "pending");
  const unansweredEndorsements = endorsements.filter((r) => r.status === "pending");
  const answeredCompute = computeRequests.filter((r) => r.status !== "pending");
  const unansweredCompute = computeRequests.filter((r) => r.status === "pending");

  if (endorsements.length === 0 && computeRequests.length === 0) {
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
        {allowEdits
          ? "Respond to these requests. You can change your response until submissions close."
          : "Submissions are closed. Your responses are locked in below."}
      </p>

      {/* Compute requests — shown first (higher urgency) */}
      {(unansweredCompute.length > 0 || answeredCompute.length > 0) && (
        <>
          {unansweredCompute.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-text-muted">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#D97706]" /> Compute requests
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {unansweredCompute.map((req) => {
                const fromRole = ROLES.find((r) => r.id === req.fromRoleId);
                return (
                  <ComputeResponseCard
                    key={req._id}
                    roleName={req.fromRoleName}
                    roleColor={fromRole?.color}
                    actionText={req.actionText}
                    computeAmount={req.computeAmount ?? 0}
                    response={null}
                    onAccept={() =>
                      void respondToProposal({ proposalId: req._id, status: "accepted" })
                    }
                    onDecline={() =>
                      void respondToProposal({ proposalId: req._id, status: "declined" })
                    }
                    disabled={!allowEdits}
                  />
                );
              })}
            </>
          )}

          {answeredCompute.map((req) => {
            const fromRole = ROLES.find((r) => r.id === req.fromRoleId);
            return (
              <ComputeResponseCard
                key={req._id}
                roleName={req.fromRoleName}
                roleColor={fromRole?.color}
                actionText={req.actionText}
                computeAmount={req.computeAmount ?? 0}
                response={req.status === "accepted" ? "accept" : "decline"}
                onAccept={() =>
                  void respondToProposal({ proposalId: req._id, status: "accepted" })
                }
                onDecline={() =>
                  void respondToProposal({ proposalId: req._id, status: "declined" })
                }
                onClear={() =>
                  void respondToProposal({ proposalId: req._id, status: "pending" })
                }
                disabled={!allowEdits}
              />
            );
          })}
        </>
      )}

      {/* Endorsement requests */}
      {answeredEndorsements.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Responded</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {answeredEndorsements.map((req) => {
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
                disabled={!allowEdits}
              />
            );
          })}
        </>
      )}

      {unansweredEndorsements.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Awaiting your response</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {unansweredEndorsements.map((req) => {
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
                disabled={!allowEdits}
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
  allowEdits,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  power: number;
  allowEdits: boolean;
}) {
  const submissions = useQuery(api.submissions.getByGameAndRoundRedacted, {
    gameId,
    roundNumber,
    viewerRoleId: AI_SYSTEMS_ROLE_ID,
  });
  const setInfluence = useMutation(api.submissions.setActionInfluence);

  const allActions = useMemo(() => {
    if (!submissions) return [];
    return submissions
      .filter((s) => s.roleId !== AI_SYSTEMS_ROLE_ID)
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
  }, [submissions]);

  const influenced = useMemo(
    () => allActions.filter(({ action }) => action.aiInfluence != null && action.aiInfluence !== 0),
    [allActions],
  );
  const uninfluenced = useMemo(
    () => allActions.filter(({ action }) => !action.aiInfluence || action.aiInfluence === 0),
    [allActions],
  );

  if (!submissions || allActions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No actions submitted yet. Other players&apos; actions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted italic">
          {allowEdits
            ? "Your responses secretly affect the dice rolls. Change anytime until dice are rolled."
            : "Submissions are closed. Your influence choices are locked for this round."}
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
                disabled={!allowEdits}
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
                response={null}
                onSupport={() =>
                  void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: power })
                }
                onOppose={() =>
                  void setInfluence({ submissionId: sub._id, actionIndex: i, modifier: -power })
                }
                disabled={!allowEdits}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function ResultStatusChip({
  success,
}: {
  success: boolean | undefined;
}) {
  if (success === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
        <CheckCircle2 className="h-3 w-3" /> Succeeded
      </span>
    );
  }
  if (success === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warm-gray px-2 py-0.5 text-[11px] font-bold text-text-muted">
      <MinusCircle className="h-3 w-3" /> No result
    </span>
  );
}

export function RespondResultsTab({
  gameId,
  roundNumber,
  roleId,
  isAiSystem,
  allRequests,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  roleId: string;
  isAiSystem: boolean;
  allRequests: Doc<"requests">[];
}) {
  const submissions = useQuery(api.submissions.getByGameAndRoundRedacted, {
    gameId,
    roundNumber,
    viewerRoleId: isAiSystem ? AI_SYSTEMS_ROLE_ID : roleId,
  });

  const results = useMemo(() => {
    if (!submissions) return [];

    if (isAiSystem) {
      return submissions
        .filter((sub) => sub.roleId !== AI_SYSTEMS_ROLE_ID)
        .flatMap((sub) => {
          const role = ROLES.find((entry) => entry.id === sub.roleId);
          return sub.actions
            .map((action, index) => ({ action, index, sub, role }))
            .filter(({ action }) => isSubmittedAction(action) && action.aiInfluence != null && action.aiInfluence !== 0)
            .map(({ action, index, sub, role }) => ({
              key: `${sub._id}-${index}`,
              roleName: role?.name ?? sub.roleId,
              roleColor: role?.color,
              actionText: action.text,
              responseLabel: (action.aiInfluence ?? 0) > 0 ? "You boosted this action" : "You sabotaged this action",
              success: action.success,
              rolled: action.rolled,
              probability: action.probability,
            }));
        });
    }

    return allRequests
      .filter((request) => request.toRoleId === roleId && request.status !== "pending")
      .map((request) => {
        const sub = submissions.find((entry) => entry.roleId === request.fromRoleId);
        // Match by exact action text. No fallback to "first secret action" — showing
        // the wrong outcome is worse than showing "No result".
        const matchedAction = sub?.actions.find((action) =>
          isSubmittedAction(action) && action.text === request.actionText
        );
        const role = ROLES.find((entry) => entry.id === request.fromRoleId);
        return {
          key: request._id,
          roleName: request.fromRoleName,
          roleColor: role?.color,
          actionText: request.actionText,
          responseLabel: request.status === "accepted" ? "You supported this action" : "You opposed this action",
          success: matchedAction?.success,
          rolled: matchedAction?.rolled,
          probability: matchedAction?.probability,
        };
      });
  }, [allRequests, isAiSystem, roleId, submissions]);

  if (!submissions || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No resolved response items yet for this round.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {isAiSystem
          ? "These are the actions you secretly influenced and how they resolved."
          : "These are the actions you supported or opposed and how they resolved."}
      </p>
      {results.map((result) => (
        <div key={result.key} className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: result.roleColor }} />
            <span className="text-sm font-bold text-text">{result.roleName}</span>
            <ResultStatusChip success={result.success} />
          </div>
          <p className="text-sm text-text leading-relaxed mb-2">{result.actionText}</p>
          <div className="flex items-center justify-between gap-3 text-[11px] text-text-muted">
            <span>{result.responseLabel}</span>
            {result.rolled != null && result.probability != null && (
              <span className="font-mono">
                rolled {result.rolled} vs {result.probability}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main respond tab (dispatches based on role type) ───────────────────────

interface RespondTabProps {
  gameId: Id<"games">;
  roundNumber: number;
  roleId: string;
  isAiSystem: boolean;
  aiInfluencePower: number;
  allRequests: Doc<"requests">[] | undefined;
  allowEdits?: boolean;
}

export function RespondTab({
  gameId,
  roundNumber,
  roleId,
  isAiSystem,
  aiInfluencePower,
  allRequests,
  allowEdits = true,
}: RespondTabProps) {
  if (isAiSystem) {
    return (
      <AiRespondTab
        gameId={gameId}
        roundNumber={roundNumber}
        power={aiInfluencePower}
        allowEdits={allowEdits}
      />
    );
  }

  return (
    <EndorsementRespondTab
      allRequests={allRequests ?? []}
      roleId={roleId}
      allowEdits={allowEdits}
    />
  );
}
