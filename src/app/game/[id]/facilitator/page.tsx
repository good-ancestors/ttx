"use client";

import Image from "next/image";
import { use, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLE_MAP, AI_SYSTEMS_ROLE_ID, getDisposition, getObserveUrl, type Lab } from "@/lib/game-data";
import { useCountdown, usePageVisibility, useSessionExpiry, useAuthMutation, useFacilitatorToken } from "@/lib/hooks";
import { GameTimeline } from "@/components/game-timeline";
import { QRCode } from "@/components/qr-codes";
import { DebugPanel } from "@/components/debug-panel";
import {
  Loader2,
  Dices,
  Monitor,
  MonitorOff,
  RotateCcw,
  Eye,
  Zap,
} from "lucide-react";

import { LobbyPhase } from "@/components/facilitator/lobby-phase";
import { RoundPhase } from "@/components/facilitator/round-phase";
import { TimerDisplay } from "@/components/facilitator/timer-display";
import { AddLabForm } from "@/components/facilitator/add-lab-form";

export default function FacilitatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParamsHook = useSearchParams();
  const isProjector = searchParamsHook.get("projector") === "true";
  const gameId = id as Id<"games">;
  const onToggleProjector = () => {
    const next = new URLSearchParams(searchParamsHook.toString());
    if (isProjector) next.delete("projector");
    else next.set("projector", "true");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const isVisible = usePageVisibility();
  useSessionExpiry("ttx-facilitator-expiry", "/");

  // Skip when hidden — phase/timer patches re-push every subscriber.
  const game = useQuery(api.games.get, isVisible ? { gameId } : "skip");
  const facilitatorToken = useFacilitatorToken();
  const runtime = useQuery(
    api.gameRuntime.getForFacilitator,
    isVisible && facilitatorToken ? { gameId, facilitatorToken } : "skip",
  );
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

  // Modal state lives up here so its visibility can gate subscriptions below.
  const [showQROverlay, setShowQROverlay] = useState(false);
  const [focusedQR, setFocusedQR] = useState<string | null>(null);

  // Observer counts per role — only feeds the Tables modal, so subscribe only
  // while the modal or its fullscreen QR child is open. Saves a per-game
  // collect() that would otherwise run for every facilitator pageview.
  const tablesModalOpen = showQROverlay || focusedQR != null;
  const observerCounts = useQuery(
    api.observers.countsByGame,
    isVisible && tablesModalOpen ? { gameId } : "skip",
  );

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

  // While the runtime query is still loading we don't know whether a resolve
  // is mid-flight, so default to "yes" to keep Roll/Grade buttons disabled
  // until we have the answer. Without this, an in-flight grading lock from
  // a tab-switch can render those buttons enabled for ~one round trip and
  // the server then throws "Resolution already in progress" on click.
  const runtimeLoading = isVisible && !!facilitatorToken && runtime === undefined;
  const pipelineStatus = runtime?.pipelineStatus;
  const pipelineSaysResolving = !!pipelineStatus && pipelineStatus.step !== "done" && pipelineStatus.step !== "error";
  // Combine signals: phase==="rolling" is a backstop in case the games doc
  // and runtime row arrive on different reactive ticks (avoids the flicker
  // where one says "rolling" while the other still says "done").
  const resolving = runtimeLoading || gamePhase === "rolling" || pipelineSaysResolving;
  const resolveStep = pipelineStatus?.detail ?? pipelineStatus?.step ?? (runtimeLoading ? "Loading…" : "");
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

  // Stable string id from the Convex query — the three callbacks below derive
  // the payload object inline to keep deps pinned to the id rather than to a
  // freshly-allocated object each render.
  const aiDispositionId = enabledTables.find((t) => t.roleId === AI_SYSTEMS_ROLE_ID)?.aiDisposition;
  const aiDisposition = useMemo(() => {
    if (!aiDispositionId) return undefined;
    const d = getDisposition(aiDispositionId);
    return d ? { label: d.label, description: d.description } : undefined;
  }, [aiDispositionId]);

  // Declared before the loading guard so useCallback is unconditional (Rules of Hooks).
  // game?.currentRound is safe — both handlers only run during the playing phase.
  const handleGradeRemaining = useCallback(
    async () => {
      await safeAction("Grading", () =>
        triggerGrading({ gameId, roundNumber: game?.currentRound ?? 1, aiDisposition }),
      )();
    },
    [safeAction, triggerGrading, gameId, game?.currentRound, aiDisposition],
  );
  const handleRollDice = useCallback(
    async () => {
      await safeAction("Roll", () =>
        triggerRoll({ gameId, roundNumber: game?.currentRound ?? 1, aiDisposition }),
      )();
    },
    [safeAction, triggerRoll, gameId, game?.currentRound, aiDisposition],
  );
  const handleReResolve = useCallback(
    async () => {
      setNarrativeStale(false);
      try {
        await clearResolution({ gameId, roundNumber: game?.currentRound ?? 1 });
        await triggerRoll({
          gameId,
          roundNumber: game?.currentRound ?? 1,
          aiDisposition,
        });
      } catch {
        setActionError("Re-resolve failed — try again or adjust manually");
      }
    },
    [clearResolution, triggerRoll, gameId, game, aiDisposition, setActionError, setNarrativeStale],
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
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} onToggleProjector={onToggleProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />
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
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} onToggleProjector={onToggleProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />
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
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} onShowQR={() => setShowQROverlay(true)} isProjector={isProjector} onToggleProjector={onToggleProjector} snapshots={snapshotOptions} onRestore={async (rn, useBefore) => { await restoreSnapshot({ gameId, roundNumber: rn, useBefore }); }} gameId={gameId} skipTimer={skipTimer} adjustTimer={adjustTimer} />

      {/* QR codes overlay — accessible during any phase */}
      {/* Fullscreen single QR code (per-table or game-level).
          Per-table URLs append ?observe=1 mid-game so a late scan lands in
          observer mode rather than silently claiming the seat. In lobby the
          plain URL still routes through claimRole as before. */}
      {focusedQR && (() => {
        const isGame = focusedQR === "__game__";
        const table = isGame ? null : tables.find((t) => t._id === focusedQR);
        const role = table ? ROLE_MAP.get(table.roleId) : null;
        // We're in the playing section here, so per-table scans should land
        // in observer mode rather than silently claim the seat.
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = isGame
          ? `${origin}/game/join/${game.joinCode}`
          : table ? getObserveUrl(gameId, table._id) : "";
        const code = isGame ? game.joinCode : table?.joinCode;
        const title = isGame ? "Join the game" : table?.roleName;
        return (
          <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center cursor-pointer" onClick={() => setFocusedQR(null)}>
            <div className="flex items-center gap-3 mb-6">
              {!isGame && <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role?.color }} />}
              <span className="text-3xl font-bold text-white">{title}</span>
            </div>
            <QRCode
              value={url}
              size={Math.min(500, typeof window !== "undefined" ? window.innerHeight - 200 : 400)}
            />
            <span className="text-2xl font-mono text-text-light mt-4 tracking-[0.3em]">
              {code}
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

            {/* Game-level join — for late arrivers who want to pick a role / observe.
                Surfaced post-lobby because the lobby phase already shows it inline. */}
            {game.joinCode && (
              <div className="bg-navy rounded-lg border border-navy-light p-4 mb-4 flex items-center gap-4">
                <button
                  onClick={() => setFocusedQR("__game__")}
                  className="bg-white rounded p-2 hover:opacity-90 transition-opacity"
                  aria-label="Show game join QR fullscreen"
                >
                  <QRCode
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/game/join/${game.joinCode}`}
                    size={96}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-light mb-1">Late arrivers — game join code</p>
                  <p className="text-2xl font-mono font-extrabold text-white tracking-[0.3em]">
                    {game.joinCode}
                  </p>
                  <p className="text-[10px] text-navy-muted mt-1">
                    Scanning lands them on the role picker so they can observe (or take a free seat).
                  </p>
                </div>
              </div>
            )}

            {/* Table management grid — same card style as lobby */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {tables.map((table) => {
                const role = ROLE_MAP.get(table.roleId);
                const obsCount = observerCounts?.[table.roleId] ?? 0;
                return (
                  <div key={table._id} className="bg-navy rounded-lg border border-navy-light p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: role?.color }} />
                      <span className="text-xs font-bold text-white truncate">{table.roleName}</span>
                      {table.connected && (
                        <span className="ml-auto text-[9px] text-viz-safety font-mono shrink-0">Connected</span>
                      )}
                    </div>

                    {/* Player + compute + observers row */}
                    <div className="flex items-center gap-2 text-[10px] text-text-light mb-2 min-h-[14px]">
                      {table.playerName && (
                        <span className="truncate" title={table.playerName}>{table.playerName}</span>
                      )}
                      {table.computeStock != null && (
                        <span className="font-mono flex items-center gap-0.5 shrink-0">
                          <Zap className="w-2.5 h-2.5" />{table.computeStock}u
                        </span>
                      )}
                      {obsCount > 0 && (
                        <span
                          className="font-mono flex items-center gap-0.5 shrink-0 ml-auto"
                          title={`${obsCount} observer${obsCount === 1 ? "" : "s"}`}
                        >
                          <Eye className="w-2.5 h-2.5" />{obsCount}
                        </span>
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

                    {/* QR code. In lobby: human-mode tables only, links to driver claim.
                        Mid-game: shown for every table (so observers can scan any seat),
                        and the URL appends ?observe=1 so the scan lands in observer mode. */}
                    {(table.controlMode === "human" || game.status !== "lobby") && (
                      <div className="bg-navy-dark rounded p-2 flex flex-col items-center cursor-pointer hover:border-white/30 transition-colors" onClick={() => setFocusedQR(table._id)}>
                        <QRCode
                          value={getObserveUrl(gameId, table._id)}
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
              Click a QR code to show fullscreen. Mid-game scans land in observer mode.
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
  onToggleProjector,
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
  isProjector: boolean;
  onToggleProjector: () => void;
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
        <Image
          src="/good-ancestors-glyph.svg"
          alt="Good Ancestors"
          width={28}
          height={28}
          className="w-7 h-7"
        />
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
        <button
          onClick={onToggleProjector}
          className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${
            isProjector
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-navy-light text-text-light hover:bg-navy-muted"
          }`}
          title={isProjector ? "Exit projector mode" : "Enter projector mode"}
          aria-pressed={isProjector}
        >
          {isProjector ? <Monitor className="w-3.5 h-3.5" /> : <MonitorOff className="w-3.5 h-3.5" />}
          Projector
        </button>
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
            isProjector={isProjector}
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
  addLab: (args: {
    gameId: Id<"games">;
    name: string;
    roleId: string;
    rdMultiplier: number;
    spec?: string;
    allocation?: { deployment: number; research: number; safety: number };
    jurisdiction?: string;
  }) => Promise<unknown>;
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
