import type { Doc, Id } from "@convex/_generated/dataModel";

/** Game document from Convex */
export type Game = Doc<"games">;

/** Table document from Convex */
export type Table = Doc<"tables">;

/** Round document from Convex */
export type Round = Doc<"rounds">;

/** Submission document from Convex */
export type Submission = Doc<"submissions">;

/** Request/proposal document from Convex */
export type Proposal = Doc<"requests">;

/** Common props shared across phase components */
export interface FacilitatorPhaseProps {
  gameId: Id<"games">;
  game: Game;
  tables: Table[];
  isProjector: boolean;
}
