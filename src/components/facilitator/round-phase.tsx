"use client";

import { useState, useMemo } from "react";
import { getCapabilityDescription, TOTAL_ROUNDS, isSubmittedAction, isResolvingPhase as checkResolvingPhase } from "@/lib/game-data";
import { NarrativePanel } from "@/components/narrative-panel";
import { NarrativeEditor, WorldStateEditor } from "@/components/manual-controls";
import { AttemptedPanel } from "./attempted-panel";
import { ExpandableSection } from "./expandable-section";
import { ComputeEditor } from "./compute-editor";
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

  const [editModal, setEditModal] = useState<"narrative" | "dials" | "addlab" | "compute" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"advance" | "end" | null>(null);

  return (
    <div className="space-y-4">
      {/* ─── 1. WHERE THINGS START — expandable narrative (open by default) ─── */}
      {previousNarrative && (
        <div className="bg-navy rounded-xl border border-navy-light p-5">
          <ExpandableSection title="Where Things Start" defaultOpen>
            <p className="text-sm text-text-light leading-relaxed">{previousNarrative}</p>
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
              <button
                onClick={handleGradeRemaining}
                disabled={resolving || ungradedCount === 0}
                className={`flex-1 py-3 rounded-lg font-bold text-base transition-colors flex items-center justify-center gap-2 ${
                  ungradedCount > 0
                    ? "bg-[#3D2F00] text-[#FCD34D] hover:bg-[#4D3D00]"
                    : "bg-navy-light text-navy-muted cursor-default"
                } disabled:opacity-50`}
              >
                {resolving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {resolveStep}</>
                ) : ungradedCount > 0 ? (
                  <>Grade Remaining ({ungradedCount})</>
                ) : (
                  <>All Graded</>
                )}
              </button>

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
        <NarrativePanel round={currentRound} />
      )}

      {/* ─── 8. WHERE WE ARE NOW — lab state + capability (narrate) ─── */}
      {isResolvingPhase && currentRound?.summary && (
        <WhereWeAreNow
          game={game}
          currentRound={currentRound}
          isProjector={isProjector}
          onEditNarrative={() => setEditModal("narrative")}
          onEditCompute={() => setEditModal("compute")}
        />
      )}

      {/* ─── 9. Advance / End button (narrate phase) ─── */}
      {phase === "narrate" && !isProjector && (
        game.currentRound < TOTAL_ROUNDS ? (
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
        )
      )}

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
  game,
  currentRound,
  isProjector,
  onEditNarrative,
  onEditCompute,
}: {
  game: RoundPhaseProps["game"];
  currentRound: Round;
  isProjector: boolean;
  onEditNarrative: () => void;
  onEditCompute: () => void;
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
            const change = currentRound.computeChanges?.distribution.find((d) => d.labName === lab.name);
            return (
              <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
                <div className="text-sm font-bold text-white">{lab.name}</div>
                <div className="text-xl font-black text-[#06B6D4] font-mono">{lab.rdMultiplier}×</div>
                <div className="text-xs text-text-light space-y-0.5">
                  <div>
                    Stock {change?.stockBefore ?? lab.computeStock}u {"→"} {lab.computeStock}u
                    {change && change.stockChange !== 0 && (
                      <span className={`ml-1 font-mono ${change.stockChange > 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                        ({change.stockChange > 0 ? "+" : ""}{change.stockChange})
                      </span>
                    )}
                  </div>
                  <div>
                    Flow {change ? `${change.sharePct}% of new compute` : "No flow data"} {" · "}Safety {lab.allocation.safety}%
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
              <p className="text-sm text-[#E2E8F0] mb-2">{cap.generalCapability}</p>
              <div className="space-y-1 mb-2">
                {cap.specificCapabilities.map((c: string, i: number) => (
                  <p key={`cap-${i}`} className="text-sm text-text-light flex items-start gap-1.5">
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
        <ComputeFlowPanel currentRound={currentRound} />
        {!isProjector && (
          <div className="flex gap-2 mt-3">
            <button onClick={onEditNarrative} className="text-[10px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit narrative
            </button>
            <button onClick={onEditCompute} className="text-[10px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted transition-colors flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit compute
            </button>
          </div>
        )}
      </ExpandableSection>
    </div>
  );
}

function ComputeFlowPanel({ currentRound }: { currentRound: Round }) {
  const computeChanges = currentRound.computeChanges;
  if (!computeChanges) return null;

  return (
    <div className="mb-3 rounded-lg border border-navy-light bg-navy p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white">Compute Stock and Flow</div>
          <div className="text-xs text-text-light">
            Competitive stock {computeChanges.stockBeforeTotal}u → {computeChanges.stockAfterTotal}u
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black font-mono text-white">{computeChanges.newComputeTotal}u</div>
          <div className="text-[11px] text-text-light">
            New compute
            <span className="ml-1 text-text-light/60">baseline {computeChanges.baselineTotal}u</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {computeChanges.distribution
          .sort((a, b) => b.stockAfter - a.stockAfter)
          .map((entry) => (
            <div
              key={entry.labName}
              className={`rounded-lg border p-3 ${
                entry.active ? "border-navy-light bg-navy-dark" : "border-dashed border-navy-light/80 bg-navy-dark/60"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white">
                    {entry.labName}
                    {!entry.active && <span className="ml-2 text-[10px] uppercase tracking-wider text-text-light/70">inactive</span>}
                  </div>
                  <div className="text-xs text-text-light">
                    Stock {entry.stockBefore}u → {entry.stockAfter}u
                    <span className={`ml-2 font-mono ${entry.stockChange >= 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                      {entry.stockChange >= 0 ? "+" : ""}{entry.stockChange}u
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-text-light">
                  <div>{entry.sharePct}% of new compute</div>
                  <div className="font-mono">
                    flow {entry.baseline >= 0 ? "+" : ""}{entry.baseline}u
                    {entry.modifier !== 0 && (
                      <span className={entry.modifier > 0 ? "text-viz-safety" : "text-viz-danger"}>
                        {" "}{entry.modifier > 0 ? "+" : ""}{entry.modifier}u
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {entry.reason && (
                <p className="mt-2 border-t border-navy-light pt-2 text-[11px] leading-relaxed text-text-light/80">
                  {entry.reason}
                </p>
              )}
            </div>
          ))}
      </div>

      {computeChanges.nonCompetitive.length > 0 && (
        <div className="mt-3 rounded-lg border border-navy-light bg-navy-dark p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-light">Non-competitive stockpiles</div>
          <div className="grid gap-2 md:grid-cols-2">
            {computeChanges.nonCompetitive.map((entry) => (
              <div key={entry.roleId} className="rounded border border-navy-light/70 px-3 py-2">
                <div className="text-xs font-bold text-white">{entry.roleName}</div>
                <div className="text-xs text-text-light">
                  {entry.stockBefore}u → {entry.stockAfter}u
                  <span className={`ml-2 font-mono ${entry.stockChange >= 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                    {entry.stockChange >= 0 ? "+" : ""}{entry.stockChange}u
                  </span>
                </div>
              </div>
            ))}
          </div>
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
  editModal: "narrative" | "dials" | "addlab" | "compute";
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
            {editModal === "addlab" ? "Add Lab" : editModal === "compute" ? "Edit Compute" : editModal === "dials" ? "Edit World State" : "Edit Narrative"}
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
        {editModal === "compute" && (
          <ComputeEditor labs={game.labs} gameId={gameId} computeChanges={currentRound?.computeChanges ?? undefined} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
