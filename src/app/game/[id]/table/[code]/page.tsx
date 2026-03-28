"use client";

import { use, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, MAX_PRIORITY, isLabCeo, isLabSafety, hasCompute, AI_DISPOSITIONS, getDisposition, getAiInfluencePower, type Role } from "@/lib/game-data";
import { useCountdown, useKeyboardScroll } from "@/lib/hooks";
import { ActionInput, normaliseActions, emptyAction, type ActionDraft } from "@/components/action-input";
import { loadSampleActions, getSampleActions, pickRandom, type SampleAction, type SampleActionsData } from "@/lib/sample-actions";
import { loadRoleHandouts } from "@/lib/role-handouts";
import { ComputeAllocation } from "@/components/compute-allocation";
// Compute loans now handled via action request system
import { LabAllocationReadOnly } from "@/components/lab-allocation-readonly";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { AiInfluencePanel } from "@/components/ai-influence-panel";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { ProposalPanel, usePendingProposalCount } from "@/components/proposals";
import {
  Send,
  Loader2,
  Clock,
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
  Lightbulb,
  EyeOff,
  Dices,
  FileText,
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
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#047857] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Success
          </span>
        )}
        {isFailed && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#B91C1C] bg-[#FEE2E2] px-2 py-0.5 rounded-full">
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
        <div className="mt-2 space-y-2 text-sm text-text-muted">
          <ul className="space-y-1.5 pl-5 list-disc">
            <li>Describe 1-5 actions: <span className="italic">&ldquo;I do [action] so that [outcome if successful]&rdquo;</span></li>
            <li>AI grades probability of success, then dice decide outcomes</li>
          </ul>
          <div className="bg-warm-gray rounded-lg p-3 space-y-1.5 text-xs">
            <p><span className="font-bold text-text">Priority:</span> Order matters. Action #1 gets the most priority, #2 less, and so on. Priority is assigned automatically.</p>
            <p><span className="font-bold text-text">Secret:</span> Mark an action secret to hide it from other players on the projected screen</p>
            <p><span className="font-bold text-text">Support:</span> Request endorsement from other players — accepted support boosts probability, declined hurts it</p>
          </div>
        </div>
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

// ─── AI Systems disposition chooser ──────────────────────────────────────────

function DispositionChooser({ tableId, onChosen }: { tableId: Id<"tables">; onChosen: () => void }) {
  const setDispositionMut = useMutation(api.tables.setDisposition);
  const [selected, setSelected] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rolled, setRolled] = useState<string | null>(null);

  const handleRoll = () => {
    setRolling(true);
    // Animate through dispositions briefly
    let ticks = 0;
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * AI_DISPOSITIONS.length);
      setRolled(AI_DISPOSITIONS[idx].id);
      ticks++;
      if (ticks >= 8) {
        clearInterval(interval);
        const final = AI_DISPOSITIONS[Math.floor(Math.random() * AI_DISPOSITIONS.length)];
        setRolled(final.id);
        setSelected(final.id);
        setRolling(false);
      }
    }, 150);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      await setDispositionMut({ tableId, disposition: selected });
      onChosen();
    } catch (err) {
      console.error("Failed to set disposition:", err);
    }
  };

  const activeDisposition = selected ? AI_DISPOSITIONS.find((d) => d.id === selected) : null;

  return (
    <div className="bg-[#1E1B4B] text-white rounded-xl p-5 mb-4 border border-[#4338CA]">
      <div className="flex items-center gap-2 mb-3">
        <Dices className="w-5 h-5 text-[#A78BFA]" />
        <h3 className="text-base font-bold">Choose Your Alignment</h3>
      </div>
      <p className="text-sm text-[#C4B5FD] mb-4">
        How will you play the AI Systems? This choice is <span className="font-bold text-white">secret</span> and
        {" "}<span className="font-bold text-white">locked for the entire game</span>.
      </p>

      {/* Roll button */}
      <button
        onClick={handleRoll}
        disabled={rolling || !!selected}
        className="w-full py-3 bg-[#4338CA] hover:bg-[#4F46E5] text-white rounded-lg font-bold text-sm mb-3
                   flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
      >
        <Dices className="w-4 h-4" />
        {rolling ? "Rolling..." : "Roll the Dice"}
      </button>

      <p className="text-xs text-[#A78BFA] text-center mb-3">— or choose manually —</p>

      {/* Disposition options */}
      <div className="space-y-1.5">
        {AI_DISPOSITIONS.map((d) => (
          <button
            key={d.id}
            onClick={() => { if (!rolling) setSelected(d.id); }}
            disabled={rolling}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              (rolled === d.id && rolling) ? "bg-[#4338CA]/50 text-white" :
              selected === d.id ? "bg-[#4338CA] text-white" :
              "bg-white/5 text-[#C4B5FD] hover:bg-white/10"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs text-[#A78BFA] mt-0.5 shrink-0">d6:{d.d6}</span>
              <div>
                <span className="font-bold">{d.label}</span>
                <p className="text-xs text-[#A78BFA]/70 mt-0.5 font-normal">{d.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Selection detail + confirm */}
      {activeDisposition && !rolling && (
        <div className="mt-4">
          <div className="bg-white/10 rounded-lg p-3 mb-3">
            <p className="text-sm font-bold text-white mb-1">{activeDisposition.label}</p>
            <p className="text-xs text-[#C4B5FD]">{activeDisposition.description}</p>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-white text-[#1E1B4B] rounded-lg font-bold text-sm
                       hover:bg-[#EDE9FE] transition-colors"
          >
            Confirm — Lock for Entire Game
          </button>
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
  const cancelRequest = useMutation(api.requests.cancel);
  const setConnected = useMutation(api.tables.setConnected);
  const updateLabSpecMut = useMutation(api.games.updateLabSpec);
  const allTables = useQuery(api.tables.getByGame, { gameId });
  const allRequests = useQuery(api.requests.getByGameAndRound, {
    gameId,
    roundNumber: game?.currentRound ?? 1,
  });

  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([emptyAction()]);
  const freeText = useMemo(() => actionDrafts.map((a) => a.text).join("\n"), [actionDrafts]);
  const parsedActions = useMemo(() => normaliseActions(actionDrafts), [actionDrafts]);
  const [computeAllocation, setComputeAllocation] = useState({
    users: 50,
    capability: 25,
    safety: 25,
  });
  // computeLoans removed — now handled by action request system
  const [artifact, setArtifact] = useState("");
  const [labSpec, setLabSpec] = useState("");
  const [specSaved, setSpecSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [autoSubmitMessage, setAutoSubmitMessage] = useState("");

  // Track whether we've already auto-submitted to avoid repeated calls
  const autoSubmittedRef = useRef(false);
  // Track whether draft has been restored to avoid overwriting on mount
  const draftRestoredRef = useRef(false);

  // Sample actions for "Need ideas?" suggestions
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

  // Generate a stable session ID per browser tab for seat conflict detection
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

  // Detect if another session has taken this seat
  const isConflict = table && table.activeSessionId && table.activeSessionId !== sessionId && table.connected;

  // Set connected on mount, disconnect on unmount/close
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

  // Initialize compute allocation from role defaults
  useEffect(() => {
    if (role?.defaultCompute) {
      setComputeAllocation({ ...role.defaultCompute });
    }
  }, [role?.defaultCompute]);

  // Initialize lab spec from game data for lab CEOs
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

  // ── Pick 3 random sample suggestions when data/role/round changes ───────
  useEffect(() => {
    if (!sampleActionsData || !role || !game) return;
    const all = getSampleActions(sampleActionsData, role.id, game.currentRound);
    if (all.length === 0) return;
    // Fisher-Yates shuffle and take 3
    const shuffled = pickRandom(all, 3);
    setShownSuggestions(shuffled);
  }, [sampleActionsData, role, game?.currentRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-expand "Need ideas?" when timer ≤ 2min and 0 filled actions ───
  useEffect(() => {
    if (phase !== "submit" || isSubmitted) return;
    const filledCount = actionDrafts.filter((a) => a.text.trim()).length;
    if (secondsLeft <= 120 && secondsLeft > 0 && filledCount === 0 && !ideasOpen) {
      setIdeasOpen(true);
    }
  }, [secondsLeft, phase, isSubmitted, actionDrafts, ideasOpen]);

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

  // ── Auto-submit on phase change (facilitator resolved before timer expired) ──
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

  const handleSuggestionTap = useCallback((suggestion: SampleAction) => {
    setActionDrafts((prev) => {
      // Pre-fill endorsement targets from sample action hints, filtered to active roles
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
      // All filled — add a new one
      return [...prev, newDraft];
    });
  }, []);

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
        // computeLoans removed — now handled by action request system
        artifact: artifact.trim() || undefined,
      });
      // Endorsement requests already sent immediately when targets selected
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

  // Convex returns undefined while loading and null when a document doesn't exist.
  // Once game/table resolve to null the record was deleted (e.g. DB reset).
  const notFound =
    game === null || table === null || round === null;

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

          {/* Seat conflict: another device connected to this table */}
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

          {/* LOBBY — waiting for game to start */}
          {game.status === "lobby" && (
            <div>
              <div className="bg-white rounded-xl p-5 border border-border mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-5 h-5 text-text" />
                  <h3 className="text-base font-bold text-text">Your Role</h3>
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

              {/* AI Systems disposition chooser — pre-game character setting */}
              {role.tags.includes("ai-system") && !table.aiDisposition && (
                <DispositionChooser tableId={tableId} onChosen={() => {}} />
              )}

              {/* Show disposition badge if already chosen */}
              {role.tags.includes("ai-system") && table.aiDisposition && (
                <div className="bg-[#1E1B4B] text-[#C4B5FD] rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-sm">
                  <EyeOff className="w-3.5 h-3.5" />
                  <span className="font-bold text-white">{getDisposition(table.aiDisposition)?.label}</span>
                  <span className="text-[10px] ml-auto">Secret — locked for game</span>
                </div>
              )}

              <div className="text-center py-8 text-text-muted">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Waiting for the facilitator to start the game...</p>
                <p className="text-xs mt-1">Read your brief above while you wait</p>
              </div>
            </div>
          )}

          {/* Round context card — only during playing */}
          {game.status === "playing" && (
            <div
              className="bg-white rounded-xl p-4 border border-border mb-4 break-words"
              style={{ borderLeftWidth: "3px", borderLeftColor: role.color }}
            >
              <h3 className="text-lg font-bold text-text mb-1">{round.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">{round.narrative}</p>
            </div>
          )}

          {/* DISCUSS phase — improved onboarding */}
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

              {/* Show disposition badge if already chosen (set during lobby) */}
              {role.tags.includes("ai-system") && table.aiDisposition && (
                <div className="bg-[#1E1B4B] text-[#C4B5FD] rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-sm">
                  <EyeOff className="w-3.5 h-3.5" />
                  <span className="font-bold text-white">{getDisposition(table.aiDisposition)?.label}</span>
                  <span className="text-xs ml-auto">Secret — locked for game</span>
                </div>
              )}

              {/* Lab Directives — AI Systems player sees all labs' current specs */}
              {role.tags.includes("ai-system") && (
                <details className="bg-white rounded-xl border border-border p-4 mb-4">
                  <summary className="flex items-center gap-2 cursor-pointer">
                    <FileText className="w-4 h-4 text-text" />
                    <span className="text-sm font-bold text-text">Lab Directives</span>
                  </summary>
                  <p className="text-xs text-text-muted mt-2 mb-3">
                    These are the current AI directives set by each lab&apos;s CEO. Your behaviour should be informed by these specs (and your secret disposition).
                  </p>
                  <div className="space-y-2">
                    {game.labs.map((lab) => (
                      <div key={lab.name} className="bg-off-white rounded-lg p-3 border border-border">
                        <span className="text-xs font-bold text-text">{lab.name}</span>
                        <p className="text-xs text-text-muted mt-1 whitespace-pre-line">
                          {lab.spec || "No directive set yet."}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Lab spec editor — CEO can write the AI directive */}
              {isLabCeo(role) && (
                <div className="bg-white rounded-xl border border-border p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-text" />
                    <span className="text-sm font-bold text-text">Your Lab&apos;s AI Directive</span>
                  </div>
                  <p className="text-xs text-text-muted mb-2">
                    What is your AI instructed to do? This is public and affects how faithfully the AI follows your direction.
                  </p>
                  <textarea
                    value={labSpec}
                    onChange={(e) => { setLabSpec(e.target.value); setSpecSaved(false); }}
                    placeholder="e.g. 'Maximise capability R&D while maintaining 10% safety budget'"
                    rows={2}
                    className="w-full p-2 bg-off-white border border-border rounded text-sm text-text resize-none outline-none placeholder:text-text-muted/50"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={handleSaveSpec}
                      disabled={!labSpec.trim()}
                      className="text-xs px-3 py-1.5 bg-navy text-white rounded font-bold hover:bg-navy/90 disabled:opacity-30"
                    >
                      Save Directive
                    </button>
                    {specSaved && (
                      <span className="text-xs text-[#059669] font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Saved
                      </span>
                    )}
                  </div>
                </div>
              )}

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
                  onSendRequest={(targetRoleId, targetRoleName, actionText) => {
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
                  }}
                  onCancelRequest={(targetRoleId, actionText) => {
                    // Find and cancel the matching request
                    const match = (allRequests ?? []).find(
                      (r) => r.fromRoleId === role?.id && r.toRoleId === targetRoleId && r.actionText === actionText
                    );
                    if (match) {
                      void cancelRequest({ requestId: match._id });
                    }
                  }}
                />

                {/* Need ideas? collapsible suggestions */}
                {shownSuggestions.length > 0 && (
                  <div className="mt-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setIdeasOpen(!ideasOpen)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <Lightbulb className="w-4 h-4 text-[#2563EB] shrink-0" />
                      <span className="text-sm font-semibold text-[#1D4ED8]">Need ideas?</span>
                      {ideasOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#2563EB] ml-auto" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#2563EB] ml-auto" />
                      )}
                    </button>
                    {ideasOpen && (
                      <div className="px-3 pb-3 space-y-2">
                        <p className="text-[11px] text-[#3B82F6]">Tap a suggestion to add it as an action</p>
                        {shownSuggestions.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestionTap(s)}
                            className="w-full text-left bg-white rounded-lg p-3 border border-[#DBEAFE] hover:border-[#93C5FD] transition-colors"
                          >
                            <p className="text-sm text-text leading-snug">{s.text}</p>
                            {s.secret && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] text-viz-warning font-medium flex items-center gap-0.5">
                                  <EyeOff className="w-3 h-3" /> Secret
                                </span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                <div key={i} className="bg-white rounded-lg p-3 border border-border relative mb-2">
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-[11px] bg-warm-gray text-text-muted rounded px-1.5 py-0.5 font-mono font-semibold shrink-0">
                      #{i + 1}
                    </span>
                    {a.secret && (
                      <span className="text-[10px] bg-[#FFF7ED] text-viz-warning rounded px-1.5 py-0.5 font-bold shrink-0">
                        SECRET
                      </span>
                    )}
                    <p className="text-sm text-text flex-1">{a.text}</p>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-navy bg-navy/10 rounded px-1.5 py-0.5">
                    Priority: {a.priority}/10
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* AI Systems influence panel — shown during rolling phase */}
          {role.tags.includes("ai-system") && phase === "rolling" && table.aiDisposition && (
            <div className="mb-4">
              <AiInfluencePanel
                gameId={gameId}
                roundNumber={game.currentRound}
                disposition={table.aiDisposition}
                influencePower={getAiInfluencePower(game.labs)}
                ownRoleId={role.id}
              />
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
