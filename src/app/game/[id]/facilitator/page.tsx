"use client";

import { use, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, cycleProbability } from "@/lib/game-data";
import { redactSecretAction } from "@/lib/secret-actions";
import { useCountdown } from "@/lib/hooks";
import { CapabilityTimeline } from "@/components/capability-timeline";
import { WorldStatePanel } from "@/components/world-state-panel";
import { LabTracker } from "@/components/lab-tracker";
import { ProbabilityBadge } from "@/components/action-card";
import { ActionFeed } from "@/components/action-feed";
import { NarrativePanel } from "@/components/narrative-panel";
import { GameTimeline } from "@/components/game-timeline";
import { QRCode } from "@/components/qr-codes";
import { WorldStateEditor, NarrativeEditor, FacilitatorAdjust } from "@/components/manual-controls";
import { DebugPanel } from "@/components/debug-panel";
import { StateOfPlay } from "@/components/state-of-play";
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
  const toggleAI = useMutation(api.tables.toggleAI);
  const toggleEnabled = useMutation(api.tables.toggleEnabled);
  const skipTimer = useMutation(api.games.skipTimer);
  const kickToAI = useMutation(api.tables.kickToAI);
  const addLab = useMutation(api.games.addLab);

  const { display: timerDisplay, isExpired, isUrgent } = useCountdown(game?.phaseEndsAt);

  const [resolving, setResolving] = useState(false);
  const [resolveStep, setResolveStep] = useState("");
  const [showSubmissionDetails, setShowSubmissionDetails] = useState(false);
  const [submitDuration, setSubmitDuration] = useState(4);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [showAddLab, setShowAddLab] = useState(false);
  const [newLabName, setNewLabName] = useState("");
  const [newLabRoleId, setNewLabRoleId] = useState("");
  const [newLabCompute, setNewLabCompute] = useState(10);
  const [newLabMultiplier, setNewLabMultiplier] = useState(1);

  const toggleReveal = (key: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    const enabledRoleNames = (tables ?? []).filter((t) => t.enabled).map((t) => t.roleName);
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
            enabledRoles: enabledRoleNames,
            computeStock: table.computeStock ?? 0,
          }),
        }).catch(console.error);
      }
    }
  };

  // Trigger AI proposals for all AI-controlled enabled tables
  const triggerAIProposals = () => {
    const aiTables = (tables ?? []).filter((t) => t.isAI && t.enabled);
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

  // Resolve round: optimised parallel pipeline
  const handleResolveRound = async () => {
    setResolving(true);

    // AI proposals already sent when submit phase opened
    // Phase 1: AI responds to any human endorsement requests
    setResolveStep("AI responding to requests (1/3)...");
    triggerAIProposals(); // responds to pending requests from humans
    await new Promise((r) => setTimeout(r, 3000));

    // Phase 2: AI players submit + start grading arrivals in parallel
    setResolveStep("AI players acting (2/3)...");
    triggerAIPlayers();
    await new Promise((r) => setTimeout(r, 4000));
    // Start grading what's arrived so far while remaining AI players finish
    gradeAllUngraded();
    await new Promise((r) => setTimeout(r, 4000));
    // Grade any stragglers
    gradeAllUngraded();
    await new Promise((r) => setTimeout(r, 2000));

    // Phase 3: Roll dice
    setResolveStep("Rolling dice (3/3)...");
    await rollAll({ gameId, roundNumber: game.currentRound });
    await advancePhase({ gameId, phase: "rolling" });

    // Phase 4: Generate narrative in background
    setResolveStep("Generating narrative (narrative)...");
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
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} />
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
                    {table.enabled && table.connected && !table.isAI && (
                      <button
                        onClick={() => kickToAI({ tableId: table._id })}
                        className="text-[10px] px-2 py-1 rounded bg-navy-light text-text-light hover:bg-navy-muted font-medium transition-colors flex items-center gap-0.5"
                      >
                        <Bot className="w-3 h-3" /> Kick to AI
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
      <div className="min-h-screen bg-navy-dark text-white">
        <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} />
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
      <FacilitatorNav round={currentRound} phase={phase} timerDisplay={timerDisplay} isExpired={isExpired} isUrgent={isUrgent} />

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
                <button
                  onClick={async () => {
                    await advancePhase({ gameId, phase: "submit", durationSeconds: submitDuration * 60 });
                    // Trigger AI proposals early so humans can react during submit phase
                    setTimeout(() => triggerAIProposals(), 500);
                  }}
                  className="py-3 px-8 bg-white text-navy rounded-lg font-bold text-base hover:bg-off-white transition-colors"
                >
                  Open Submissions ({submitDuration}min)
                </button>
                <button
                  onClick={async () => {
                    await advancePhase({ gameId, phase: "submit" });
                    // Trigger all AI tables immediately for demo
                    setTimeout(() => {
                      triggerAIPlayers();
                    }, 500);
                  }}
                  className="py-2 px-6 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors mt-3"
                >
                  Demo: Skip to AI Submissions
                </button>
                {game.phaseEndsAt && (
                  <button
                    onClick={() => skipTimer({ gameId })}
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
                  onKickToAI={(id) => kickToAI({ tableId: id })}
                  onSetHuman={(id) => toggleAI({ tableId: id })}
                />

                {/* Accepted agreements */}
                {(proposals ?? []).filter((p) => p.status === "accepted").length > 0 && (
                  <div className="bg-navy-dark rounded-xl border border-navy-light p-4 mt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-viz-safety mb-2 block">
                      Accepted Requests
                    </span>
                    {(proposals ?? []).filter((p) => p.status === "accepted").map((p) => (
                      <div key={p._id} className="flex items-center gap-2 py-1.5 text-[13px]">
                        <span className="text-viz-safety font-mono text-[11px]">✓</span>
                        <span className="text-white">
                          <span className="font-bold">{p.fromRoleName}</span>
                          {" → "}
                          <span className="font-bold">{p.toRoleName}</span>
                          {": "}
                        </span>
                        <span className="text-[#E2E8F0] flex-1 truncate">{p.actionText}</span>
                      </div>
                    ))}
                  </div>
                )}

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
                            className={`text-[13px] flex-1 ${
                              isHidden
                                ? "text-text-light italic cursor-pointer hover:text-white transition-colors"
                                : "text-[#E2E8F0]"
                            }`}
                            onClick={isHidden ? () => toggleReveal(secretKey) : undefined}
                            title={isHidden ? "Click to reveal secret action" : undefined}
                          >
                            {isHidden ? redactSecretAction(roleName, action) : action.text}
                          </span>
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
                        );
                      })}
                    </div>
                  );
                })}

                {/* Quick actions */}
                <div className="flex gap-2 mt-3">
                  {game.phaseEndsAt && (
                    <button
                      onClick={() => skipTimer({ gameId })}
                      className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1"
                    >
                      <SkipForward className="w-3 h-3" /> Skip Timer
                    </button>
                  )}
                </div>

                {/* Resolve button */}
                {submissionCount > 0 && (
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

            {/* ─── ROLLING ─── */}
            {phase === "rolling" && (
              <ActionFeed
                submissions={submissions ?? []}
                onComplete={() => advancePhase({ gameId, phase: "narrate" })}
                isFacilitator
              />
            )}

            {/* ─── NARRATE ─── */}
            {phase === "narrate" && (
              <div>
                {/* State of Play stays visible above narrative */}
                <StateOfPlay
                  labs={game.labs}
                  worldState={game.worldState}
                  roundLabel={currentRound?.label ?? ""}
                />
                <NarrativePanel round={currentRound} submissions={submissions ?? []} />

                {/* Game timeline for mid-game overview */}
                <div className="mt-4">
                  <GameTimeline
                    rounds={rounds}
                    initialWorldState={game.worldState}
                    initialLabs={game.labs}
                  />
                </div>

                {/* Manual override controls */}
                <div className="flex gap-3 mt-2 mb-4">
                  <NarrativeEditor
                    gameId={gameId}
                    roundNumber={game.currentRound}
                    currentSummary={currentRound?.summary ?? undefined}
                  />
                  <WorldStateEditor gameId={gameId} worldState={game.worldState} />
                  <FacilitatorAdjust gameId={gameId} currentWorldState={game.worldState} currentLabs={game.labs} />
                  <button
                    onClick={() => setShowAddLab(!showAddLab)}
                    className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Lab
                  </button>
                </div>

                {showAddLab && (
                  <div className="bg-navy rounded-xl border border-navy-light p-4 mb-4">
                    <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
                      <div>
                        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Lab Name</label>
                        <input
                          type="text"
                          value={newLabName}
                          onChange={(e) => setNewLabName(e.target.value)}
                          placeholder="e.g. Sovereign Compute Centre"
                          className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white placeholder:text-navy-muted focus:outline-none focus:border-text-light"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Controlled by</label>
                        <select
                          value={newLabRoleId}
                          onChange={(e) => setNewLabRoleId(e.target.value)}
                          className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light"
                        >
                          <option value="">Select role...</option>
                          {enabledTables.map((t) => (
                            <option key={t.roleId} value={t.roleId}>{t.roleName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Compute</label>
                        <input
                          type="number"
                          value={newLabCompute}
                          onChange={(e) => setNewLabCompute(Number(e.target.value))}
                          className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Multiplier</label>
                        <input
                          type="number"
                          value={newLabMultiplier}
                          onChange={(e) => setNewLabMultiplier(Number(e.target.value))}
                          step={0.1}
                          className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!newLabName || !newLabRoleId) return;
                          await addLab({
                            gameId,
                            name: newLabName,
                            roleId: newLabRoleId,
                            computeStock: newLabCompute,
                            rdMultiplier: newLabMultiplier,
                          });
                          setNewLabName("");
                          setNewLabRoleId("");
                          setNewLabCompute(10);
                          setNewLabMultiplier(1);
                          setShowAddLab(false);
                        }}
                        disabled={!newLabName || !newLabRoleId}
                        className="text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

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

        {/* Debug panel */}
        <DebugPanel
          gameId={gameId}
          roundNumber={game.currentRound}
          submissions={submissions as Props["submissions"]}
          round={currentRound as Props["round"]}
        />
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
}: {
  round: { label: string; number: number } | undefined;
  phase: string;
  timerDisplay: string;
  isExpired: boolean;
  isUrgent: boolean;
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
  tables: { _id: Id<"tables">; roleId: string; roleName: string; isAI: boolean; enabled: boolean; connected: boolean }[];
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
              {/* Quick role management during play */}
              {table.isAI && onSetHuman && (
                <button
                  onClick={() => onSetHuman(table._id)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-navy-light text-text-light hover:bg-navy-muted"
                  title="Open for a human player to join"
                >
                  Open
                </button>
              )}
              {!table.isAI && !sub && onKickToAI && (
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
