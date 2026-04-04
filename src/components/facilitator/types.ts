import type { Doc, Id } from "@convex/_generated/dataModel";

/** Game document from Convex */
export type Game = Doc<"games">;

/** Table — lightweight subset used by facilitator components.
 *  Compatible with both Doc<"tables"> and getFacilitatorState().tables. */
export type Table = {
  _id: Id<"tables">;
  roleId: string;
  roleName: string;
  joinCode: string;
  connected: boolean;
  controlMode: "human" | "ai" | "npc";
  enabled?: boolean;
  computeStock?: number;
  aiDisposition?: string;
};

/** Round document from Convex */
export type Round = Doc<"rounds"> & {
  roleComputeBefore?: { roleId: string; roleName: string; computeStock: number }[];
  roleComputeAfter?: { roleId: string; roleName: string; computeStock: number }[];
  computeChanges?: {
    newComputeTotal: number;
    baselineTotal: number;
    stockBeforeTotal: number;
    stockAfterTotal: number;
    distribution: {
      labName: string;
      stockBefore: number;
      stockAfter: number;
      stockChange: number;
      baseline: number;
      modifier: number;
      sharePct: number;
      active: boolean;
      reason?: string;
      newTotal: number;
    }[];
    nonCompetitive: {
      roleId: string;
      roleName: string;
      stockBefore: number;
      stockAfter: number;
      stockChange: number;
    }[];
  };
};

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
