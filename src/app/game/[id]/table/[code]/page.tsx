"use client";

import { use, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLE_MAP, isLabCeo, hasCompute, isSubmittedAction, isResolvingPhase, DEFAULT_ROUND_LABEL, DEFAULT_LABS } from "@/lib/game-data";
import { useCountdown, useKeyboardScroll, usePageVisibility, useSessionExpiry, getOrCreateId } from "@/lib/hooks";
import { normaliseActions, emptyAction, type ActionDraft, type ComputeTarget } from "@/components/action-input";
import { loadSampleActions, getSampleActions, pickRandom, type SampleAction, type SampleActionsData } from "@/lib/sample-actions";
import { loadRoleHandouts, type HandoutData } from "@/lib/role-handouts";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { PlayerTabBar, buildPlayerTabs, type PlayerTab } from "@/components/table/player-tabs";
import { PhaseContent } from "@/components/table/phase-content";
import type { ResultAction } from "@/components/table/result-action-card";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Clock,
  AlertTriangle,
  Info,
  Zap,
  LogOut,
} from "lucide-react";

// ─── Draft persistence helpers ────────────────────────────────────────────────

interface DraftData {
  freeText: string;
  parsedActions: { text: string; priority: number }[];
  computeAllocation: { users: number; capability: number; safety: number };
  artifact: string;
  labSpec?: string;
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

/** Cancel endorsement requests for drafts being discarded. */

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
  const router = useRouter();

  const isVisible = usePageVisibility();
  useSessionExpiry(`ttx-session-expiry-${tableId}`, "/");

  // ── Convex queries & mutations ────────────────────────────────────────────
  // Player-facing game query excludes pipelineStatus to avoid re-renders during resolve
  const game = useQuery(api.games.getForPlayer, { gameId });
  const table = useQuery(api.tables.get, { tableId });
  // Everything else only when tab is visible
  // Lightweight player round query — takes roundNumber to avoid reading games doc
  const round = useQuery(api.rounds.getForPlayer,
    game ? { gameId, roundNumber: game.currentRound } : "skip"
  );
  const submission = useQuery(api.submissions.getForTable,
    isVisible ? { tableId, roundNumber: game?.currentRound ?? 1 } : "skip"
  );

  const saveAndSubmitMut = useMutation(api.submissions.saveAndSubmit);
  const editSubmittedMut = useMutation(api.submissions.editSubmitted);
  const deleteActionMut = useMutation(api.submissions.deleteAction);
  const setConnected = useMutation(api.tables.setConnected);
  const leaveRole = useMutation(api.tables.leaveRole);
  const updateLabSpecMut = useMutation(api.games.updateLabSpec);
  const saveComputeAllocationMut = useMutation(api.submissions.saveComputeAllocation);
  // Lightweight query — only enabled tables' roleId/roleName (for endorsement targets)
  const allTables = useQuery(api.tables.getEnabledRoleNames, isVisible ? { gameId } : "skip");
  // Compute overview — only subscribes to tables (not games doc)
  const computeOverview = useQuery(api.tables.getComputeOverview,
    isVisible && game?.status === "playing" ? { gameId } : "skip"
  );
  // Per-role requests — only this player's sent/received, not all 50+ for the round
  const allRequests = useQuery(api.requests.getForRole,
    isVisible && game?.status === "playing" && table
      ? { gameId, roundNumber: game?.currentRound ?? 1, roleId: table.roleId }
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
  const ideasAutoOpenedRef = useRef(false);

  useKeyboardScroll();

  // Load sample actions on mount
  useEffect(() => {
    loadSampleActions().then(setSampleActionsData).catch((err) => console.error("Failed to load sample actions:", err));
  }, []);

  // Load role handouts on mount
  const [handoutData, setHandoutData] = useState<HandoutData | null>(null);
  useEffect(() => {
    // Fire-and-forget: handout data is supplementary, failure is non-critical
    loadRoleHandouts().then(setHandoutData).catch(() => {});
  }, []);

  const { display: timerDisplay, secondsLeft, isUrgent, isExpired } = useCountdown(game?.phaseEndsAt);

  // ── Derived values ────────────────────────────────────────────────────────
  const role = table ? ROLE_MAP.get(table.roleId) ?? null : null;
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
        const r = ROLE_MAP.get(t.roleId);
        return r && hasCompute(r);
      })
      .map((t) => {
        // table.computeStock is the single source of truth for all roles (including lab CEOs)
        const stock = computeOverview?.roles.find((o) => o.roleId === t.roleId)?.computeStock ?? 0;
        return { id: t.roleId, name: t.roleName, computeStock: stock };
      }),
    [allTables, table?.roleId, computeOverview]
  );
  const isSubmitted = submission?.status !== undefined && submission.status !== "draft";
  const phase = game?.phase ?? "discuss";
  const isAiSystem = role?.tags.includes("ai-system") ?? false;
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
  const [sessionId] = useState(() =>
    typeof window !== "undefined" ? getOrCreateId(sessionStorage, `ttx-session-${tableId}`) : ""
  );
  const isConflict = table?.activeSessionId && table.activeSessionId !== sessionId;

  // ── Connection lifecycle ──────────────────────────────────────────────────
  // Only disconnect on beforeunload (page close / navigation away) — NOT on
  // visibilitychange. Tab switches fire visibilitychange aggressively (especially
  // on mobile: switching apps, notifications, lock screen) and each toggle
  // writes to Convex (2 mutations × 30 players × frequent switches = hundreds
  // of pointless writes per round). The `connected` field is cosmetic — no game
  // mechanic depends on it. Submission status is the real "is this player done" signal.
  useEffect(() => {
    if (!tableId) return;
    void setConnected({ tableId, connected: true, sessionId });

    const handleDisconnect = () => {
      void setConnected({ tableId, connected: false, sessionId });
    };
    window.addEventListener("beforeunload", handleDisconnect);
    return () => {
      window.removeEventListener("beforeunload", handleDisconnect);
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
      if (lab?.spec !== undefined) {
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
      if (draft.labSpec !== undefined) {
        setLabSpec(draft.labSpec);
        labSpecInitRef.current = true;
      }
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
      setAutoSubmitMessage("");
      autoSubmittedRef.current = false;
      draftRestoredRef.current = false;
      ideasAutoOpenedRef.current = false;
      setActiveTab("brief");
      // Reload compute allocation and lab spec from current game state
      const currentRole = roleRef.current;
      const currentGame = gameRef.current;
      if (currentRole && currentGame) {
        const lab = currentGame.labs.find((l) => l.roleId === currentRole.id);
        if (lab?.allocation) {
          setComputeAllocation({ ...lab.allocation });
        }
        if (isLabCeo(currentRole) && lab?.spec !== undefined) {
          setLabSpec(lab.spec);
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
        labSpec,
      });
    }, 500);
    return () => clearTimeout(draftSaveTimer.current);
  }, [actionDrafts, computeAllocation, artifact, labSpec, game, tableId]);

  // ── Sample suggestions ──────────────────────────────────────────────────
  const [shownSuggestions, setShownSuggestions] = useState<SampleAction[]>([]);
  useEffect(() => {
    if (!sampleActionsData || !role || currentRound == null) return;
    const all = getSampleActions(sampleActionsData, role.id, currentRound);
    if (all.length === 0) return;
    setShownSuggestions(pickRandom(all, 3));
  }, [sampleActionsData, role, currentRound]);

  // ── Auto-expand ideas when timer low and no actions (once per round) ────
  useEffect(() => {
    if (phase !== "submit" || isSubmitted || ideasAutoOpenedRef.current) return;
    const filledCount = actionDrafts.filter((a) => a.text.trim()).length;
    if (secondsLeft <= 120 && secondsLeft > 0 && filledCount === 0) {
      ideasAutoOpenedRef.current = true;
      setIdeasOpen(true);
    }
  }, [secondsLeft, phase, isSubmitted, actionDrafts]);

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
        setActionDrafts([emptyAction()]);
      }
    }
    if (!isExpired) {
      autoSubmittedRef.current = false;
    }
  }, [isExpired, phase, actionDrafts]);

  // ── Phase change (submit → rolling): discard remaining drafts ──────────
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (
      prevPhaseRef.current === "submit" &&
      phase === "rolling" &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      setActionDrafts([emptyAction()]);
    }
    prevPhaseRef.current = phase;
  }, [phase, actionDrafts]);

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

  const handleLabSpecChange = useCallback((spec: string) => {
    setLabSpec(spec);
    setSpecSaved(false);
  }, []);

  const handleSaveSpec = useCallback(async () => {
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
  }, [labSpec, role, game, gameId, updateLabSpecMut]);

  const [allocationSaved, setAllocationSaved] = useState(false);
  const handleSaveAllocation = useCallback(async () => {
    if (!role || !game) return;
    try {
      await saveComputeAllocationMut({
        tableId,
        gameId,
        roundNumber: game.currentRound,
        roleId: role.id,
        computeAllocation,
      });
      setAllocationSaved(true);
      setTimeout(() => setAllocationSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save allocation:", err);
    }
  }, [role, game, tableId, gameId, computeAllocation, saveComputeAllocationMut]);

  // ─── Per-action handlers ────────────────────────────────────────────────────

  const handleSubmitAction = useCallback(async (draftIndex: number) => {
    const draft = actionDrafts[draftIndex];
    if (!draft?.text.trim() || !role || !game) return;
    setSubmitError("");
    try {
      await saveAndSubmitMut({
        tableId,
        gameId,
        roundNumber: game.currentRound,
        roleId: role.id,
        text: draft.text.trim(),
        priority: 1,
        secret: draft.secret || undefined,
        computeTargets: draft.computeTargets.length > 0 ? draft.computeTargets : undefined,
        endorseTargets: draft.endorseTargets.length > 0 ? [...new Set(draft.endorseTargets)] : undefined,
      });
      // Remove from local drafts
      setActionDrafts((prev) => {
        const next = prev.filter((_, i) => i !== draftIndex);
        return next.length === 0 ? [emptyAction()] : next;
      });
    } catch (err) {
      setSubmitError(`Failed to submit action: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [actionDrafts, role, game, tableId, gameId, saveAndSubmitMut]);

  // ── Sent requests grouped by actionId (stable across text edits) ────
  const sentRequestsByAction = useMemo(() => {
    if (!allRequests || !role) return undefined;
    const map = new Map<string, { toRoleName: string; requestType: "endorsement" | "compute"; computeAmount?: number; status: "pending" | "accepted" | "declined" }[]>();
    for (const req of allRequests) {
      if (req.fromRoleId !== role.id) continue;
      // Key by actionId (stable) when available, fall back to actionText for legacy
      const key = req.actionId ?? req.actionText;
      const list = map.get(key) ?? [];
      list.push({
        toRoleName: req.toRoleName,
        requestType: req.requestType,
        computeAmount: req.computeAmount,
        status: req.status,
      });
      map.set(key, list);
    }
    return map;
  }, [allRequests, role]);

  const handleEditAction = useCallback(async (submittedIndex: number) => {
    if (!submission) return;
    setSubmitError("");
    try {
      const actualIndex = nthSubmittedIndex(submission.actions, submittedIndex);
      if (actualIndex === -1) return;
      const action = submission.actions[actualIndex];

      // Warn if editing will cancel accepted compute requests
      const existingRequests = sentRequestsByAction?.get(action.actionId ?? action.text) ?? [];
      const hasAcceptedCompute = existingRequests.some(
        (r) => r.requestType === "compute" && r.status === "accepted"
      );
      const hasComputeTargets = action.computeTargets && action.computeTargets.length > 0;
      if (hasAcceptedCompute || hasComputeTargets) {
        const confirmed = window.confirm(
          "Editing this action will cancel any accepted compute requests and refund escrowed compute. Continue?"
        );
        if (!confirmed) return;
      }

      await editSubmittedMut({ submissionId: submission._id, actionIndex: actualIndex });

      // Restore endorsement/compute targets from existing requests
      const actionRequests = sentRequestsByAction?.get(action.actionId ?? action.text) ?? [];
      const endorseTargets = actionRequests
        .filter((r) => r.requestType === "endorsement")
        .map((r) => {
          // Find roleId from roleName via allTables
          const t = (allTables ?? []).find((t) => t.roleName === r.toRoleName);
          return t?.roleId;
        })
        .filter((id): id is string => !!id);
      const computeTargets: ComputeTarget[] = [];
      for (const r of actionRequests) {
        if (r.requestType !== "compute") continue;
        const t = (allTables ?? []).find((t) => t.roleName === r.toRoleName);
        if (t) computeTargets.push({ roleId: t.roleId, amount: r.computeAmount ?? 1, direction: "request" });
      }

      setActionDrafts((prev) => [
        ...prev.filter((a) => a.text.trim()),
        { text: action.text, priority: "medium" as const, secret: !!action.secret, endorseTargets, computeTargets },
      ]);
    } catch (err) {
      setSubmitError(`Failed to edit: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [submission, editSubmittedMut, sentRequestsByAction, allTables]);

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
  const showTabs = game.status === "playing" || game.status === "lobby";
  // CEO roles have full lab control (edit allocation, spec); safety leads get read-only access
  const controlsLab = game.labs.some(l => l.roleId === role.id);
  const hasLabAccess = controlsLab || (
    !!role.labId && game.labs.some(l => l.name.toLowerCase() === role.labId)
  );
  const tabs = buildPlayerTabs(role, phase, pendingProposalCount, hasLabAccess);

  // Previous round narrative for the brief tab

  // ── Derived unsaved flags ────────────────────────────────────────────────
  const specUnsaved = !!currentLab && labSpec.trim() !== (currentLab.spec ?? "");
  const savedAllocation = submission?.computeAllocation ?? currentLab?.allocation;
  const allocationUnsaved = !!savedAllocation && (
    computeAllocation.users !== savedAllocation.users ||
    computeAllocation.capability !== savedAllocation.capability ||
    computeAllocation.safety !== savedAllocation.safety
  );

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
            <div className="flex items-center gap-3 overflow-hidden">
              {hasCompute(role) && table.computeStock != null && (
                <span className="text-xs font-mono text-text-muted flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" /> {table.computeStock ?? 0}u
                </span>
              )}
              {game.phaseEndsAt && !isExpired && (
                <span
                  className={`text-xs font-mono tabular-nums flex items-center gap-1 ${isUrgent ? "text-viz-danger font-bold" : "text-text-muted"}`}
                  role="timer"
                  aria-label={`${timerDisplay} remaining`}
                >
                  <Clock className={`w-3.5 h-3.5 ${isUrgent ? "animate-pulse" : ""}`} aria-hidden="true" /> {timerDisplay}
                </span>
              )}
              {game.status === "lobby" ? (
                <button
                  onClick={() => {
                    void leaveRole({ tableId, sessionId });
                    router.push(`/game/${gameId}/pick`);
                  }}
                  className="text-[11px] text-text-muted hover:text-viz-danger transition-colors flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" /> Leave
                </button>
              ) : (
                <span className="text-[11px] text-text-muted font-mono">
                  {round?.label ?? DEFAULT_ROUND_LABEL} — Turn {round?.number ?? 1}/4
                </span>
              )}
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
          <PhaseContent
            phase={phase}
            playerName={table.playerName}
            labs={game.labs}
            common={{
              activeTab,
              role,
              tableId,
              gameId,
              gameStatus: game.status,
              isAiSystem,
              aiDisposition: table.aiDisposition,
              handoutData,
              hasLabAccess,
              controlsLab,
            }}
            submit={{
              game,
              submittedActions: submission?.actions ?? [],
              isExpired,
              computeStock: table.computeStock ?? undefined,
              computeRecipients,
              actionDrafts,
              onActionDraftsChange: setActionDrafts,
              enabledRoles,
              onSubmitAction: handleSubmitAction,
              onEditAction: handleEditAction,
              onDeleteAction: handleDeleteAction,
              submitError,
              sentRequestsByAction,
              shownSuggestions,
              ideasOpen,
              onIdeasOpenChange: setIdeasOpen,
              onSuggestionTap: handleSuggestionTap,
              currentRound: game.currentRound,
              allRequests,
            }}
            lab={{
              currentLab,
              startingStock: DEFAULT_LABS.find((l) => l.name === currentLab?.name)?.computeStock ?? 0,
              labSpec,
              onLabSpecChange: handleLabSpecChange,
              specSaved,
              specUnsaved,
              onSaveSpec: handleSaveSpec,
              computeAllocation,
              onComputeAllocationChange: setComputeAllocation,
              allocationSaved,
              allocationUnsaved,
              onSaveAllocation: handleSaveAllocation,
            }}
            resolve={{
              round: round ?? undefined,
              sortedResultActions,
            }}
          />
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
