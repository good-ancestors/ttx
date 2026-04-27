import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { StructuredEffect, Confidence } from "@/lib/ai-prompts";
import type { Lab } from "@/lib/game-data";

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
  playerName?: string;
};

/** Round document from Convex — full doc shape, used by GameTimeline (which
 *  reads via `api.rounds.getByGame` only on `status === "finished"`). Not the
 *  shape returned by the bandwidth-bounded `api.rounds.getCurrent` — see
 *  `CurrentRound` below for that. */
export type Round = Doc<"rounds">;

/** Live-subscription projection returned by `api.rounds.getCurrent`. Bounded
 *  to suppress per-pipeline-phase wire noise; consumers should prefer this
 *  over `Round` for facilitator UI props. Derived from the actual API return
 *  so any change to the projection forces a type-level update here. */
export type CurrentRound = NonNullable<FunctionReturnType<typeof api.rounds.getCurrent>>;

/** Lightweight round summary for the R&D chart + snapshot dropdown — must
 *  stay in sync with `convex/rounds.ts:getByGameLightweight`'s projection.
 *  `hasLabsBefore` is wire-only (boolean projection of `labsBefore != null`),
 *  not present on full `Round` rows — don't expect to find it on `Doc<"rounds">`. */
export interface RoundLite {
  number: number;
  label: string;
  labsAfter?: Lab[];
  hasLabsBefore: boolean;
}

/** Lightweight submission summary — excludes aiMeta, artifact, computeAllocation.
 *  Used by facilitator panels that only need action data for display. */
export type Submission = Pick<
  Doc<"submissions">,
  "_id" | "_creationTime" | "tableId" | "gameId" | "roundNumber" | "roleId" | "status"
> & {
  actions: {
    actionId: string;
    text: string;
    priority: number;
    secret?: boolean;
    actionStatus: "draft" | "submitted";
    probability?: number;
    reasoning?: string;
    rolled?: number;
    success?: boolean;
    aiInfluence?: number;
    structuredEffect?: StructuredEffect;
    confidence?: Confidence;
    mergeLab?: { absorbedLabId: string; survivorLabId: string; newName?: string; newSpec?: string };
    foundLab?: { name: string; seedCompute: number; spec?: string; allocation?: { deployment: number; research: number; safety: number } };
    computeTargets?: { roleId: string; amount: number; direction?: "send" | "request" }[];
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
