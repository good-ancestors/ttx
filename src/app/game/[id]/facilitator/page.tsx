"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ROLES, cycleProbability } from "@/lib/game-data";
import { useCountdown } from "@/lib/hooks";
import { CapabilityTimeline } from "@/components/capability-timeline";
import { WorldStatePanel } from "@/components/world-state-panel";
import { LabTracker } from "@/components/lab-tracker";
import { ProbabilityBadge } from "@/components/action-card";
import { ActionFeed } from "@/components/action-feed";
import { NarrativePanel } from "@/components/narrative-panel";
import { QRCode } from "@/components/qr-codes";
import { WorldStateEditor, NarrativeEditor } from "@/components/manual-controls";
import {
  Play,
  ChevronRight,
  Clock,
  Lock,
  Loader2,
  Dices,
  MessageSquareText,
} from "lucide-react";

export default function FacilitatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const gameId = id as Id<"games">;

  const game = useQuery(api.games.get, { gameId });
  const tables = useQuery(api.tables.getByGame, { gameId });
  const rounds = useQuery(api.rounds.getByGame, { gameId });
  const submissions = useQuery(api.submissions.getByGameAndRound, {
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
  const toggleAI = useMutation(api.tables.toggleAI);
  const toggleEnabled = useMutation(api.tables.toggleEnabled);

  const { display: timerDisplay, isExpired } = useCountdown(game?.phaseEndsAt);

  const [resolving, setResolving] = useState(false);
  const [showSubmissionDetails, setShowSubmissionDetails] = useState(false);

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

  // Trigger AI player submissions for all AI-controlled enabled tables that haven't submitted
  const triggerAIPlayers = () => {
    const aiTables = (tables ?? []).filter((t) => t.isAI && t.enabled);
    const submitted = new Set((submissions ?? []).map((s) => s.roleId));
    for (const table of aiTables) {
      if (!submitted.has(table.roleId)) {
        fetch("/api/ai-player", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: table._id,
            gameId,
            roundNumber: game.currentRound,
            roleId: table.roleId,
          }),
        }).catch(console.error);
      }
    }
  };

  // Resolve round: roll all dice + trigger narrative generation
  const handleResolveRound = async () => {
    setResolving(true);

    // 1. Trigger AI player submissions for any AI tables that haven't submitted
    triggerAIPlayers();
    // Wait for AI submissions to arrive
    await new Promise((r) => setTimeout(r, 5000));

    // 2. Grade any ungraded submissions (including fresh AI ones)
    // Re-fetch won't help here since we're in the same render,
    // but grading will pick up whatever's in the DB
    gradeAllUngraded();
    await new Promise((r) => setTimeout(r, 3000));

    // 3. Roll all dice
    await rollAll({ gameId, roundNumber: game.currentRound });
    await advancePhase({ gameId, phase: "rolling" });

    // Trigger narrative generation in background
    fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, roundNumber: game.currentRound }),
    }).catch(console.error);

    setResolving(false);
  };

  // ─── LOBBY ──────────────────────────────────────────────────────────────────
  if (game.status === "lobby") {
    return (
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} />
        <div className="p-6 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold mb-2">Waiting for Tables</h2>
            <p className="text-text-light">
              {connectedCount}/{tables.length} tables connected
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
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
                      {!table.connected && table.isAI && table.enabled && (
                        <span className="text-[10px] text-viz-capability font-mono">AI</span>
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
                    {table.enabled && !table.connected && (
                      <button
                        onClick={() => toggleAI({ tableId: table._id })}
                        className="text-[10px] px-2 py-1 rounded bg-navy-light text-text-light hover:bg-navy-muted font-medium transition-colors"
                      >
                        {table.isAI ? "Set Human" : "Set AI"}
                      </button>
                    )}
                  </div>

                  {/* QR code only for enabled human tables */}
                  {table.enabled && !table.isAI && (
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
                  {table.enabled && table.isAI && !table.connected && (
                    <div className="bg-navy-dark rounded-lg p-3 text-center">
                      <span className="text-xs text-text-light">AI-controlled this round</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-3">
            {!game.locked && (
              <button
                onClick={() => lockGame({ gameId })}
                className="py-3 px-6 bg-navy-light text-white rounded-lg font-bold hover:bg-navy-muted transition-colors flex items-center gap-2"
              >
                <Lock className="w-4 h-4" /> Lock Game
              </button>
            )}
            <button
              onClick={() => startGame({ gameId })}
              className="py-3 px-8 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors flex items-center gap-2"
            >
              <Play className="w-5 h-5" /> Start Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── FINISHED ───────────────────────────────────────────────────────────────
  if (game.status === "finished") {
    return (
      <div className="min-h-screen bg-navy-dark text-white flex items-center justify-center">
        <div className="text-center">
          <Dices className="w-12 h-12 text-text-light mx-auto mb-4" />
          <h2 className="text-2xl font-extrabold mb-2">Scenario Complete</h2>
          <p className="text-text-light">Time for debrief and reflection.</p>
        </div>
      </div>
    );
  }

  // ─── PLAYING ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy-dark text-white">
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} />

      <div className="p-6 max-w-[1400px] mx-auto">
        {currentRound && (
          <div className="bg-navy rounded-xl border border-navy-light p-6 mb-6">
            <h2 className="text-2xl font-extrabold mb-1 tracking-tight">{currentRound.title}</h2>
            <p className="text-sm text-text-light leading-relaxed">{currentRound.narrative}</p>
          </div>
        )}

        <div className="grid grid-cols-[320px_1fr] gap-6">
          {/* Left sidebar */}
          <div className="flex flex-col gap-4">
            <CapabilityTimeline currentRound={game.currentRound - 1} />
            <div>
              <WorldStatePanel worldState={game.worldState} variant="dark" />
              <WorldStateEditor gameId={gameId} worldState={game.worldState} />
            </div>
            <LabTracker labs={game.labs} />
          </div>

          {/* Main content area */}
          <div>
            {/* ─── DISCUSS ─── */}
            {phase === "discuss" && (
              <div className="text-center py-16">
                <MessageSquareText className="w-12 h-12 text-text-light mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Tables are discussing</h3>
                <p className="text-text-light mb-6 text-sm">
                  Each table: discuss what your actor does this quarter, then submit.
                </p>
                <button
                  onClick={() => advancePhase({ gameId, phase: "submit", durationSeconds: 4 * 60 })}
                  className="py-3 px-8 bg-white text-navy rounded-lg font-bold text-base hover:bg-off-white transition-colors"
                >
                  Open Submissions
                </button>
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
                />

                {/* Expandable submission details — optional review */}
                {submissionCount > 0 && (
                  <button
                    onClick={() => setShowSubmissionDetails(!showSubmissionDetails)}
                    className="text-xs text-text-light hover:text-white mt-2 mb-2 transition-colors"
                  >
                    {showSubmissionDetails ? "Hide details" : "Show submission details (optional)"}
                  </button>
                )}

                {showSubmissionDetails && submissions?.map((sub) => {
                  const role = ROLES.find((r) => r.id === sub.roleId);
                  return (
                    <div key={sub._id} className="bg-navy rounded-xl border border-navy-light p-4 mb-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role?.color }} />
                        <span className="text-sm font-bold">{role?.name ?? sub.roleId}</span>
                      </div>
                      {sub.actions.map((action, i) => (
                        <div key={i} className="flex items-center gap-3 py-2 border-b border-navy-light last:border-0">
                          <span className="text-[13px] text-[#E2E8F0] flex-1">{action.text}</span>
                          <span className="text-[11px] text-text-light font-mono">P{action.priority}</span>
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
                      ))}
                    </div>
                  );
                })}

                {/* Resolve button */}
                {submissionCount > 0 && (
                  <button
                    onClick={handleResolveRound}
                    disabled={resolving}
                    className={`w-full py-4 rounded-lg font-extrabold text-lg mt-4 transition-colors flex items-center justify-center gap-2 ${
                      submissionCount === tables.length
                        ? "bg-white text-navy hover:bg-off-white"
                        : "bg-navy-light text-text-light hover:bg-navy-muted"
                    } disabled:opacity-50`}
                  >
                    {resolving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Dices className="w-5 h-5" />
                    )}
                    Resolve Round ({submissionCount}/{tables.length} submitted)
                  </button>
                )}
              </div>
            )}

            {/* ─── ROLLING ─── */}
            {phase === "rolling" && (
              <ActionFeed
                submissions={submissions ?? []}
                onComplete={() => advancePhase({ gameId, phase: "narrate" })}
              />
            )}

            {/* ─── NARRATE ─── */}
            {phase === "narrate" && (
              <div>
                <NarrativePanel round={currentRound} submissions={submissions ?? []} />

                {/* Manual override controls */}
                <div className="flex gap-3 mt-2 mb-4">
                  <NarrativeEditor
                    gameId={gameId}
                    roundNumber={game.currentRound}
                    currentSummary={currentRound?.summary ?? undefined}
                  />
                  <WorldStateEditor gameId={gameId} worldState={game.worldState} />
                </div>

                {game.currentRound < 3 ? (
                  <button
                    onClick={() => advanceRound({ gameId })}
                    className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4 hover:bg-off-white transition-colors flex items-center justify-center gap-2"
                  >
                    Advance to Next Round <ChevronRight className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={() => finishGame({ gameId })}
                    className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4 hover:bg-off-white transition-colors"
                  >
                    End Scenario
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FacilitatorNav({
  round,
  phase,
  timerDisplay,
  isExpired,
}: {
  round: { label: string; number: number } | undefined;
  phase: string;
  timerDisplay: string;
  isExpired: boolean;
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
            Turn {round.number}/3 — {round.label}
          </span>
        )}
        <span
          className="text-[11px] py-1 px-2.5 rounded-full font-mono font-semibold"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {phase.toUpperCase()}
        </span>
        {timerDisplay !== "0:00" && (
          <span className={`text-sm font-mono flex items-center gap-1 ${isExpired ? "text-viz-danger" : "text-text-light"}`}>
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
}: {
  tables: { _id: Id<"tables">; roleId: string; roleName: string; isAI: boolean; enabled: boolean }[];
  submissions: { roleId: string; status: string; actions: { text: string; probability?: number }[] }[];
  onGradeAll: () => void;
}) {
  const enabledTables = tables.filter((t) => t.enabled);

  // Auto-trigger grading when new submissions arrive
  const ungradedCount = submissions.filter(
    (s) => s.status === "submitted" && s.actions.some((a) => a.probability == null)
  ).length;

  if (ungradedCount > 0) {
    setTimeout(onGradeAll, 100);
  }

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light mb-3 block">
        Submissions ({submissions.length}/{enabledTables.length})
      </span>
      <div className="flex flex-col gap-2">
        {enabledTables.map((table) => {
          const role = ROLES.find((r) => r.id === table.roleId);
          const sub = submissions.find((s) => s.roleId === table.roleId);
          const allGraded = sub?.actions.every((a) => a.probability != null);
          return (
            <div key={table._id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role?.color }} />
              <span className="text-[13px] text-white flex-1">
                {table.roleName}
                {table.isAI && <span className="text-[10px] text-viz-capability ml-1">(AI)</span>}
              </span>
              {sub ? (
                <span className={`text-[11px] font-mono ${allGraded ? "text-viz-safety" : "text-viz-warning"}`}>
                  {sub.actions.length} action{sub.actions.length !== 1 ? "s" : ""}
                  {allGraded ? " ✓" : " (grading...)"}
                </span>
              ) : (
                <span className="text-[11px] text-navy-muted">Waiting...</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
