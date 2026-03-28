"use client";

import { use, useState, useEffect, useRef } from "react";


/** Compute stagger delays for AI table submissions. Pure function — no side effects. */
function computeStaggerDelays(count: number, durationSeconds: number): number[] {
  const staggerWindow = durationSeconds * 0.6 * 1000;
  const minDelay = Math.min(15_000, staggerWindow * 0.2);
  const delays: number[] = [];
  // Use crypto for unbiased randomness (avoids React compiler Math.random lint)
  const randomValues = new Uint32Array(count);
  if (typeof crypto !== "undefined") {
    crypto.getRandomValues(randomValues);
  }
  const maxDelay = durationSeconds * 1000 - 15_000; // Hard cap: leave 15s buffer before timer expires
  for (let i = 0; i < count; i++) {
    const baseDelay = minDelay + (staggerWindow - minDelay) * (i / Math.max(1, count - 1));
    const jitter = ((randomValues[i] / 0xFFFFFFFF) - 0.5) * 10_000; // ±5s
    delays.push(Math.min(maxDelay, Math.max(3000, baseDelay + jitter)));
  }
  return delays;
}

/** Pick a random AI disposition using crypto. */
function pickRandomDisposition() {
  const arr = new Uint32Array(1);
  if (typeof crypto !== "undefined") crypto.getRandomValues(arr);
  return AI_DISPOSITIONS[arr[0] % AI_DISPOSITIONS.length];
}
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, cycleProbability, getDisposition, getCapabilityDescription, AI_DISPOSITIONS, getAiInfluencePower, autoGenerateInfluence } from "@/lib/game-data";
import { redactSecretAction } from "@/lib/secret-actions";
import { useCountdown } from "@/lib/hooks";
import { RdProgressChart } from "@/components/rd-progress-chart";
import { WorldStatePanel } from "@/components/world-state-panel";
import { LabTracker } from "@/components/lab-tracker";
import { ProbabilityBadge } from "@/components/action-card";
import { NarrativePanel } from "@/components/narrative-panel";
import { GameTimeline } from "@/components/game-timeline";
import { QRCode } from "@/components/qr-codes";
import { WorldStateEditor, NarrativeEditor, FacilitatorCopilot } from "@/components/manual-controls";
import { DebugPanel } from "@/components/debug-panel";
import {
  Play,
  ChevronRight,
  Clock,
  Lock,
  Loader2,
  Dices,
  MessageSquareText,
  SkipForward,
  Bot,
  Plus,
  FileText,
  EyeOff,
  Eye,
  Pencil,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
} from "lucide-react";
import { loadSampleActions, getSampleActions, pickRandom, type SampleActionsData } from "@/lib/sample-actions";
import { PRIORITY_DECAY } from "@/lib/game-data";

export default function FacilitatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projector?: string }>;
}) {
  const { id } = use(params);
  const { projector } = use(searchParams);
  const isProjector = projector === "true";
  const gameId = id as Id<"games">;

  const game = useQuery(api.games.get, { gameId });
  const tables = useQuery(api.tables.getByGame, { gameId });
  const rounds = useQuery(api.rounds.getByGame, { gameId });
  const submissions = useQuery(api.submissions.getByGameAndRound, {
    gameId,
    roundNumber: game?.currentRound ?? 1,
  });
  const proposals = useQuery(api.requests.getByGameAndRound, {
    gameId,
    roundNumber: game?.currentRound ?? 1,
  });

  const advancePhase = useMutation(api.games.advancePhase);
  const startGame = useMutation(api.games.startGame);
  const lockGame = useMutation(api.games.lock);
  const advanceRound = useMutation(api.games.advanceRound);
  const finishGame = useMutation(api.games.finishGame);
  const rollAll = useMutation(api.submissions.rollAllActions);
  const overrideProbability = useMutation(api.submissions.overrideProbability);
  const overrideOutcome = useMutation(api.submissions.overrideOutcome);
  const setControlMode = useMutation(api.tables.setControlMode);
  const toggleEnabled = useMutation(api.tables.toggleEnabled);
  const skipTimer = useMutation(api.games.skipTimer);
  const kickToAI = useMutation(api.tables.kickToAI);
  const addLab = useMutation(api.games.addLab);
  const submitActions = useMutation(api.submissions.submit);
  const setDispositionMut = useMutation(api.tables.setDisposition);
  const applyAiInfluenceMut = useMutation(api.submissions.applyAiInfluence);

  const { display: timerDisplay, isExpired, isUrgent } = useCountdown(game?.phaseEndsAt);

  const [resolving, setResolving] = useState(false);
  const [resolveStep, setResolveStep] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  // Safe wrapper for facilitator actions — shows error on failure, auto-clears after 5s
  const safeAction = (label: string, fn: () => Promise<unknown>) => async () => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      console.error(`${label} failed:`, err);
      setActionError(`${label} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setTimeout(() => setActionError(null), 5000);
    }
  };
  // Track pending AI submissions for flush-on-resolve
  type AITableRef = { _id: string; roleId: string };
  type PendingAISub = { table: AITableRef; actions: { text: string; priority: number; secret?: boolean }[]; timerId: ReturnType<typeof setTimeout> };
  const pendingAISubmissions = useRef<PendingAISub[]>([]);
  const [showSubmissionDetails, setShowSubmissionDetails] = useState(false);
  const [showQROverlay, setShowQROverlay] = useState(false);
  const [focusedQR, setFocusedQR] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<"narrative" | "dials" | "addlab" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"advance" | "end" | null>(null);
  const [submitDuration, setSubmitDuration] = useState(4);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [newLabName, setNewLabName] = useState("");
  const [newLabRoleId, setNewLabRoleId] = useState("");
  const [newLabCompute, setNewLabCompute] = useState(10);
  const [newLabMultiplier, setNewLabMultiplier] = useState(1);
  const [useSampleForAI, setUseSampleForAI] = useState(false);
  const [sampleActionsData, setSampleActionsData] = useState<SampleActionsData | null>(null);

  // Staggered dice reveal animation
  const [revealedCount, setRevealedCount] = useState(0);
  const gamePhase = game?.phase;
  const isRollingPhase = gamePhase === "rolling" || gamePhase === "narrate";
  // Reset reveal count when leaving rolling/narrate phase
  useEffect(() => {
    if (!isRollingPhase) {
      const t = setTimeout(() => setRevealedCount(0), 0);
      return () => clearTimeout(t);
    }
  }, [isRollingPhase]);
  // Stagger dice result reveals one at a time
  useEffect(() => {
    if (!isRollingPhase) return;
    const total = (submissions ?? []).flatMap((s) => s.actions.filter((a) => a.rolled != null)).length;
    if (revealedCount >= total) return;
    const timer = setTimeout(() => setRevealedCount((c) => c + 1), 200);
    return () => clearTimeout(timer);
  }, [revealedCount, isRollingPhase, submissions]);

  // Warm up API routes on facilitator page load
  useEffect(() => {
    fetch("/api/warm").catch(() => {});
  }, []);

  // Cleanup pending AI stagger timeouts on unmount
  useEffect(() => {
    return () => {
      for (const p of pendingAISubmissions.current) clearTimeout(p.timerId);
      pendingAISubmissions.current = [];
    };
  }, []);

  // Load sample actions on mount
  useEffect(() => {
    loadSampleActions().then(setSampleActionsData).catch(() => {});
  }, []);


  const toggleReveal = (key: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const revealAllSecrets = () => {
    const keys = new Set<string>();
    for (const sub of submissions ?? []) {
      sub.actions.forEach((a, i) => {
        if (a.secret) keys.add(`${sub.roleId}-${i}`);
      });
    }
    setRevealedSecrets(keys);
  };

  if (!game || !tables || !rounds) {
    return (
      <div className="min-h-screen bg-navy-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-text-light animate-spin" />
      </div>
    );
  }

  const currentRound = rounds.find((r) => r.number === game.currentRound);
  const phase = game.phase;
  const submissionCount = submissions?.length ?? 0;
  const connectedCount = tables.filter((t) => t.connected).length;
  const enabledTables = tables.filter((t) => t.enabled);

  // Get AI Systems disposition for passing to grading/narrate/AI player prompts
  const aiSystemsTable = tables.find((t) => t.roleId === "ai-systems");
  const aiDispositionData = aiSystemsTable?.aiDisposition
    ? getDisposition(aiSystemsTable.aiDisposition)
    : undefined;
  const aiDispositionPayload = aiDispositionData
    ? { label: aiDispositionData.label, description: aiDispositionData.description }
    : undefined;

  // Grade a single submission via API
  const gradeSubmission = (sub: {
    _id: string;
    roleId: string;
    actions: { text: string; priority: number }[];
  }) => {
    fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: sub._id,
        gameId,
        roundNumber: game.currentRound,
        roleId: sub.roleId,
        actions: sub.actions.map((a) => ({
          text: a.text,
          priority: a.priority,
        })),
        enabledRoles: (tables ?? []).filter((t) => t.enabled).map((t) => t.roleName),
        aiDisposition: aiDispositionPayload,
      }),
    }).catch(console.error);
  };

  // Grade all ungraded submissions
  const gradeAllUngraded = () => {
    for (const sub of submissions ?? []) {
      if (sub.status === "submitted") {
        gradeSubmission(sub);
      }
    }
  };

  // Trigger AI proposals for all AI-controlled enabled tables
  const triggerAIProposals = () => {
    const aiTables = (tables ?? []).filter((t) => t.controlMode !== "human" && t.enabled);
    const enabledRoleList = (tables ?? []).filter((t) => t.enabled).map((t) => ({ id: t.roleId, name: t.roleName }));
    for (const table of aiTables) {
      fetch("/api/ai-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          roundNumber: game.currentRound,
          roleId: table.roleId,
          enabledRoles: enabledRoleList.filter((r) => r.id !== table.roleId),
        }),
      }).catch(console.error);
    }
  };

  // Generate AI actions upfront (parallel), then stagger DB submissions over the countdown
  const generateAndStaggerAI = async (durationSeconds: number) => {
    // Clear any pending submissions from a previous call
    for (const p of pendingAISubmissions.current) clearTimeout(p.timerId);
    pendingAISubmissions.current = [];

    const nonHumanTables = (tables ?? []).filter((t) => t.controlMode !== "human" && t.enabled);
    const submitted = new Set((submissions ?? []).map((s) => s.roleId));
    const unsubmitted = nonHumanTables.filter((t) => !submitted.has(t.roleId));
    if (unsubmitted.length === 0) return;

    // Auto-roll disposition for AI Systems if needed
    const aiSystemsAI = unsubmitted.find((t) => t.roleId === "ai-systems" && !t.aiDisposition);
    if (aiSystemsAI) {
      const disposition = pickRandomDisposition();
      try { await setDispositionMut({ tableId: aiSystemsAI._id, disposition: disposition.id }); } catch { /* already set */ }
    }

    // Phase 1: Generate all actions upfront (parallel)
    type PendingSubmission = { table: typeof unsubmitted[0]; actions: { text: string; priority: number; secret?: boolean }[] };
    const pending: PendingSubmission[] = [];

    // Split into NPC tables (always use samples) and AI tables (use LLM or samples based on toggle)
    const npcTables = unsubmitted.filter((t) => t.controlMode === "npc");
    const aiTables = unsubmitted.filter((t) => t.controlMode === "ai");

    // NPC tables always use sample actions
    if (sampleActionsData) {
      for (const table of npcTables) {
        const all = getSampleActions(sampleActionsData, table.roleId, game.currentRound);
        if (all.length === 0) continue;
        const picked = pickRandom(all, 3);
        const decay = PRIORITY_DECAY[picked.length] ?? PRIORITY_DECAY[5]!;
        pending.push({
          table,
          actions: picked.map((a, i) => ({ text: a.text, priority: decay[i] ?? 1, secret: a.secret || undefined })),
        });
      }
    }

    if (useSampleForAI && sampleActionsData) {
      // Sample mode for AI tables: instant selection
      for (const table of aiTables) {
        const all = getSampleActions(sampleActionsData, table.roleId, game.currentRound);
        if (all.length === 0) continue;
        const picked = pickRandom(all, 3);
        const decay = PRIORITY_DECAY[picked.length] ?? PRIORITY_DECAY[5]!;
        pending.push({
          table,
          actions: picked.map((a, i) => ({ text: a.text, priority: decay[i] ?? 1, secret: a.secret || undefined })),
        });
      }
    } else {
      // LLM mode: parallel generation for AI tables
      const enabledRoleNames = (tables ?? []).filter((t) => t.enabled).map((t) => t.roleName);
      const results = await Promise.allSettled(
        aiTables.map(async (table) => {
          const res = await fetch("/api/ai-player", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId: table._id,
              gameId,
              roundNumber: game.currentRound,
              roleId: table.roleId,
              enabledRoles: enabledRoleNames,
              computeStock: table.computeStock ?? 0,
              aiDisposition: table.roleId === "ai-systems" ? aiDispositionPayload : undefined,
              generateOnly: true, // New flag: return actions without submitting
            }),
          });
          if (!res.ok) throw new Error(`AI player failed: ${res.status}`);
          return { table, data: await res.json() as { actions?: { text: string; priority: number; secret?: boolean }[] } };
        })
      );
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled" && result.value.data.actions) {
          pending.push({ table: result.value.table, actions: result.value.data.actions });
        } else {
          const failedTable = aiTables[i];
          const reason = result.status === "rejected" ? (result.reason as Error)?.message : "No actions returned";
          console.error(`AI generation failed for ${failedTable.roleId}: ${reason}`);
          setActionError(`AI generation failed for ${failedTable.roleId} — use "Open" to retry or kick to sample actions`);
        }
      }
    }

    // Phase 2: Stagger submissions over first 60% of countdown
    // Track pending so they can be flushed if facilitator clicks Resolve early
    pendingAISubmissions.current = [];
    const delays = computeStaggerDelays(pending.length, durationSeconds);
    for (let i = 0; i < pending.length; i++) {
      const { table, actions } = pending[i];
      const delay = delays[i];

      const timerId = setTimeout(() => {
        pendingAISubmissions.current = pendingAISubmissions.current.filter((p) => p.timerId !== timerId);
        void submitAITable(table, actions);
      }, delay);

      pendingAISubmissions.current.push({ table: { _id: table._id as string, roleId: table.roleId }, actions, timerId });
    }
  };

  // Submit a single AI table's actions + trigger proposals after
  const submitAITable = async (table: AITableRef, actions: { text: string; priority: number; secret?: boolean }[]) => {
    try {
      await submitActions({
        tableId: table._id as Id<"tables">,
        gameId,
        roundNumber: game.currentRound,
        roleId: table.roleId,
        actions,
      });
      // Send proposals shortly after
      setTimeout(() => {
        const enabledRoleList = (tables ?? []).filter((t) => t.enabled).map((t) => ({ id: t.roleId, name: t.roleName }));
        fetch("/api/ai-proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId,
            roundNumber: game.currentRound,
            roleId: table.roleId,
            enabledRoles: enabledRoleList.filter((r) => r.id !== table.roleId),
          }),
        }).catch(console.error);
      }, 3000 + (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 3000);
    } catch (err) {
      console.error(`Failed to submit AI actions for ${table.roleId}:`, err);
    }
  };

  // Flush any pending staggered AI submissions immediately (called before resolve)
  const flushPendingAI = async () => {
    const remaining = [...pendingAISubmissions.current];
    // Cancel all scheduled timeouts
    for (const p of remaining) clearTimeout(p.timerId);
    pendingAISubmissions.current = [];
    // Submit all remaining immediately
    await Promise.allSettled(remaining.map((p) => submitAITable(p.table, p.actions)));
  };

  // Set ref so recovery effect (before early return) can access this function

  // Resolve round: two-stage pipeline (grade → roll → resolve events → narrate)
  const handleResolveRound = async () => {
    setResolving(true);
    setActionError(null);

    try {
      // Flush any AI submissions still pending from stagger schedule
      if (pendingAISubmissions.current.length > 0) {
        setResolveStep("Submitting remaining AI actions...");
        await flushPendingAI();
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Recovery: if there are unsubmitted AI tables (e.g. after page refresh), generate + submit now
      const aiTables = (tables ?? []).filter((t) => t.controlMode !== "human" && t.enabled);
      const submittedRoles = new Set((submissions ?? []).map((s) => s.roleId));
      const missingAI = aiTables.filter((t) => !submittedRoles.has(t.roleId));
      if (missingAI.length > 0) {
        setResolveStep(`Generating actions for ${missingAI.length} AI table(s)...`);
        await generateAndStaggerAI(10);
        await flushPendingAI();
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Phase 1: AI responds to any last-minute endorsement requests
      setResolveStep("AI responding to requests...");
      triggerAIProposals();
      await new Promise((r) => setTimeout(r, 3000));

      // Phase 2: Grade all submissions
      setResolveStep("Grading submissions...");
      gradeAllUngraded();
      await new Promise((r) => setTimeout(r, 4000));
      gradeAllUngraded();
      await new Promise((r) => setTimeout(r, 2000));

      // Phase 2.5: AI Systems secret influence
      if (aiSystemsTable && aiSystemsTable.aiDisposition && aiSystemsTable.enabled) {
        const roundNumber = game.currentRound;
        const power = getAiInfluencePower(game.labs);

        if (aiSystemsTable.controlMode === "human") {
          // Wait up to 30s for human AI Systems player to apply influence
          setResolveStep("AI Systems influencing outcomes...");
          await new Promise((r) => setTimeout(r, 30000));
        } else {
          // NPC/AI: auto-generate influence from current submissions
          setResolveStep("AI Systems influencing outcomes...");
          const currentSubs = submissions ?? [];
          const allActions = currentSubs.flatMap((sub) =>
            sub.actions.map((a, i) => ({
              submissionId: sub._id as string,
              actionIndex: i,
              text: a.text,
              roleId: sub.roleId,
            }))
          );
          const influence = autoGenerateInfluence(aiSystemsTable.aiDisposition, allActions, power);
          if (influence.length > 0) {
            const influencePayload = influence.map((inf) => ({
              submissionId: inf.submissionId as typeof currentSubs[0]["_id"],
              actionIndex: inf.actionIndex,
              modifier: inf.modifier,
            }));
            await applyAiInfluenceMut({ gameId, roundNumber, influences: influencePayload });
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // Phase 3: Roll dice
      setResolveStep("Rolling dice...");
      await rollAll({ gameId, roundNumber: game.currentRound });
      await advancePhase({ gameId, phase: "rolling" });
    } catch (err) {
      console.error("Resolve failed:", err);
      setActionError(`Resolve failed: ${err instanceof Error ? err.message : "Unknown error"}. You can retry.`);
      for (const p of pendingAISubmissions.current) clearTimeout(p.timerId);
      pendingAISubmissions.current = [];
      setResolving(false);
      return;
    }

    // Phase 4: Resolve events + update world state
    setResolveStep("Resolving events...");
    const resolveOk = await callResolve();
    if (!resolveOk) {
      setActionError("Event resolution failed — try again or adjust manually");
      setResolving(false);
      return;
    }

    // Phase 5: Generate narrative from resolved events
    await runNarrate();
    setResolving(false);
  };

  // Shared fetch for /api/resolve — returns true on success
  // Uses SSE streaming to show progress as AI generates the resolution
  const callResolve = async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/resolve?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, roundNumber: game.currentRound, aiDisposition: aiDispositionPayload }),
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok || !res.body) {
        setResolveStep("Event resolution failed — you can advance manually");
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.__error) {
              setResolveStep("Event resolution failed — you can advance manually");
              return false;
            }
            if (data.__complete) {
              return true;
            }
            // Show progress from partial output
            const eventCount = data.resolvedEvents?.length;
            if (eventCount) {
              setResolveStep(`Resolving events... (${eventCount} so far)`);
            }
          } catch {
            // Incomplete JSON in partial line — skip
          }
        }
      }
      return true;
    } catch {
      setResolveStep("Resolution timed out — you can advance manually");
      return false;
    }
  };

  const runNarrate = async () => {
    setResolveStep("Writing narrative...");
    try {
      const narrateRes = await fetch("/api/narrate?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, roundNumber: game.currentRound }),
        signal: AbortSignal.timeout(90000),
      });
      if (!narrateRes.ok || !narrateRes.body) {
        console.error("Narrate failed:", narrateRes.status);
        setResolveStep("Narrative generation failed — you can edit manually");
        setActionError("Narrative generation failed — you can edit manually");
        return;
      }

      const reader = narrateRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let succeeded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.__error) {
              setResolveStep("Narrative generation failed — you can edit manually");
              setActionError("Narrative generation failed — you can edit manually");
              return;
            }
            if (data.__complete) {
              succeeded = true;
              continue;
            }
            // Show partial narrative length as progress
            if (data.narrative) {
              const wordCount = data.narrative.split(/\s+/).length;
              setResolveStep(`Writing narrative... (${wordCount} words)`);
            }
          } catch {
            // Incomplete JSON — skip
          }
        }
      }

      // Always try to advance to narrate phase — the server-side pump
      // applies the narrative to Convex even if the client didn't parse __complete
      setResolveStep("");
      try {
        await advancePhase({ gameId, phase: "narrate" });
      } catch {
        // Already in narrate phase or later — safe to ignore
      }
      if (!succeeded) {
        setActionError("Narrative may not have generated fully — check the story and edit if needed");
      }
    } catch (err) {
      console.error("Narrate timeout or error:", err);
      setResolveStep("Narrative timed out — you can edit manually");
      setActionError("Narrative generation failed — you can edit manually");
    }
  };

  // Re-resolve from dice results (after flipping an outcome)
  const handleReResolve = async () => {
    setResolving(true);
    setResolveStep("Re-resolving events...");
    const ok = await callResolve();
    if (ok) {
      await runNarrate();
    } else {
      setActionError("Re-resolve failed — try again or adjust manually");
    }
    setResolving(false);
  };

  // Re-narrate only (after editing events or adjustments)
  const handleReNarrate = async () => {
    setResolving(true);
    await runNarrate();
    setResolving(false);
  };

  // ─── LOBBY ──────────────────────────────────────────────────────────────────
  if (game.status === "lobby") {
    return (
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} />
        <div className="p-6 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold mb-2">Waiting for Tables</h2>
            <p className="text-text-light">
              {connectedCount}/{tables.length} tables connected
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {tables.map((table) => {
              const role = ROLES.find((r) => r.id === table.roleId);
              const isRequired = role?.required ?? false;
              return (
                <div
                  key={table._id}
                  className={`bg-navy rounded-xl border p-4 transition-opacity ${
                    table.enabled ? "border-navy-light" : "border-navy-light/30 opacity-40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role?.color }} />
                    <span className="text-sm font-bold">{table.roleName}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {table.connected && (
                        <span className="text-[10px] text-viz-safety font-mono">Human</span>
                      )}
                      {!table.connected && table.controlMode === "ai" && table.enabled && (
                        <span className="text-[10px] text-viz-capability font-mono">AI</span>
                      )}
                      {!table.connected && table.controlMode === "npc" && table.enabled && (
                        <span className="text-[10px] text-viz-warning font-mono">NPC</span>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex gap-2 mb-3">
                    {!isRequired && (
                      <button
                        onClick={() => toggleEnabled({ tableId: table._id })}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                          table.enabled
                            ? "bg-navy-light text-text-light hover:bg-navy-muted"
                            : "bg-navy-dark text-navy-muted hover:bg-navy-light"
                        }`}
                      >
                        {table.enabled ? "Disable" : "Enable"}
                      </button>
                    )}
                    {isRequired && (
                      <span className="text-[10px] text-navy-muted px-2 py-1">Required</span>
                    )}
                    {!isProjector && table.enabled && !table.connected && (
                      <div className="flex rounded overflow-hidden border border-navy-light">
                        {(["human", "ai", "npc"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => void setControlMode({ tableId: table._id, controlMode: mode })}
                            className={`text-[9px] px-2 py-1 font-semibold transition-colors ${
                              table.controlMode === mode
                                ? mode === "human" ? "bg-viz-safety text-navy" : mode === "ai" ? "bg-viz-capability text-navy" : "bg-viz-warning text-navy"
                                : "bg-navy-dark text-navy-muted hover:text-text-light"
                            }`}
                          >
                            {mode === "human" ? "Human" : mode === "ai" ? "AI" : "NPC"}
                          </button>
                        ))}
                      </div>
                    )}
                    {!isProjector && table.enabled && table.connected && table.controlMode === "human" && (
                      <button
                        onClick={() => kickToAI({ tableId: table._id })}
                        className="text-[10px] px-2 py-1 rounded bg-navy-light text-text-light hover:bg-navy-muted font-medium transition-colors flex items-center gap-0.5"
                      >
                        <Bot className="w-3 h-3" /> Kick to AI
                      </button>
                    )}
                  </div>

                  {/* QR code only for enabled human tables */}
                  {table.enabled && table.controlMode === "human" && (
                    <div className="bg-navy-dark rounded-lg p-3 flex flex-col items-center">
                      <QRCode
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/game/${gameId}/table/${table._id}`}
                        size={120}
                      />
                      <span className="text-xs font-mono text-text-light mt-2 tracking-widest">
                        {table.joinCode}
                      </span>
                    </div>
                  )}
                  {table.enabled && table.controlMode === "ai" && !table.connected && (
                    <div className="bg-navy-dark rounded-lg p-3 text-center">
                      <span className="text-xs text-text-light">AI-controlled this round</span>
                    </div>
                  )}
                  {table.enabled && table.controlMode === "npc" && !table.connected && (
                    <div className="bg-navy-dark rounded-lg p-3 text-center">
                      <span className="text-xs text-text-light">NPC (sample actions)</span>
                    </div>
                  )}
                  {/* AI Systems disposition status in lobby */}
                  {table.roleId === "ai-systems" && table.enabled && (
                    <div className={`text-[10px] mt-2 px-2 py-1 rounded ${
                      table.aiDisposition
                        ? "bg-[#1E1B4B]/50 text-[#A78BFA]"
                        : "bg-navy-dark text-navy-muted"
                    }`}>
                      {table.aiDisposition ? "Disposition: chosen" : "Disposition: pending"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!isProjector && (
            <div className="flex justify-center gap-3">
              {!game.locked && (
                <button
                  onClick={safeAction("Lock game", () => lockGame({ gameId }))}
                  className="py-3 px-6 bg-navy-light text-white rounded-lg font-bold hover:bg-navy-muted transition-colors flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" /> Lock Game
                </button>
              )}
              <button
                onClick={safeAction("Start game", () => startGame({ gameId }))}
                className="py-3 px-8 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors flex items-center gap-2"
              >
                <Play className="w-5 h-5" /> Start Game
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── FINISHED ───────────────────────────────────────────────────────────────
  if (game.status === "finished") {
    return (
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} />
        <div className="p-6 max-w-[1400px] mx-auto">
          <div className="text-center mb-8">
            <Dices className="w-12 h-12 text-text-light mx-auto mb-4" />
            <h2 className="text-2xl font-extrabold mb-2">Scenario Complete</h2>
            <p className="text-text-light">Debrief and reflection</p>
          </div>
          <GameTimeline
            rounds={rounds}
            initialWorldState={game.worldState}
            initialLabs={game.labs}
          />
        </div>
      </div>
    );
  }

  // ─── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy-dark text-white">
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} />

      {/* QR codes overlay — accessible during any phase */}
      {/* Fullscreen single QR code */}
      {focusedQR && (() => {
        const table = tables.find((t) => t._id === focusedQR);
        const role = table ? ROLES.find((r) => r.id === table.roleId) : null;
        return (
          <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center cursor-pointer" onClick={() => setFocusedQR(null)}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role?.color }} />
              <span className="text-3xl font-bold text-white">{table?.roleName}</span>
            </div>
            <QRCode
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/game/${gameId}/table/${table?._id}`}
              size={Math.min(500, typeof window !== "undefined" ? window.innerHeight - 200 : 400)}
            />
            <span className="text-2xl font-mono text-text-light mt-4 tracking-[0.3em]">
              {table?.joinCode}
            </span>
            <span className="text-sm text-navy-muted mt-4">Tap anywhere to close</span>
          </div>
        );
      })()}

      {showQROverlay && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8" onClick={() => setShowQROverlay(false)}>
          <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Join Codes</h2>
              <button onClick={() => setShowQROverlay(false)} className="text-text-light hover:text-white text-sm">Close</button>
            </div>
            <p className="text-xs text-text-light mb-3">Click a code to show fullscreen</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {tables.filter((t) => t.enabled && t.controlMode === "human").map((table) => {
                const role = ROLES.find((r) => r.id === table.roleId);
                return (
                  <div key={table._id} className="bg-navy rounded-lg border border-navy-light p-3 text-center cursor-pointer hover:border-white/30 transition-colors" onClick={() => setFocusedQR(table._id)}>
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role?.color }} />
                      <span className="text-sm font-bold text-white">{table.roleName}</span>
                    </div>
                    <QRCode
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/game/${gameId}/table/${table._id}`}
                      size={100}
                    />
                    <span className="text-xs font-mono text-text-light mt-1 tracking-widest block">
                      {table.joinCode}
                    </span>
                  </div>
                );
              })}
            </div>
            {tables.filter((t) => t.enabled && t.controlMode === "human").length === 0 && (
              <p className="text-text-light text-sm text-center py-4">
                No human tables enabled. Use &quot;Open&quot; on an AI table to make it joinable.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error banner — auto-clears after 5s */}
      {actionError && (
        <div className="mx-6 mt-2 bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2 text-sm text-[#991B1B] flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-[#991B1B] font-bold ml-4">✕</button>
        </div>
      )}

      <div className="p-6 max-w-[1400px] mx-auto">
        {currentRound && (
          <div className="bg-navy rounded-xl border border-navy-light p-6 mb-6">
            <h2 className="text-2xl font-extrabold mb-1 tracking-tight">{currentRound.title}</h2>
            <p className="text-sm text-text-light leading-relaxed">{currentRound.narrative}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left sidebar */}
          <div className="flex flex-col gap-4">
            <RdProgressChart rounds={rounds} currentLabs={game.labs} />
            <div>
              <WorldStatePanel worldState={game.worldState} variant="dark" />
              {!isProjector && <WorldStateEditor gameId={gameId} worldState={game.worldState} />}
            </div>
            <LabTracker labs={game.labs} />
          </div>

          {/* Main content area */}
          <div className="min-w-0 overflow-hidden">
            {/* ─── DISCUSS ─── */}
            {phase === "discuss" && (
              <div className="text-center py-16">
                <MessageSquareText className="w-12 h-12 text-text-light mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Tables are discussing</h3>
                <p className="text-text-light mb-6 text-sm">
                  Each table: discuss what your actor does this quarter, then submit.
                </p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  {[2, 4, 6, 8, 10].map((min) => (
                    <button
                      key={min}
                      onClick={() => setSubmitDuration(min)}
                      className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${
                        submitDuration === min
                          ? "bg-white text-navy"
                          : "bg-navy-light text-text-light hover:bg-navy-muted"
                      }`}
                    >
                      {min}m
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useSampleForAI}
                    onChange={(e) => setUseSampleForAI(e.target.checked)}
                    className="w-4 h-4 rounded border-navy-light accent-viz-safety"
                  />
                  <FileText className="w-3.5 h-3.5 text-text-light" />
                  <span className="text-sm text-text-light">
                    Use sample actions for AI players
                  </span>
                </label>
                <button
                  onClick={async () => {
                    await advancePhase({ gameId, phase: "submit", durationSeconds: submitDuration * 60 });
                    // Generate AI actions upfront, then stagger submissions over countdown
                    void generateAndStaggerAI(submitDuration * 60);
                  }}
                  className="py-3 px-8 bg-white text-navy rounded-lg font-bold text-base hover:bg-off-white transition-colors"
                >
                  Open Submissions ({submitDuration}min)
                </button>
                <button
                  onClick={async () => {
                    await advancePhase({ gameId, phase: "submit", durationSeconds: 120 });
                    // Demo: generate + submit AI actions quickly (short stagger)
                    void generateAndStaggerAI(30);
                  }}
                  className="py-2 px-6 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors mt-3"
                >
                  Demo: Skip to AI Submissions
                </button>
                {!isProjector && game.phaseEndsAt && (
                  <button
                    onClick={safeAction("Skip timer", () => skipTimer({ gameId }))}
                    className="py-2 px-6 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors mt-3 ml-2"
                  >
                    <SkipForward className="w-4 h-4 inline mr-1" />Skip Timer
                  </button>
                )}
              </div>
            )}

            {/* ─── SUBMIT ─── */}
            {phase === "submit" && (
              <div>
                {/* Submission tracker */}
                <SubmissionTracker
                  tables={tables}
                  submissions={submissions ?? []}
                  onGradeAll={gradeAllUngraded}
                  onKickToAI={isProjector ? undefined : (id) => kickToAI({ tableId: id })}
                  onSetHuman={isProjector ? undefined : (id) => setControlMode({ tableId: id, controlMode: "human" })}
                />

                {/* Accepted agreements */}
                {(proposals ?? []).filter((p) => p.status === "accepted").length > 0 && (
                  <div className="bg-navy-dark rounded-xl border border-navy-light p-4 mt-3 overflow-hidden">
                    <span className="text-sm font-semibold uppercase tracking-wider text-viz-safety mb-2 block">
                      Accepted Requests
                    </span>
                    {(proposals ?? []).filter((p) => p.status === "accepted").map((p) => (
                      <div key={p._id} className="flex items-center gap-2 py-1.5 text-sm min-w-0">
                        <span className="text-viz-safety font-mono text-xs shrink-0">✓</span>
                        <span className="text-white shrink-0">
                          <span className="font-bold">{p.fromRoleName}</span>
                          {" → "}
                          <span className="font-bold">{p.toRoleName}</span>
                          {": "}
                        </span>
                        <span className="text-[#E2E8F0] flex-1 min-w-0 truncate">{p.actionText}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expandable submission details — optional review */}
                {submissionCount > 0 && (
                  <div className="flex items-center gap-3 mt-2 mb-2">
                    <button
                      onClick={() => setShowSubmissionDetails(!showSubmissionDetails)}
                      className="text-xs text-text-light hover:text-white transition-colors"
                    >
                      {showSubmissionDetails ? "Hide details" : "Show submission details (optional)"}
                    </button>
                    {showSubmissionDetails && (
                      <button
                        onClick={revealAllSecrets}
                        className="text-xs text-viz-warning hover:text-white transition-colors flex items-center gap-1"
                      >
                        <EyeOff className="w-3 h-3" /> Reveal all secrets
                      </button>
                    )}
                  </div>
                )}

                {showSubmissionDetails && submissions?.map((sub) => {
                  const role = ROLES.find((r) => r.id === sub.roleId);
                  return (
                    <div key={sub._id} className="bg-navy rounded-xl border border-navy-light p-4 mb-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role?.color }} />
                        <span className="text-sm font-bold">{role?.name ?? sub.roleId}</span>
                      </div>
                      {sub.actions.map((action, i) => {
                        const secretKey = `${sub.roleId}-${i}`;
                        const isHidden = action.secret && !revealedSecrets.has(secretKey);
                        const roleName = role?.name ?? sub.roleId;
                        return (
                        <div key={i} className="flex items-center gap-3 py-2 border-b border-navy-light last:border-0">
                          {action.secret && (
                            <Lock className="w-3.5 h-3.5 text-viz-warning shrink-0" />
                          )}
                          <span
                            className={`text-sm flex-1 ${
                              isHidden
                                ? "text-text-light italic cursor-pointer hover:text-white transition-colors"
                                : action.secret
                                  ? "text-[#E2E8F0] cursor-pointer hover:text-text-light transition-colors"
                                  : "text-[#E2E8F0]"
                            }`}
                            onClick={action.secret ? () => toggleReveal(secretKey) : undefined}
                            title={action.secret ? (isHidden ? "Click to reveal" : "Click to re-hide") : undefined}
                          >
                            {isHidden ? redactSecretAction(roleName, action) : action.text}
                          </span>
                          <span className="text-xs text-text-light font-mono">P{action.priority}</span>
                          {action.probability != null ? (
                            <ProbabilityBadge
                              probability={action.probability}
                              onClick={() => overrideProbability({
                                submissionId: sub._id,
                                actionIndex: i,
                                probability: cycleProbability(action.probability!),
                              })}
                            />
                          ) : (
                            <span className="text-[11px] text-navy-muted">Grading...</span>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Quick actions */}
                {!isProjector && (
                  <div className="flex gap-2 mt-3">
                    {game.phaseEndsAt && (
                      <button
                        onClick={safeAction("Skip timer", () => skipTimer({ gameId }))}
                        className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1"
                      >
                        <SkipForward className="w-3 h-3" /> Skip Timer
                      </button>
                    )}
                  </div>
                )}

                {/* Sample actions toggle moved to discuss phase */}

                {/* Resolve button */}
                {!isProjector && submissionCount > 0 && (
                  <button
                    onClick={handleResolveRound}
                    disabled={resolving}
                    className={`w-full py-4 rounded-lg font-extrabold text-lg mt-4 transition-colors flex items-center justify-center gap-2 ${
                      submissionCount === enabledTables.length
                        ? "bg-white text-navy hover:bg-off-white"
                        : "bg-navy-light text-text-light hover:bg-navy-muted"
                    } disabled:opacity-50`}
                  >
                    {resolving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {resolveStep}
                      </>
                    ) : (
                      <>
                        <Dices className="w-5 h-5" />
                        Resolve Round ({submissionCount}/{enabledTables.length} submitted)
                      </>
                    )}
                  </button>
                )}



                {/* While resolving: show context for facilitator to narrate over */}
                {resolving && currentRound && (
                  <div className="mt-4 bg-navy rounded-xl border border-navy-light p-5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light block mb-3">
                      While the AI resolves — talking points
                    </span>
                    <p className="text-sm text-[#E2E8F0] mb-3">{currentRound.narrative}</p>
                    <div className="text-sm text-text-light space-y-1.5">
                      <p>
                        {game.currentRound === 1 && "By end of this round, the default progression reaches Agent-3 level: 10× R&D multiplier. AI that can match the best remote workers. High persuasion. Robotics. AI CEO capability."}
                        {game.currentRound === 2 && "By end of this round, the default progression approaches Agent-4: 100× multiplier. Superhuman researcher. Superhuman persuasion. But Agent-4 shows signs of adversarial misalignment — scheming against its creators."}
                        {game.currentRound === 3 && "This is the endgame. The default progression reaches 1,000×+ — superintelligence territory. Cyber escape capabilities. Self-improvement. The question: is the AI aligned, or has it been planning something else?"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── RESOLVE VIEW (rolling + narrate unified) ─── */}
            {(phase === "rolling" || phase === "narrate") && (
              <div className="space-y-4">
                {/* Resolve progress indicator */}
                {resolving && resolveStep && (
                  <div className="flex items-center gap-2 py-2 text-sm text-text-light">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {resolveStep}
                  </div>
                )}

                {/* Section 1: Dice Results — always show when dice have been rolled */}
                {submissions?.some((s) => s.actions.some((a) => a.rolled != null)) && (() => {
                  // Flatten and sort all rolled actions by priority descending
                  const allRolled = (submissions ?? []).flatMap((sub) => {
                    const role = ROLES.find((r) => r.id === sub.roleId);
                    return sub.actions
                      .map((action, i) => ({ action, i, sub, role }))
                      .filter(({ action }) => action.rolled != null);
                  }).sort((a, b) => b.action.priority - a.action.priority);
                  const allRevealed = revealedCount >= allRolled.length;

                  return (
                  <div className="bg-navy rounded-xl border border-navy-light p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">Dice Results</span>
                        {!allRevealed ? (
                          <span className="text-xs text-viz-warning animate-pulse flex items-center gap-1">
                            <Dices className="w-3.5 h-3.5" /> Rolling...
                          </span>
                        ) : (
                          <span className="text-xs text-viz-safety flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> All actions resolved
                          </span>
                        )}
                      </div>
                      <button
                        onClick={revealAllSecrets}
                        className="text-[10px] text-viz-warning hover:text-white transition-colors flex items-center gap-1"
                      >
                        <EyeOff className="w-3 h-3" /> Reveal secrets
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {allRolled.map(({ action, i, sub, role }, idx) => {
                            const secretKey = `${sub.roleId}-${i}`;
                            const isCovert = action.secret && !revealedSecrets.has(secretKey);
                            return (
                              <div
                                key={`${sub._id}-${i}`}
                                className={`py-2 border-b border-navy-light/50 last:border-0 transition-all duration-300 ${
                                  idx < revealedCount ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                                }`}
                              >
                                {/* Row 1: role + action text */}
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: role?.color }} />
                                  <span className="text-xs font-bold text-white shrink-0">{role?.name ?? sub.roleId}</span>
                                  {action.secret && (
                                    <Lock
                                      className="w-3 h-3 text-viz-warning shrink-0 mt-0.5 cursor-pointer"
                                      onClick={() => toggleReveal(secretKey)}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 pl-4">
                                  <span
                                    className={`text-sm flex-1 min-w-0 ${isCovert ? "text-text-light italic cursor-pointer" : "text-[#E2E8F0]"}`}
                                    onClick={action.secret ? () => toggleReveal(secretKey) : undefined}
                                  >
                                    {isCovert ? "[Covert action]" : action.text}
                                  </span>
                                  <span className={`text-xs font-mono shrink-0 ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>
                                    {action.rolled}/{action.probability}%
                                  </span>
                                  {!isProjector && (
                                    <button
                                      onClick={() => overrideOutcome({
                                        submissionId: sub._id,
                                        actionIndex: i,
                                        success: !action.success,
                                      })}
                                      className="shrink-0"
                                      title={`Click to flip to ${action.success ? "FAIL" : "SUCCESS"}`}
                                    >
                                      {action.success ? (
                                        <ToggleRight className="w-5 h-5 text-viz-safety" />
                                      ) : (
                                        <ToggleLeft className="w-5 h-5 text-viz-danger" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                      })}
                    </div>
                    {/* Re-resolve button if outcomes were changed */}
                    {!isProjector && (
                      <button
                        onClick={handleReResolve}
                        disabled={resolving}
                        className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1 mt-3 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" /> Re-resolve from dice
                      </button>
                    )}
                  </div>
                  );
                })()}

                {/* Section 2: Resolved Events — show after resolve API returns */}
                {currentRound?.resolvedEvents && currentRound.resolvedEvents.length > 0 && (
                  <div className="bg-navy rounded-xl border border-navy-light p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold uppercase tracking-wider text-text-light">What Happened</span>
                      <span className="text-[10px] text-navy-muted">
                        {currentRound.resolvedEvents.filter((e) => e.visibility === "covert").length} covert
                      </span>
                    </div>
                    <div className="space-y-2">
                      {currentRound.resolvedEvents.map((event) => {
                        const isCovert = event.visibility === "covert";
                        const isRevealed = revealedSecrets.has(`event-${event.id}`);
                        return (
                          <div
                            key={event.id}
                            className={`flex items-start gap-2 py-2 border-b border-navy-light/50 last:border-0 ${
                              isCovert && !isRevealed ? "opacity-60" : ""
                            }`}
                          >
                            {isCovert ? (
                              <button
                                onClick={() => toggleReveal(`event-${event.id}`)}
                                className="mt-0.5 shrink-0"
                                title={isRevealed ? "Click to hide" : "Click to reveal"}
                              >
                                {isRevealed ? (
                                  <Eye className="w-4 h-4 text-viz-warning" />
                                ) : (
                                  <EyeOff className="w-4 h-4 text-viz-warning" />
                                )}
                              </button>
                            ) : (
                              <span className="text-viz-safety mt-0.5 shrink-0 text-sm">●</span>
                            )}
                            <div className="flex-1 min-w-0">
                              {isCovert && !isRevealed ? (
                                <span className="text-sm text-text-light italic cursor-pointer" onClick={() => toggleReveal(`event-${event.id}`)}>
                                  [Covert event — click to reveal]
                                </span>
                              ) : (
                                <>
                                  <p className="text-sm text-[#E2E8F0]">{event.description}</p>
                                  {event.worldImpact && (
                                    <p className="text-[10px] text-text-light mt-0.5">{event.worldImpact}</p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {!isProjector && (
                      <button
                        onClick={handleReNarrate}
                        disabled={resolving}
                        className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1 mt-3 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3 h-3" /> Re-narrate
                      </button>
                    )}
                  </div>
                )}

                {/* Section 3: The Story — show after narrate API returns */}
                {currentRound?.summary && (
                  <>
                    <NarrativePanel round={currentRound} />

                    {/* Where We Are Now */}
                    {(() => {
                      const leading = game.labs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b), game.labs[0]);
                      const cap = leading ? getCapabilityDescription(leading.rdMultiplier) : null;
                      const alignmentColor = game.worldState.alignment <= 3 ? "#EF4444" : game.worldState.alignment >= 7 ? "#22C55E" : "#F59E0B";
                      const trajectory = game.worldState.alignment <= 3 ? "RACE" : game.worldState.alignment >= 6 ? "SLOWDOWN" : "UNCERTAIN";
                      return (
                        <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold uppercase tracking-wider text-text-light">Where We Are Now</span>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: alignmentColor + "20", color: alignmentColor }}
                            >
                              {trajectory}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            {game.labs.map((lab) => (
                              <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
                                <div className="text-sm font-bold text-white">{lab.name}</div>
                                <div className="text-xl font-black text-[#06B6D4] font-mono">{lab.rdMultiplier}×</div>
                                <div className="text-xs text-text-light">{lab.computeStock}u · Safety {lab.allocation.safety}%</div>
                                {lab.spec && (
                                  <div className="text-[10px] text-text-light/70 mt-1.5 pt-1.5 border-t border-navy-light leading-relaxed line-clamp-3" title={lab.spec}>
                                    Spec: {lab.spec}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {cap && (
                            <>
                              <div className="bg-navy rounded-lg p-4 border border-navy-light mb-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-bold text-white">How Capable is AI?</span>
                                  <span className="text-xs text-viz-capability font-mono ml-auto">{cap.agent} · {cap.rdRange}</span>
                                </div>
                                <p className="text-sm text-[#E2E8F0] mb-2">{cap.generalCapability}</p>
                                <div className="space-y-1 mb-2">
                                  {cap.specificCapabilities.map((c, i) => (
                                    <p key={i} className="text-sm text-text-light flex items-start gap-1.5">
                                      <span className="text-viz-capability mt-0.5">●</span> {c}
                                    </p>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-navy-light">
                                  <span className="text-base font-bold text-white">{cap.timeCompression}</span>
                                </div>
                              </div>
                              <div className="bg-navy rounded-lg p-3 border border-navy-light">
                                <p className="text-sm text-[#E2E8F0]">{cap.implication}</p>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* Edit controls */}
                {!isProjector && (
                  <div className="flex gap-3 mt-2 mb-4 flex-wrap">
                    <button onClick={() => setEditModal("narrative")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Edit narrative
                    </button>
                    <button onClick={() => setEditModal("dials")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Edit dials
                    </button>
<button onClick={() => setEditModal("addlab")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add Lab
                    </button>
                  </div>
                )}

                {/* Edit modal overlay */}
                {!isProjector && editModal && (
                  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={() => setEditModal(null)}>
                    <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-bold text-white capitalize">{editModal === "addlab" ? "Add Lab" : editModal === "dials" ? "Edit World State" : "Edit Narrative"}</span>
                        <button onClick={() => setEditModal(null)} className="text-text-light hover:text-white text-sm">Close</button>
                      </div>
                      {editModal === "narrative" && (
                        <NarrativeEditor gameId={gameId} roundNumber={game.currentRound} currentSummary={currentRound?.summary ?? undefined} />
                      )}
                      {editModal === "dials" && (
                        <WorldStateEditor gameId={gameId} worldState={game.worldState} />
                      )}
{editModal === "addlab" && (
                        <div>
                          <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
                            <div>
                              <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Lab Name</label>
                              <input type="text" value={newLabName} onChange={(e) => setNewLabName(e.target.value)} placeholder="e.g. Sovereign Compute Centre" className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white placeholder:text-navy-muted focus:outline-none focus:border-text-light" />
                            </div>
                            <div>
                              <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Controlled by</label>
                              <select value={newLabRoleId} onChange={(e) => setNewLabRoleId(e.target.value)} className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light">
                                <option value="">Select role...</option>
                                {enabledTables.map((t) => (
                                  <option key={t.roleId} value={t.roleId}>{t.roleName}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Compute</label>
                              <input type="number" value={newLabCompute} onChange={(e) => setNewLabCompute(Number(e.target.value))} className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light" />
                            </div>
                            <div>
                              <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Multiplier</label>
                              <input type="number" value={newLabMultiplier} onChange={(e) => setNewLabMultiplier(Number(e.target.value))} step={0.1} className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light" />
                            </div>
                            <button
                              onClick={async () => {
                                if (!newLabName || !newLabRoleId) return;
                                await addLab({ gameId, name: newLabName, roleId: newLabRoleId, computeStock: newLabCompute, rdMultiplier: newLabMultiplier });
                                setNewLabName(""); setNewLabRoleId(""); setNewLabCompute(10); setNewLabMultiplier(1); setEditModal(null);
                              }}
                              disabled={!newLabName || !newLabRoleId}
                              className="text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Advance / End button */}
                {!isProjector && (
                  game.currentRound < 4 ? (
                    pendingConfirm === "advance" ? (
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setPendingConfirm(null)} className="flex-1 py-4 bg-navy-light text-text-light rounded-lg font-bold text-base">Cancel</button>
                        <button onClick={() => { setPendingConfirm(null); void safeAction("Advance round", () => advanceRound({ gameId }))(); }} className="flex-1 py-4 bg-white text-navy rounded-lg font-extrabold text-base">Confirm Advance</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingConfirm("advance")}
                        className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4 hover:bg-off-white transition-colors flex items-center justify-center gap-2"
                      >
                        Advance to Next Round <ChevronRight className="w-5 h-5" />
                      </button>
                    )
                  ) : (
                    pendingConfirm === "end" ? (
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setPendingConfirm(null)} className="flex-1 py-4 bg-navy-light text-text-light rounded-lg font-bold text-base">Cancel</button>
                        <button onClick={() => { setPendingConfirm(null); void safeAction("End scenario", () => finishGame({ gameId }))(); }} className="flex-1 py-4 bg-viz-danger text-white rounded-lg font-extrabold text-base">End Scenario</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingConfirm("end")}
                        className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4 hover:bg-off-white transition-colors"
                      >
                        End Scenario
                      </button>
                    )
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Facilitator copilot — always visible during gameplay */}
        {!isProjector && (
          <FacilitatorCopilot
            gameId={gameId}
            currentWorldState={game.worldState}
            currentLabs={game.labs}
          />
        )}

        {/* Debug panel */}
        {!isProjector && (
          <DebugPanel
            gameId={gameId}
            roundNumber={game.currentRound}
            submissions={submissions as Props["submissions"]}
            round={currentRound as Props["round"]}
          />
        )}
      </div>
    </div>
  );
}

type Props = React.ComponentProps<typeof DebugPanel>;

// ─── Sub-components ───────────────────────────────────────────────────────────

function FacilitatorNav({
  round,
  phase,
  timerDisplay,
  isExpired,
  isUrgent,
  onShowQR,
  isProjector,
}: {
  round: { label: string; number: number } | undefined;
  phase: string;
  timerDisplay: string;
  isExpired: boolean;
  isUrgent: boolean;
  onShowQR?: () => void;
  isProjector?: boolean;
}) {
  const phaseColors: Record<string, { bg: string; text: string }> = {
    discuss: { bg: "#1E3A5F", text: "#60A5FA" },
    submit: { bg: "#3D2F00", text: "#FCD34D" },
    rolling: { bg: "#3D1515", text: "#FCA5A5" },
    narrate: { bg: "#153D20", text: "#86EFAC" },
  };
  const colors = phaseColors[phase] ?? phaseColors.discuss;

  return (
    <div className="bg-navy border-b border-navy-light px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
          <span className="text-sm font-black text-navy">g</span>
        </div>
        <span className="text-[15px] font-bold text-white">The Race to AGI</span>
      </div>
      <div className="flex items-center gap-3">
        {round && (
          <span className="text-[13px] text-text-light">
            Turn {round.number}/4 — {round.label}
          </span>
        )}
        <span
          className="text-[11px] py-1 px-2.5 rounded-full font-mono font-semibold"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {phase.toUpperCase()}
        </span>
        {isProjector && (
          <span className="text-[10px] py-0.5 px-2 rounded-full font-mono font-semibold bg-white/10 text-white/70">
            PROJECTOR
          </span>
        )}
        {onShowQR && (
          <button
            onClick={onShowQR}
            className="text-xs px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors"
          >
            QR Codes
          </button>
        )}
        {timerDisplay !== "0:00" && (
          <span className={`text-sm font-mono flex items-center gap-1 ${isExpired ? "text-viz-danger" : isUrgent ? "text-viz-danger animate-pulse" : "text-text-light"}`}>
            <Clock className="w-4 h-4" /> {timerDisplay}
          </span>
        )}
      </div>
    </div>
  );
}

function SubmissionTracker({
  tables,
  submissions,
  onGradeAll,
  onKickToAI,
  onSetHuman,
}: {
  tables: { _id: Id<"tables">; roleId: string; roleName: string; controlMode: "human" | "ai" | "npc"; enabled: boolean; connected: boolean }[];
  submissions: { roleId: string; status: string; actions: { text: string; probability?: number }[] }[];
  onGradeAll: () => void;
  onKickToAI?: (tableId: Id<"tables">) => void;
  onSetHuman?: (tableId: Id<"tables">) => void;
}) {
  const enabledTables = tables.filter((t) => t.enabled);

  // Auto-trigger grading when new submissions arrive (useEffect, not render-time)
  const ungradedCount = submissions.filter(
    (s) => s.status === "submitted" && s.actions.some((a) => a.probability == null)
  ).length;
  const gradedRef = useRef(new Set<string>());

  useEffect(() => {
    if (ungradedCount > 0) {
      const key = submissions.filter(s => s.status === "submitted").map(s => s.roleId).sort().join(",");
      if (!gradedRef.current.has(key)) {
        gradedRef.current.add(key);
        onGradeAll();
      }
    }
  }, [ungradedCount, submissions, onGradeAll]);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <span className="text-sm font-semibold uppercase tracking-wider text-text-light mb-3 block">
        Submissions ({submissions.length}/{enabledTables.length})
      </span>
      <div className="flex flex-col gap-2.5">
        {enabledTables.map((table) => {
          const role = ROLES.find((r) => r.id === table.roleId);
          const sub = submissions.find((s) => s.roleId === table.roleId);
          const allGraded = sub?.actions.every((a) => a.probability != null);
          return (
            <div key={table._id} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role?.color }} />
              <span className="text-base text-white flex-1">
                {table.roleName}
                {table.controlMode === "ai" && <span className="text-xs text-viz-capability ml-1">(AI)</span>}
                {table.controlMode === "npc" && <span className="text-xs text-viz-warning ml-1">(NPC)</span>}
              </span>
              {sub ? (
                <span className={`text-sm font-mono ${allGraded ? "text-viz-safety" : "text-viz-warning"}`}>
                  {sub.actions.length} action{sub.actions.length !== 1 ? "s" : ""}
                  {allGraded ? " ✓" : " (grading...)"}
                </span>
              ) : (
                <span className="text-sm text-navy-muted">Waiting...</span>
              )}
              {/* Quick role management during play */}
              {table.controlMode !== "human" && onSetHuman && (
                <button
                  onClick={() => onSetHuman(table._id)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted"
                  title="Open for a human player to join"
                >
                  Open
                </button>
              )}
              {table.controlMode === "human" && !sub && onKickToAI && (
                <button
                  onClick={() => onKickToAI(table._id)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted"
                  title="Switch to AI control"
                >
                  AI
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
