import type { Doc, Id } from "@convex/_generated/dataModel";

/** Game document from Convex */
export type Game = Doc<"games">;

/** Table document from Convex */
export type Table = Doc<"tables">;

/** Round document from Convex */
export type Round = Doc<"rounds">;

/** Full submission document from Convex */
export type SubmissionFull = Doc<"submissions">;

/** Lightweight submission summary — excludes aiMeta, reasoning, artifact, computeAllocation.
 *  Used by facilitator panels that only need action data for display. */
export type Submission = Pick<
  Doc<"submissions">,
  "_id" | "_creationTime" | "tableId" | "gameId" | "roundNumber" | "roleId" | "status"
> & {
  actions: {
    text: string;
    priority: number;
    secret?: boolean;
    actionStatus?: "draft" | "submitted";
    probability?: number;
    rolled?: number;
    success?: boolean;
    aiInfluence?: number;
  }[];
};

/** Request/proposal document from Convex */
export type Proposal = Doc<"requests">;

/** Common props shared across phase components */
export interface FacilitatorPhaseProps {
  gameId: Id<"games">;
  game: Game;
  tables: Table[];
  isProjector: boolean;
}
