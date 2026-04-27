/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiGenerate from "../aiGenerate.js";
import type * as aiModels from "../aiModels.js";
import type * as aiProposals from "../aiProposals.js";
import type * as computeLedger from "../computeLedger.js";
import type * as computeMutations from "../computeMutations.js";
import type * as events from "../events.js";
import type * as gameData from "../gameData.js";
import type * as gameRuntime from "../gameRuntime.js";
import type * as games from "../games.js";
import type * as labs from "../labs.js";
import type * as llm from "../llm.js";
import type * as migrations from "../migrations.js";
import type * as pipeline from "../pipeline.js";
import type * as pipelineApply from "../pipelineApply.js";
import type * as requests from "../requests.js";
import type * as rounds from "../rounds.js";
import type * as sampleActionsData from "../sampleActionsData.js";
import type * as submissions from "../submissions.js";
import type * as tables from "../tables.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiGenerate: typeof aiGenerate;
  aiModels: typeof aiModels;
  aiProposals: typeof aiProposals;
  computeLedger: typeof computeLedger;
  computeMutations: typeof computeMutations;
  events: typeof events;
  gameData: typeof gameData;
  gameRuntime: typeof gameRuntime;
  games: typeof games;
  labs: typeof labs;
  llm: typeof llm;
  migrations: typeof migrations;
  pipeline: typeof pipeline;
  pipelineApply: typeof pipelineApply;
  requests: typeof requests;
  rounds: typeof rounds;
  sampleActionsData: typeof sampleActionsData;
  submissions: typeof submissions;
  tables: typeof tables;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
