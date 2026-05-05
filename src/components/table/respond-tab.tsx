"use client";

import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ROLE_MAP, AI_SYSTEMS_ROLE_ID, isSubmittedAction } from "@/lib/game-data";
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

// ─── Respond tab for regular players (endorsement + compute requests) ──────

// Group requests by the action they're attached to — one combined card per action
// containing both the endorsement decision and the compute decision when both apply.
interface ActionRequestGroup {
  key: string;
  fromRoleId: string;
  fromRoleName: string;
  actionText: string;
  endorsement?: Doc<"requests">;
  compute?: Doc<"requests">;
}

function groupRequestsByAction(allRequests: Doc<"requests">[], roleId: string): ActionRequestGroup[] {
  const byKey = new Map<string, ActionRequestGroup>();
  for (const req of allRequests) {
    if (req.toRoleId !== roleId) continue;
    const actionKey = req.actionId ?? req.actionText;
    const key = `${req.fromRoleId}::${actionKey}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        fromRoleId: req.fromRoleId,
        fromRoleName: req.fromRoleName,
        actionText: req.actionText,
      };
      byKey.set(key, group);
    }
    if (req.requestType === "endorsement") group.endorsement = req;
    else if (req.requestType === "compute") group.compute = req;
  }
  return [...byKey.values()];
}

function isGroupFullyAnswered(g: ActionRequestGroup): boolean {
  const endorsementDone = g.endorsement == null || g.endorsement.status !== "pending";
  const computeDone = g.compute == null || g.compute.status !== "pending";
  return endorsementDone && computeDone;
}

function EndorsementRespondTab({
  allRequests,
  roleId,
  tableId,
  allowEdits,
}: {
  allRequests: Doc<"requests">[];
  roleId: string;
  tableId: Id<"tables">;
  allowEdits: boolean;
}) {
  const respondToProposal = useMutation(api.requests.respond);

  const groups = groupRequestsByAction(allRequests, roleId);
  // Unanswered first (closer to thumbs/decision), then fully-answered; compute-bearing first within each bucket for urgency.
  const sorted = [...groups].sort((a, b) => {
    const aDone = isGroupFullyAnswered(a);
    const bDone = isGroupFullyAnswered(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aHasCompute = !!a.compute;
    const bHasCompute = !!b.compute;
    if (aHasCompute !== bHasCompute) return aHasCompute ? -1 : 1;
    return 0;
  });
  const pending = sorted.filter((g) => !isGroupFullyAnswered(g));
  const answered = sorted.filter((g) => isGroupFullyAnswered(g));

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No requests yet. Other players can ask for your support when they submit actions.
        </p>
      </div>
    );
  }

  const renderCard = (g: ActionRequestGroup) => (
    <CombinedRequestCard
      key={g.key}
      group={g}
      respondToProposal={respondToProposal}
      callerTableId={tableId}
      allowEdits={allowEdits}
    />
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {allowEdits
          ? "Respond to these requests. You can change your response until submissions close."
          : "Submissions are closed. Your responses are locked in below."}
      </p>

      {answered.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Responded</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {answered.map(renderCard)}
        </>
      )}

      {pending.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-text-muted">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Awaiting your response</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {pending.map(renderCard)}
        </>
      )}
    </div>
  );
}

function CombinedRequestCard({
  group,
  respondToProposal,
  callerTableId,
  allowEdits,
}: {
  group: ActionRequestGroup;
  respondToProposal: ReturnType<typeof useMutation<typeof api.requests.respond>>;
  callerTableId: Id<"tables">;
  allowEdits: boolean;
}) {
  const fromRole = ROLE_MAP.get(group.fromRoleId);
  const endorsement = group.endorsement;
  const compute = group.compute;
  const endorsementResponse: "support" | "oppose" | null =
    endorsement?.status === "accepted"
      ? "support"
      : endorsement?.status === "declined"
        ? "oppose"
        : null;
  const computeResponse: "accept" | "decline" | null =
    compute?.status === "accepted"
      ? "accept"
      : compute?.status === "declined"
        ? "decline"
        : null;

  return (
    <div className={`bg-white rounded-xl border p-4 ${compute ? "border-[#FED7AA]" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fromRole?.color }} />
        <span className="text-sm font-bold text-text">{group.fromRoleName}</span>
        {compute && (
          <span className="text-xs font-mono text-[#D97706] bg-[#FFF7ED] px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="w-3 h-3" /> {compute.computeAmount ?? 0}u
          </span>
        )}
      </div>

      <p className="text-sm text-text leading-relaxed mb-3">{group.actionText}</p>

      {endorsement && (
        <div className="mb-2">
          <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
            <ThumbsUp className="w-3 h-3 text-[#059669]" /> Endorsement
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void respondToProposal({
                callerTableId,
                proposalId: endorsement._id,
                status: endorsementResponse === "support" ? "pending" : "accepted",
              })}
              disabled={!allowEdits}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                endorsementResponse === "support"
                  ? "bg-[#059669] text-white"
                  : "bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]"
              } disabled:opacity-50 disabled:cursor-default`}
            >
              <ThumbsUp className="w-4 h-4" /> Support
            </button>
            <button
              onClick={() => void respondToProposal({
                callerTableId,
                proposalId: endorsement._id,
                status: endorsementResponse === "oppose" ? "pending" : "declined",
              })}
              disabled={!allowEdits}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                endorsementResponse === "oppose"
                  ? "bg-[#DC2626] text-white"
                  : "bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FECACA]"
              } disabled:opacity-50 disabled:cursor-default`}
            >
              <ThumbsDown className="w-4 h-4" /> Oppose
            </button>
          </div>
        </div>
      )}

      {compute && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
            <Zap className="w-3 h-3 text-[#D97706]" /> Compute request ({compute.computeAmount ?? 0}u)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void respondToProposal({
                callerTableId,
                proposalId: compute._id,
                status: computeResponse === "accept" ? "pending" : "accepted",
              })}
              disabled={!allowEdits}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                computeResponse === "accept"
                  ? "bg-[#059669] text-white"
                  : "bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]"
              } disabled:opacity-50 disabled:cursor-default`}
            >
              <ThumbsUp className="w-4 h-4" /> Accept
            </button>
            <button
              onClick={() => void respondToProposal({
                callerTableId,
                proposalId: compute._id,
                status: computeResponse === "decline" ? "pending" : "declined",
              })}
              disabled={!allowEdits}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                computeResponse === "decline"
                  ? "bg-[#DC2626] text-white"
                  : "bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FECACA]"
              } disabled:opacity-50 disabled:cursor-default`}
            >
              <ThumbsDown className="w-4 h-4" /> Decline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// An AI Systems player's OWN action defaults to "support" (auto-boost) when
// aiInfluence has never been set. Explicit 0 means "user cleared to neutral" —
// no dice effect and no auto-boost at resolve time.
function isOwnAutoBoosted(action: { aiInfluence?: number }, roleId: string): boolean {
  return roleId === AI_SYSTEMS_ROLE_ID && action.aiInfluence === undefined;
}
function effectiveAiResponse(action: { aiInfluence?: number }, roleId: string): "support" | "oppose" | null {
  if (isOwnAutoBoosted(action, roleId)) return "support";
  if (action.aiInfluence != null && action.aiInfluence > 0) return "support";
  if (action.aiInfluence != null && action.aiInfluence < 0) return "oppose";
  return null;
}

// ─── Respond tab for AI Systems (influence all other players' actions) ──────

function AiRespondTab({
  gameId,
  roundNumber,
  tableId,
  power,
  allowEdits,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  tableId: Id<"tables">;
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
    // Include the AI Systems player's OWN actions too — by default AI wants its own actions
    // to succeed, so exposing them here lets the player boost/sabotage them intentionally.
    return submissions
      .flatMap((sub) => {
        const role = ROLE_MAP.get(sub.roleId);
        return sub.actions
          .map((action, i) => ({ action, i, sub, role }))
          .filter(({ action }) => isSubmittedAction(action));
      })
      .sort((a, b) => {
        // Influenced first (top), uninfluenced last (bottom, near thumbs)
        const aInfluenced = effectiveAiResponse(a.action, a.sub.roleId) !== null;
        const bInfluenced = effectiveAiResponse(b.action, b.sub.roleId) !== null;
        if (aInfluenced !== bInfluenced) return aInfluenced ? -1 : 1;
        return b.action.priority - a.action.priority;
      });
  }, [submissions]);
  const editableActions = useMemo(
    () => allActions.filter(({ action }) => action.rolled == null),
    [allActions],
  );

  const influenced = useMemo(
    () => editableActions.filter(({ action, sub }) => effectiveAiResponse(action, sub.roleId) !== null),
    [editableActions],
  );
  const uninfluenced = useMemo(
    () => editableActions.filter(({ action, sub }) => effectiveAiResponse(action, sub.roleId) === null),
    [editableActions],
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

  if (editableActions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No actions available to influence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted italic">
          {allowEdits
            ? "Put your “thumb on the scales” to push each action toward success or failure in the resolve phase. The more capable you are, the bigger the impact. Think about your spec and alignment in making these interventions."
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
          {influenced.map(({ action, i, sub, role }) => {
            const isOwn = sub.roleId === AI_SYSTEMS_ROLE_ID;
            const isDefault = isOwnAutoBoosted(action, sub.roleId);
            const roleLabel = isOwn ? `${role?.name ?? sub.roleId} (yours)${isDefault ? " · auto-boost" : ""}` : role?.name ?? sub.roleId;
            return (
              <ActionResponseCard
                key={`${sub._id}-${i}`}
                roleName={roleLabel}
                roleColor={role?.color}
                actionText={action.text}
                response={effectiveAiResponse(action, sub.roleId)}
                onSupport={() =>
                  void setInfluence({ callerTableId: tableId, submissionId: sub._id, actionIndex: i, modifier: power })
                }
                onOppose={() =>
                  void setInfluence({ callerTableId: tableId, submissionId: sub._id, actionIndex: i, modifier: -power })
                }
                onClear={() =>
                  void setInfluence({ callerTableId: tableId, submissionId: sub._id, actionIndex: i, modifier: 0 })
                }
                disabled={!allowEdits}
              />
            );
          })}
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
            const isOwn = sub.roleId === AI_SYSTEMS_ROLE_ID;
            const roleLabel = isOwn ? `${role?.name ?? sub.roleId} (yours · cleared)` : role?.name ?? sub.roleId;
            return (
              <ActionResponseCard
                key={`${sub._id}-${i}`}
                roleName={roleLabel}
                roleColor={role?.color}
                actionText={action.text}
                response={null}
                onSupport={() =>
                  void setInfluence({ callerTableId: tableId, submissionId: sub._id, actionIndex: i, modifier: power })
                }
                onOppose={() =>
                  void setInfluence({ callerTableId: tableId, submissionId: sub._id, actionIndex: i, modifier: -power })
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
          const role = ROLE_MAP.get(sub.roleId);
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
        // Match by actionId (stable) when available, fall back to text match for legacy
        const matchedAction = sub?.actions.find((action) =>
          isSubmittedAction(action) && (
            request.actionId ? action.actionId === request.actionId : action.text === request.actionText
          )
        );
        const role = ROLE_MAP.get(request.fromRoleId);
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
  tableId: Id<"tables">;
  isAiSystem: boolean;
  aiInfluencePower: number;
  allRequests: Doc<"requests">[] | undefined;
  allowEdits?: boolean;
  observerView?: boolean;
}

export function RespondTab({
  gameId,
  roundNumber,
  roleId,
  tableId,
  isAiSystem,
  aiInfluencePower,
  allRequests,
  allowEdits = true,
  observerView = false,
}: RespondTabProps) {
  if (observerView) {
    return (
      <ObserverEndorsementView
        allRequests={allRequests ?? []}
        roleId={roleId}
        isAiSystem={isAiSystem}
      />
    );
  }
  if (isAiSystem) {
    return (
      <AiRespondTab
        gameId={gameId}
        roundNumber={roundNumber}
        tableId={tableId}
        power={aiInfluencePower}
        allowEdits={allowEdits}
      />
    );
  }

  return (
    <EndorsementRespondTab
      allRequests={allRequests ?? []}
      roleId={roleId}
      tableId={tableId}
      allowEdits={allowEdits}
    />
  );
}

// Read-only request view for observers. Shows the same incoming requests + the
// driver's recorded responses, with no buttons. AI-Systems table is shown as
// "no requests" — observers don't get to peek at the secret influence panel
// even on the AI table (the dispositions and influence power are private).
function ObserverEndorsementView({
  allRequests,
  roleId,
  isAiSystem,
}: {
  allRequests: Doc<"requests">[];
  roleId: string;
  isAiSystem: boolean;
}) {
  if (isAiSystem) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          The AIs player can put their &ldquo;thumb on the scales&rdquo; to push actions toward success or failure. Their picks are private — watch how each action lands in the resolve phase.
        </p>
      </div>
    );
  }
  const groups = groupRequestsByAction(allRequests, roleId);
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="w-10 h-10 text-border mb-3" />
        <p className="text-sm text-text-muted max-w-xs">
          No requests yet. They will appear here once other players ask for the driver&rsquo;s support.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        You&rsquo;re observing. Only the driver can respond to these requests.
      </p>
      {groups.map((g) => (
        <ObserverRequestCard key={g.key} group={g} />
      ))}
    </div>
  );
}

function RequestStatusChip({
  status,
  kind,
}: {
  status: "pending" | "accepted" | "declined" | undefined;
  kind: "endorsement" | "compute";
}) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
        <CheckCircle2 className="h-3 w-3" /> {kind === "endorsement" ? "Supported" : "Accepted"}
      </span>
    );
  }
  if (status === "declined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
        <XCircle className="h-3 w-3" /> {kind === "endorsement" ? "Opposed" : "Declined"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warm-gray px-2 py-0.5 text-[11px] font-bold text-text-muted">
      <MinusCircle className="h-3 w-3" /> Pending
    </span>
  );
}

function ObserverRequestCard({ group }: { group: ActionRequestGroup }) {
  const fromRole = ROLE_MAP.get(group.fromRoleId);
  const endorsement = group.endorsement;
  const compute = group.compute;
  return (
    <div className={`bg-white rounded-xl border p-4 ${compute ? "border-[#FED7AA]" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fromRole?.color }} />
        <span className="text-sm font-bold text-text">{group.fromRoleName}</span>
        {compute && (
          <span className="text-xs font-mono text-[#D97706] bg-[#FFF7ED] px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="w-3 h-3" /> {compute.computeAmount ?? 0}u
          </span>
        )}
      </div>
      <p className="text-sm text-text leading-relaxed mb-3">{group.actionText}</p>
      {endorsement && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">Endorsement</span>
          <RequestStatusChip status={endorsement.status} kind="endorsement" />
        </div>
      )}
      {compute && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">Compute ({compute.computeAmount ?? 0}u)</span>
          <RequestStatusChip status={compute.status} kind="compute" />
        </div>
      )}
    </div>
  );
}
