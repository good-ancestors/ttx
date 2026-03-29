"use client";

import { use, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, isLabCeo } from "@/lib/game-data";
import { useCountdown, useKeyboardScroll } from "@/lib/hooks";
import { normaliseActions, emptyAction, type ActionDraft } from "@/components/action-input";
import { loadSampleActions, getSampleActions, pickRandom, type SampleAction, type SampleActionsData } from "@/lib/sample-actions";
import { loadRoleHandouts } from "@/lib/role-handouts";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { usePendingProposalCount } from "@/components/proposals";
import { HowToPlaySection } from "@/components/table/how-to-play-section";
import { TableLobby } from "@/components/table/table-lobby";
import { TableSubmit } from "@/components/table/table-submit";
import { TableResolving } from "@/components/table/table-resolving";
import type { ResultAction } from "@/components/table/result-action-card";
import {
  Loader2,
  Clock,
  Target,
  Handshake,
  AlertTriangle,
  Info,
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

// ─── Main page component ─────────────────────────────────────────────────────

export default function TablePlayerPage({
  params,
}: {
  params: Promise<{ id: string; code: string }>;
}) {
  const { id, code } = use(params);
  const gameId = id as Id<"games">;
  const tableId = code as Id<"tables">;

  // ── Convex queries & mutations ────────────────────────────────────────────
  const game = useQuery(api.games.get, { gameId });
  const table = useQuery(api.tables.get, { tableId });
  const round = useQuery(api.rounds.getCurrent, { gameId });
  const submission = useQuery(api.submissions.getForTable, {
    tableId,
    roundNumber: game?.currentRound ?? 1,
  });

  const submitActions = useMutation(api.submissions.submit);
  const sendRequest = useMutation(api.requests.send);
  const cancelRequest = useMutation(api.requests.cancel);
  const setConnected = useMutation(api.tables.setConnected);
  const updateLabSpecMut = useMutation(api.games.updateLabSpec);
  const allTables = useQuery(api.tables.getByGame, { gameId });
  const allRequests = useQuery(api.requests.getByGameAndRound, {
    gameId,
    roundNumber: game?.currentRound ?? 1,
  });

  // ── Local state ───────────────────────────────────────────────────────────
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([emptyAction()]);
  const freeText = useMemo(() => actionDrafts.map((a) => a.text).join("\n"), [actionDrafts]);
  const parsedActions = useMemo(() => normaliseActions(actionDrafts), [actionDrafts]);
  const [computeAllocation, setComputeAllocation] = useState({
    users: 50,
    capability: 25,
    safety: 25,
  });
  const [artifact, setArtifact] = useState("");
  const [labSpec, setLabSpec] = useState("");
  const [specSaved, setSpecSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [autoSubmitMessage, setAutoSubmitMessage] = useState("");

  const autoSubmittedRef = useRef(false);
  const draftRestoredRef = useRef(false);

  // Sample actions for suggestions
  const [sampleActionsData, setSampleActionsData] = useState<SampleActionsData | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [shownSuggestions, setShownSuggestions] = useState<SampleAction[]>([]);

  useKeyboardScroll();

  // Load sample actions on mount
  useEffect(() => {
    loadSampleActions().then(setSampleActionsData).catch((err) => console.error("Failed to load sample actions:", err));
  }, []);

  // Load role handouts on mount
  const [handoutData, setHandoutData] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    loadRoleHandouts().then(setHandoutData).catch(() => {});
  }, []);

  const { display: timerDisplay, secondsLeft, isUrgent, isExpired } = useCountdown(game?.phaseEndsAt);

  // ── Derived values ────────────────────────────────────────────────────────
  const role = table ? ROLES.find((r) => r.id === table.roleId) : null;
  const enabledRoles = (allTables ?? [])
    .filter((t) => t.enabled && t.roleId !== table?.roleId)
    .map((t) => ({ id: t.roleId, name: t.roleName }));
  const isSubmitted = submission?.status !== undefined && submission.status !== "draft";
  const phase = game?.phase ?? "discuss";

  const pendingProposalCount = usePendingProposalCount(
    gameId,
    game?.currentRound ?? 1,
    role?.id ?? ""
  );

  // ── Session ID for seat conflict detection ────────────────────────────────
  const sessionIdRef = useRef<string>("");
  if (!sessionIdRef.current) {
    const key = `ttx-session-${tableId}`;
    let stored = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
    if (!stored) {
      stored = crypto.randomUUID();
      if (typeof window !== "undefined") sessionStorage.setItem(key, stored);
    }
    sessionIdRef.current = stored;
  }
  const sessionId = sessionIdRef.current;
  const isConflict = table?.activeSessionId && table.activeSessionId !== sessionId && table.connected;

  // ── Connection lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!tableId) return;
    void setConnected({ tableId, connected: true, sessionId });

    const handleDisconnect = () => {
      void setConnected({ tableId, connected: false, sessionId });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") handleDisconnect();
      else void setConnected({ tableId, connected: true, sessionId });
    };
    window.addEventListener("beforeunload", handleDisconnect);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleDisconnect);
      document.removeEventListener("visibilitychange", handleVisibility);
      handleDisconnect();
    };
  }, [tableId, setConnected, sessionId]);

  // ── Initialize compute allocation from role defaults ──────────────────────
  useEffect(() => {
    if (role?.defaultCompute) {
      setComputeAllocation({ ...role.defaultCompute });
    }
  }, [role?.defaultCompute]);

  // ── Initialize lab spec from game data for lab CEOs ───────────────────────
  const labSpecInitRef = useRef(false);
  useEffect(() => {
    if (!game || !role || labSpecInitRef.current) return;
    if (isLabCeo(role)) {
      const lab = game.labs.find((l) => l.roleId === role.id);
      if (lab?.spec) {
        setLabSpec(lab.spec);
        labSpecInitRef.current = true;
      }
    }
  }, [game, role]);

  // ── Draft persistence: restore on mount ─────────────────────────────────
  useEffect(() => {
    if (!game || draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const draft = loadDraft(tableId, game.currentRound);
    if (draft) {
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

  // Auto-clear draft restored message
  useEffect(() => {
    if (!draftRestored) return;
    const timeout = setTimeout(() => setDraftRestored(false), 3000);
    return () => clearTimeout(timeout);
  }, [draftRestored]);

  // ── Draft persistence: save on every change ─────────────────────────────
  useEffect(() => {
    if (!game || !draftRestoredRef.current) return;
    saveDraft(tableId, game.currentRound, {
      freeText: "",
      parsedActions: normaliseActions(actionDrafts),
      computeAllocation,
      artifact,
    });
  }, [actionDrafts, computeAllocation, artifact, game, tableId]);

  // ── Sample suggestions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!sampleActionsData || !role || !game) return;
    const all = getSampleActions(sampleActionsData, role.id, game.currentRound);
    if (all.length === 0) return;
    const shuffled = pickRandom(all, 3);
    setShownSuggestions(shuffled);
  }, [sampleActionsData, role, game?.currentRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-expand ideas when timer low and no actions ─────────────────────
  useEffect(() => {
    if (phase !== "submit" || isSubmitted) return;
    const filledCount = actionDrafts.filter((a) => a.text.trim()).length;
    if (secondsLeft <= 120 && secondsLeft > 0 && filledCount === 0 && !ideasOpen) {
      setIdeasOpen(true);
    }
  }, [secondsLeft, phase, isSubmitted, actionDrafts, ideasOpen]);

  // ── Timer auto-submit ─────────────────────────────────────────────────────
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

  // ── Auto-submit on phase change ───────────────────────────────────────────
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (
      prevPhaseRef.current === "submit" &&
      phase === "rolling" &&
      !isSubmitted &&
      !submitting &&
      !autoSubmittedRef.current &&
      parsedActions.length > 0
    ) {
      autoSubmittedRef.current = true;
      void handleSubmit();
    }
    prevPhaseRef.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleSuggestionTap = useCallback((suggestion: SampleAction) => {
    setActionDrafts((prev) => {
      const activeRoleIds = new Set(enabledRoles.map((r) => r.id));
      const endorseTargets = (suggestion.endorseHint ?? []).filter((id) => activeRoleIds.has(id));
      const newDraft: ActionDraft = {
        text: suggestion.text,
        priority: suggestion.priority,
        secret: suggestion.secret,
        endorseTargets,
      };
      const emptyIdx = prev.findIndex((a) => !a.text.trim());
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = newDraft;
        return next;
      }
      return [...prev, newDraft];
    });
  }, [enabledRoles]);

  const handleSaveSpec = async () => {
    if (!labSpec.trim() || !role || !game) return;
    const lab = game.labs.find((l) => l.roleId === role.id);
    if (!lab) return;
    try {
      await updateLabSpecMut({ gameId, labName: lab.name, spec: labSpec.trim() });
      setSpecSaved(true);
      setTimeout(() => setSpecSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save spec:", err);
    }
  };

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
        artifact: artifact.trim() || undefined,
      });
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

  const handleSendRequest = useCallback((targetRoleId: string, targetRoleName: string, actionText: string) => {
    void sendRequest({
      gameId,
      roundNumber: game?.currentRound ?? 1,
      fromRoleId: role?.id ?? "",
      fromRoleName: role?.name ?? "",
      toRoleId: targetRoleId,
      toRoleName: targetRoleName,
      actionText,
      requestType: "endorsement" as const,
    });
  }, [sendRequest, gameId, game?.currentRound, role?.id, role?.name]);

  const handleCancelRequest = useCallback((targetRoleId: string, actionText: string) => {
    const match = (allRequests ?? []).find(
      (r) => r.fromRoleId === role?.id && r.toRoleId === targetRoleId && r.actionText === actionText
    );
    if (match) {
      void cancelRequest({ requestId: match._id });
    }
  }, [allRequests, role?.id, cancelRequest]);

  // ── Loading & error states ────────────────────────────────────────────────
  const notFound = game === null || table === null || round === null;

  if (notFound) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-off-white gap-3 px-6 text-center">
        <AlertTriangle className="w-10 h-10 text-text-muted" />
        <h1 className="text-lg font-bold text-text">Table not found</h1>
        <p className="text-sm text-text-muted max-w-xs">
          This table no longer exists. The game may have been reset or deleted.
        </p>
      </div>
    );
  }

  if (!game || !table || !round || !role) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white">
        <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
      </div>
    );
  }

  // ── Sort result actions for resolving/narrate phases ──────────────────────
  const sortedResultActions: ResultAction[] = submission?.actions
    ? [...submission.actions].sort((a, b) => {
        if (a.success === true && b.success !== true) return -1;
        if (a.success !== true && b.success === true) return 1;
        if (a.success === false && b.success == null) return -1;
        if (a.success == null && b.success === false) return 1;
        return 0;
      })
    : [];

  // ── Render ────────────────────────────────────────────────────────────────
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
                {round.label} — Turn {round.number}/4
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

          {/* Seat conflict warning */}
          {isConflict && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <div>
                <span className="text-sm text-[#991B1B] font-bold">Another player has taken over this table.</span>
                <p className="text-xs text-[#B91C1C]">If this is a mistake, ask the facilitator for help.</p>
              </div>
            </div>
          )}

          {/* Auto-submit message */}
          {autoSubmitMessage && (
            <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-lg p-2.5 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#EA580C] shrink-0" />
              <span className="text-xs text-[#C2410C] font-medium">{autoSubmitMessage}</span>
            </div>
          )}

          {/* Phase routing */}
          {game.status === "lobby" && (
            <TableLobby
              role={role}
              tableId={tableId}
              aiDisposition={table.aiDisposition}
              handoutData={handoutData}
            />
          )}

          {/* Round context card — only during playing */}
          {game.status === "playing" && (
            <div
              className="bg-white rounded-xl p-4 border border-border mb-4 break-words"
              style={{ borderLeftWidth: "3px", borderLeftColor: role.color }}
            >
              <h3 className="text-lg font-bold text-text mb-1">{round.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">
                {round.number > 1 && round.summary?.narrative
                  ? round.summary.narrative
                  : round.narrative}
              </p>
            </div>
          )}

          {/* Discuss phase */}
          {phase === "discuss" && game.status === "playing" && (
            <div className="bg-white rounded-xl p-5 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-text" />
                <h3 className="text-base font-bold text-text">Your Mission</h3>
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
          )}

          {/* Submit phase */}
          {phase === "submit" && (
            <TableSubmit
              gameId={gameId}
              game={game}
              role={role}
              tableId={tableId}
              aiDisposition={table.aiDisposition}
              computeStock={table.computeStock ?? 0}
              isSubmitted={isSubmitted}
              submittedActions={submission?.actions ?? []}
              timerDisplay={timerDisplay}
              actionDrafts={actionDrafts}
              onActionDraftsChange={setActionDrafts}
              computeAllocation={computeAllocation}
              onComputeAllocationChange={setComputeAllocation}
              labSpec={labSpec}
              onLabSpecChange={(spec) => { setLabSpec(spec); setSpecSaved(false); }}
              specSaved={specSaved}
              onSaveSpec={handleSaveSpec}
              enabledRoles={enabledRoles}
              parsedActions={parsedActions}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
              onSendRequest={handleSendRequest}
              onCancelRequest={handleCancelRequest}
              shownSuggestions={shownSuggestions}
              ideasOpen={ideasOpen}
              onIdeasOpenChange={setIdeasOpen}
              onSuggestionTap={handleSuggestionTap}
            />
          )}

          {/* Rolling / Narrate phases */}
          {(phase === "rolling" || phase === "narrate") && (
            <TableResolving
              gameId={gameId}
              game={game}
              role={role}
              aiDisposition={table.aiDisposition}
              phase={phase}
              round={round}
              sortedResultActions={sortedResultActions}
            />
          )}
        </div>
      </div>
    </InAppBrowserGate>
  );
}
