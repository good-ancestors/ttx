"use client";

import { use, useCallback, useMemo, useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLE_MAP, AI_SYSTEMS_ROLE_ID, getDisposition, type Lab } from "@/lib/game-data";
import { useCountdown, usePageVisibility, useSessionExpiry, useAuthMutation } from "@/lib/hooks";
import { GameTimeline } from "@/components/game-timeline";
import { QRCode } from "@/components/qr-codes";
import { DebugPanel } from "@/components/debug-panel";
import {
  Loader2,
  Dices,
  RotateCcw,
} from "lucide-react";

import { LobbyPhase } from "@/components/facilitator/lobby-phase";
import { RoundPhase } from "@/components/facilitator/round-phase";
import { TimerDisplay } from "@/components/facilitator/timer-display";
import { AddLabForm } from "@/components/facilitator/add-lab-form";

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

  const isVisible = usePageVisibility();
  useSessionExpiry("ttx-facilitator-expiry", "/");

  // games.get is always subscribed — lightweight, needed for phase detection even when hidden
  const game = useQuery(api.games.get, { gameId });
  const activeLabsRaw = useQuery(api.labs.getActiveLabs, isVisible ? { gameId } : "skip");
  const labTables = useQuery(api.tables.getByGame, isVisible ? { gameId } : "skip");
  // Memoised: without this, every Convex reactive tick re-ran an O(labs × tables)
  // scan inside the join. O(1) Map lookup instead; stable reference across ticks
  // when the upstream data hasn't changed.
  const labs: Lab[] = useMemo(() => {
    const tableByRoleId = new Map((labTables ?? []).map((t) => [t.roleId, t] as const));
    return (activeLabsRaw ?? []).map((l) => ({
      labId: l._id,
      name: l.name,
      roleId: l.ownerRoleId,
      computeStock: (l.ownerRoleId ? tableByRoleId.get(l.ownerRoleId) : undefined)?.computeStock ?? 0,
      rdMultiplier: l.rdMultiplier,
      allocation: l.allocation,
      spec: l.spec,
      colour: l.colour,
      status: l.status,
    }));
  }, [activeLabsRaw, labTables]);

  // Full tables query — needed for lobby (all 17 tables, including disabled)
  const gamePhase = game?.phase;
  const allTablesForLobby = useQuery(api.tables.getByGame,
    isVisible && game?.status === "lobby" ? { gameId } : "skip"
  );
  // Merged facilitator state: tables + submissions + proposals in one subscription
  const facilitatorState = useQuery(
    api.games.getFacilitatorState,
    isVisible && game?.status === "playing" ? { gameId, roundNumber: game?.currentRound ?? 1 } : "skip"
  );
  const { tables: enabledTables, submissions, proposals } = facilitatorState ?? {
    tables: [],
    submissions: [],
    proposals: [],
  };
  // Lobby uses full tables; playing uses enabled-only from merged query
  const tables = game?.status === "lobby" ? (allTablesForLobby ?? []) : enabledTables;

  // Lightweight rounds for sidebar chart + snapshot dropdown (excludes narrative, events, snapshots)
  const roundsLite = useQuery(api.rounds.getByGameLightweight, isVisible ? { gameId } : "skip");
  // Full rounds only needed for finished-game timeline
  const roundsFull = useQuery(api.rounds.getByGame, isVisible && game?.status === "finished" ? { gameId } : "skip");
  // Full current round only needed during submit/rolling/effect-review/narrate
  // (narrative panel, resolve results, P7 applied-ops review).
  const needsCurrentRound = gamePhase === "rolling" || gamePhase === "narrate" || gamePhase === "submit" || gamePhase === "effect-review";
  const currentRoundFull = useQuery(api.rounds.getCurrent,
    isVisible && needsCurrentRound ? { gameId } : "skip"
  );

  const startGame = useAuthMutation(api.games.startGame);
  const advanceRound = useAuthMutation(api.games.advanceRound);
  const finishGame = useAuthMutation(api.games.finishGame);
  const overrideProbability = useAuthMutation(api.submissions.overrideProbability);
  const overrideStructuredEffect = useAuthMutation(api.submissions.overrideStructuredEffect);
  const ungradeAction = useAuthMutation(api.submissions.ungradeAction);
  const rerollAction = useAuthMutation(api.submissions.rerollAction);
  const setControlMode = useAuthMutation(api.tables.setControlMode);
  const toggleEnabled = useAuthMutation(api.tables.toggleEnabled);
  const skipTimer = useAuthMutation(api.games.skipTimer);
  const kickToAI = useAuthMutation(api.tables.kickToAI);
  const addLab = useAuthMutation(api.games.addLab);
  const mergeLabs = useAuthMutation(api.games.mergeLabs);
  const adjustTimer = useAuthMutation(api.games.adjustTimer);
  const restoreSnapshot = useAuthMutation(api.games.restoreSnapshot);
  const clearResolution = useAuthMutation(api.rounds.clearResolution);
  const forceClearLock = useAuthMutation(api.games.forceClearResolvingLock);
  const { display: timerDisplay, isExpired, isUrgent } = useCountdown(game?.phaseEndsAt);

  const triggerGrading = useAuthMutation(api.games.triggerGrading);
  const triggerRoll = useAuthMutation(api.games.triggerRoll);
  const openSubmissions = useAuthMutation(api.games.openSubmissions);

  // Pipeline state: derive from game document (reactive)
  const pipelineStatus = game?.pipelineStatus;
  const resolving = !!pipelineStatus && pipelineStatus.step !== "done" && pipelineStatus.step !== "error";
  const resolveStep = pipelineStatus?.detail ?? pipelineStatus?.step ?? "";
  const pipelineError = pipelineStatus?.step === "error" ? pipelineStatus.error : null;

  const [actionError, setActionError] = useState<string | null>(null);
  const safeAction = useCallback(
    (label: string, fn: () => Promise<unknown>) => async () => {
      setActionError(null);
      try {
        await fn();
      } catch (err) {
        console.error(`${label} failed:`, err);
        setActionError(`${label} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        setTimeout(() => setActionError(null), 5000);
      }
    },
    [setActionError],
  );

  const [showQROverlay, setShowQROverlay] = useState(false);
  const [focusedQR, setFocusedQR] = useState<string | null>(null);
  const [submitDuration, setSubmitDuration] = useState(4);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [addLabOpen, setAddLabOpen] = useState(false);
  const [narrativeStale, setNarrativeStale] = useState(false);

  // Staggered dice reveal animation
  const [revealedCount, setRevealedCount] = useState(0);
  const isRollingPhase = gamePhase === "rolling" || gamePhase === "narrate";
  // Reset reveal count and stale flag when leaving rolling/narrate phase
  useEffect(() => {
    if (!isRollingPhase) {
      const t = setTimeout(() => { setRevealedCount(0); setNarrativeStale(false); }, 0);
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

  // Warm up serverless API routes on facilitator page load
  useEffect(() => {
    fetch("/api/warm").catch(() => {});
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

  const hideAllSecrets = () => {
    setRevealedSecrets(new Set());
  };

  // Get AI Systems disposition for passing to grading/narrate/AI player prompts.
  // Memoised so the useCallback hooks below don't see a fresh object identity
  // on every render (react-hooks/exhaustive-deps would otherwise complain).
  // enabledTables comes from getFacilitatorState and only carries aiDisposition during playing.
  const aiDispositionPayload = useMemo(() => {
    const aiSystemsEnabled = enabledTables.find((t) => t.roleId === AI_SYSTEMS_ROLE_ID);
    if (!aiSystemsEnabled?.aiDisposition) return undefined;
    const d = getDisposition(aiSystemsEnabled.aiDisposition);
    return d ? { label: d.label, description: d.description } : undefined;
  }, [enabledTables]);

  // Grade Remaining + Roll Dice both wrap a single trigger mutation with the
  // same try/catch shell — safeAction handles both uniformly.
  // Declared before the loading guard so useCallback is unconditional (Rules of Hooks).
  // game?.currentRound is safe here; both handlers are only called during playing phase.
  const handleGradeRemaining = useCallback(
    async () => {
      await safeAction("Grading", () =>
        triggerGrading({ gameId, roundNumber: game?.currentRound ?? 1, aiDisposition: aiDispositionPayload }),
      )();
    },
    [safeAction, triggerGrading, gameId, game?.currentRound, aiDispositionPayload],
  );
  const handleRollDice = useCallback(
    async () => {
      await safeAction("Roll", () =>
        triggerRoll({ gameId, roundNumber: game?.currentRound ?? 1, aiDisposition: aiDispositionPayload }),
      )();
    },
    [safeAction, triggerRoll, gameId, game?.currentRound, aiDispositionPayload],
  );
  const handleReResolve = useCallback(
    async () => {
      setNarrativeStale(false);
      try {
        await clearResolution({ gameId, roundNumber: game?.currentRound ?? 1 });
        await triggerRoll({
          gameId,
          roundNumber: game?.currentRound ?? 1,
          aiDisposition: aiDispositionPayload,
        });
      } catch {
        setActionError("Re-resolve failed — try again or adjust manually");
      }
    },
    [clearResolution, triggerRoll, gameId, game, aiDispositionPayload, setActionError, setNarrativeStale],
  );

  // Lobby needs game + tables; playing needs facilitatorState + rounds; finished needs roundsFull
  const isLoading = !game || (
    game.status === "lobby" ? !allTablesForLobby :
    game.status === "finished" ? !roundsFull :
    (!facilitatorState || !roundsLite)
  );
  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-text-light animate-spin" />
      </div>
    );
  }

  // Full current round for narrative panel + summary content
  const currentRound = currentRoundFull ?? undefined;
  // rounds is guaranteed non-null after loading guard for playing/finished states
  const rounds = roundsLite ?? [];
  const phase = game.phase;
  const connectedCount = tables.filter((t) => t.connected).length;
  const snapshotOptions = isProjector ? [] : rounds.flatMap(r => {
    const opts: { number: number; label: string; useBefore: boolean; desc: string }[] = [];
    if (r.hasLabsBefore) opts.push({ number: r.number, label: r.label, useBefore: true, desc: `Before ${r.label} resolve` });
    if (r.labsAfter) opts.push({ number: r.number, label: r.label, useBefore: false, desc: `After ${r.label} resolve` });
    return opts;
  });

  // ─── LOBBY ────────���───────────────────────────────��─────────────────────────
  if (game.status === "lobby") {
    return (
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />
        <LobbyPhase
          gameId={gameId}
          game={game}
          tables={tables}
          isProjector={isProjector}
          connectedCount={connectedCount}
          safeAction={safeAction}
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
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />
        <div className="p-6 max-w-[1400px] mx-auto">
          <div className="text-center mb-8">
            <Dices className="w-12 h-12 text-text-light mx-auto mb-4" />
            <h2 className="text-2xl font-extrabold mb-2">Scenario Complete</h2>
            <p className="text-text-light">Debrief and reflection</p>
          </div>
          <GameTimeline
            rounds={roundsFull ?? []}
            initialLabs={labs}
          />
        </div>
      </div>
    );
  }

  // ─── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy-dark text-white">
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />

      {/* QR codes overlay — accessible during any phase */}
      {/* Fullscreen single QR code */}
      {focusedQR && (() => {
        const table = tables.find((t) => t._id === focusedQR);
        const role = table ? ROLE_MAP.get(table.roleId) : null;
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

            {/* Table management grid — same card style as lobby */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {tables.map((table) => {
                const role = ROLE_MAP.get(table.roleId);
                return (
                  <div key={table._id} className="bg-navy rounded-lg border border-navy-light p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: role?.color }} />
                      <span className="text-xs font-bold text-white truncate">{table.roleName}</span>
                      {table.connected && (
                        <div className="ml-auto flex items-center gap-1 shrink-0">
                          <span className="text-[9px] text-viz-safety font-mono">Connected</span>
                        </div>
                      )}
                    </div>

                    {/* Unified mode toggle */}
                    {!isProjector && (
                      <div className="flex rounded overflow-hidden border border-navy-light w-full mb-2">
                        {(["human", "ai", "npc"] as const).map((mode) => {
                          const isActive = table.controlMode === mode;
                          return (
                            <button
                              key={mode}
                              onClick={() => {
                                if (table.connected && table.controlMode === "human" && mode === "ai") {
                                  void kickToAI({ tableId: table._id });
                                } else {
                                  void setControlMode({ tableId: table._id, controlMode: mode });
                                }
                              }}
                              className={`text-[9px] px-2 py-1 font-semibold transition-colors flex-1 ${
                                isActive
                                  ? mode === "human" ? "bg-viz-safety text-navy" : mode === "ai" ? "bg-viz-capability text-navy" : "bg-viz-warning text-navy"
                                  : "bg-navy-dark text-navy-muted hover:text-text-light"
                              }`}
                            >
                              {mode === "human" ? "Human" : mode === "ai" ? "AI" : "NPC"}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* QR code for human-mode tables */}
                    {table.controlMode === "human" && (
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
              Click a QR code to show fullscreen.
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {(actionError || pipelineError) && (
        <div className="mx-6 mt-2 bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2 text-sm text-[#991B1B] flex items-center justify-between">
          <span>{pipelineError ?? actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="text-[#991B1B] font-bold ml-4">✕</button>
        </div>
      )}

      {/* Full-width sequential layout — designed for 1920×1080 projection */}
      <div className="px-6 py-6 space-y-4">
        {/* Add Lab modal */}
        {addLabOpen && !isProjector && (
          <AddLabModal
            gameId={gameId}
            tables={tables}
            addLab={addLab}
            onClose={() => setAddLabOpen(false)}
          />
        )}

        {/* ── Sections 1–3: phase controls, AttemptedSection, HappenedSection, StateSection (all progressively revealed) ── */}
        <RoundPhase
          gameId={gameId}
          game={game}
          tables={tables}
          isProjector={isProjector}
          submissions={submissions ?? []}
          proposals={proposals ?? []}
          currentRound={currentRound}
          resolving={resolving}
          resolveStep={resolveStep}
          revealedCount={revealedCount}
          revealedSecrets={revealedSecrets}
          toggleReveal={toggleReveal}
          revealAllSecrets={revealAllSecrets}
          hideAllSecrets={hideAllSecrets}
          handleGradeRemaining={handleGradeRemaining}
          handleRollDice={handleRollDice}
          handleReResolve={handleReResolve}
          safeAction={safeAction}
          submitDuration={submitDuration}
          setSubmitDuration={setSubmitDuration}
          openSubmissions={openSubmissions}
          skipTimer={skipTimer}
          overrideProbability={overrideProbability}
          overrideStructuredEffect={overrideStructuredEffect}
          ungradeAction={ungradeAction}
          rerollAction={rerollAction}
          narrativeStale={narrativeStale}
          onDiceChanged={() => setNarrativeStale(true)}
          advanceRound={advanceRound}
          finishGame={finishGame}
          forceClearLock={forceClearLock}
          isTimerExpired={isExpired}
          timerDisplay={timerDisplay}
          isUrgent={isUrgent}
          adjustTimer={adjustTimer}
          labs={labs}
          rounds={rounds}
          mergeLabs={mergeLabs}
          openAddLab={() => setAddLabOpen(true)}
        />

        {/* Debug panel — fetches its own data when expanded to avoid always-on subscriptions */}
        {!isProjector && (
          <DebugPanel
            gameId={gameId}
            roundNumber={game.currentRound}
          />
        )}
      </div>
    </div>
  );
}

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
  gameId,
  skipTimer,
  adjustTimer,
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
  gameId: Id<"games">;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  adjustTimer: (args: { gameId: Id<"games">; deltaSeconds: number }) => Promise<unknown>;
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
          <Image src="/favicon.svg" alt="Good Ancestors" width={20} height={20} className="w-5 h-5" />
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
        {timerDisplay !== "0:00" && timerDisplay !== "" && (
          <TimerDisplay
            timerDisplay={timerDisplay}
            isExpired={isExpired}
            isUrgent={isUrgent}
            isProjector={isProjector ?? false}
            gameId={gameId}
            hasTimer={timerDisplay !== "" && timerDisplay !== "0:00"}
            skipTimer={skipTimer}
            adjustTimer={adjustTimer}
          />
        )}
      </div>
    </div>
  );
}

function AddLabModal({
  gameId,
  tables,
  addLab,
  onClose,
}: {
  gameId: Id<"games">;
  tables: { roleId: string; roleName: string; enabled?: boolean; computeStock?: number }[];
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; rdMultiplier: number }) => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-white">Add Lab</span>
          <button onClick={onClose} className="text-text-light hover:text-white text-sm">Close</button>
        </div>
        <AddLabForm gameId={gameId} tables={tables} addLab={addLab} onDone={onClose} />
      </div>
    </div>
  );
}
