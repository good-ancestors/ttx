"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { TOTAL_ROUNDS, isSubmittedAction, countUnacknowledgedLowConfidence, type Lab } from "@/lib/game-data";
import { hasNarrativeContent } from "@/lib/narrative-sections";
import { NarrativeEditor } from "@/components/manual-controls";
import { NumberField } from "@/components/number-field";
import { AttemptedPanel } from "./attempted-panel";
import { HappenedSection } from "./resolve-sections/happened-section";
import { StateSection } from "./resolve-sections/state-section";
import {
  Loader2,
  Dices,
  SkipForward,
  ChevronRight,
  MessageSquareText,
} from "lucide-react";
import type { FacilitatorPhaseProps, CurrentRound, Submission, Proposal, RoundLite } from "./types";
import type { StructuredEffect } from "@/lib/ai-prompts";
import type { Id } from "@convex/_generated/dataModel";

// ─── Main unified round phase ───────────────────────────────────────────────

interface RoundPhaseProps extends FacilitatorPhaseProps {
  submissions: Submission[];
  proposals: Proposal[];
  currentRound: CurrentRound | undefined;
  resolving: boolean;
  resolveStep: string;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  hideAllSecrets: () => void;
  handleGradeRemaining: () => Promise<void>;
  handleRollDice: () => Promise<void>;
  handleReResolve: () => Promise<void>;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  submitDuration: number;
  setSubmitDuration: (val: number) => void;
  openSubmissions: (args: { gameId: Id<"games">; durationSeconds: number }) => Promise<unknown>;
  skipTimer: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  overrideStructuredEffect: (args: {
    submissionId: Id<"submissions">;
    actionIndex: number;
    structuredEffect?: StructuredEffect;
    acknowledge?: boolean;
  }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  narrativeStale: boolean;
  onDiceChanged: () => void;
  advanceRound: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  finishGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  forceClearLock: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  isTimerExpired?: boolean;
  timerDisplay?: string;
  isUrgent?: boolean;
  adjustTimer: (args: { gameId: Id<"games">; deltaSeconds: number }) => Promise<unknown>;
  labs: Lab[];
  rounds: RoundLite[];
  mergeLabs: (args: { gameId: Id<"games">; survivorName: string; absorbedName: string }) => Promise<unknown>;
  openAddLab: () => void;
}

// Complexity is inherent: this is the top-level facilitator view orchestrating
// discuss, submit, rolling, effect-review, and narrate phases in a single
// progressive layout.
// eslint-disable-next-line complexity
export function RoundPhase({
  gameId,
  game,
  tables,
  isProjector,
  submissions,
  proposals,
  currentRound,
  resolving,
  resolveStep,
  revealedCount,
  revealedSecrets,
  toggleReveal,
  revealAllSecrets,
  hideAllSecrets,
  handleGradeRemaining,
  handleRollDice,
  handleReResolve,
  safeAction,
  submitDuration,
  setSubmitDuration,
  openSubmissions,
  skipTimer,
  overrideProbability,
  overrideStructuredEffect,
  ungradeAction,
  rerollAction,
  narrativeStale,
  onDiceChanged,
  advanceRound,
  finishGame,
  forceClearLock,
  isTimerExpired,
  timerDisplay,
  isUrgent,
  adjustTimer,
  labs,
  rounds,
  mergeLabs,
  openAddLab,
}: RoundPhaseProps) {
  const phase = game.phase;

  const { submittedActionCount, ungradedCount, lowConfidenceCount } = useMemo(() => {
    const submitted = submissions.flatMap((s) =>
      s.actions.filter((a) => isSubmittedAction(a))
    );
    return {
      submittedActionCount: submitted.length,
      ungradedCount: submitted.filter((a) => a.probability == null).length,
      lowConfidenceCount: countUnacknowledgedLowConfidence(submissions),
    };
  }, [submissions]);

  const [editModal, setEditModal] = useState<"narrative" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"advance" | "end" | null>(null);

  const hasNarrative = hasNarrativeContent(currentRound?.summary);

  return (
    <div className="space-y-4">
      {/* ─── DISCUSS phase controls ─── */}
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
              <NumberField
                value={submitDuration}
                onChange={setSubmitDuration}
                min={1}
                max={30}
                integer
                ariaLabel="Submit duration in minutes"
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

      {/* ─── Section 1: What Was Attempted (hidden during discuss) ─── */}
      {phase !== "discuss" && (
        <AttemptedPanel
          phase={phase}
          submissions={submissions}
          proposals={proposals}
          isProjector={isProjector}
          resolving={resolving}
          revealedCount={revealedCount}
          revealedSecrets={revealedSecrets}
          toggleReveal={toggleReveal}
          revealAllSecrets={revealAllSecrets}
          hideAllSecrets={hideAllSecrets}
          handleReResolve={handleReResolve}
          rerollAction={rerollAction}
          overrideProbability={overrideProbability}
          overrideStructuredEffect={overrideStructuredEffect}
          ungradeAction={ungradeAction}
          hasNarrative={hasNarrative}
          narrativeStale={narrativeStale}
          onDiceChanged={onDiceChanged}
          isTimerExpired={!!isTimerExpired}
          labs={labs}
          tables={tables}
        />
      )}

      {/* ─── Grade/Roll buttons (submit phase, timer expired) ─── */}
      {phase === "submit" && !isProjector && (isTimerExpired || !game.phaseEndsAt) && (
        <div className="space-y-3">
          {submittedActionCount > 0 && (
            <div className="flex gap-3">
              {ungradedCount > 0 && (
                <button
                  onClick={handleGradeRemaining}
                  disabled={resolving}
                  className="flex-1 py-3 rounded-lg font-bold text-base transition-colors flex items-center justify-center gap-2 bg-[#3D2F00] text-[#FCD34D] hover:bg-[#4D3D00] disabled:opacity-50"
                >
                  {resolving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {resolveStep}</>
                  ) : (
                    <>Grade Remaining ({ungradedCount})</>
                  )}
                </button>
              )}

              <button
                onClick={handleRollDice}
                disabled={resolving}
                aria-describedby={lowConfidenceCount > 0 ? "roll-dice-gate-hint" : undefined}
                className={`flex-1 py-3 rounded-lg font-extrabold text-base transition-colors flex items-center justify-center gap-2 ${
                  resolving
                    ? "bg-navy-light text-navy-muted opacity-50 cursor-not-allowed"
                    : "bg-white text-navy hover:bg-off-white shadow-lg ring-1 ring-white/20"
                }`}
              >
                {resolving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {resolveStep}</>
                ) : ungradedCount > 0 ? (
                  <><Dices className="w-5 h-5" /> Grade &amp; Roll Dice</>
                ) : (
                  <><Dices className="w-5 h-5" /> Roll Dice</>
                )}
              </button>
            </div>
          )}
          {submittedActionCount > 0 && lowConfidenceCount > 0 && (
            <p id="roll-dice-gate-hint" className="text-xs text-viz-warning text-center">
              {lowConfidenceCount} low-confidence effect{lowConfidenceCount === 1 ? "" : "s"} flagged for review — click each yellow badge above to accept or edit, or roll anyway.
            </p>
          )}
        </div>
      )}

      {/* ─── Section 2: What Happened — narrative + effect summaries ─── */}
      <HappenedSection
        gameId={gameId}
        roundNumber={game.currentRound}
        currentRound={currentRound}
        phase={phase}
        resolving={resolving}
        resolveStep={resolveStep}
        isProjector={isProjector}
        forceClearLock={forceClearLock}
        onEditNarrative={isProjector ? undefined : () => setEditModal("narrative")}
      />

      {/* ─── Section 3: Where Things Are At (narrate phase only) ─── */}
      <StateSection
        gameId={gameId}
        currentRound={currentRound}
        currentRoundNumber={game.currentRound}
        phase={phase}
        isProjector={isProjector}
        labs={labs}
        rounds={rounds}
        onMerge={isProjector ? undefined : async (survivor, absorbed) => {
          await mergeLabs({ gameId, survivorName: survivor, absorbedName: absorbed });
        }}
        onAddLab={isProjector ? undefined : openAddLab}
      />

      {/* ─── Advance / End button (narrate phase) ─── */}
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

      {/* ─── Edit modal overlay (narrative only; Add Lab has its own modal in page.tsx) ─── */}
      {!isProjector && editModal === "narrative" && (
        <NarrativeEditModal
          onClose={() => setEditModal(null)}
          gameId={gameId}
          roundNumber={game.currentRound}
          currentRound={currentRound}
        />
      )}
    </div>
  );
}

function NarrativeEditModal({
  onClose,
  gameId,
  roundNumber,
  currentRound,
}: {
  onClose: () => void;
  gameId: Id<"games">;
  roundNumber: number;
  currentRound: CurrentRound | undefined;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => { prevActive?.focus(); };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="narrative-modal-title"
        className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-4">
          <span id="narrative-modal-title" className="text-sm font-bold text-white">Edit Round Summary</span>
          <button ref={closeButtonRef} onClick={onClose} className="text-text-light hover:text-white text-sm">Close</button>
        </div>
        <NarrativeEditor gameId={gameId} roundNumber={roundNumber} currentSummary={currentRound?.summary ?? undefined} startOpen />
      </div>
    </div>
  );
}
