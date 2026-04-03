"use client";

import { use, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, getDisposition } from "@/lib/game-data";
import { useCountdown, usePageVisibility, useSessionExpiry } from "@/lib/hooks";
import { RdProgressChart } from "@/components/rd-progress-chart";
import { WorldStatePanel } from "@/components/world-state-panel";
import { LabTracker } from "@/components/lab-tracker";
import { GameTimeline } from "@/components/game-timeline";
import { QRCode } from "@/components/qr-codes";
import { WorldStateEditor, FacilitatorCopilot } from "@/components/manual-controls";
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
import { DiceRollOverlay } from "@/components/facilitator/dice-roll-overlay";

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
  // Full current round only needed during submit/rolling/narrate (narrative panel, resolve results)
  const needsCurrentRound = gamePhase === "rolling" || gamePhase === "narrate" || gamePhase === "submit";
  const currentRoundFull = useQuery(api.rounds.getCurrent,
    isVisible && needsCurrentRound ? { gameId } : "skip"
  );

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
  const adjustTimer = useMutation(api.games.adjustTimer);
  const restoreSnapshot = useMutation(api.games.restoreSnapshot);
  const clearResolution = useMutation(api.rounds.clearResolution);
  const forceClearLock = useMutation(api.games.forceClearResolvingLock);
  const { display: timerDisplay, isExpired, isUrgent } = useCountdown(game?.phaseEndsAt);

  const triggerGrading = useMutation(api.games.triggerGrading);
  const triggerRoll = useMutation(api.games.triggerRoll);
  const openSubmissions = useMutation(api.games.openSubmissions);

  // Pipeline state: derive from game document (reactive)
  const pipelineStatus = game?.pipelineStatus;
  const resolving = !!pipelineStatus && pipelineStatus.step !== "done" && pipelineStatus.step !== "error";
  const resolveStep = pipelineStatus?.detail ?? pipelineStatus?.step ?? "";
  const pipelineError = pipelineStatus?.step === "error" ? pipelineStatus.error : null;

  const [actionError, setActionError] = useState<string | null>(null);
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

  const [showQROverlay, setShowQROverlay] = useState(false);
  const [focusedQR, setFocusedQR] = useState<string | null>(null);
  const [submitDuration, setSubmitDuration] = useState(4);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [editDials, setEditDials] = useState(false);
  const [addLabOpen, setAddLabOpen] = useState(false);
  const [showDiceAnimation, setShowDiceAnimation] = useState(false);

  // Staggered dice reveal animation
  const [revealedCount, setRevealedCount] = useState(0);
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

  // Warm up API routes on facilitator page load (for copilot)
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

  // Lobby only needs game + tables; playing needs facilitatorState + rounds
  const isLoading = !game || (game.status === "lobby" ? !allTablesForLobby : (!facilitatorState || !roundsLite));
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
  // Previous narrative from lightweight rounds (summaryNarrative) or current round's narrative for round 1
  const prevRoundLite = rounds.find(r => r.number === game.currentRound - 1);
  const currentRoundLite = rounds.find(r => r.number === game.currentRound);
  const previousNarrative = prevRoundLite?.summaryNarrative ?? (game.currentRound === 1 ? currentRoundLite?.narrative : undefined);
  const phase = game.phase;
  const connectedCount = tables.filter((t) => t.connected).length;
  const snapshotOptions = isProjector ? [] : rounds.flatMap(r => {
    const opts: { number: number; label: string; useBefore: boolean; desc: string }[] = [];
    if (r.hasWorldStateBefore) opts.push({ number: r.number, label: r.label, useBefore: true, desc: `Before ${r.label} resolve` });
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

  // ─── Grade Remaining: AI grades only ungraded submitted actions ──────────
  const handleGradeRemaining = async () => {
    setActionError(null);
    try {
      await triggerGrading({
        gameId,
        roundNumber: game.currentRound,
        aiDisposition: aiDispositionPayload,
      });
    } catch (err) {
      console.error("Grading failed:", err);
      setActionError(`Grading failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // ─── Roll Dice: roll all graded actions + generate narrative ────────────
  const handleRollDice = async () => {
    setActionError(null);
    setShowDiceAnimation(true);
    try {
      await triggerRoll({
        gameId,
        roundNumber: game.currentRound,
        aiDisposition: aiDispositionPayload,
      });
    } catch (err) {
      console.error("Roll failed:", err);
      setShowDiceAnimation(false);
      setActionError(`Roll failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleReResolve = async () => {
    try {
      await clearResolution({ gameId, roundNumber: game.currentRound });
      await triggerRoll({
        gameId,
        roundNumber: game.currentRound,
        aiDisposition: aiDispositionPayload,
      });
    } catch {
      setActionError("Re-resolve failed — try again or adjust manually");
    }
  };


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
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />
        <div className="p-6 max-w-[1400px] mx-auto">
          <div className="text-center mb-8">
            <Dices className="w-12 h-12 text-text-light mx-auto mb-4" />
            <h2 className="text-2xl font-extrabold mb-2">Scenario Complete</h2>
            <p className="text-text-light">Debrief and reflection</p>
          </div>
          <GameTimeline
            rounds={roundsFull ?? []}
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
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />

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

            {/* Table management grid — same card style as lobby */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {tables.filter((t) => t.enabled).map((table) => {
                const role = ROLES.find((r) => r.id === table.roleId);
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
          <button onClick={() => setActionError(null)} className="text-[#991B1B] font-bold ml-4">✕</button>
        </div>
      )}

      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left sidebar */}
          <div className="flex flex-col gap-4">
            <RdProgressChart rounds={rounds} currentLabs={game.labs} currentRound={game.currentRound} />
            <WorldStatePanel worldState={game.worldState} variant="dark" onEdit={isProjector ? undefined : () => setEditDials(true)} />
            {editDials && !isProjector && <WorldStateEditor gameId={gameId} worldState={game.worldState} startOpen />}
            <LabTracker
              labs={game.labs}
              onMerge={isProjector ? undefined : async (survivor, absorbed) => {
                await mergeLabs({ gameId, survivorName: survivor, absorbedName: absorbed });
              }}
              onAddLab={isProjector ? undefined : () => setAddLabOpen(true)}
            />
          </div>

      {/* Add Lab modal (triggered from sidebar + button) */}
      {addLabOpen && !isProjector && (
        <AddLabModal
          gameId={gameId}
          tables={tables}
          addLab={addLab}
          onClose={() => setAddLabOpen(false)}
        />
      )}

          {/* Dice roll animation overlay */}
          {showDiceAnimation && (
            <DiceRollOverlay onComplete={() => setShowDiceAnimation(false)} />
          )}

          {/* Main content area — single progressive view for all phases */}
          <div className="min-w-0 overflow-hidden">
            <RoundPhase
              gameId={gameId}
              game={game}
              tables={tables}
              isProjector={isProjector}
              submissions={submissions ?? []}
              proposals={proposals ?? []}
              currentRound={currentRound}
              previousNarrative={previousNarrative}
              resolving={resolving}
              resolveStep={resolveStep}
              revealedCount={revealedCount}
              revealedSecrets={revealedSecrets}
              toggleReveal={toggleReveal}
              revealAllSecrets={revealAllSecrets}
              handleGradeRemaining={handleGradeRemaining}
              handleRollDice={handleRollDice}
              handleReResolve={handleReResolve}
              safeAction={safeAction}
              submitDuration={submitDuration}
              setSubmitDuration={setSubmitDuration}
              openSubmissions={openSubmissions}
              skipTimer={skipTimer}
              overrideProbability={overrideProbability}
              rerollAction={rerollAction}
              advanceRound={advanceRound}
              finishGame={finishGame}
              addLab={addLab}
              forceClearLock={forceClearLock}
            />
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
            {phase === "discuss" && !round ? "LOBBY" : phase.toUpperCase()}
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
  tables: { roleId: string; roleName: string; enabled: boolean }[];
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; computeStock: number; rdMultiplier: number }) => Promise<unknown>;
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
