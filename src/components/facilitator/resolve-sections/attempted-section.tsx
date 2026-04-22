"use client";

import { AttemptedPanel } from "../attempted-panel";
import type { Submission, Proposal, Round } from "../types";
import type { Id } from "@convex/_generated/dataModel";

/** Section 1 — "What was attempted". Wraps AttemptedPanel.
 *  AttemptedPanel internally branches by phase: flat list during submit/rolling, and a
 *  succeeded/failed split with review flags + Continue bar during effect-review/narrate. */
export function AttemptedSection(props: {
  gameId: Id<"games">;
  roundNumber: number;
  phase: string;
  currentRound: Round | undefined;
  submissions: Submission[];
  proposals: Proposal[];
  isProjector: boolean;
  resolving: boolean;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  hideAllSecrets: () => void;
  handleReResolve: () => Promise<void>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  hasNarrative: boolean;
  narrativeStale: boolean;
  onDiceChanged: () => void;
  isTimerExpired: boolean;
}) {
  if (props.phase === "discuss") return null;

  return (
    <AttemptedPanel
      gameId={props.gameId}
      roundNumber={props.roundNumber}
      submissions={props.submissions}
      proposals={props.proposals}
      isProjector={props.isProjector}
      resolving={props.resolving}
      revealedCount={props.revealedCount}
      revealedSecrets={props.revealedSecrets}
      toggleReveal={props.toggleReveal}
      revealAllSecrets={props.revealAllSecrets}
      hideAllSecrets={props.hideAllSecrets}
      handleReResolve={props.handleReResolve}
      rerollAction={props.rerollAction}
      overrideProbability={props.overrideProbability}
      ungradeAction={props.ungradeAction}
      phase={props.phase}
      hasNarrative={props.hasNarrative}
      narrativeStale={props.narrativeStale}
      onDiceChanged={props.onDiceChanged}
      currentRound={props.currentRound}
      isTimerExpired={props.isTimerExpired}
    />
  );
}
