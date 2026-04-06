"use client";

import { useState, useMemo } from "react";
import { api } from "@convex/_generated/api";
import { getCapabilityDescription, TOTAL_ROUNDS, isSubmittedAction, isResolvingPhase as checkResolvingPhase } from "@/lib/game-data";
import { useAuthMutation } from "@/lib/hooks";
import { NarrativePanel } from "@/components/narrative-panel";
import { NarrativeEditor, WorldStateEditor } from "@/components/manual-controls";
import { AttemptedPanel } from "./attempted-panel";
import { ExpandableSection } from "./expandable-section";
import { AddLabForm } from "./add-lab-form";
import {
  Loader2,
  Dices,
  SkipForward,
  Pencil,
  ChevronRight,
  CheckCircle,
  MessageSquareText,
} from "lucide-react";
import type { FacilitatorPhaseProps, Round, Submission, Proposal } from "./types";
import type { Id } from "@convex/_generated/dataModel";

// ─── Main unified round phase ───────────────────────────────────────────────

interface RoundPhaseProps extends FacilitatorPhaseProps {
  submissions: Submission[];
  proposals: Proposal[];
  currentRound: Round | undefined;
  previousNarrative: string | undefined;
  resolving: boolean;
  resolveStep: string;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  handleGradeRemaining: () => Promise<void>;
  handleRollDice: () => Promise<void>;
  handleReResolve: () => Promise<void>;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  submitDuration: number;
  setSubmitDuration: (val: number) => void;
  openSubmissions: (args: { gameId: Id<"games">; durationSeconds: number }) => Promise<unknown>;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  advanceRound: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  finishGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; computeStock: number; rdMultiplier: number }) => Promise<unknown>;
  forceClearLock: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  isTimerExpired?: boolean;
  timerDisplay?: string;
  isUrgent?: boolean;
  adjustTimer: (args: { gameId: Id<"games">; deltaSeconds: number }) => Promise<unknown>;
}

// Complexity is inherent: this is the top-level facilitator view orchestrating
// discuss, submit, rolling, and narrate phases in a single progressive layout.
// eslint-disable-next-line complexity
export function RoundPhase({
  gameId,
  game,
  tables,
  isProjector,
  submissions,
  proposals,
  currentRound,
  previousNarrative,
  resolving,
  resolveStep,
  revealedCount,
  revealedSecrets,
  toggleReveal,
  revealAllSecrets,
  handleGradeRemaining,
  handleRollDice,
  handleReResolve,
  safeAction,
  submitDuration,
  setSubmitDuration,
  openSubmissions,
  skipTimer,
  overrideProbability,
  rerollAction,
  advanceRound,
  finishGame,
  addLab,
  forceClearLock,
  isTimerExpired,
  timerDisplay,
  isUrgent,
  adjustTimer,
}: RoundPhaseProps) {
  const phase = game.phase;
  const isResolvingPhase = checkResolvingPhase(phase);

  const { submittedActionCount, ungradedCount } = useMemo(() => {
    const submitted = submissions.flatMap((s) =>
      s.actions.filter((a) => isSubmittedAction(a))
    );
    return {
      submittedActionCount: submitted.length,
      ungradedCount: submitted.filter((a) => a.probability == null).length,
    };
  }, [submissions]);

  const [editModal, setEditModal] = useState<"narrative" | "dials" | "addlab" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"advance" | "end" | null>(null);

  return (
    <div className="space-y-4">
      {/* ─── 1. WHERE THINGS START — expandable narrative (open by default) ─── */}
      {previousNarrative && (
        <div className="bg-navy rounded-xl border border-navy-light p-5">
          <ExpandableSection title="Where Things Start" defaultOpen>
            <p className={`${isProjector ? "text-lg" : "text-sm"} text-text-light leading-relaxed`}>{previousNarrative}</p>
          </ExpandableSection>
        </div>
      )}

      {/* ─── 2. DISCUSS phase controls ─── */}
      {phase === "discuss" && (
        <div className="bg-navy rounded-xl border border-navy-light p-5">
        <div className="text-center py-8">
          <MessageSquareText className="w-10 h-10 text-text-light mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-2">Tables are discussing</h3>
          <p className="text-text-light mb-4 text-sm">
            Each table: discuss what your actor does this quarter, then submit.
          </p>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
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
            <div className="mb-4 flex items-center justify-center gap-2">
              <label className="text-xs uppercase tracking-wider text-text-light/70">
                Custom
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={submitDuration}
                onChange={(event) => setSubmitDuration(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
                className="w-20 rounded border border-navy-light bg-navy-dark px-2 py-1.5 text-center text-sm text-white outline-none"
              />
              <span className="text-xs text-text-light/70">minutes</span>
            </div>
            <button
              onClick={() => void openSubmissions({ gameId, durationSeconds: submitDuration * 60 })}
              className="py-3 px-8 bg-white text-navy rounded-lg font-bold text-base hover:bg-off-white transition-colors"
            >
              Open Submissions ({submitDuration}min)
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
        </div>
      )}

      {/* ─── Large inline timer (during submit phase with active timer) ─── */}
      {phase === "submit" && game.phaseEndsAt && timerDisplay && !isTimerExpired && (
        <div className={`rounded-xl p-6 text-center ${isUrgent ? "bg-viz-danger/10 border border-viz-danger/30" : "bg-navy border border-navy-light"}`}>
          <span className={`text-6xl font-mono font-black tabular-nums ${isUrgent ? "text-viz-danger animate-pulse" : "text-white"}`}>
            {timerDisplay}
          </span>
          {!isProjector && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => void adjustTimer({ gameId, deltaSeconds: -30 })}
                className="px-4 py-2 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors"
              >
                −30s
              </button>
              <button
                onClick={safeAction("End early", () => skipTimer({ gameId }))}
                className="px-6 py-2 bg-viz-danger/20 text-viz-danger rounded-lg font-bold text-sm hover:bg-viz-danger/30 transition-colors"
              >
                End Early
              </button>
              <button
                onClick={() => void adjustTimer({ gameId, deltaSeconds: 30 })}
                className="px-4 py-2 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors"
              >
                +30s
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── 3. WHAT WAS ATTEMPTED (collapsed, populates as submissions arrive) ─── */}
      {phase !== "discuss" && (
        <AttemptedPanel
          submissions={submissions}
          proposals={proposals}
          isProjector={isProjector}
          resolving={resolving}
          revealedCount={revealedCount}
          revealedSecrets={revealedSecrets}
          toggleReveal={toggleReveal}
          revealAllSecrets={revealAllSecrets}
          handleReResolve={handleReResolve}
          rerollAction={rerollAction}
          overrideProbability={overrideProbability}
          phase={phase}
        />
      )}

      {/* ─── 5. Skip timer + Grade/Roll buttons (submit phase) ─── */}
      {phase === "submit" && !isProjector && (
        <div className="space-y-3">
          {submittedActionCount > 0 && (
            <div className="flex gap-3">
              {/* Grade Remaining — AI grades actions without a probability */}
              {(ungradedCount > 0 || resolving) && (
                <button
                  onClick={handleGradeRemaining}
                  disabled={resolving || ungradedCount === 0}
                  className="flex-1 py-3 rounded-lg font-bold text-base transition-colors flex items-center justify-center gap-2 bg-[#3D2F00] text-[#FCD34D] hover:bg-[#4D3D00] disabled:opacity-50"
                >
                  {resolving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {resolveStep}</>
                  ) : (
                    <>Grade Remaining ({ungradedCount})</>
                  )}
                </button>
              )}

              {/* Roll Dice — only enabled when all submitted actions are graded */}
              <button
                onClick={handleRollDice}
                disabled={resolving || ungradedCount > 0}
                className={`flex-1 py-3 rounded-lg font-extrabold text-base transition-colors flex items-center justify-center gap-2 ${
                  resolving
                    ? "bg-navy-light text-navy-muted opacity-50"
                    : ungradedCount === 0
                      ? "bg-white text-navy hover:bg-off-white shadow-lg ring-1 ring-white/20"
                      : "bg-navy-light text-navy-muted cursor-default"
                }`}
              >
                <Dices className="w-5 h-5" /> Roll Dice
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── 6. Resolve progress (rolling/narrate) ─── */}
      {isResolvingPhase && resolving && resolveStep && (
        <div className="flex items-center gap-2 py-2 text-sm text-text-light">
          <Loader2 className="w-4 h-4 animate-spin" />
          {resolveStep}
        </div>
      )}
      {!isProjector && resolveStep && (resolveStep.toLowerCase().includes("error") || resolveStep.toLowerCase().includes("failed")) && (
        <button
          onClick={() => void forceClearLock({ gameId })}
          className="text-[11px] px-3 py-1.5 bg-viz-danger/20 text-viz-danger rounded font-medium hover:bg-viz-danger/30 transition-colors flex items-center gap-1 mt-2"
        >
          Clear Lock &amp; Retry
        </button>
      )}

      {/* ─── 7. WHAT HAPPENED — narrative (rolling/narrate) ─── */}
      {isResolvingPhase && (resolving || currentRound?.summary) && (
        <NarrativePanel round={currentRound} isProjector={isProjector} />
      )}

      {/* ─── 8. WHERE WE ARE NOW — lab state + capability (narrate) ─── */}
      {isResolvingPhase && currentRound?.summary && (
        <WhereWeAreNow
          gameId={gameId}
          game={game}
          currentRound={currentRound}
          isProjector={isProjector}
          onEditNarrative={() => setEditModal("narrative")}
        />
      )}

      {/* ─── 9. Advance / End button (narrate phase) ─── */}
      {phase === "narrate" && !isProjector && (<div className="mt-6">
        {game.currentRound < TOTAL_ROUNDS ? (
          pendingConfirm === "advance" ? (
            <div className="flex gap-2">
              <button onClick={() => setPendingConfirm(null)} className="flex-1 py-4 bg-navy-light text-text-light rounded-lg font-bold text-base">Cancel</button>
              <button onClick={() => { setPendingConfirm(null); void safeAction("Advance round", () => advanceRound({ gameId }))(); }} className="flex-1 py-4 bg-white text-navy rounded-lg font-extrabold text-base">Confirm Advance</button>
            </div>
          ) : (
            <button
              onClick={() => setPendingConfirm("advance")}
              className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors flex items-center justify-center gap-2"
            >
              Advance to Next Round <ChevronRight className="w-5 h-5" />
            </button>
          )
        ) : (
          pendingConfirm === "end" ? (
            <div className="flex gap-2">
              <button onClick={() => setPendingConfirm(null)} className="flex-1 py-4 bg-navy-light text-text-light rounded-lg font-bold text-base">Cancel</button>
              <button onClick={() => { setPendingConfirm(null); void safeAction("End scenario", () => finishGame({ gameId }))(); }} className="flex-1 py-4 bg-viz-danger text-white rounded-lg font-extrabold text-base">End Scenario</button>
            </div>
          ) : (
            <button
              onClick={() => setPendingConfirm("end")}
              className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors"
            >
              End Scenario
            </button>
          )
        )}
      </div>)}

      {/* ─── Edit modal overlay ─── */}
      {!isProjector && editModal && (
        <EditModal
          editModal={editModal}
          onClose={() => setEditModal(null)}
          gameId={gameId}
          game={game}
          tables={tables}
          currentRound={currentRound}
          addLab={addLab}
        />
      )}
    </div>
  );
}

// ─── Where We Are Now sub-component ─────────────────────────────────────────

function WhereWeAreNow({
  gameId,
  game,
  currentRound,
  isProjector,
  onEditNarrative,
}: {
  gameId: Id<"games">;
  game: RoundPhaseProps["game"];
  currentRound: Round;
  isProjector: boolean;
  onEditNarrative: () => void;
}) {
  const leading = game.labs.length > 0
    ? game.labs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b))
    : null;
  const cap = leading ? getCapabilityDescription(leading.rdMultiplier) : null;
  const alignmentColor = game.worldState.alignment <= 3 ? "#EF4444" : game.worldState.alignment >= 7 ? "#22C55E" : "#F59E0B";
  const trajectory = game.worldState.alignment <= 3 ? "RACE" : game.worldState.alignment >= 6 ? "SLOWDOWN" : "UNCERTAIN";

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <ExpandableSection
        title="Where We Are Now"
        defaultOpen
        badge={
          <>
            <CheckCircle className="w-3.5 h-3.5 text-viz-safety" />
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ backgroundColor: `${alignmentColor}20`, color: alignmentColor }}
            >
              {trajectory}
            </span>
          </>
        }
      >
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {game.labs.map((lab) => {
            const holder = currentRound.computeHolders?.find((h) => h.roleId === lab.roleId);
            const stockChange = holder ? (holder.override ?? holder.stockAfter) - holder.stockBefore : 0;
            return (
              <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
                <div className={`${isProjector ? "text-base" : "text-sm"} font-bold text-white`}>{lab.name}</div>
                <div className={`${isProjector ? "text-3xl" : "text-xl"} font-black text-[#06B6D4] font-mono`}>{lab.rdMultiplier}×</div>
                <div className="text-xs text-text-light space-y-0.5">
                  <div>
                    Stock {holder?.stockBefore ?? lab.computeStock}u {"→"} {lab.computeStock}u
                    {stockChange !== 0 && (
                      <span className={`ml-1 font-mono ${stockChange > 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                        ({stockChange > 0 ? "+" : ""}{stockChange})
                      </span>
                    )}
                  </div>
                  <div>
                    {holder ? `${holder.sharePct}% of new compute` : "No flow data"} {" · "}Safety {lab.allocation.safety}%
                  </div>
                </div>
                {lab.spec && (
                  <div className="text-[10px] text-text-light/70 mt-1.5 pt-1.5 border-t border-navy-light leading-relaxed line-clamp-3" title={lab.spec}>
                    Spec: {lab.spec}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {cap && (
          <>
            <div className="bg-navy rounded-lg p-4 border border-navy-light mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-white">How Capable is AI?</span>
                <span className="text-xs text-viz-capability font-mono ml-auto">{cap.agent} · {cap.rdRange}</span>
              </div>
              <p className={`${isProjector ? "text-base" : "text-sm"} text-[#E2E8F0] mb-2`}>{cap.generalCapability}</p>
              <div className="space-y-1 mb-2">
                {cap.specificCapabilities.map((c: string, i: number) => (
                  <p key={`cap-${i}`} className={`${isProjector ? "text-base" : "text-sm"} text-text-light flex items-start gap-1.5`}>
                    <span className="text-viz-capability mt-0.5">●</span> {c}
                  </p>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-navy-light">
                <span className="text-base font-bold text-white">{cap.timeCompression}</span>
              </div>
            </div>
            <div className="bg-navy rounded-lg p-3 border border-navy-light">
              <p className={`${isProjector ? "text-base" : "text-sm"} text-[#E2E8F0]`}>{cap.implication}</p>
            </div>
          </>
        )}
        <ComputeFlowPanel currentRound={currentRound} gameId={gameId} isProjector={isProjector} />
        {!isProjector && (
          <div className="flex gap-2 mt-3">
            <button onClick={onEditNarrative} className="text-[10px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit narrative
            </button>
          </div>
        )}
      </ExpandableSection>
    </div>
  );
}

function ComputeFlowPanel({
  currentRound,
  gameId,
  isProjector,
}: {
  currentRound: Round;
  gameId: Id<"games">;
  isProjector: boolean;
}) {
  const holders = currentRound.computeHolders;
  if (!holders) return null;

  const entries = holders
    .filter((h) => h.stockBefore !== 0 || h.produced !== 0 || h.transferred !== 0 || h.adjustment !== 0 || h.override != null)
    .toSorted((a, b) => (b.override ?? b.stockAfter) - (a.override ?? a.stockAfter));

  const totalBefore = entries.reduce((s, e) => s + e.stockBefore, 0);
  const totalAfter = entries.reduce((s, e) => s + (e.override ?? e.stockAfter), 0);

  // Chart data
  const chartEntries = entries.map((e) => {
    const after = e.override ?? e.stockAfter;
    return {
      name: e.name,
      gain: Math.max(0, e.produced + Math.max(0, e.transferred)),
      loss: Math.max(0, -e.adjustment) + Math.max(0, -e.transferred),
      stockBefore: e.stockBefore,
      stockAfter: after,
      sharePct: e.sharePct,
    };
  });
  const maxTotal = Math.max(...chartEntries.map((e) => e.stockBefore + e.gain), 1);

  return (
    <div className="mt-3 mb-3 rounded-lg border border-navy-light bg-navy p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white">Compute Stock and Flow</div>
          <div className="text-xs text-text-light">
            Total {totalBefore}u {"→"} {totalAfter}u
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-text-light">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-viz-safety" /> New</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#64748B]" /> Stock</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-viz-danger" /> Lost</span>
        </div>
      </div>

      {/* Stacked column chart */}
      <div className="flex items-end gap-1.5" style={{ height: 160 }}>
        {chartEntries.map((entry) => {
          const retained = Math.max(0, entry.stockBefore - entry.loss);
          const retainedPct = (retained / maxTotal) * 100;
          const gainPct = (entry.gain / maxTotal) * 100;
          const lossPct = (entry.loss / maxTotal) * 100;

          return (
            <div key={entry.name} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex flex-col justify-end" style={{ height: 120 }}>
                {gainPct > 0 && (
                  <div className="w-full bg-viz-safety rounded-t-sm" style={{ height: `${gainPct}%` }} title={`+${entry.gain}u new`} />
                )}
                {retainedPct > 0 && (
                  <div className={`w-full bg-[#64748B] ${gainPct === 0 ? "rounded-t-sm" : ""}`} style={{ height: `${retainedPct}%` }} title={`${retained}u retained`} />
                )}
                {lossPct > 0 && (
                  <div className="w-full bg-viz-danger rounded-b-sm" style={{ height: `${lossPct}%` }} title={`-${entry.loss}u lost`} />
                )}
              </div>
              <div className="text-center w-full overflow-hidden">
                <div className="text-[10px] font-bold text-white truncate">{entry.name}</div>
                <div className="text-[10px] font-mono text-text-light">{entry.stockAfter}u</div>
                {entry.sharePct > 0 && (
                  <div className="text-[9px] text-text-light/60">{entry.sharePct}%</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail table — only for facilitator, not projector */}
      {!isProjector && (
        <ComputeDetailTable
          key={currentRound.number}
          entries={entries}
          gameId={gameId}
          roundNumber={currentRound.number}
        />
      )}
    </div>
  );
}

function ComputeDetailTable({
  entries,
  gameId,
  roundNumber,
}: {
  entries: { roleId: string; name: string; stockBefore: number; stockAfter: number; produced: number; transferred: number; adjustment: number; adjustmentReason?: string; sharePct: number; override?: number; overrideReason?: string }[];
  gameId: Id<"games">;
  roundNumber: number;
}) {
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, { value: number; reason: string }>>({});
  const overrideCompute = useAuthMutation(api.computeMutations.overrideHolderCompute);

  const handleSave = async () => {
    try {
      await Promise.all(
        Object.entries(overrides).map(([roleId, { value, reason }]) =>
          overrideCompute({ gameId, roundNumber, roleId, computeStock: value, reason: reason || undefined })
        )
      );
      setOverrides({});
      setEditing(false);
    } catch (err) {
      console.error("[ComputeDetailTable] Save failed:", err);
    }
  };

  return (
    <div className="mt-3 border-t border-navy-light pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-light">Detail</span>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-[10px] px-2 py-0.5 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-2.5 h-2.5" /> Edit
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={() => { setOverrides({}); setEditing(false); }} className="text-[10px] px-2 py-0.5 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={Object.keys(overrides).length === 0}
              className="text-[10px] px-2 py-0.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-light/60 text-left">
            <th className="pb-1 font-semibold">Entity</th>
            <th className="pb-1 font-semibold text-right">Start</th>
            <th className="pb-1 font-semibold text-right">New</th>
            <th className="pb-1 font-semibold text-right">Lost</th>
            <th className="pb-1 font-semibold text-right">After</th>
            <th className="pb-1 font-semibold text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const displayAfter = overrides[e.roleId]?.value ?? e.override ?? e.stockAfter;
            const isOverridden = e.roleId in overrides;
            const gained = Math.max(0, e.produced) + Math.max(0, e.transferred);
            const lost = Math.max(0, -e.produced) + Math.max(0, -e.transferred) + Math.max(0, -e.adjustment);

            return (
              <tr key={e.roleId} className="border-t border-navy-light/30">
                <td className="py-1 text-white font-medium truncate max-w-[120px]">{e.name}</td>
                <td className="py-1 text-right font-mono text-text-light">{e.stockBefore}</td>
                <td className="py-1 text-right font-mono text-viz-safety">{gained > 0 ? `+${gained}` : "—"}</td>
                <td className="py-1 text-right font-mono text-viz-danger">{lost > 0 ? `−${lost}` : "—"}</td>
                <td className="py-1 text-right font-mono">
                  {editing ? (
                    <input
                      type="number"
                      value={displayAfter}
                      onChange={(ev) => {
                        const val = parseInt(ev.target.value) || 0;
                        setOverrides((prev) => ({ ...prev, [e.roleId]: { value: Math.max(0, val), reason: prev[e.roleId]?.reason ?? "" } }));
                      }}
                      className={`w-14 bg-navy-dark border rounded px-1 py-0.5 text-right font-mono text-white outline-none ${
                        isOverridden ? "border-[#FCD34D]" : "border-navy-light"
                      } focus:border-text-light`}
                    />
                  ) : (
                    <span className={e.override != null ? "text-[#FCD34D]" : "text-white"}>
                      {displayAfter}
                    </span>
                  )}
                </td>
                <td className="py-1 text-right font-mono text-text-light/50">{e.sharePct > 0 ? `${e.sharePct}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <div className="mt-2 text-[9px] text-text-light/60">
          Edit the &quot;After&quot; values. Changes are saved as facilitator overrides.
        </div>
      )}
    </div>
  );
}

// ─── Edit modal ─────────────────────────────────────────────────────────────

function EditModal({
  editModal,
  onClose,
  gameId,
  game,
  tables,
  currentRound,
  addLab,
}: {
  editModal: "narrative" | "dials" | "addlab";
  onClose: () => void;
  gameId: Id<"games">;
  game: RoundPhaseProps["game"];
  tables: RoundPhaseProps["tables"];
  currentRound: Round | undefined;
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; computeStock: number; rdMultiplier: number }) => Promise<unknown>;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-white capitalize">
            {editModal === "addlab" ? "Add Lab" : editModal === "dials" ? "Edit World State" : "Edit Narrative"}
          </span>
          <button onClick={onClose} className="text-text-light hover:text-white text-sm">Close</button>
        </div>
        {editModal === "narrative" && (
          <NarrativeEditor gameId={gameId} roundNumber={game.currentRound} currentSummary={currentRound?.summary ?? undefined} startOpen />
        )}
        {editModal === "dials" && (
          <WorldStateEditor gameId={gameId} worldState={game.worldState} startOpen />
        )}
        {editModal === "addlab" && (
          <AddLabForm gameId={gameId} tables={tables} addLab={addLab} onDone={onClose} />
        )}
      </div>
    </div>
  );
}
