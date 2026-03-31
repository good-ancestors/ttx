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

/** Pick a random AI disposition using crypto (excludes "other"). */
function pickRandomDisposition() {
  const rollable = AI_DISPOSITIONS.filter((d) => d.id !== "other");
  const arr = new Uint32Array(1);
  if (typeof crypto !== "undefined") crypto.getRandomValues(arr);
  return rollable[arr[0] % rollable.length];
}
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, AI_DISPOSITIONS, getDisposition } from "@/lib/game-data";
import { useCountdown } from "@/lib/hooks";
import { RdProgressChart } from "@/components/rd-progress-chart";
import { WorldStatePanel } from "@/components/world-state-panel";
import { LabTracker } from "@/components/lab-tracker";
import { GameTimeline } from "@/components/game-timeline";
import { QRCode } from "@/components/qr-codes";
import { WorldStateEditor, FacilitatorCopilot } from "@/components/manual-controls";
import { DebugPanel } from "@/components/debug-panel";
import {
  Clock,
  Loader2,
  Dices,
  RotateCcw,
} from "lucide-react";
import { loadSampleActions, getSampleActions, pickRandom, type SampleActionsData } from "@/lib/sample-actions";
import { PRIORITY_DECAY } from "@/lib/game-data";

import { LobbyPhase } from "@/components/facilitator/lobby-phase";
import { DiscussPhase } from "@/components/facilitator/discuss-phase";
import { SubmitPhase } from "@/components/facilitator/submit-phase";
import { RollingPhase } from "@/components/facilitator/rolling-phase";
import { NarratePhase } from "@/components/facilitator/narrate-phase";

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
  const overrideProbability = useMutation(api.submissions.overrideProbability);
  const rerollAction = useMutation(api.submissions.rerollAction);
  const setControlMode = useMutation(api.tables.setControlMode);
  const toggleEnabled = useMutation(api.tables.toggleEnabled);
  const skipTimer = useMutation(api.games.skipTimer);
  const kickToAI = useMutation(api.tables.kickToAI);
  const addLab = useMutation(api.games.addLab);
  const mergeLabs = useMutation(api.games.mergeLabs);
  const restoreSnapshot = useMutation(api.games.restoreSnapshot);
  const clearResolution = useMutation(api.rounds.clearResolution);
  const setResolvingMut = useMutation(api.games.setResolving);
  const sendRequest = useMutation(api.requests.send);
  const submitActions = useMutation(api.submissions.submit);
  const setDispositionMut = useMutation(api.tables.setDisposition);

  const { display: timerDisplay, isExpired, isUrgent } = useCountdown(game?.phaseEndsAt);

  const triggerPipeline = useMutation(api.games.triggerResolvePipeline);
  const openSubmissions = useMutation(api.games.openSubmissions);

  // Pipeline state: derive from game document (reactive) instead of local state
  const pipelineStatus = game?.pipelineStatus;
  const resolving = !!pipelineStatus && pipelineStatus.step !== "done" && pipelineStatus.step !== "error";
  const resolveStep = pipelineStatus?.detail ?? pipelineStatus?.step ?? "";

  // Legacy local state for backward compat (re-resolve/re-narrate still use old API routes)
  const [streamingEvents, setStreamingEvents] = useState<{ id: string; description: string; visibility: string; worldImpact?: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  // No-op setter for legacy callResolve/runNarrate functions (progress now comes from pipelineStatus)
  const setResolveStep = (_s: string) => { /* no-op — progress is reactive via pipelineStatus */ };
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
  const [showQROverlay, setShowQROverlay] = useState(false);
  const [focusedQR, setFocusedQR] = useState<string | null>(null);
  const [submitDuration, setSubmitDuration] = useState(4);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
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
  // Stagger action reveals one at a time (graded or rolled)
  useEffect(() => {
    if (!isRollingPhase) return;
    const total = (submissions ?? []).flatMap((s) => s.actions.filter((a) => a.probability != null || a.rolled != null)).length;
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
  const connectedCount = tables.filter((t) => t.connected).length;
  const snapshotOptions = isProjector ? [] : rounds.flatMap(r => {
    const opts: { number: number; label: string; useBefore: boolean; desc: string }[] = [];
    if (r.worldStateBefore) opts.push({ number: r.number, label: r.label, useBefore: true, desc: `Before ${r.label} resolve` });
    if (r.worldStateAfter) opts.push({ number: r.number, label: r.label, useBefore: false, desc: `After ${r.label} resolve` });
    return opts;
  });

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

    // Ensure sample actions are loaded (fixes race condition where facilitator
    // opens submissions before the async fetch completes)
    let samples = sampleActionsData;
    if (!samples) {
      try { samples = await loadSampleActions(); setSampleActionsData(samples); } catch { /* proceed without samples */ }
    }

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
    type PendingSubmission = { table: typeof unsubmitted[0]; actions: { text: string; priority: number; secret?: boolean }[]; endorseHints?: { actionText: string; targetRoleIds: string[] }[] };
    const pending: PendingSubmission[] = [];

    // Split into NPC tables (always use samples) and AI tables (use LLM or samples based on toggle)
    const npcTables = unsubmitted.filter((t) => t.controlMode === "npc");
    const aiTables = unsubmitted.filter((t) => t.controlMode === "ai");

    // Scale AI/NPC action count based on total enabled tables
    const totalEnabled = (tables ?? []).filter((t) => t.enabled).length;
    const actionsPerTable = totalEnabled <= 6 ? 3 : totalEnabled <= 11 ? 2 : 1;

    // NPC tables always use sample actions
    if (samples) {
      const activeRoleIds = new Set((tables ?? []).filter((t) => t.enabled).map((t) => t.roleId));
      for (const table of npcTables) {
        const all = getSampleActions(samples, table.roleId, game.currentRound);
        if (all.length === 0) continue;
        const picked = pickRandom(all, actionsPerTable);
        const decay = PRIORITY_DECAY[picked.length] ?? PRIORITY_DECAY[5];
        pending.push({
          table,
          actions: picked.map((a, i) => ({ text: a.text, priority: decay[i] ?? 1, secret: a.secret || undefined })),
          endorseHints: picked
            .filter((a) => a.endorseHint?.length)
            .map((a) => ({ actionText: a.text, targetRoleIds: a.endorseHint.filter((id) => activeRoleIds.has(id) && id !== table.roleId) }))
            .filter((h) => h.targetRoleIds.length > 0),
        });
      }
    }

    if (useSampleForAI && samples) {
      // Sample mode for AI tables: instant selection
      for (const table of aiTables) {
        const all = getSampleActions(samples, table.roleId, game.currentRound);
        if (all.length === 0) continue;
        const picked = pickRandom(all, actionsPerTable);
        const decay = PRIORITY_DECAY[picked.length] ?? PRIORITY_DECAY[5];
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
              generateOnly: true,
              maxActions: actionsPerTable,
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
      const { table, actions, endorseHints } = pending[i];
      const delay = delays[i];

      const timerId = setTimeout(() => {
        pendingAISubmissions.current = pendingAISubmissions.current.filter((p) => p.timerId !== timerId);
        void submitAITable(table, actions, endorseHints);
      }, delay);

      pendingAISubmissions.current.push({ table: { _id: table._id as string, roleId: table.roleId }, actions, timerId });
    }
  };

  // Submit a single AI table's actions + trigger proposals after
  const submitAITable = async (table: AITableRef, actions: { text: string; priority: number; secret?: boolean }[], endorseHints?: { actionText: string; targetRoleIds: string[] }[]) => {
    try {
      await submitActions({
        tableId: table._id as Id<"tables">,
        gameId,
        roundNumber: game.currentRound,
        roleId: table.roleId,
        actions,
      });
      // Send endorsement requests from sample action hints (NPC tables)
      if (endorseHints?.length) {
        const roleMap = new Map((tables ?? []).filter((t) => t.enabled).map((t) => [t.roleId, t.roleName]));
        for (const hint of endorseHints) {
          for (const targetId of hint.targetRoleIds.slice(0, 1)) { // Send to first hint only to avoid spam
            try {
              await sendRequest({
                gameId, roundNumber: game.currentRound,
                fromRoleId: table.roleId, fromRoleName: roleMap.get(table.roleId) ?? table.roleId,
                toRoleId: targetId, toRoleName: roleMap.get(targetId) ?? targetId,
                actionText: hint.actionText, requestType: "endorsement" as const,
              });
            } catch { /* request already exists or phase changed */ }
          }
        }
      }
      // Send LLM proposals shortly after (responds to incoming + may create new)
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
    setActionError(null);

    try {
      // Flush any AI submissions still pending from browser stagger schedule
      if (pendingAISubmissions.current.length > 0) {
        await flushPendingAI();
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Recovery: if there are unsubmitted non-human tables, generate + submit now
      const nonHumanTables = (tables ?? []).filter((t) => t.controlMode !== "human" && t.enabled);
      const submittedRoles = new Set((submissions ?? []).map((s) => s.roleId));
      const missingTables = nonHumanTables.filter((t) => !submittedRoles.has(t.roleId));
      if (missingTables.length > 0) {
        await generateAndStaggerAI(10);
        await flushPendingAI();
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Trigger AI proposals (respond to pending endorsement requests)
      triggerAIProposals();
      await new Promise((r) => setTimeout(r, 3000));

      // Trigger the server-side pipeline — everything from here runs independently
      await triggerPipeline({
        gameId,
        roundNumber: game.currentRound,
        aiDisposition: aiDispositionPayload,
      });
    } catch (err) {
      console.error("Resolve failed:", err);
      setActionError(`Resolve failed: ${err instanceof Error ? err.message : "Unknown error"}. You can retry.`);
      for (const p of pendingAISubmissions.current) clearTimeout(p.timerId);
      pendingAISubmissions.current = [];
    }
  };

  // Shared fetch for /api/resolve — returns true on success
  // Uses SSE streaming to show progress as AI generates the resolution
  const _callResolve = async (): Promise<boolean> => {
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
            // Show completed events (the last may still be streaming).
            // Show all-but-last when there are 2+, but always show at least the first.
            if (data.resolvedEvents?.length) {
              const events = data.resolvedEvents;
              const completed = events.length <= 1 ? events : events.slice(0, -1);
              setStreamingEvents(completed);
              setResolveStep(`Resolving events... (${events.length} so far)`);
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
    try {
      await clearResolution({ gameId, roundNumber: game.currentRound });
      // Re-trigger the resolve + narrate stages via pipeline
      await triggerPipeline({
        gameId,
        roundNumber: game.currentRound,
        aiDisposition: aiDispositionPayload,
      });
    } catch {
      setActionError("Re-resolve failed — try again or adjust manually");
    }
  };

  // Re-narrate only (after editing events or adjustments)
  const handleReNarrate = async () => {
    // TODO: trigger narrate-only pipeline stage
    // For now, keep using the old path as a fallback
    try {
      await setResolvingMut({ gameId, resolving: true });
      await runNarrate();
      await setResolvingMut({ gameId, resolving: false });
    } catch (_err) {
      setActionError("Re-narrate failed");
    }
  };

  // ─── LOBBY ────────���───────────────────────────────��─────────────────────────
  if (game.status === "lobby") {
    return (
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} />
        <LobbyPhase
          gameId={gameId}
          game={game}
          tables={tables}
          isProjector={isProjector}
          connectedCount={connectedCount}
          safeAction={safeAction}
          lockGame={lockGame}
          startGame={startGame}
          toggleEnabled={toggleEnabled}
          setControlMode={setControlMode}
          kickToAI={kickToAI}
        />
      </div>
    );
  }

  // ��── FINISHED ───────────────────────────────────────────────────────────────
  if (game.status === "finished") {
    return (
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} />
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
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} />

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
          <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Table Management</h2>
              <button onClick={() => setShowQROverlay(false)} className="text-text-light hover:text-white text-sm">Close</button>
            </div>

            {/* Table management grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {tables.filter((t) => t.enabled).map((table) => {
                const role = ROLES.find((r) => r.id === table.roleId);
                return (
                  <div key={table._id} className="bg-navy rounded-lg border border-navy-light p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: role?.color }} />
                      <span className="text-xs font-bold text-white truncate">{table.roleName}</span>
                      <span className={`ml-auto text-[9px] font-mono flex-shrink-0 ${
                        table.connected ? "text-viz-safety" : table.controlMode === "ai" ? "text-viz-capability" : table.controlMode === "npc" ? "text-viz-warning" : "text-navy-muted"
                      }`}>
                        {table.connected ? "Connected" : table.controlMode === "human" ? "Open" : table.controlMode === "ai" ? "AI" : "NPC"}
                      </span>
                    </div>

                    {/* Control mode switcher */}
                    {!isProjector && (
                      <div className="flex gap-1 mb-2">
                        {table.connected && table.controlMode === "human" ? (
                          <button
                            onClick={() => void kickToAI({ tableId: table._id })}
                            className="text-[9px] px-2 py-1 rounded bg-navy-light text-text-light hover:bg-navy-muted font-medium transition-colors w-full"
                          >
                            Kick to AI
                          </button>
                        ) : (
                          <div className="flex rounded overflow-hidden border border-navy-light w-full">
                            {(["human", "ai", "npc"] as const).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => void setControlMode({ tableId: table._id, controlMode: mode })}
                                className={`text-[9px] px-2 py-1 font-semibold transition-colors flex-1 ${
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
                      </div>
                    )}

                    {/* QR code for human-mode tables */}
                    {table.controlMode === "human" && !table.connected && (
                      <div className="bg-navy-dark rounded p-2 flex flex-col items-center cursor-pointer hover:border-white/30 transition-colors" onClick={() => setFocusedQR(table._id)}>
                        <QRCode
                          value={`${typeof window !== "undefined" ? window.location.origin : ""}/game/${gameId}/table/${table._id}`}
                          size={80}
                        />
                        <span className="text-[10px] font-mono text-text-light mt-1 tracking-widest">
                          {table.joinCode}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-navy-muted text-center">
              Set a table to Human to generate a join code. Click a QR code to show fullscreen.
            </p>
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
        {/* Show previous round's AI narrative, or R1 hardcoded intro — never current round's hardcoded text */}
        {(() => {
          const prevRound = rounds.find(r => r.number === game.currentRound - 1);
          const storyText = prevRound?.summary?.narrative ?? (game.currentRound === 1 ? currentRound?.narrative : undefined);
          if (!storyText) return null;
          return (
            <div className="bg-navy rounded-xl border border-navy-light p-6 mb-6">
              <p className="text-sm text-text-light leading-relaxed">{storyText}</p>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left sidebar */}
          <div className="flex flex-col gap-4">
            <RdProgressChart rounds={rounds} currentLabs={game.labs} currentRound={game.currentRound} />
            <div>
              <WorldStatePanel worldState={game.worldState} variant="dark" />
              {!isProjector && <WorldStateEditor gameId={gameId} worldState={game.worldState} />}
            </div>
            <LabTracker
              labs={game.labs}
              onMerge={isProjector ? undefined : async (survivor, absorbed) => {
                await mergeLabs({ gameId, survivorName: survivor, absorbedName: absorbed });
              }}
            />
          </div>

          {/* Main content area */}
          <div className="min-w-0 overflow-hidden">
            {/* ─── DISCUSS ─── */}
            {phase === "discuss" && (
              <DiscussPhase
                gameId={gameId}
                game={game}
                tables={tables}
                isProjector={isProjector}
                submitDuration={submitDuration}
                setSubmitDuration={setSubmitDuration}
                useSampleForAI={useSampleForAI}
                setUseSampleForAI={setUseSampleForAI}
                openSubmissions={openSubmissions}
                safeAction={safeAction}
                skipTimer={skipTimer}
              />
            )}

            {/* ─── SUBMIT ─── */}
            {phase === "submit" && (
              <SubmitPhase
                gameId={gameId}
                game={game}
                tables={tables}
                isProjector={isProjector}
                submissions={submissions ?? []}
                proposals={proposals ?? []}
                currentRound={currentRound}
                resolving={resolving}
                resolveStep={resolveStep}
                revealedSecrets={revealedSecrets}
                toggleReveal={toggleReveal}
                revealAllSecrets={revealAllSecrets}
                handleResolveRound={handleResolveRound}
                safeAction={safeAction}
                skipTimer={skipTimer}
                kickToAI={kickToAI}
                setControlMode={setControlMode}
                overrideProbability={overrideProbability}
                gradeAllUngraded={gradeAllUngraded}
              />
            )}

            {/* ─── RESOLVE VIEW (rolling + narrate unified) ─── */}
            {(phase === "rolling" || phase === "narrate") && (
              <div className="space-y-4">
                <RollingPhase
                  gameId={gameId}
                  game={game}
                  tables={tables}
                  isProjector={isProjector}
                  submissions={submissions ?? []}
                  resolving={resolving}
                  revealedCount={revealedCount}
                  revealedSecrets={revealedSecrets}
                  toggleReveal={toggleReveal}
                  revealAllSecrets={revealAllSecrets}
                  handleReResolve={handleReResolve}
                  rerollAction={rerollAction}
                  overrideProbability={overrideProbability}
                />

                <NarratePhase
                  gameId={gameId}
                  game={game}
                  tables={tables}
                  isProjector={isProjector}
                  submissions={submissions ?? []}
                  currentRound={currentRound}
                  resolving={resolving}
                  resolveStep={resolveStep}
                  revealedCount={revealedCount}
                  revealedSecrets={revealedSecrets}
                  toggleReveal={toggleReveal}
                  revealAllSecrets={revealAllSecrets}
                  handleReResolve={handleReResolve}
                  handleReNarrate={handleReNarrate}
                  rerollAction={rerollAction}
                  overrideProbability={overrideProbability}
                  safeAction={safeAction}
                  advanceRound={advanceRound}
                  finishGame={finishGame}
                  addLab={addLab}
                  streamingEvents={streamingEvents}
                />
              </div>
            )}
          </div>
        </div>

        {/* Facilitator copilot — always visible during gameplay */}
        {!isProjector && (
          <div className="sticky bottom-0 z-40 bg-navy-dark">
            <FacilitatorCopilot
              gameId={gameId}
              currentWorldState={game.worldState}
              currentLabs={game.labs}
            />
          </div>
        )}

        {/* Debug panel */}
        {!isProjector && (
          <DebugPanel
            gameId={gameId}
            roundNumber={game.currentRound}
            submissions={submissions as DebugPanelProps["submissions"]}
            round={currentRound as DebugPanelProps["round"]}
          />
        )}
      </div>
    </div>
  );
}

type DebugPanelProps = React.ComponentProps<typeof DebugPanel>;

// ─── Sub-components ──────��────────────────────────────────────────────────────

function FacilitatorNav({
  round,
  phase,
  timerDisplay,
  isExpired,
  isUrgent,
  onShowQR,
  isProjector,
  snapshots,
  onRestore,
}: {
  round: { label: string; number: number } | undefined;
  phase: string;
  timerDisplay: string;
  isExpired: boolean;
  isUrgent: boolean;
  onShowQR?: () => void;
  isProjector?: boolean;
  snapshots?: { number: number; label: string; useBefore: boolean; desc: string }[];
  onRestore?: (roundNumber: number, useBefore: boolean) => Promise<void>;
}) {
  const [showSnapshots, setShowSnapshots] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSnapshots) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSnapshots(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSnapshots]);

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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={snapshots?.length ? () => setShowSnapshots(!showSnapshots) : undefined}
            className="text-[11px] py-1 px-2.5 rounded-full font-mono font-semibold cursor-default"
            style={{ backgroundColor: colors.bg, color: colors.text, cursor: snapshots?.length ? "pointer" : "default" }}
          >
            {phase.toUpperCase()}
          </button>
          {showSnapshots && snapshots && onRestore && (
            <div className="absolute right-0 top-full mt-1 bg-navy-dark border border-navy-light rounded-lg shadow-xl z-50 min-w-[180px] py-1">
              <div className="px-3 py-1.5 text-[10px] text-text-light uppercase tracking-wider">Restore snapshot</div>
              {snapshots.map((s) => (
                <button
                  key={`${s.number}-${s.useBefore ? "b" : "a"}`}
                  onClick={async () => { await onRestore(s.number, s.useBefore); setShowSnapshots(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-white hover:bg-navy-light transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-3 h-3 text-text-light" />
                  {s.desc}
                </button>
              ))}
            </div>
          )}
        </div>
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
            Tables
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
