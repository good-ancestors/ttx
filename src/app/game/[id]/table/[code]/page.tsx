"use client";

import { use, useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, MAX_PRIORITY, isLabCeo, isLabSafety, hasCompute, type Role } from "@/lib/game-data";
import { useCountdown, useKeyboardScroll, parseActionsFromText } from "@/lib/hooks";
import { ActionCard } from "@/components/action-card";
import { ActionInput, normaliseActions, emptyAction, type ActionDraft } from "@/components/action-input";
import { ComputeAllocation } from "@/components/compute-allocation";
// Compute loans now handled via action request system
import { LabAllocationReadOnly } from "@/components/lab-allocation-readonly";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { ProposalPanel, usePendingProposalCount } from "@/components/proposals";
import {
  Send,
  Loader2,
  Clock,
  FileText,
  Target,
  ChevronDown,
  ChevronUp,
  Cpu,
  Info,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Handshake,
  AlertTriangle,
} from "lucide-react";

// ─── Draft persistence helpers ────────────────────────────────────────────────

interface DraftData {
  freeText: string;
  parsedActions: { text: string; priority: number }[];
  computeAllocation: { users: number; capability: number; safety: number };
  computeLoans?: never; // removed — kept for backward compat with old drafts
  artifact: string;
}

function draftKey(tableId: string, roundNumber: number) {
  return `ttx-draft-${tableId}-${roundNumber}`;
}

function saveDraft(tableId: string, roundNumber: number, data: DraftData) {
  try {
    localStorage.setItem(draftKey(tableId, roundNumber), JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function loadDraft(tableId: string, roundNumber: number): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(tableId, roundNumber));
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function clearDraft(tableId: string, roundNumber: number) {
  try {
    localStorage.removeItem(draftKey(tableId, roundNumber));
  } catch {
    // Ignore
  }
}

// ─── Results card for rolling/narrate phase ──────────────────────────────────

function ResultActionCard({
  action,
  index,
}: {
  action: {
    text: string;
    priority: number;
    probability?: number;
    rolled?: number;
    success?: boolean;
    reasoning?: string;
  };
  index: number;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const isSuccess = action.success === true;
  const isFailed = action.success === false;
  const borderColor = isSuccess ? "#22C55E" : isFailed ? "#EF4444" : undefined;

  return (
    <div
      className="bg-white rounded-lg p-3 border border-border relative mb-2"
      style={borderColor ? { borderLeftWidth: "3px", borderLeftColor: borderColor } : undefined}
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[11px] bg-warm-gray text-text-muted rounded px-1.5 py-0.5 font-mono font-semibold shrink-0">
          #{index + 1}
        </span>
        <p className="text-sm text-text flex-1">{action.text}</p>
        {isSuccess && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Success
          </span>
        )}
        {isFailed && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[#DC2626] bg-[#FEF2F2] px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-text-muted mb-1">
        <span className="font-mono">Priority: {action.priority}/{MAX_PRIORITY}</span>
        {action.probability != null && (
          <span className="font-mono">Probability: {action.probability}%</span>
        )}
      </div>

      {action.rolled != null && action.probability != null && (
        <p className="text-xs font-mono mt-1" style={{ color: isSuccess ? "#22C55E" : "#EF4444" }}>
          Needed ≤{action.probability}, rolled {action.rolled} — {isSuccess ? "Success!" : "Failed"}
        </p>
      )}

      {action.reasoning && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            onClick={() => setReasoningOpen(!reasoningOpen)}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            Why?
            {reasoningOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {reasoningOpen && (
            <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
              {action.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Onboarding "How to Play" section ────────────────────────────────────────

function HowToPlaySection({ role }: { role: Role }) {
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
        <ul className="mt-2 space-y-1.5 text-sm text-text-muted pl-5 list-disc">
          <li>Discuss with your table what you will do this quarter</li>
          <li>When submissions open, describe your key actions</li>
          <li>The AI will grade probabilities and dice determine outcomes</li>
        </ul>
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

// ─── Main page component ─────────────────────────────────────────────────────

export default function TablePlayerPage({
  params,
}: {
  params: Promise<{ id: string; code: string }>;
}) {
  const { id, code } = use(params);
  const gameId = id as Id<"games">;
  const tableId = code as Id<"tables">;

  const game = useQuery(api.games.get, { gameId });
  const table = useQuery(api.tables.get, { tableId });
  const round = useQuery(api.rounds.getCurrent, { gameId });
  const submission = useQuery(api.submissions.getForTable, {
    tableId,
    roundNumber: game?.currentRound ?? 1,
  });

  const submitActions = useMutation(api.submissions.submit);
  const sendRequest = useMutation(api.requests.send);
  const setConnected = useMutation(api.tables.setConnected);
  const allTables = useQuery(api.tables.getByGame, { gameId });

  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([emptyAction()]);
  // Legacy compat — keep these for draft persistence and auto-submit
  const freeText = actionDrafts.map((a) => a.text).join("\n");
  const parsedActions = normaliseActions(actionDrafts);
  const [computeAllocation, setComputeAllocation] = useState({
    users: 50,
    capability: 25,
    safety: 25,
  });
  // computeLoans removed — now handled by action request system
  const [artifact, setArtifact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [autoSubmitMessage, setAutoSubmitMessage] = useState("");

  // Track whether we've already auto-submitted to avoid repeated calls
  const autoSubmittedRef = useRef(false);
  // Track whether draft has been restored to avoid overwriting on mount
  const draftRestoredRef = useRef(false);

  useKeyboardScroll();

  const { display: timerDisplay, isUrgent, isExpired } = useCountdown(game?.phaseEndsAt);

  const role = table ? ROLES.find((r) => r.id === table.roleId) : null;
  const enabledRoles = (allTables ?? [])
    .filter((t) => t.enabled && t.roleId !== table?.roleId)
    .map((t) => ({ id: t.roleId, name: t.roleName }));
  const isSubmitted = submission?.status !== undefined && submission.status !== "draft";
  const phase = game?.phase ?? "discuss";

  // Proposal count for header badge
  const pendingProposalCount = usePendingProposalCount(
    gameId,
    game?.currentRound ?? 1,
    role?.id ?? ""
  );

  // Set connected on mount, disconnect on unmount/close
  useEffect(() => {
    if (!tableId) return;
    void setConnected({ tableId, connected: true });

    const handleDisconnect = () => {
      void setConnected({ tableId, connected: false });
    };
    window.addEventListener("beforeunload", handleDisconnect);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handleDisconnect();
      else void setConnected({ tableId, connected: true });
    });
    return () => {
      window.removeEventListener("beforeunload", handleDisconnect);
      handleDisconnect();
    };
  }, [tableId, setConnected]);

  // Initialize compute allocation from role defaults
  useEffect(() => {
    if (role?.defaultCompute) {
      setComputeAllocation({ ...role.defaultCompute });
    }
  }, [role?.defaultCompute]);

  // ── Draft persistence: restore on mount ──────────────────────────────────
  useEffect(() => {
    if (!game || draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const draft = loadDraft(tableId, game.currentRound);
    if (draft) {
      // Restore drafts — convert old format to new ActionDraft format
      if (draft.parsedActions?.length > 0) {
        setActionDrafts(draft.parsedActions.map((a: { text: string; priority: number; secret?: boolean }) => ({
          text: a.text, priority: a.priority >= 4 ? "high" as const : a.priority >= 2 ? "medium" as const : "low" as const,
          secret: !!a.secret, endorseTargets: [],
        })));
      } else if (draft.freeText?.trim()) {
        setActionDrafts([{ text: draft.freeText, priority: "medium" as const, secret: false, endorseTargets: [] }]);
      }
      if (draft.computeAllocation) setComputeAllocation(draft.computeAllocation);
      if (draft.artifact) setArtifact(draft.artifact);
      setDraftRestored(true);
    }
  }, [game, tableId]);

  // Auto-clear the "Draft restored" message after 3 seconds
  useEffect(() => {
    if (!draftRestored) return;
    const timeout = setTimeout(() => setDraftRestored(false), 3000);
    return () => clearTimeout(timeout);
  }, [draftRestored]);

  // ── Draft persistence: save on every change ──────────────────────────────
  useEffect(() => {
    if (!game || !draftRestoredRef.current) return;
    saveDraft(tableId, game.currentRound, {
      freeText: "",
      parsedActions: normaliseActions(actionDrafts),
      computeAllocation,
      artifact,
    });
  }, [actionDrafts, computeAllocation, artifact, game, tableId]);

  // ── Timer auto-submit (auto-parses unparsed text first) ─────────────────
  useEffect(() => {
    if (
      isExpired &&
      phase === "submit" &&
      !isSubmitted &&
      !submitting &&
      !autoSubmittedRef.current
    ) {
      if (parsedActions.length > 0) {
        autoSubmittedRef.current = true;
        setAutoSubmitMessage("Time's up — submitting your actions");
        const timeout = setTimeout(() => {
          void handleSubmit();
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
    if (!isExpired) {
      autoSubmittedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired, phase, isSubmitted, parsedActions.length, submitting, freeText]);

  const handleSubmit = async () => {
    if (parsedActions.length === 0) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitActions({
        tableId,
        gameId,
        roundNumber: game?.currentRound ?? 1,
        roleId: role?.id ?? "",
        actions: parsedActions.map((a) => ({ text: a.text, priority: a.priority, secret: a.secret || undefined })),
        computeAllocation: role && isLabCeo(role) ? computeAllocation : undefined,
        // computeLoans removed — now handled by action request system
        artifact: artifact.trim() || undefined,
      });
      // Send endorsement requests for actions that have targets
      for (const draft of actionDrafts) {
        if (draft.text.trim() && draft.endorseTargets.length > 0) {
          for (const targetRoleId of draft.endorseTargets) {
            const targetRole = enabledRoles.find((r) => r.id === targetRoleId);
            void sendRequest({
              gameId,
              roundNumber: game?.currentRound ?? 1,
              fromRoleId: role?.id ?? "",
              fromRoleName: role?.name ?? "",
              toRoleId: targetRoleId,
              toRoleName: targetRole?.name ?? targetRoleId,
              actionText: draft.text.trim(),
              requestType: "endorsement" as const,
            });
          }
        }
      }
      // Clear draft on successful submit
      if (game) {
        clearDraft(tableId, game.currentRound);
      }
    } catch {
      setSubmitError("Failed to submit. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      setAutoSubmitMessage("");
    }
  };

  // Removed — handleSubmit is now the main submit function above

  if (!game || !table || !round || !role) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white">
        <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
      </div>
    );
  }

  // Sort actions for results: successes first, then failures, then unresolved
  const sortedResultActions = submission?.actions
    ? [...submission.actions].sort((a, b) => {
        if (a.success === true && b.success !== true) return -1;
        if (a.success !== true && b.success === true) return 1;
        if (a.success === false && b.success == null) return -1;
        if (a.success == null && b.success === false) return 1;
        return 0;
      })
    : [];

  return (
    <InAppBrowserGate>
      <div
        className="min-h-dvh bg-off-white pb-[env(safe-area-inset-bottom)] overflow-x-hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-off-white/95 backdrop-blur-sm border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
              <span className="text-[15px] font-bold text-text">{role.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {game.phaseEndsAt && (
                <span className={`text-xs font-mono flex items-center gap-1 ${isUrgent ? "text-viz-danger animate-pulse" : "text-text-muted"}`}>
                  <Clock className="w-3.5 h-3.5" /> {timerDisplay}
                </span>
              )}
              {phase === "submit" && pendingProposalCount > 0 && (
                <span className="text-[10px] bg-viz-warning text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Handshake className="w-3 h-3" /> {pendingProposalCount}
                </span>
              )}
              <span className="text-[11px] text-text-muted font-mono">
                {round.label} — Turn {round.number}/3
              </span>
              <ConnectionIndicator />
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          {/* Draft restored toast */}
          {draftRestored && (
            <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-2.5 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span className="text-xs text-[#0369A1] font-medium">Draft restored from previous session</span>
            </div>
          )}

          {/* Auto-submit message */}
          {autoSubmitMessage && (
            <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-lg p-2.5 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#EA580C] shrink-0" />
              <span className="text-xs text-[#C2410C] font-medium">{autoSubmitMessage}</span>
            </div>
          )}

          {/* Round context card */}
          <div
            className="bg-white rounded-xl p-4 border border-border mb-4 break-words"
            style={{ borderLeftWidth: "3px", borderLeftColor: role.color }}
          >
            <h3 className="text-lg font-bold text-text mb-1">{round.title}</h3>
            <p className="text-sm text-text-muted mb-2 leading-relaxed">{round.narrative}</p>
            <p className="text-sm text-text italic">&ldquo;{role.brief}&rdquo;</p>
          </div>

          {/* DISCUSS phase — improved onboarding */}
          {phase === "discuss" && (
            <div className="bg-white rounded-xl p-5 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-text" />
                <h3 className="text-base font-bold text-text">Your Mission</h3>
              </div>
              <p className="text-sm font-semibold text-text mb-1">{role.name}</p>
              <p className="text-[14px] text-text leading-relaxed mb-1">{role.brief}</p>
              <HowToPlaySection role={role} />
            </div>
          )}

          {/* SUBMIT phase — proposals always visible */}
          {phase === "submit" && (
            <ProposalPanel
              gameId={gameId}
              roundNumber={game.currentRound}
              roleId={role.id}
              roleName={role.name}
            />
          )}

          {/* SUBMIT phase — not yet submitted */}
          {phase === "submit" && !isSubmitted && (
            <>
              {/* Phase transition banner */}
              <div className="bg-navy text-white rounded-xl p-3 mb-4 flex items-center gap-2">
                <Send className="w-4 h-4 shrink-0" />
                <span className="text-sm font-bold">Submissions are open!</span>
                <span className="text-xs text-text-light ml-auto">{timerDisplay} remaining</span>
              </div>

              {/* Compute allocation for lab CEO roles */}
              {isLabCeo(role) && (
                <ComputeAllocation
                  allocation={computeAllocation}
                  onChange={setComputeAllocation}
                  isSubmitted={false}
                  roleName={role.name}
                />
              )}

              {/* Read-only lab allocation for safety leads */}
              {isLabSafety(role) && role.labId && (
                <LabAllocationReadOnly labId={role.labId} labs={game.labs} />
              )}

              {/* Compute for non-lab roles shown as info — loans handled via request system */}
              {hasCompute(role) && !isLabCeo(role) && (table.computeStock ?? 0) > 0 && (
                <div className="bg-white rounded-xl border border-border p-4 mb-4">
                  <h3 className="text-sm font-bold text-text mb-1">Compute Resources</h3>
                  <p className="text-[11px] text-text-muted">
                    You have {table.computeStock}u of compute. Other players can request it via the support request system on their actions.
                  </p>
                </div>
              )}

              {/* Action input — card-based interface */}
              <div className="mb-4">
                <ActionInput
                  actions={actionDrafts}
                  onChange={setActionDrafts}
                  roleId={role.id}
                  roleName={role.name}
                  enabledRoles={enabledRoles}
                  isSubmitted={false}
                />

                {/* Submit button */}
                {parsedActions.length > 0 && (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || parsedActions.length === 0}
                    className="mt-4 w-full py-3.5 bg-navy text-white rounded-lg font-bold text-base
                               disabled:opacity-30 hover:bg-navy-light transition-colors
                               flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Submit Actions
                  </button>
                )}
                {submitError && <p className="text-xs text-viz-danger mt-2 text-center">{submitError}</p>}
              </div>

            </>
          )}

          {/* Submitted state */}
          {isSubmitted && phase === "submit" && (
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-[#ECFDF5] flex items-center justify-center">
                  <Send className="w-3.5 h-3.5 text-[#059669]" />
                </div>
                <span className="text-sm font-bold text-text">Submitted</span>
              </div>
              {submission?.actions.map((a, i) => (
                <ActionCard
                  key={i}
                  action={a}
                  index={i}
                  onPriorityChange={() => {}}
                  onRemove={() => {}}
                  totalPriorityUsed={0}
                  isSubmitted
                />
              ))}
            </div>
          )}

          {/* Rolling / narrate — show results + narrative */}
          {(phase === "rolling" || phase === "narrate") && (
            <div>
              {/* Narrative summary */}
              {phase === "narrate" && round?.summary && (
                <div className="bg-navy rounded-xl p-4 border border-navy-light mb-4 text-white break-words overflow-hidden">
                  <h3 className="text-base font-bold mb-3">{round.label} — What Happened</h3>

                  {round.summary.headlines.map((h, i) => (
                    <p key={i} className="text-sm text-[#E2E8F0] italic mb-1.5 pl-3 border-l-2 border-viz-warning">
                      {h}
                    </p>
                  ))}

                  {round.summary.geopoliticalEvents.length > 0 && (
                    <div className="mt-3">
                      {round.summary.geopoliticalEvents.map((evt, i) => (
                        <p key={i} className="text-sm text-[#CBD5E1] mb-1">
                          {evt}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Own action results — grouped by success/fail */}
              <div className="bg-white rounded-xl border border-border p-4">
                <h3 className="text-sm font-bold text-text mb-3">
                  {phase === "rolling" ? "Resolving..." : "Your Results"}
                </h3>
                {sortedResultActions.map((a, i) => (
                  <ResultActionCard
                    key={i}
                    action={a}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </InAppBrowserGate>
  );
}
