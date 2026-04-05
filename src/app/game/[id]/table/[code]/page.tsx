"use client";

import { use, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ROLES, isLabCeo, hasCompute, getAiInfluencePower, isSubmittedAction, isResolvingPhase, DEFAULT_ROUND_LABEL, DEFAULT_LABS } from "@/lib/game-data";
import { ComputeAllocation } from "@/components/compute-allocation";
// Lab allocation read-only moved to Lab tab for safety leads
import { useCountdown, useKeyboardScroll, usePageVisibility, useSessionExpiry } from "@/lib/hooks";
import { normaliseActions, emptyAction, type ActionDraft } from "@/components/action-input";
import { loadSampleActions, getSampleActions, pickRandom, type SampleAction, type SampleActionsData } from "@/lib/sample-actions";
import { loadRoleHandouts } from "@/lib/role-handouts";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { TableLobby, DispositionChooser } from "@/components/table/table-lobby";
import { LabSpecEditor } from "@/components/table/lab-spec-editor";
import { TableSubmit } from "@/components/table/table-submit";
import { TableResolving } from "@/components/table/table-resolving";
import { BriefTab } from "@/components/table/brief-tab";
import { RespondTab, RespondResultsTab } from "@/components/table/respond-tab";
import { PlayerTabBar, buildPlayerTabs, type PlayerTab } from "@/components/table/player-tabs";
import type { ResultAction } from "@/components/table/result-action-card";
import {
  Loader2,
  Clock,
  AlertTriangle,
  Info,
  Zap,
  Vote,
  FlaskConical,
} from "lucide-react";

// ─── Draft persistence helpers ────────────────────────────────────────────────

interface DraftData {
  freeText: string;
  parsedActions: { text: string; priority: number }[];
  computeAllocation: { users: number; capability: number; safety: number };
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

/** Read-only lab view shared by submit (non-CEO) and resolving phases. */
function ReadOnlyLabView({ lab, roleName }: { lab: { spec?: string; allocation: { users: number; capability: number; safety: number } }; roleName: string }) {
  return (
    <>
      <LabSpecEditor
        labSpec={lab.spec ?? ""}
        onLabSpecChange={() => {}}
        specSaved={false}
        onSaveSpec={() => {}}
        readOnly
      />
      <ComputeAllocation
        allocation={lab.allocation}
        onChange={() => {}}
        isSubmitted={true}
        roleName={roleName}
      />
    </>
  );
}

/** Shows current lab compute stock and delta from starting value if any loans were received. */
function LabComputeSummary({ lab }: { lab: { name: string; computeStock: number } }) {
  const startingLab = DEFAULT_LABS.find((l) => l.name === lab.name);
  const startingStock = startingLab?.computeStock ?? 0;
  const delta = lab.computeStock - startingStock;
  return (
    <div className="bg-white rounded-xl border border-border p-3 mb-4">
      <p className="text-sm font-bold text-text">
        Lab Compute: {lab.computeStock}u
      </p>
      {delta !== 0 && (
        <p className="text-xs text-text-muted mt-0.5">
          (base {startingStock}u {delta > 0 ? "+" : ""}{delta}u {delta > 0 ? "loaned" : "spent"})
        </p>
      )}
    </div>
  );
}

/** Cancel endorsement requests for drafts being discarded. */
function cancelDraftEndorsements(
  drafts: ActionDraft[],
  allRequests: Doc<"requests">[] | undefined,
  roleId: string | undefined,
  cancelFn: (args: { requestId: Id<"requests"> }) => unknown,
) {
  for (const draft of drafts.filter((a) => a.text.trim())) {
    for (const targetId of new Set(draft.endorseTargets)) {
      const match = (allRequests ?? []).find(
        (r) => r.fromRoleId === roleId && r.toRoleId === targetId && r.actionText === draft.text.trim()
      );
      if (match) void cancelFn({ requestId: match._id });
    }
  }
}

/** Map the Nth submitted action back to its actual index in the actions array. */
function nthSubmittedIndex(actions: { actionStatus: string }[], n: number): number {
  let count = 0;
  for (let i = 0; i < actions.length; i++) {
    if (isSubmittedAction(actions[i])) {
      if (count === n) return i;
      count++;
    }
  }
  return -1;
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

  const isVisible = usePageVisibility();
  useSessionExpiry(`ttx-session-expiry-${tableId}`, "/");

  // ── Convex queries & mutations ────────────────────────────────────────────
  // games.get and tables.get are always subscribed — lightweight, needed for phase detection
  const game = useQuery(api.games.get, { gameId });
  const table = useQuery(api.tables.get, { tableId });
  // Everything else only when tab is visible
  // Round is always subscribed — needed for loading guard + header display
  const round = useQuery(api.rounds.getCurrent, { gameId });
  const submission = useQuery(api.submissions.getForTable,
    isVisible ? { tableId, roundNumber: game?.currentRound ?? 1 } : "skip"
  );

  const saveAndSubmitMut = useMutation(api.submissions.saveAndSubmit);
  const editSubmittedMut = useMutation(api.submissions.editSubmitted);
  const deleteActionMut = useMutation(api.submissions.deleteAction);
  const sendRequest = useMutation(api.requests.send);
  const cancelRequest = useMutation(api.requests.cancel);
  const setConnected = useMutation(api.tables.setConnected);
  const updateLabSpecMut = useMutation(api.games.updateLabSpec);
  // Lightweight query — only enabled tables' roleId/roleName (for endorsement targets)
  const allTables = useQuery(api.tables.getEnabledRoleNames, isVisible ? { gameId } : "skip");
  // Compute overview — visible to all players during gameplay (replicates physical compute tokens)
  const computeOverview = useQuery(api.tables.getComputeOverview,
    isVisible && game?.status === "playing" ? { gameId } : "skip"
  );
  // Requests only needed during submit phase (endorsement tracking + cleanup)
  const allRequests = useQuery(api.requests.getByGameAndRound,
    isVisible && game?.status === "playing"
      ? { gameId, roundNumber: game?.currentRound ?? 1 }
      : "skip"
  );

  // ── Local state ───────────────────────────────────────────────────────────
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([emptyAction()]);
  const [computeAllocation, setComputeAllocation] = useState({
    users: 50,
    capability: 25,
    safety: 25,
  });
  const [artifact, setArtifact] = useState("");
  const [labSpec, setLabSpec] = useState("");
  const [specSaved, setSpecSaved] = useState(false);
  const [specSaveError, setSpecSaveError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [autoSubmitMessage, setAutoSubmitMessage] = useState("");
  const [activeTab, setActiveTab] = useState<PlayerTab>("brief");

  const autoSubmittedRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const lastRoundRef = useRef<number | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sample actions for suggestions
  const [sampleActionsData, setSampleActionsData] = useState<SampleActionsData | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);

  useKeyboardScroll();

  // Load sample actions on mount
  useEffect(() => {
    loadSampleActions().then(setSampleActionsData).catch((err) => console.error("Failed to load sample actions:", err));
  }, []);

  // Load role handouts on mount
  const [handoutData, setHandoutData] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    // Fire-and-forget: handout data is supplementary, failure is non-critical
    loadRoleHandouts().then(setHandoutData).catch(() => {});
  }, []);

  const { display: timerDisplay, secondsLeft, isUrgent, isExpired } = useCountdown(game?.phaseEndsAt);

  // ── Derived values ────────────────────────────────────────────────────────
  const role = table ? ROLES.find((r) => r.id === table.roleId) : null;
  const enabledRoles = useMemo(() =>
    (allTables ?? [])
      .filter((t) => t.roleId !== table?.roleId)
      .map((t) => ({ id: t.roleId, name: t.roleName })),
    [allTables, table?.roleId]
  );
  // Compute recipients: other enabled roles with has-compute tag (for direct transfers)
  const computeRecipients = useMemo(() =>
    (allTables ?? [])
      .filter((t) => {
        if (t.roleId === table?.roleId) return false;
        const r = ROLES.find((entry) => entry.id === t.roleId);
        return r && hasCompute(r);
      })
      .map((t) => ({ id: t.roleId, name: t.roleName })),
    [allTables, table?.roleId]
  );
  const isSubmitted = submission?.status !== undefined && submission.status !== "draft";
  const phase = game?.phase ?? "discuss";
  const isAiSystem = role?.tags.includes("ai-system") ?? false;
  const submissionsClosed = phase === "submit" && isExpired;
  const currentLab = game?.labs.find((lab) => lab.roleId === role?.id)
    ?? (role?.labId ? game?.labs.find((lab) => lab.name.toLowerCase() === role.labId) : undefined);
  // isLabCeo used for compute/spec editor rendering inside Lab tab

  const pendingProposalCount = useMemo(
    () => (allRequests ?? []).filter(p => p.toRoleId === role?.id && p.status === "pending").length,
    [allRequests, role?.id]
  );

  // ── Auto-switch to "actions" when submissions open ────────────────────────
  const prevPhaseForTabRef = useRef(phase);
  useEffect(() => {
    if (phase === "submit" && prevPhaseForTabRef.current !== "submit") {
      setActiveTab("actions");
    }
    if (isResolvingPhase(phase) && prevPhaseForTabRef.current !== phase) {
      setActiveTab("actions");
    }
    prevPhaseForTabRef.current = phase;
  }, [phase]);

  // ── Session ID for seat conflict detection ────────────────────────────────
  const [sessionId] = useState(() => {
    const key = `ttx-session-${tableId}`;
    let stored = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
    if (!stored) {
      stored = crypto.randomUUID();
      if (typeof window !== "undefined") sessionStorage.setItem(key, stored);
    }
    return stored;
  });
  const isConflict = table?.activeSessionId && table.activeSessionId !== sessionId;

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
          secret: !!a.secret, endorseTargets: [], computeTargets: [],
        })));
      } else if (draft.freeText?.trim()) {
        setActionDrafts([{ text: draft.freeText, priority: "medium" as const, secret: false, endorseTargets: [], computeTargets: [] }]);
      }
      if (draft.computeAllocation) setComputeAllocation(draft.computeAllocation);
      if (draft.artifact) setArtifact(draft.artifact);
      setDraftRestored(true);
    }
  }, [game, tableId]);

  // ── Reset form when round advances ─────────────────────────────────────
  // Refs for values read inside the effect but that should not trigger it.
  // Synced via effects to satisfy react-compiler's no-ref-writes-during-render rule.
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);
  const roleRef = useRef(role);
  useEffect(() => { roleRef.current = role; }, [role]);

  const currentRound = game?.currentRound;
  useEffect(() => {
    if (currentRound == null) return;
    if (lastRoundRef.current !== null && lastRoundRef.current !== currentRound) {
      // Round changed — clear form state and allow draft restore for new round
      setActionDrafts([emptyAction()]);
      setArtifact("");
      setSubmitError("");
      setSpecSaveError("");
      setAutoSubmitMessage("");
      autoSubmittedRef.current = false;
      draftRestoredRef.current = false;
      setActiveTab("brief");
      // Reload compute allocation from current game state (not defaults)
      const currentRole = roleRef.current;
      const currentGame = gameRef.current;
      if (currentRole && currentGame) {
        const lab = currentGame.labs.find((l) => l.roleId === currentRole.id);
        if (lab?.allocation) {
          setComputeAllocation({ ...lab.allocation });
        }
      }
    }
    lastRoundRef.current = currentRound;
  }, [currentRound]);

  // Auto-clear draft restored message
  useEffect(() => {
    if (!draftRestored) return;
    const timeout = setTimeout(() => setDraftRestored(false), 3000);
    return () => clearTimeout(timeout);
  }, [draftRestored]);

  // ── Draft persistence: save on change (debounced) ───────────────────────
  useEffect(() => {
    if (!game || !draftRestoredRef.current) return;
    clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft(tableId, game.currentRound, {
        freeText: "",
        parsedActions: normaliseActions(actionDrafts),
        computeAllocation,
        artifact,
      });
    }, 500);
    return () => clearTimeout(draftSaveTimer.current);
  }, [actionDrafts, computeAllocation, artifact, game, tableId]);

  // ── Sample suggestions ──────────────────────────────────────────────────
  const [shownSuggestions, setShownSuggestions] = useState<SampleAction[]>([]);
  useEffect(() => {
    if (!sampleActionsData || !role || currentRound == null) return;
    const all = getSampleActions(sampleActionsData, role.id, currentRound);
    if (all.length === 0) return;
    setShownSuggestions(pickRandom(all, 3));
  }, [sampleActionsData, role, currentRound]);

  // ── Auto-expand ideas when timer low and no actions ─────────────────────
  useEffect(() => {
    if (phase !== "submit" || isSubmitted) return;
    const filledCount = actionDrafts.filter((a) => a.text.trim()).length;
    if (secondsLeft <= 120 && secondsLeft > 0 && filledCount === 0 && !ideasOpen) {
      setIdeasOpen(true);
    }
  }, [secondsLeft, phase, isSubmitted, actionDrafts, ideasOpen]);

  // ── Timer expired: discard remaining drafts (only submitted actions count) ─
  useEffect(() => {
    if (
      isExpired &&
      phase === "submit" &&
      !autoSubmittedRef.current
    ) {
      const draftWithText = actionDrafts.filter((a) => a.text.trim());
      if (draftWithText.length > 0) {
        autoSubmittedRef.current = true;
        setAutoSubmitMessage("Time\u2019s up \u2014 only submitted actions will count");
        cancelDraftEndorsements(draftWithText, allRequests, role?.id, cancelRequest);
        setActionDrafts([emptyAction()]);
      }
    }
    if (!isExpired) {
      autoSubmittedRef.current = false;
    }
  }, [isExpired, phase, actionDrafts, allRequests, role?.id, cancelRequest]);

  // ── Phase change (submit → rolling): discard remaining drafts ──────────
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (
      prevPhaseRef.current === "submit" &&
      phase === "rolling" &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      cancelDraftEndorsements(actionDrafts, allRequests, role?.id, cancelRequest);
      setActionDrafts([emptyAction()]);
    }
    prevPhaseRef.current = phase;
  }, [phase, actionDrafts, allRequests, role?.id, cancelRequest]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleSuggestionTap = useCallback((suggestion: SampleAction) => {
    setActionDrafts((prev) => {
      const newDraft: ActionDraft = {
        text: suggestion.text,
        priority: suggestion.priority,
        secret: suggestion.secret,
        endorseTargets: [],
        computeTargets: [],
      };
      const emptyIdx = prev.findIndex((a) => !a.text.trim());
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = newDraft;
        return next;
      }
      return [...prev, newDraft];
    });
  }, []);

  const handleSaveSpec = async () => {
    if (!labSpec.trim() || !role || !game) return;
    const lab = game.labs.find((l) => l.roleId === role.id);
    if (!lab) return;
    setSpecSaveError("");
    try {
      await updateLabSpecMut({ gameId, labName: lab.name, spec: labSpec.trim() });
      setSpecSaved(true);
      setTimeout(() => setSpecSaved(false), 2000);
    } catch (err) {
      setSpecSaveError(`Failed to save spec: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // ─── Per-action handlers ────────────────────────────────────────────────────

  const handleSubmitAction = useCallback(async (draftIndex: number) => {
    const draft = actionDrafts[draftIndex];
    if (!draft?.text.trim() || !role || !game) return;
    setSubmitError("");
    try {
      // Save + submit in a single mutation (avoids two round-trips)
      await saveAndSubmitMut({
        tableId,
        gameId,
        roundNumber: game.currentRound,
        roleId: role.id,
        text: draft.text.trim(),
        priority: 1, // Rank assigned server-side based on submission order
        secret: draft.secret || undefined,
      });
      // Remove from local drafts
      setActionDrafts((prev) => {
        const next = prev.filter((_, i) => i !== draftIndex);
        return next.length === 0 ? [emptyAction()] : next;
      });
      // Send endorsement requests
      for (const targetId of new Set(draft.endorseTargets)) {
        const targetRole = (allTables ?? []).find((t) => t.roleId === targetId);
        if (targetRole) {
          void sendRequest({
            gameId,
            roundNumber: game.currentRound,
            fromRoleId: role.id,
            fromRoleName: role.name,
            toRoleId: targetId,
            toRoleName: targetRole.roleName,
            actionText: draft.text.trim(),
            requestType: "endorsement" as const,
          });
        }
      }
      // Send compute requests
      for (const target of draft.computeTargets) {
        const targetRole = (allTables ?? []).find((t) => t.roleId === target.roleId);
        if (targetRole) {
          void sendRequest({
            gameId,
            roundNumber: game.currentRound,
            fromRoleId: role.id,
            fromRoleName: role.name,
            toRoleId: target.roleId,
            toRoleName: targetRole.roleName,
            actionText: draft.text.trim(),
            requestType: "compute" as const,
            computeAmount: target.amount,
          });
        }
      }
    } catch (err) {
      setSubmitError(`Failed to submit action: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [actionDrafts, role, game, tableId, gameId, saveAndSubmitMut, sendRequest, allTables]);

  const handleEditAction = useCallback(async (submittedIndex: number) => {
    if (!submission) return;
    setSubmitError("");
    try {
      const actualIndex = nthSubmittedIndex(submission.actions, submittedIndex);
      if (actualIndex === -1) return;
      const action = submission.actions[actualIndex];
      await editSubmittedMut({ submissionId: submission._id, actionIndex: actualIndex });
      setActionDrafts((prev) => [
        ...prev.filter((a) => a.text.trim()),
        { text: action.text, priority: "medium" as const, secret: !!action.secret, endorseTargets: [], computeTargets: [] },
      ]);
    } catch (err) {
      setSubmitError(`Failed to edit: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [submission, editSubmittedMut]);

  const handleDeleteAction = useCallback(async (submittedIndex: number) => {
    if (!submission) return;
    setSubmitError("");
    try {
      const actualIndex = nthSubmittedIndex(submission.actions, submittedIndex);
      if (actualIndex === -1) return;
      await deleteActionMut({ submissionId: submission._id, actionIndex: actualIndex });
    } catch (err) {
      setSubmitError(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [submission, deleteActionMut]);

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

  if (!game || !table || !role || (game.status === "playing" && !round)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white">
        <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
      </div>
    );
  }

  // ── Sort result actions for resolving/narrate phases ──────────────────────
  const sortedResultActions: ResultAction[] = submission?.actions
    ? [...submission.actions]
        .filter((action) => isSubmittedAction(action))
        .sort((a, b) => {
        if (a.success === true && b.success !== true) return -1;
        if (a.success !== true && b.success === true) return 1;
        if (a.success === false && b.success == null) return -1;
        if (a.success == null && b.success === false) return 1;
        return 0;
      })
    : [];

  // ── Tab config ────────────────────────────────────────────────────────────
  const showTabs = game.status === "playing";
  // CEO roles have full lab control (edit allocation, spec); safety leads get read-only access
  const controlsLab = game.labs.some(l => l.roleId === role.id);
  const hasLabAccess = controlsLab || (
    !!role.labId && game.labs.some(l => l.name.toLowerCase() === role.labId)
  );
  const tabs = buildPlayerTabs(role, phase, pendingProposalCount, hasLabAccess);

  // Previous round narrative for the brief tab
  const roundNarrative = round?.summary?.narrative;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <InAppBrowserGate>
      <div
        className={`min-h-dvh bg-off-white overflow-x-hidden ${showTabs ? "pb-16" : ""}`}
        style={{ paddingBottom: showTabs ? "max(64px, calc(64px + env(safe-area-inset-bottom)))" : "max(env(safe-area-inset-bottom), 20px)" }}
      >
        {/* Header — fixed so it's always visible */}
        <div className="fixed top-0 left-0 right-0 z-10 bg-off-white/95 backdrop-blur-sm border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
              <span className="text-[15px] font-bold text-text">{role.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {hasCompute(role) && (currentLab?.computeStock ?? table.computeStock) != null && (
                <span className="text-xs font-mono text-text-muted flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" /> {currentLab?.computeStock ?? table.computeStock ?? 0}u
                </span>
              )}
              {game.phaseEndsAt && (
                <span
                  className={`text-xs font-mono flex items-center gap-1 ${isUrgent ? "text-viz-danger animate-pulse" : "text-text-muted"}`}
                  role="timer"
                  aria-label={`${timerDisplay} remaining`}
                >
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {timerDisplay}
                </span>
              )}
              <span className="text-[11px] text-text-muted font-mono">
                {round?.label ?? DEFAULT_ROUND_LABEL} — Turn {round?.number ?? 1}/4
              </span>
              <ConnectionIndicator />
            </div>
          </div>
        </div>

        <div className="px-4 pt-16">
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

          {/* ── Phase routing ── */}

          {/* Lobby */}
          {game.status === "lobby" && (
            <TableLobby
              role={role}
              tableId={tableId}
              aiDisposition={table.aiDisposition}
              handoutData={handoutData}
            />
          )}

          {/* Discuss phase — tab content */}
          {phase === "discuss" && game.status === "playing" && (
            <>
              {/* AI Systems disposition chooser (blocker) */}
              {isAiSystem && !table.aiDisposition && (
                <DispositionChooser tableId={tableId} onChosen={() => {}} />
              )}
              {activeTab === "brief" && (
                <BriefTab
                  role={role}
                  handoutData={handoutData}
                  aiDisposition={table.aiDisposition}
                  roundNarrative={roundNarrative}
                  roundLabel={round?.label ?? DEFAULT_ROUND_LABEL}
                  submissionsOpen={false}
                  labs={game.labs}
                  computeOverview={computeOverview ?? undefined}
                  gameStatus={game.status}
                />
              )}
              {activeTab === "actions" && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Zap className="w-10 h-10 text-border mb-3" />
                  <p className="text-sm font-bold text-text mb-1">Actions</p>
                  <p className="text-xs text-text-muted max-w-xs">When the facilitator opens submissions, you&apos;ll draft and submit your actions here.</p>
                </div>
              )}
              {activeTab === "respond" && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Vote className="w-10 h-10 text-border mb-3" />
                  <p className="text-sm font-bold text-text mb-1">Respond</p>
                  <p className="text-xs text-text-muted max-w-xs">When other players submit actions, you&apos;ll be able to support or oppose them here.</p>
                </div>
              )}
              {activeTab === "lab" && hasLabAccess && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FlaskConical className="w-10 h-10 text-border mb-3" />
                  <p className="text-sm font-bold text-text mb-1">Lab Controls</p>
                  <p className="text-xs text-text-muted max-w-xs">
                    {controlsLab
                      ? "When submissions open, you\u2019ll set your compute allocation and lab spec here."
                      : "When submissions open, you\u2019ll be able to view your lab\u2019s data here."}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Submit phase — tabbed UI */}
          {phase === "submit" && (
            <>
              {/* AI Systems disposition chooser (blocker) */}
              {isAiSystem && !table.aiDisposition && (
                <DispositionChooser tableId={tableId} onChosen={() => {}} />
              )}

              {activeTab === "brief" && (
                <BriefTab
                  role={role}
                  handoutData={handoutData}
                  aiDisposition={table.aiDisposition}
                  roundNarrative={roundNarrative}
                  roundLabel={round?.label ?? DEFAULT_ROUND_LABEL}
                  submissionsOpen={true}
                  labs={game.labs}
                  computeOverview={computeOverview ?? undefined}
                  gameStatus={game.status}
                />
              )}

              {activeTab === "actions" && (
                <TableSubmit
                  game={game}
                  gameId={gameId}
                  tableId={table._id}
                  role={role}
                  submittedActions={submission?.actions ?? []}
                  isExpired={isExpired}
                  computeStock={currentLab?.computeStock ?? table.computeStock ?? undefined}
                  computeRecipients={computeRecipients}
                  actionDrafts={actionDrafts}
                  onActionDraftsChange={setActionDrafts}
                  enabledRoles={enabledRoles}
                  onSubmitAction={handleSubmitAction}
                  onEditAction={handleEditAction}
                  onDeleteAction={handleDeleteAction}
                  submitError={submitError}
                  shownSuggestions={shownSuggestions}
                  ideasOpen={ideasOpen}
                  onIdeasOpenChange={setIdeasOpen}
                  onSuggestionTap={handleSuggestionTap}
                />
              )}

              {activeTab === "respond" && (
                <RespondTab
                  gameId={gameId}
                  roundNumber={game.currentRound}
                  roleId={role.id}
                  isAiSystem={isAiSystem}
                  aiInfluencePower={getAiInfluencePower(game.labs)}
                  allRequests={allRequests}
                  allowEdits={!submissionsClosed}
                />
              )}

              {activeTab === "lab" && controlsLab && currentLab && (
                <>
                  <LabComputeSummary lab={currentLab} />
                  <LabSpecEditor
                    labSpec={labSpec}
                    onLabSpecChange={(spec) => { setLabSpec(spec); setSpecSaved(false); setSpecSaveError(""); }}
                    specSaved={specSaved}
                    onSaveSpec={() => void handleSaveSpec()}
                  />
                  {specSaveError && (
                    <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-2.5 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                      <span className="text-xs text-[#991B1B] font-medium">{specSaveError}</span>
                    </div>
                  )}
                  <ComputeAllocation
                    allocation={computeAllocation}
                    onChange={setComputeAllocation}
                    isSubmitted={false}
                    roleName={role.name}
                  />
                </>
              )}
              {activeTab === "lab" && !controlsLab && hasLabAccess && currentLab && (
                <>
                  <LabComputeSummary lab={currentLab} />
                  <ReadOnlyLabView lab={currentLab} roleName={role.name} />
                </>
              )}
            </>
          )}

          {/* Rolling / Narrate phases */}
          {isResolvingPhase(phase) && round && (
            <>
              {activeTab === "brief" && (
                <TableResolving
                  phase={phase}
                  round={round}
                  sortedResultActions={sortedResultActions}
                  showResults={false}
                />
              )}

              {activeTab === "actions" && (
                <TableResolving
                  phase={phase}
                  round={round}
                  sortedResultActions={sortedResultActions}
                  showNarrative={false}
                />
              )}

              {activeTab === "respond" && (
                <RespondResultsTab
                  gameId={gameId}
                  roundNumber={game.currentRound}
                  roleId={role.id}
                  isAiSystem={isAiSystem}
                  allRequests={allRequests ?? []}
                />
              )}

              {activeTab === "lab" && hasLabAccess && currentLab && (
                <>
                  <LabComputeSummary lab={currentLab} />
                  <ReadOnlyLabView lab={currentLab} roleName={role.name} />
                </>
              )}
            </>
          )}
        </div>

        {/* Tab bar — only during submit phase */}
        {showTabs && (
          <PlayerTabBar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
      </div>
    </InAppBrowserGate>
  );
}
