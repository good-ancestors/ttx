"use client";

import { useState } from "react";
import { getCapabilityDescription, TOTAL_ROUNDS, isSubmittedAction } from "@/lib/game-data";
import { NarrativePanel } from "@/components/narrative-panel";
import { NarrativeEditor, WorldStateEditor } from "@/components/manual-controls";
import { PlayersPanel } from "./players-panel";
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
  kickToAI: (args: { tableId: Id<"tables"> }) => Promise<unknown>;
  setControlMode: (args: { tableId: Id<"tables">; controlMode: "human" | "ai" | "npc" }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  advanceRound: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  finishGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; computeStock: number; rdMultiplier: number }) => Promise<unknown>;
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
  kickToAI,
  setControlMode,
  overrideProbability,
  rerollAction,
  advanceRound,
  finishGame,
  addLab,
}: RoundPhaseProps) {
  const phase = game.phase;
  const isResolvingPhase = phase === "rolling" || phase === "narrate";

  const submittedActions = submissions.flatMap((s) =>
    s.actions.filter((a) => isSubmittedAction(a))
  );
  const submittedActionCount = submittedActions.length;
  const ungradedCount = submittedActions.filter((a) => a.probability == null).length;

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
            <div className="flex items-center justify-center gap-2 mb-4">
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

      {/* ─── 3. PLAYERS panel (visible from submit phase onwards) ─── */}
      {phase !== "discuss" && (
        <PlayersPanel
          tables={tables}
          submissions={submissions}
          isProjector={isProjector}
          onKickToAI={isProjector ? undefined : (id) => kickToAI({ tableId: id })}
          onSetControlMode={isProjector ? undefined : (id, mode) => setControlMode({ tableId: id, controlMode: mode })}
        />
      )}

      {/* ─── 4. WHAT WAS ATTEMPTED (collapsed, populates as submissions arrive) ─── */}
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
          {game.phaseEndsAt && (
            <button
              onClick={safeAction("Skip timer", () => skipTimer({ gameId }))}
              className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1"
            >
              <SkipForward className="w-3 h-3" /> Close Submissions
            </button>
          )}
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
  const leading = game.labs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b), game.labs[0]);
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
        <div className="grid grid-cols-3 gap-3 mb-3">
          {game.labs.map((lab) => {
            const change = currentRound.computeChanges?.distribution.find((d) => d.labName === lab.name);
            const totalChange = change ? change.baseline + change.modifier : 0;
            return (
              <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
                <div className="text-sm font-bold text-white">{lab.name}</div>
                <div className="text-xl font-black text-[#06B6D4] font-mono">{lab.rdMultiplier}×</div>
                <div className="text-xs text-text-light">
                  {lab.computeStock}u
                  {totalChange !== 0 && (
                    <span className={`ml-1 font-mono ${totalChange > 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                      ({totalChange > 0 ? "+" : ""}{totalChange})
                    </span>
                  )}
                  {" · "}Safety {lab.allocation.safety}%
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
