"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS, RESOLVE_MODELS } from "./aiModels";
import { AI_SYSTEMS_ROLE_ID } from "./gameData";
import {
  buildBatchedGradingPrompt,
  buildResolveNarrativePrompt,
  normaliseStructuredEffect,
  SCENARIO_CONTEXT,
  type ActionRequest,
  type BatchedGradingRole,
  type GradedActionOutput,
  type StructuredEffect,
} from "@/lib/ai-prompts";
import handoutData from "../public/role-handouts.json" with { type: "json" };
import type { RoleHandout } from "@/lib/role-handouts";
import type { LabWithCompute } from "./labs";
import { plainEventReason } from "./events";
import {
  ROLES,
  LAB_PROGRESSION,
  clampProductivity,
  getAiInfluencePower,
  autoGenerateInfluence,
  computeLabGrowth,
} from "@/lib/game-data";

/** Build role description for the grading LLM from the structured handout.
 *  Only includes role + objective — resources are dynamic and already
 *  represented by actual game state (labs, compute, allocations). */
function getRoleDescription(roleId: string, fallbackBrief: string): string {
  const handout = (handoutData as Record<string, RoleHandout>)[roleId];
  if (!handout) return fallbackBrief;
  return `${handout.role}\nObjective: ${handout.objective}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Submission = Doc<"submissions">;
type Round = Doc<"rounds">;
type Table = Doc<"tables">;


// ─── Helpers ──────────────────────────────────────────────────────────────────

async function failPipeline(ctx: ActionCtx, gameId: Id<"games">, stage: string, err: unknown) {
  const message = `${stage} failed: ${err instanceof Error ? err.message : String(err)}`;
  console.error(`[pipeline] ${message}`);
  try {
    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "error", error: message, startedAt: Date.now() },
    });
    await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
  } catch (cleanupErr) {
    console.error(`[pipeline] failPipeline cleanup also failed:`, cleanupErr);
    // Lock will auto-expire via 3-minute TTL
  }
}

function generateNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Shape the prior rounds into the prompt input. Includes both prose
 *  (outcomes/stateOfPlay/pressures) and legacy 4-domain buckets;
 *  `formatPreviousRounds` in ai-prompts.ts prefers prose when present and
 *  falls back to legacy. Consumers can pass the result to either the grading
 *  or narrate prompt without re-munging. */
function previousRoundsForPrompt(rounds: Round[], roundNumber: number) {
  return rounds
    .filter((r) => r.number < roundNumber && r.summary)
    .map((r) => ({
      number: r.number,
      label: r.label,
      summary: r.summary ? {
        outcomes: r.summary.outcomes,
        stateOfPlay: r.summary.stateOfPlay,
        pressures: r.summary.pressures,
        labs: r.summary.labs,
        geopolitics: r.summary.geopolitics,
        publicAndMedia: r.summary.publicAndMedia,
        aiSystems: r.summary.aiSystems,
      } : undefined,
    }));
}

/** Batched grading — single LLM call across all roles per round. Emits
 *  probability + reasoning + structuredEffect + confidence per action, matched
 *  back to submissions by actionId. Replaces the pre-refactor per-role loop
 *  and the separate decide-LLM pass. Apply phase consumes structuredEffect
 *  deterministically; there is no second LLM.
 *
 *  Failure mode: up to 2 retries with exponential backoff. Hard-fail on
 *  exhaustion — the pipeline surfaces "Grading failed" to the facilitator
 *  rather than silently defaulting (silent fallback would give every action
 *  narrativeOnly + a default probability, degrading game quality invisibly). */
async function gradeAllBatched(
  ctx: ActionCtx,
  opts: {
    gameId: Id<"games">;
    roundNumber: number;
    labs: LabWithCompute[];
    submissions: Submission[];
    rounds: Round[];
    requests: { fromRoleId: string; toRoleId: string; actionText: string; fromRoleName: string; toRoleName: string; requestType: string; computeAmount?: number; status: string }[];
    enabledRoleNames: string[];
    onlyUngraded: boolean;
  },
) {
  const { gameId, roundNumber, labs, submissions, rounds, requests, enabledRoleNames, onlyUngraded } = opts;

  const roleMap = new Map(ROLES.map((r) => [r.id, r]));
  const labMap = new Map(labs.filter((l) => l.roleId).map((l) => [l.roleId!, l]));
  const labByLabId = new Map(labs.map((l) => [String(l.labId), l] as const));
  const roundMap = new Map(rounds.map((r) => [r.number, r]));

  // Build one BatchedGradingRole per submission that has at least one action
  // still needing grading. Fully-graded submissions are skipped — the batched
  // prompt doesn't need to re-see them (the facilitator's manual grades stand).
  const batchedRoles: BatchedGradingRole[] = [];
  const actionIdToSubmission = new Map<string, { submissionId: Id<"submissions">; actionIndex: number }>();

  for (const sub of submissions) {
    const role = roleMap.get(sub.roleId);
    if (!role) continue;

    const actionsNeedingGrade = onlyUngraded
      ? sub.actions.map((a, i) => ({ a, i })).filter(({ a }) => a.probability == null)
      : sub.actions.map((a, i) => ({ a, i }));
    if (actionsNeedingGrade.length === 0) continue;

    const roleRequests = requests.filter((r) => r.fromRoleId === sub.roleId || r.toRoleId === sub.roleId);

    const actions = actionsNeedingGrade.map(({ a, i }) => {
      actionIdToSubmission.set(a.actionId, { submissionId: sub._id, actionIndex: i });

      let pinnedEffect: BatchedGradingRole["actions"][number]["pinnedEffect"];
      if (a.mergeLab) {
        const absorbedLab = labByLabId.get(String(a.mergeLab.absorbedLabId));
        const survivorLab = labByLabId.get(String(a.mergeLab.survivorLabId));
        if (absorbedLab && survivorLab) {
          pinnedEffect = {
            kind: "merge",
            absorbedLabName: absorbedLab.name,
            survivorLabName: survivorLab.name,
            submitterIsAbsorbed: absorbedLab.roleId === sub.roleId,
            newName: a.mergeLab.newName,
            newSpec: a.mergeLab.newSpec,
          };
        }
      } else if (a.foundLab) {
        pinnedEffect = { kind: "foundLab", name: a.foundLab.name, spec: a.foundLab.spec, seedCompute: a.foundLab.seedCompute };
      } else if (a.computeTargets && a.computeTargets.length > 0) {
        pinnedEffect = {
          kind: "computeTransfer",
          targets: a.computeTargets.map((t) => ({
            toRoleName: roleMap.get(t.roleId)?.name ?? t.roleId,
            amount: t.amount,
            direction: t.direction ?? "send",
          })),
        };
      }

      const actionRequests: ActionRequest[] = roleRequests
        .filter((r) => r.actionText === a.text)
        .map((r) => ({
          actionText: r.actionText, fromRoleName: r.fromRoleName, toRoleName: r.toRoleName,
          requestType: r.requestType, computeAmount: r.computeAmount, status: r.status,
        }));

      return {
        actionId: a.actionId,
        text: a.text,
        priority: a.priority,
        secret: a.secret,
        pinnedEffect,
        actionRequests: actionRequests.length > 0 ? actionRequests : undefined,
      };
    });

    batchedRoles.push({
      roleId: sub.roleId,
      roleName: role.name,
      roleDescription: getRoleDescription(sub.roleId, role.brief ?? ""),
      roleTags: [...role.tags],
      labSpec: labMap.get(sub.roleId)?.spec,
      actions,
    });
  }

  if (batchedRoles.length === 0) return; // Nothing to grade

  const currentRound = roundMap.get(roundNumber);
  const prevRound = roundMap.get(roundNumber - 1);

  const prompt = buildBatchedGradingPrompt({
    round: roundNumber,
    roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
    enabledRoles: enabledRoleNames,
    labs,
    roles: batchedRoles,
    previousRounds: previousRoundsForPrompt(rounds, roundNumber),
    previousTrajectories: prevRound?.labTrajectories as
      { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[] | undefined,
  });

  const totalActions = batchedRoles.reduce((sum, r) => sum + r.actions.length, 0);
  await ctx.runMutation(internal.games.updatePipelineStatus, {
    gameId,
    status: { step: "grading", detail: `Evaluating ${totalActions} action${totalActions === 1 ? "" : "s"}...`, progress: `0/${totalActions}`, startedAt: Date.now() },
  });

  // Schema for Claude tool-use. structuredEffect is a flat object with all
  // fields optional, discriminated by `type` enum — the grader's prompt names
  // which fields go with which type. Claude handles this shape reliably; a
  // strict JSON Schema oneOf would be cleaner but produces worse compliance.
  const result = await callAnthropic<{ actions: GradedActionOutput[] }>({
    models: GRADING_MODELS,
    systemPrompt: SCENARIO_CONTEXT,
    prompt,
    maxTokens: 8192,
    timeoutMs: 180_000,
    toolName: "grade_all_actions",
    schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              actionId: { type: "string", description: "The actionId from the input — match exactly" },
              probability: { type: "number", enum: [10, 30, 50, 70, 90] },
              reasoning: { type: "string", description: "1–2 sentences explaining the grade" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              structuredEffect: {
                type: "object",
                description: "Discriminated by `type`. Set only the fields relevant to the chosen type — see prompt taxonomy. Four-layer model: position (breakthrough/modelRollback/merge), stock (computeDestroyed/computeTransfer/merge), productivity (researchDisruption/researchBoost).",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "merge", "decommission",
                      "breakthrough", "modelRollback",
                      "computeDestroyed", "researchDisruption", "researchBoost",
                      "transferOwnership", "computeTransfer",
                      "foundLab", "narrativeOnly",
                    ],
                  },
                  // merge
                  survivor: { type: "string" },
                  absorbed: { type: "string" },
                  newName: { type: "string" },
                  newSpec: { type: "string" },
                  // decommission / breakthrough / modelRollback / computeDestroyed /
                  // researchDisruption / researchBoost / transferOwnership
                  labName: { type: "string" },
                  controllerRoleId: { type: "string" },
                  // foundLab
                  name: { type: "string" },
                  spec: { type: "string" },
                  seedCompute: { type: "number" },
                  // computeTransfer (fromRoleId/toRoleId/amount) + computeDestroyed (amount)
                  fromRoleId: { type: "string" },
                  toRoleId: { type: "string" },
                  amount: { type: "number", description: "For computeTransfer: positive units to move from fromRoleId → toRoleId. For computeDestroyed: positive units of compute physically destroyed (emitted as a negative ledger adjustment under the hood)." },
                },
                required: ["type"],
              },
            },
            required: ["actionId", "probability", "reasoning", "confidence", "structuredEffect"],
          },
        },
      },
      required: ["actions"],
    },
    // Built-in retry (the callAnthropic wrapper handles transient failures).
  });

  if (!result.output?.actions) throw new Error("Grading LLM returned no actions");
  const graded = result.output.actions;

  // Group returned grades by submissionId so we patch each submission once.
  const updatesBySubmission = new Map<Id<"submissions">, Map<number, GradedActionOutput>>();
  for (const g of graded) {
    const ref = actionIdToSubmission.get(g.actionId);
    if (!ref) {
      console.warn(`[pipeline] Grading returned unknown actionId: ${g.actionId}`);
      continue;
    }
    const perSub = updatesBySubmission.get(ref.submissionId) ?? new Map<number, GradedActionOutput>();
    perSub.set(ref.actionIndex, g);
    updatesBySubmission.set(ref.submissionId, perSub);
  }

  // For each submission that had any graded actions, merge grades into the
  // action array and persist. Independent writes — run in parallel so a 10-role
  // batched grade doesn't serialize 10 round trips.
  await Promise.all(submissions
    .filter((sub) => updatesBySubmission.has(sub._id))
    .map((sub) => {
      const updates = updatesBySubmission.get(sub._id)!;
      const nextActions = sub.actions.map((a, i) => {
        const g = updates.get(i);
        if (!g) return a;
        return {
          ...a,
          probability: g.probability,
          reasoning: g.reasoning,
          confidence: g.confidence,
          structuredEffect: normaliseStructuredEffect(g.structuredEffect),
        };
      });
      return ctx.runMutation(internal.submissions.applyGradingInternal, {
        submissionId: sub._id,
        actions: nextActions,
      });
    }));

  await ctx.runMutation(internal.games.updatePipelineStatus, {
    gameId,
    status: { step: "grading", detail: "Grading complete", progress: `${totalActions}/${totalActions}`, startedAt: Date.now() },
  });

  return { model: result.model, timeMs: result.timeMs, tokens: result.tokens };
}


// ─── Grade Only (no roll/narrate after) ──────────────────────────────────────

export const gradeOnly = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;

    try {
      // Both reads are independent — fetch in parallel to halve the RTT.
      const [existingSubs, allTables]: [Submission[], Table[]] = await Promise.all([
        ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
        ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
      ]);

      const submittedRoles = new Set(existingSubs.map((s) => s.roleId));
      const enabledNonHuman = allTables.filter((t) => t.enabled && t.controlMode !== "human");
      const missingTables = enabledNonHuman.filter((t) => !submittedRoles.has(t.roleId));

      if (missingTables.length > 0) {
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "generating", detail: `Generating ${missingTables.length} missing AI submissions...`, startedAt: Date.now() },
        });
        await ctx.runAction(internal.aiGenerate.generateAll, {
          gameId,
          roundNumber,
        });
      }

      // Re-fetch submissions after potential AI generation
      const submissions: Submission[] = missingTables.length > 0
        ? await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber })
        : existingSubs;

      // Are there any actions still needing a probability?
      const hasUngraded = submissions.some((s) =>
        s.actions.some((a) => a.actionStatus === "submitted" && a.probability == null)
      );
      if (!hasUngraded) {
        // Nothing to grade — done. Skip fetching game, rounds, requests.
        await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "done", detail: "All actions graded", startedAt: Date.now() },
        });
        return;
      }

      if (submissions.length === 0) throw new Error("No submissions to grade");

      // Only fetch remaining data when we actually have things to grade. All four
      // queries are independent of each other — parallelise to save ~3 RTTs.
      const [rounds, requests, tables, labs] = await Promise.all([
        ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
        ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber }),
        ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
        ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId }),
      ]);
      const enabledRoleNames = tables.filter((t) => t.enabled).map((t) => t.roleName);

      await gradeAllBatched(ctx, {
        gameId, roundNumber, labs, submissions, rounds, requests: requests ?? [],
        enabledRoleNames, onlyUngraded: true,
      });

      // Done grading — release lock, don't proceed to roll
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "done", detail: "Grading complete", startedAt: Date.now() },
      });
    } catch (err) {
      await failPipeline(ctx, gameId, "Grading", err);
    }
  },
});

// ─── Stage 3: Roll dice + narrate (merged resolve+narrate) ────────────────────


/** Phase 2-6 of docs/resolve-pipeline.md: roll → decide LLM → apply structural effects.
 *  Terminates at the P7 facilitator-review pause. The second half (R&D growth, compute
 *  acquisition, narrative) runs in continueFromEffectReview after the facilitator
 *  clicks "Continue to Narrative". */
export const rollAndApplyEffects = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    // aiDisposition arg is retained on the caller side for backward compatibility
    // (games.triggerPipeline still passes it) — ignored here since the decide LLM
    // has been replaced by deterministic apply-from-structured-effects. The
    // narrative phase re-resolves disposition from the AI Systems table.
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  // Complexity is inherent: multi-step pipeline (influence, roll, apply effects,
  // build P7 review) running as a single atomic action to the P7 pause.
  // eslint-disable-next-line complexity
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;

    try {
      // Fetch tables once for use in AI influence resolution and snapshotting
      const tablesBeforeResolve: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });

      // Resolve AI influence before dice roll.
      // - NPC/AI AI Systems: auto-generate keyword-based influence for OTHER players' actions
      // - Any AI Systems (including human-controlled): auto-boost its OWN submitted actions
      //   (it wants them to succeed) unless the player has set influence manually.
      {
        const aiSystemsTable = tablesBeforeResolve.find(
          (t) => t.roleId === AI_SYSTEMS_ROLE_ID && t.enabled && t.aiDisposition
        );
        if (aiSystemsTable) {
          // labsNow and subs are independent — parallelise.
          const [labsNow, subs]: [LabWithCompute[], Submission[]] = await Promise.all([
            ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId }),
            ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
          ]);
          if (labsNow) {
            const power = getAiInfluencePower(labsNow);
            const influences: { submissionId: Id<"submissions">; actionIndex: number; modifier: number }[] = [];

            // AI Systems' OWN actions → auto-boost if no influence set
            if (power > 0) {
              for (const sub of subs) {
                if (sub.roleId !== AI_SYSTEMS_ROLE_ID) continue;
                sub.actions.forEach((action, i) => {
                  if (action.aiInfluence == null) {
                    influences.push({ submissionId: sub._id, actionIndex: i, modifier: power });
                  }
                });
              }
            }

            // Other players' actions → keyword-driven auto-influence for NPC/AI controllers
            if (aiSystemsTable.controlMode !== "human") {
              const actionsToInfluence = subs.flatMap((sub) =>
                sub.actions
                  .map((a, i) => ({ submissionId: sub._id as string, actionIndex: i, text: a.text, roleId: sub.roleId, aiInfluence: a.aiInfluence }))
                  .filter((item) => item.aiInfluence == null && item.roleId !== AI_SYSTEMS_ROLE_ID)
              );
              if (actionsToInfluence.length > 0) {
                const keyword = autoGenerateInfluence(aiSystemsTable.aiDisposition!, actionsToInfluence, power);
                for (const inf of keyword) {
                  influences.push({ submissionId: inf.submissionId as Id<"submissions">, actionIndex: inf.actionIndex, modifier: inf.modifier });
                }
              }
            }

            if (influences.length > 0) {
              await ctx.runMutation(internal.submissions.applyAiInfluenceInternal, {
                gameId,
                roundNumber,
                influences,
              });
            }
          }
        }
      }

      // Roll dice (idempotent — skips already-rolled)
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "rolling", detail: "Rolling dice...", startedAt: Date.now() },
      });
      await ctx.runMutation(internal.submissions.rollAllInternal, { gameId, roundNumber });

      // Generate nonce + snapshot before
      const nonce = generateNonce();
      await Promise.all([
        ctx.runMutation(internal.rounds.setResolveNonce, { gameId, roundNumber, nonce }),
        ctx.runMutation(internal.games.setResolveNonce, { gameId, nonce }),
      ]);

      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");

      await ctx.runMutation(internal.rounds.snapshotBeforeInternal, {
        gameId,
        roundNumber,
      });

      // ═══ APPLY PHASE ═══
      // Read each successful action's structuredEffect (populated at grade time
      // by the batched grading LLM, optionally overridden by the facilitator at
      // P2). Dispatch deterministically — no LLM at this stage. Player-pinned
      // effects (mergeLab, foundLab, computeTargets) already settled inside
      // rollAllImpl; they're skipped here and surface in P7 via the event log.
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "resolving", detail: "Applying effects...", startedAt: Date.now() },
      });

      const [submissions, rounds]: [Submission[], Round[]] = await Promise.all([
        ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
        ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
      ]);
      const currentRound = rounds.find((r) => r.number === roundNumber);

      // Nonce check before applying anything — another run may have superseded us.
      const gameAfterRoll = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (gameAfterRoll?.resolveNonce !== nonce) {
        console.warn("[pipeline] Nonce mismatch — another run won. Aborting.");
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "error", error: "Resolution superseded by another action — use Re-resolve", startedAt: Date.now() },
        });
        await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
        return;
      }

      // ═══ MECHANICAL APPLY — deterministic state mutation ═══
      // Idempotent regenerate: wipe this round's regenerable rows (acquired/adjusted/merged)
      // so table.computeStock returns to the pre-growth baseline before we run lab math.
      // Transferred + facilitator + starting rows are preserved.
      await ctx.runMutation(internal.computeLedger.clearRegenerableRowsInternal, { gameId, roundNumber });

      // Also reset lab structural state to the pre-round snapshot so a re-resolve
      // doesn't carry forward earlier effects (breakthrough/modelRollback/merge/
      // decommission) applied during a previous run of this same round. Passes
      // the full structural state so merges/decommissions can be re-applied
      // idempotently from the cleared-ledger baseline.
      const labsBefore = currentRound?.labsBefore;
      if (labsBefore && labsBefore.length > 0) {
        await ctx.runMutation(internal.labs.resetLabsToSnapshotInternal, {
          gameId,
          snapshot: labsBefore.map((s) => ({
            labId: s.labId,
            name: s.name,
            spec: s.spec,
            roleId: s.roleId,
            rdMultiplier: s.rdMultiplier,
            allocation: s.allocation,
            status: s.status,
            mergedIntoLabId: s.mergedIntoLabId,
          })),
        });
      }

      // Re-read tables/labs after the clear so cache reflects pre-growth state.
      const [tablesAfterClear, labsAfterClear]: [Table[], LabWithCompute[]] = await Promise.all([
        ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
        ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId }),
      ]);
      const tableComputeByRole = new Map(
        tablesAfterClear.filter((t) => t.computeStock != null).map((t) => [t.roleId, t.computeStock!] as const),
      );
      const maxMult = LAB_PROGRESSION.maxMultiplier(roundNumber);

      // Work in memory: `workingLabs` is the in-memory view of active labs being transformed.
      // Each entry tracks its labId so we can emit precise patches at the end.
      type WorkingLab = LabWithCompute & { labId: Id<"labs"> };
      let workingLabs: WorkingLab[] = labsAfterClear.map((l) => ({ ...l, labId: l.labId }));

      // Parsed operations for the apply mutation
      const mergeOps: { survivorLabId: Id<"labs">; absorbedLabId: Id<"labs">; newName?: string; newSpec?: string; reason: string }[] = [];
      const decommissionOps: { labId: Id<"labs"> }[] = [];
      const transferOps: { labId: Id<"labs">; newOwnerRoleId: string | undefined }[] = [];
      // computeDestructions carries destruction-only deltas (amount > 0 on the effect,
      // stored as a negative change for the ledger). No positive entries ever originate
      // here — compute is conserved; see the conservation principle in ai-prompts.ts.
      const computeDestructions: { labId: Id<"labs">; change: number; reason: string }[] = [];
      const computeTransferPairs: { fromRoleId: string; toRoleId: string; amount: number; reason: string }[] = [];
      // multiplierUpdates holds final rdMultiplier values derived from breakthrough /
      // modelRollback effects. Growth in phase 9 starts from these post-effect values
      // — there is NO post-growth re-apply.
      const multiplierUpdates: { labId: Id<"labs">; newMultiplier: number }[] = [];
      // One-round productivity modifiers from researchDisruption / researchBoost.
      // Stashed on round.pendingProductivityMods; consumed by phase 9 growth.
      const productivityMods: { labId: Id<"labs">; modifier: number }[] = [];
      // Phase-5 mechanics audit log. Every mutation of rdMultiplier / computeStock /
      // productivity appends an entry — the facilitator reads these at P7 to trace
      // why a number moved the way it did. Phase 9/10 entries are appended later in
      // continueFromEffectReview.
      type Phase5LogEntry = { sequence: number; phase: 5; source: "grader-effect"; subject: string; field: "rdMultiplier" | "computeStock" | "productivity"; before: number; after: number; reason: string };
      const mechanicsLogPhase5: Phase5LogEntry[] = [];
      const logEntry = (subject: string, field: Phase5LogEntry["field"], before: number, after: number, reason: string) => {
        mechanicsLogPhase5.push({ sequence: mechanicsLogPhase5.length, phase: 5, source: "grader-effect", subject, field, before, after, reason });
      };
      // Structured rejection tracking: each rejection carries a category so the P7
      // panel can group + style by severity. Categories:
      //   invalid_reference    — effect targets a lab / roleId that doesn't exist or
      //                          isn't in the required state (most common).
      //   precondition_failure — effect violates a rule (last-active-lab guard,
      //                          self-merge, unowned lab op, conservation violation).
      const rejectedOps: { category: "invalid_reference" | "precondition_failure"; opType: string; message: string }[] = [];

      const findActiveByName = (name: string) => workingLabs.find((l) => l.name === name);
      const activeRoleIds = new Set(tablesAfterClear.filter((t) => t.enabled).map((t) => t.roleId));
      const roleNameMap = new Map<string, string>(ROLES.map((r) => [r.id, r.name]));

      // Collect per-action effects to apply. Skip failed actions; skip actions
      // with player-pinned effects (mergeLab / foundLab / computeTargets) — those
      // settled inside rollAllImpl and surface in P7 via the event log; skip
      // narrativeOnly and foundLab at the grader-effect layer (foundLab is
      // player-pinned only).
      type ApplyableEffect = Exclude<StructuredEffect, { type: "narrativeOnly" } | { type: "foundLab" }>;
      type ResolvedEffect = {
        actorRoleId: string;
        actorRoleName: string;
        actionText: string;
        effect: ApplyableEffect;
      };
      const effectsToApply: ResolvedEffect[] = [];
      for (const sub of submissions) {
        const actorRoleName = roleNameMap.get(sub.roleId) ?? sub.roleId;
        for (const action of sub.actions) {
          if (!action.success) continue;
          if (action.mergeLab || action.foundLab || (action.computeTargets && action.computeTargets.length > 0)) continue;
          const e = action.structuredEffect;
          if (!e || e.type === "narrativeOnly" || e.type === "foundLab") continue;
          effectsToApply.push({ actorRoleId: sub.roleId, actorRoleName, actionText: action.text, effect: e });
        }
      }

      const effectReason = (r: ResolvedEffect): string => `${r.actorRoleName}: ${r.actionText}`.slice(0, 200);

      /** Random factor in [min, max], rounded to 2dp for readable mechanicsLog reasons. */
      const factor = (min: number, max: number): number => Math.round((min + Math.random() * (max - min)) * 100) / 100;

      /** Position-layer bump — used by breakthrough (ceil maxMult) and modelRollback (floor 1).
       *  Reject if target isn't an active lab; otherwise pick a random factor, apply the clamp,
       *  stash the post-effect multiplier, mutate workingLabs in place, and log the change. */
      const applyMultiplierBump = (
        e: { type: "breakthrough" | "modelRollback"; labName: string },
        range: { min: number; max: number },
        clamp: { fn: (next: number) => number; label: string },
      ) => {
        const target = findActiveByName(e.labName);
        if (!target) {
          rejectedOps.push({ category: "invalid_reference", opType: e.type, message: `${e.type}: "${e.labName}" is not an active lab` });
          return;
        }
        const f = factor(range.min, range.max);
        const current = target.rdMultiplier;
        const next = clamp.fn(current * f);
        multiplierUpdates.push({ labId: target.labId, newMultiplier: next });
        workingLabs = workingLabs.map((l) => l.labId === target.labId ? { ...l, rdMultiplier: next } : l);
        logEntry(target.name, "rdMultiplier", current, next, `${e.type} ×${f} (${clamp.label})`);
      };

      /** Productivity-layer mod — used by researchDisruption and researchBoost. Composes
       *  multiplicatively with any existing mod this round (one round only; cleared by
       *  continueFromEffectReview after consumption). */
      const applyProductivityMod = (
        e: { type: "researchDisruption" | "researchBoost"; labName: string },
        range: { min: number; max: number },
      ) => {
        const target = findActiveByName(e.labName);
        if (!target) {
          rejectedOps.push({ category: "invalid_reference", opType: e.type, message: `${e.type}: "${e.labName}" is not an active lab` });
          return;
        }
        const f = factor(range.min, range.max);
        const existing = productivityMods.find((p) => p.labId === target.labId);
        const before = existing?.modifier ?? 1;
        // Compose multiplicatively with any existing productivity mod this
        // round, then clamp so repeated emissions can't nuke or rocket a lab.
        // Symmetric with the rdMultiplier clamps on breakthrough (ceil
        // maxMult) and modelRollback (floor 1).
        const after = clampProductivity(before * f);
        if (existing) existing.modifier = after;
        else productivityMods.push({ labId: target.labId, modifier: after });
        logEntry(target.name, "productivity", before, after, `${e.type} ×${f} (one round, clamped [${LAB_PROGRESSION.PRODUCTIVITY_MIN}, ${LAB_PROGRESSION.PRODUCTIVITY_MAX}])`);
      };

      for (const resolved of effectsToApply) {
        const e = resolved.effect;
        const reason = effectReason(resolved);
        switch (e.type) {
          case "merge": {
            const survivor = findActiveByName(e.survivor);
            const absorbed = findActiveByName(e.absorbed);
            if (!survivor || !absorbed) {
              rejectedOps.push({ category: "invalid_reference", opType: "merge", message: `merge: one of "${e.survivor}" / "${e.absorbed}" is not an active lab` });
              break;
            }
            if (survivor.labId === absorbed.labId) {
              rejectedOps.push({ category: "precondition_failure", opType: "merge", message: `merge: cannot merge "${e.survivor}" with itself` });
              break;
            }
            mergeOps.push({
              survivorLabId: survivor.labId,
              absorbedLabId: absorbed.labId,
              newName: e.newName,
              newSpec: e.newSpec,
              reason,
            });
            // Update working view: remove absorbed, patch survivor
            const newMult = Math.max(survivor.rdMultiplier, absorbed.rdMultiplier);
            if (newMult !== survivor.rdMultiplier) {
              logEntry(survivor.name, "rdMultiplier", survivor.rdMultiplier, newMult, `merge absorbed ${absorbed.name} (inherited higher multiplier)`);
            }
            workingLabs = workingLabs
              .filter((l) => l.labId !== absorbed.labId)
              .map((l) => l.labId === survivor.labId
                ? { ...l, name: e.newName ?? l.name, spec: e.newSpec ?? l.spec, rdMultiplier: newMult }
                : l);
            break;
          }
          case "decommission": {
            const target = findActiveByName(e.labName);
            if (!target) { rejectedOps.push({ category: "invalid_reference", opType: "decommission", message: `decommission: "${e.labName}" is not an active lab` }); break; }
            if (workingLabs.length <= 1) { rejectedOps.push({ category: "precondition_failure", opType: "decommission", message: `decommission: cannot decommission the last active lab` }); break; }
            decommissionOps.push({ labId: target.labId });
            workingLabs = workingLabs.filter((l) => l.labId !== target.labId);
            break;
          }
          case "breakthrough":
            applyMultiplierBump(e, { min: 1.4, max: 1.6 }, { fn: (n) => Math.min(maxMult, n), label: `ceil maxMult ${maxMult}` });
            break;
          case "modelRollback":
            applyMultiplierBump(e, { min: 0.4, max: 0.6 }, { fn: (n) => Math.max(1, n), label: "floor 1" });
            break;
          case "computeDestroyed": {
            const target = findActiveByName(e.labName);
            if (!target) { rejectedOps.push({ category: "invalid_reference", opType: "computeDestroyed", message: `computeDestroyed: "${e.labName}" is not an active lab` }); break; }
            if (!target.roleId) { rejectedOps.push({ category: "precondition_failure", opType: "computeDestroyed", message: `computeDestroyed: "${e.labName}" is unowned — no compute pool to destroy` }); break; }
            if (e.amount <= 0) {
              rejectedOps.push({ category: "precondition_failure", opType: "computeDestroyed", message: `computeDestroyed: amount must be positive (got ${e.amount}). Compute is conserved — use computeTransfer to redistribute.` });
              break;
            }
            const available = tableComputeByRole.get(target.roleId) ?? 0;
            if (available <= 0) {
              rejectedOps.push({ category: "precondition_failure", opType: "computeDestroyed", message: `computeDestroyed: "${e.labName}" has no compute to destroy` });
              break;
            }
            const destroyed = Math.min(e.amount, 50, available);
            computeDestructions.push({ labId: target.labId, change: -destroyed, reason });
            tableComputeByRole.set(target.roleId, available - destroyed);
            workingLabs = workingLabs.map((l) => l.labId === target.labId
              ? { ...l, computeStock: Math.max(0, l.computeStock - destroyed) }
              : l);
            logEntry(target.name, "computeStock", available, available - destroyed, `computeDestroyed ${destroyed}u (requested ${e.amount}u, capped)`);
            break;
          }
          case "researchDisruption":
            applyProductivityMod(e, { min: 0.5, max: 0.8 });
            break;
          case "researchBoost":
            applyProductivityMod(e, { min: 1.2, max: 1.5 });
            break;
          case "transferOwnership": {
            const target = findActiveByName(e.labName);
            if (!target) { rejectedOps.push({ category: "invalid_reference", opType: "transferOwnership", message: `transferOwnership: "${e.labName}" is not an active lab` }); break; }
            if (!e.controllerRoleId) {
              rejectedOps.push({ category: "precondition_failure", opType: "transferOwnership", message: `transferOwnership: cannot unown "${e.labName}" — use decommission to end a lab's existence` });
              break;
            }
            if (!activeRoleIds.has(e.controllerRoleId)) {
              rejectedOps.push({ category: "invalid_reference", opType: "transferOwnership", message: `transferOwnership: "${e.controllerRoleId}" is not an active role id` });
              break;
            }
            transferOps.push({ labId: target.labId, newOwnerRoleId: e.controllerRoleId });
            workingLabs = workingLabs.map((l) => l.labId === target.labId ? { ...l, roleId: e.controllerRoleId } : l);
            break;
          }
          case "computeTransfer": {
            if (!activeRoleIds.has(e.fromRoleId)) {
              rejectedOps.push({ category: "invalid_reference", opType: "computeTransfer", message: `computeTransfer: sender "${e.fromRoleId}" is not an active role id` });
              break;
            }
            if (!activeRoleIds.has(e.toRoleId)) {
              rejectedOps.push({ category: "invalid_reference", opType: "computeTransfer", message: `computeTransfer: recipient "${e.toRoleId}" is not an active role id` });
              break;
            }
            if (e.fromRoleId === e.toRoleId) {
              rejectedOps.push({ category: "precondition_failure", opType: "computeTransfer", message: `computeTransfer: from and to are the same role` });
              break;
            }
            if (e.amount <= 0) {
              rejectedOps.push({ category: "precondition_failure", opType: "computeTransfer", message: `computeTransfer: amount must be positive (got ${e.amount})` });
              break;
            }
            const senderStock = tableComputeByRole.get(e.fromRoleId) ?? 0;
            if (senderStock < e.amount) {
              rejectedOps.push({ category: "precondition_failure", opType: "computeTransfer", message: `computeTransfer: "${e.fromRoleId}" has ${senderStock}u, cannot transfer ${e.amount}u` });
              break;
            }
            computeTransferPairs.push({ fromRoleId: e.fromRoleId, toRoleId: e.toRoleId, amount: e.amount, reason });
            // Track in working compute map so later same-round transfers from
            // the same sender see the reduced balance.
            tableComputeByRole.set(e.fromRoleId, senderStock - e.amount);
            tableComputeByRole.set(e.toRoleId, (tableComputeByRole.get(e.toRoleId) ?? 0) + e.amount);
            break;
          }
        }
      }
      if (rejectedOps.length > 0) {
        console.warn(`[pipeline] Rejected effects: ${rejectedOps.map((r) => `[${r.category}] ${r.message}`).join("; ")}`);
      }

      // ═══ PHASE 5 APPLY — structural effects only ═══
      // R&D growth (phase 9) and compute acquisition (phase 10) run AFTER the P7
      // facilitator pause in continueFromEffectReview. That keeps the mechanical
      // consequences of actions reviewable before the deterministic growth lands,
      // and matches docs/resolve-pipeline.md.

      // O(1) labId lookup maps for the ledger builds below.
      const workingLabsById = new Map(workingLabs.map((l) => [l.labId, l] as const));
      const labsAfterClearById = new Map(labsAfterClear.map((l) => [l.labId, l] as const));

      // Adjusted compute ledger entries from computeDestroyed effects.
      const adjustedEntries = computeDestructions
        .map((m) => {
          const lab = workingLabsById.get(m.labId);
          if (!lab?.roleId) return null;
          return { roleId: lab.roleId, amount: m.change, reason: m.reason };
        })
        .filter((x): x is { roleId: string; amount: number; reason: string } => x !== null && x.amount !== 0);

      // Merged-pair ledger: absorbed owner's stock moves to survivor owner
      // (from grader-emitted merge effects — not player-pinned mergers, which
      // settle in rollAllImpl with their own ledger rows).
      const mergedEntries: { fromRoleId: string; toRoleId: string; amount: number; reason: string }[] = [];
      for (const m of mergeOps) {
        const absorbed = labsAfterClearById.get(m.absorbedLabId);
        const survivor = labsAfterClearById.get(m.survivorLabId);
        if (!absorbed?.roleId || !survivor?.roleId) continue;
        const absorbedStock = tableComputeByRole.get(absorbed.roleId) ?? 0;
        if (absorbedStock > 0) {
          mergedEntries.push({
            fromRoleId: absorbed.roleId,
            toRoleId: survivor.roleId,
            amount: absorbedStock,
            reason: m.reason,
          });
        }
      }

      // Narrative compute transfers: grader-emitted computeTransfer effects also
      // go through the merged-pair ledger — the mechanics are identical (compute
      // moves between two role pools as a matched pair, regenerable on re-resolve)
      // even though the label is structurally "merger". Reason text distinguishes
      // them in the ledger UI.
      for (const t of computeTransferPairs) {
        mergedEntries.push({
          fromRoleId: t.fromRoleId,
          toRoleId: t.toRoleId,
          amount: t.amount,
          reason: t.reason,
        });
      }

      // Apply structural ops + breakthrough/rollback multiplier updates + adjusted
      // (including computeDestroyed deletions) + merged + productivity mods + mechanics log.
      await ctx.runMutation(internal.pipelineApply.applyDecidedEffectsInternal, {
        gameId,
        roundNumber,
        nonce,
        mergeOps,
        decommissionOps,
        transferOps,
        multiplierUpdates: multiplierUpdates.map((ov) => ({ labId: ov.labId, rdMultiplier: ov.newMultiplier })),
        adjusted: adjustedEntries,
        merged: mergedEntries,
        productivityMods,
        mechanicsLog: mechanicsLogPhase5,
      });

      // Build the P7 appliedOps list — what the facilitator sees on the review screen.
      // Sources:
      //   (a) Grader-emitted effects that just landed via applyDecidedEffectsInternal
      //   (b) Player-originated ops settled in rollAllImpl (pinned mergers + lab
      //       foundings) — pulled from the event log since game.resolvingStartedAt
      //   (c) Rejected effects (validator failures — facilitator can edit at P2 for
      //       next resolve)
      // Name lookup must include decommissioned labs — the absorbed lab of a player-
      // originated merger is already `status: "decommissioned"` by the time we build
      // this summary (rollAllImpl settled the merge before the apply phase).
      const allLabsForNames = await ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId, includeInactive: true });
      const labNameById = new Map(allLabsForNames.map((l) => [l.labId, l.name] as const));
      const appliedOps: { type: string; status: "applied" | "rejected"; summary: string; reason?: string; category?: string; opType?: string }[] = [];

      // (b) Player-originated structural ops. rollAllImpl settles player mergers and
      // lab foundings directly and emits events.
      const sinceMs = game.resolvingStartedAt ?? 0;
      if (sinceMs > 0) {
        const playerEvents = await ctx.runQuery(internal.events.getSinceForRound, {
          gameId,
          sinceTimestamp: sinceMs,
          types: ["lab_merged", "lab_merge_failed", "lab_founded", "lab_founding_failed"],
        });
        for (const evt of playerEvents) {
          const data: Record<string, unknown> = evt.data ? (() => { try { return JSON.parse(evt.data) as Record<string, unknown>; } catch { return {}; } })() : {};
          const actorName = evt.roleId ? roleNameMap.get(evt.roleId) ?? evt.roleId : "a player";
          if (evt.type === "lab_merged") {
            const survivorName = typeof data.survivorLabId === "string" ? labNameById.get(data.survivorLabId as Id<"labs">) ?? "?" : "?";
            const absorbedName = typeof data.absorbedLabId === "string" ? labNameById.get(data.absorbedLabId as Id<"labs">) ?? "?" : "?";
            appliedOps.push({
              type: "merge",
              status: "applied",
              summary: `${actorName} merged ${absorbedName} into ${survivorName}`,
              reason: typeof data.amountMoved === "number" ? `${data.amountMoved}u compute transferred` : undefined,
            });
          } else if (evt.type === "lab_merge_failed") {
            const reason = typeof data.reason === "string" ? data.reason : "unknown";
            // Dice-roll failures (rolled_failure) are already visible in Section 1's Succeeded/Failed split.
            // Only surface precondition failures (e.g. lab_already_decommissioned) in the P7 review.
            if (reason === "rolled_failure") {
              continue;
            }
            const survivorName = typeof data.survivorLabId === "string" ? labNameById.get(data.survivorLabId as Id<"labs">) ?? "?" : "?";
            const absorbedName = typeof data.absorbedLabId === "string" ? labNameById.get(data.absorbedLabId as Id<"labs">) ?? "?" : "?";
            appliedOps.push({
              type: "rejected",
              status: "rejected",
              summary: `${actorName} tried to merge ${absorbedName} into ${survivorName} — ${plainEventReason(reason)}`,
              category: "precondition_failure",
              opType: "merge",
            });
          } else if (evt.type === "lab_founded") {
            const labName = typeof data.labName === "string" ? data.labName : "?";
            const seed = typeof data.seedCompute === "number" ? data.seedCompute : "?";
            appliedOps.push({
              type: "foundLab",
              status: "applied",
              summary: `${actorName} founded ${labName} with ${seed}u seed compute`,
            });
          } else if (evt.type === "lab_founding_failed") {
            // Founding failures without a reason field are all dice-roll failures and are
            // already visible in Section 1's Succeeded/Failed split. Precondition failures
            // (name collision, escrow) are caught and refunded in submissions.ts before
            // emitting this event, so we don't see them here.
            continue;
          }
        }
      }

      // (a) Grader-emitted effects that just landed. Reason carries the action text
      // so the facilitator can trace each op back to its originating action.
      for (const m of mergeOps) {
        const s = labNameById.get(m.survivorLabId) ?? "?";
        const a = labNameById.get(m.absorbedLabId) ?? "?";
        const rename = m.newName && m.newName !== s ? ` → renamed ${m.newName}` : "";
        appliedOps.push({ type: "merge", status: "applied", summary: `${a} merged into ${s}${rename}`, reason: m.reason });
      }
      for (const d of decommissionOps) {
        appliedOps.push({ type: "decommission", status: "applied", summary: `${labNameById.get(d.labId) ?? "?"} decommissioned` });
      }
      for (const t of transferOps) {
        const name = labNameById.get(t.labId) ?? "?";
        const newOwner = t.newOwnerRoleId ? roleNameMap.get(t.newOwnerRoleId) ?? t.newOwnerRoleId : "(unowned)";
        appliedOps.push({ type: "transferOwnership", status: "applied", summary: `${name} ownership → ${newOwner}` });
      }
      for (const ov of multiplierUpdates) {
        const name = labNameById.get(ov.labId) ?? "?";
        appliedOps.push({ type: "multiplierUpdate", status: "applied", summary: `${name} R&D multiplier → ${ov.newMultiplier.toFixed(2)}×` });
      }
      for (const p of productivityMods) {
        const name = labNameById.get(p.labId) ?? "?";
        appliedOps.push({ type: "productivityMod", status: "applied", summary: `${name} productivity ×${p.modifier.toFixed(2)} (this round only)` });
      }
      for (const m of computeDestructions) {
        const name = labNameById.get(m.labId) ?? "?";
        // Entries are all negative (destruction); the sign is implicit in the number.
        appliedOps.push({ type: "computeDestroyed", status: "applied", summary: `${name} compute ${m.change}u`, reason: m.reason });
      }
      for (const t of computeTransferPairs) {
        const from = roleNameMap.get(t.fromRoleId) ?? t.fromRoleId;
        const to = roleNameMap.get(t.toRoleId) ?? t.toRoleId;
        appliedOps.push({ type: "computeTransfer", status: "applied", summary: `${from} → ${to}: ${t.amount}u`, reason: t.reason });
      }
      // (c) Rejected grader effects — carry the category + opType so the UI can group by severity.
      for (const rej of rejectedOps) {
        appliedOps.push({
          type: "rejected",
          status: "rejected",
          summary: rej.message,
          category: rej.category,
          opType: rej.opType,
        });
      }

      // P7 — stash appliedOps for the review panel and transition to effect-review.
      // Independent patches on different docs, so run in parallel. Phase-9 growth
      // will consume the productivity mods stashed earlier by applyDecidedEffectsInternal.
      await Promise.all([
        ctx.runMutation(internal.rounds.setAppliedOpsInternal, { gameId, roundNumber, appliedOps }),
        ctx.runMutation(internal.games.setPhaseEffectReviewInternal, { gameId }),
      ]);
    } catch (err) {
      await failPipeline(ctx, gameId, "Resolve", err);
    }
  },
});

/** Phase 8-11 of docs/resolve-pipeline.md: R&D growth → new compute acquired →
 *  narrate. Triggered by the facilitator clicking "Continue to Narrative" on the
 *  P7 effect-review screen (via triggerContinueFromEffectReview in games.ts). */
export const continueFromEffectReview = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
  },
  // eslint-disable-next-line complexity
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;
    try {
      const [game, submissions, rounds, tables, labsNow]: [Doc<"games"> | null, Submission[], Round[], Table[], LabWithCompute[]] = await Promise.all([
        ctx.runQuery(internal.games.getInternal, { gameId }),
        ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
        ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
        ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
        ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId }),
      ]);
      if (!game) throw new Error("Game not found");
      const currentRound = rounds.find((r) => r.number === roundNumber);
      if (!currentRound) throw new Error("Round not found");
      const nonce = game.resolveNonce;
      if (!nonce) throw new Error("No resolve nonce — continueFromEffectReview requires a live nonce from rollAndApplyEffects");

      // Re-resolve aiDisposition from the AI Systems table (same logic as roll phase)
      let aiDisposition: { label: string; description: string } | undefined;
      const aiTable = tables.find((t) => t.roleId === AI_SYSTEMS_ROLE_ID && t.aiDisposition);
      if (aiTable?.aiDisposition) {
        const { getDisposition } = await import("@/lib/game-data");
        const disp = getDisposition(aiTable.aiDisposition);
        if (disp) aiDisposition = { label: disp.label, description: disp.description };
      }

      const maxMult = LAB_PROGRESSION.maxMultiplier(roundNumber);

      // Idempotency guard. If the previous run of continueFromEffectReview
      // landed phase-9+10 apply but then failed (e.g. crashed during the
      // narrate LLM call, or snapshotAfter write errored), phase stays
      // "effect-review" and the facilitator may retry. Re-running the phase-9
      // growth would compound on top of the already-grown multipliers and
      // silently skip productivity mods (which were cleared on first run).
      // Detect the prior run via any phase-9 entry in mechanicsLog and skip
      // straight to narrate.
      const phase9AlreadyApplied = (currentRound.mechanicsLog ?? []).some((e) => e.phase === 9);

      if (!phase9AlreadyApplied) {
        const tableComputeByRole = new Map(
          tables.filter((t) => t.computeStock != null).map((t) => [t.roleId, t.computeStock!] as const),
        );

        // ═══ PHASE 9 — R&D GROWTH ═══
        // Start mechanicsLog for phases 9 + 10 at the phase-5 offset.
        const phase5LogLen = currentRound.mechanicsLog?.length ?? 0;
        type MechLog = { sequence: number; phase: 5 | 9 | 10; source: "player-pinned" | "grader-effect" | "natural-growth" | "acquisition" | "facilitator-edit"; subject: string; field: "rdMultiplier" | "computeStock" | "productivity"; before: number; after: number; reason: string };
        const mechLog: MechLog[] = [];
        const pushLog = (entry: Omit<MechLog, "sequence">) => {
          mechLog.push({ sequence: phase5LogLen + mechLog.length, ...entry });
        };

        // O(1) lookup maps — all sites below previously scanned labsNow linearly.
        const labsByRoleId = new Map(labsNow.map((l) => [l.roleId, l] as const));
        const labsByLabId = new Map(labsNow.map((l) => [l.labId, l] as const));

        const ceoAllocations = new Map<string, { deployment: number; research: number; safety: number }>();
        for (const sub of submissions) {
          if (!sub.computeAllocation) continue;
          const lab = labsByRoleId.get(sub.roleId);
          if (lab) ceoAllocations.set(lab.name, sub.computeAllocation);
        }
        // One-round productivity modifiers from researchDisruption / researchBoost
        // stashed by applyDecidedEffectsInternal. Cleared in applyGrowthAndAcquisitionInternal
        // so they don't persist into next round.
        const productivityModsByLab = new Map<string, number>();
        if (currentRound.pendingProductivityMods) {
          for (const mod of currentRound.pendingProductivityMods) {
            const lab = labsByLabId.get(mod.labId);
            if (lab) {
              productivityModsByLab.set(lab.name, mod.modifier);
              pushLog({ phase: 9, source: "grader-effect", subject: lab.name, field: "productivity", before: 1, after: mod.modifier, reason: `productivity mod applied to R${roundNumber} growth` });
            }
          }
        }
        const grownLabs = computeLabGrowth(labsNow, ceoAllocations, roundNumber, maxMult, productivityModsByLab);
        const multiplierUpdates: { labId: Id<"labs">; rdMultiplier: number }[] = [];
        for (const lab of grownLabs) {
          const pre = labsByLabId.get(lab.labId);
          if (!pre) continue;
          if (lab.rdMultiplier !== pre.rdMultiplier) {
            multiplierUpdates.push({ labId: pre.labId, rdMultiplier: lab.rdMultiplier });
            pushLog({ phase: 9, source: "natural-growth", subject: lab.name, field: "rdMultiplier", before: pre.rdMultiplier, after: lab.rdMultiplier, reason: `R${roundNumber} natural growth` });
          }
        }

        // ═══ PHASE 10 — NEW COMPUTE ACQUIRED ═══
        const acquiredEntries: { roleId: string; amount: number }[] = [];
        for (const lab of grownLabs) {
          if (!lab.roleId) continue;
          const pre = labsByLabId.get(lab.labId);
          if (!pre) continue;
          const preStock = pre.roleId ? tableComputeByRole.get(pre.roleId) ?? 0 : 0;
          const acquired = lab.computeStock - preStock;
          if (acquired > 0) acquiredEntries.push({ roleId: lab.roleId, amount: acquired });
        }
        const activeOwnerRoleIds = new Set(grownLabs.map((l) => l.roleId).filter((r): r is string => !!r));
        const enabledRoleIds = new Set(tables.filter((t) => t.enabled).map((t) => t.roleId));
        const { calculatePoolNewCompute, NEW_COMPUTE_PER_GAME_ROUND } = await import("./gameData");
        for (const t of tables) {
          if (!t.enabled || activeOwnerRoleIds.has(t.roleId)) continue;
          const overridePct = game.computeShareOverrides?.[t.roleId];
          let produced: number;
          if (overridePct != null) {
            const baseTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;
            produced = Math.round(baseTotal * overridePct / 100);
          } else {
            produced = calculatePoolNewCompute(t.roleId, roundNumber, enabledRoleIds);
          }
          if (produced !== 0) acquiredEntries.push({ roleId: t.roleId, amount: produced });
        }

        // Phase 10 mechanicsLog — acquisition deltas per role. The before/after value
        // is the role's stock pre- and post-acquisition (for a lab owner, the lab's
        // growth stock IS the acquisition; for non-lab roles, it's pool share).
        for (const entry of acquiredEntries) {
          const pre = tableComputeByRole.get(entry.roleId) ?? 0;
          pushLog({ phase: 10, source: "acquisition", subject: entry.roleId, field: "computeStock", before: pre, after: pre + entry.amount, reason: `R${roundNumber + 1} acquisition +${entry.amount}u` });
        }

        await ctx.runMutation(internal.pipelineApply.applyGrowthAndAcquisitionInternal, {
          gameId,
          roundNumber,
          nonce,
          multiplierUpdates,
          acquired: acquiredEntries,
          mechanicsLog: mechLog,
        });
      }

      // Snapshot labs-after (narrator's frozen ground truth) + update pipeline
      // status for the UI — independent writes, run in parallel. Both are
      // idempotent: snapshotAfter overwrites labsAfter from fresh lab state;
      // updatePipelineStatus is a single patch.
      await Promise.all([
        ctx.runMutation(internal.rounds.snapshotAfterInternal, { gameId, roundNumber }),
        ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "narrating", detail: "Writing the story...", startedAt: Date.now() },
        }),
      ]);

      const labsAfterApply: LabWithCompute[] = await ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId });

      // Reconstitute labsBefore from the round snapshot (written during rollAndApplyEffects).
      // The snapshot validator has extra bookkeeping fields (mergedIntoLabId, createdRound)
      // that aren't on LabWithCompute — stripped here since the narrative prompt doesn't
      // read them.
      const labsBeforeSnapshot = currentRound.labsBefore ?? [];
      const labsBefore: LabWithCompute[] = labsBeforeSnapshot.map((s) => ({
        labId: s.labId,
        name: s.name,
        roleId: s.roleId,
        computeStock: s.computeStock,
        rdMultiplier: s.rdMultiplier,
        allocation: s.allocation,
        spec: s.spec,
        colour: s.colour,
        status: s.status,
        jurisdiction: s.jurisdiction,
      }));

      const resolvedActions = submissions.flatMap((sub) => {
        const role = ROLES.find((r) => r.id === sub.roleId);
        return sub.actions
          .filter((a) => a.rolled != null)
          .map((a) => ({
            roleName: role?.name ?? sub.roleId,
            text: a.text,
            priority: a.priority,
            probability: a.probability ?? 50,
            rolled: a.rolled!,
            success: a.success ?? false,
            secret: a.secret,
          }));
      });

      const prevRound = rounds.find((r) => r.number === roundNumber - 1);
      const previousTrajectories = prevRound?.labTrajectories as
        { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[] | undefined;

      const interRoundChanges: string[] = [];
      if (prevRound?.labsAfter) {
        const prevByName = new Map(prevRound.labsAfter.map((l) => [l.name, l] as const));
        const currentByName = new Map(labsBefore.map((l) => [l.name, l] as const));
        for (const [name, prev] of prevByName) {
          const curr = currentByName.get(name);
          const wasActive = prev.status === "active";
          if (wasActive && !curr) {
            interRoundChanges.push(`${name} was decommissioned or merged away since last round (no longer in active labs).`);
          } else if (wasActive && curr && prev.roleId !== curr.roleId) {
            interRoundChanges.push(`${name} changed ownership: ${prev.roleId ?? "(unowned)"} → ${curr.roleId ?? "(unowned)"}.`);
          }
        }
        for (const [name, curr] of currentByName) {
          if (!prevByName.has(name) && curr.status === "active") {
            interRoundChanges.push(`${name} appeared as a new active lab since last round.`);
          }
        }
      }

      const narrativePrompt = buildResolveNarrativePrompt({
        round: roundNumber,
        roundLabel: currentRound.label ?? `Round ${roundNumber}`,
        resolvedActions,
        labsBefore,
        labsAfter: labsAfterApply,
        aiDisposition,
        previousRounds: previousRoundsForPrompt(rounds, roundNumber),
        previousTrajectories,
        interRoundChanges,
      });

      type NarrativeOutput = {
        summary: {
          labs: string[];
          geopolitics: string[];
          publicAndMedia: string[];
          aiSystems: string[];
          facilitatorNotes?: string;
        };
        labTrajectories: { labName: string; safetyAdequacy: "adequate" | "concerning" | "dangerous" | "catastrophic"; likelyFailureMode: "aligned" | "deceptive" | "spec-gaming" | "power-concentration" | "benevolent-override" | "loss-of-control" | "misuse"; reasoning: string; signalStrength: number }[];
      };

      let narrativeOutput: NarrativeOutput;
      let narrativeModel = "none";
      let narrativeTimeMs = 0;
      let narrativeTokens = 0;
      let narrativeError: string | undefined;

      try {
        const result = await callAnthropic<NarrativeOutput>({
          models: RESOLVE_MODELS,
          systemPrompt: SCENARIO_CONTEXT,
          prompt: narrativePrompt,
          maxTokens: 8192,
          timeoutMs: 120_000,
          toolName: "narrate_round",
          schema: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                description: "Round summary split by domain. Each field is an array of short bullet strings. Follow the SUMMARY STYLE rules in the prompt exactly: bullets are terse single-sentence outcomes, empty arrays are valid when a domain had nothing licensed, do not pad with non-events.",
                properties: {
                  labs: {
                    type: "array",
                    items: { type: "string", maxLength: 200 },
                    description: "Lab-level outcomes: mergers, ownership transfers, decommissions, renames, safety investments (or lack thereof), revenue-relevant announcements, public safety findings. What shifted inside or between the frontier labs this round.",
                  },
                  geopolitics: {
                    type: "array",
                    items: { type: "string", maxLength: 200 },
                    description: "Government actions, diplomatic moves, regulatory responses, intelligence operations, treaty work, sanctions, export controls, alliance formation. Both successes and failures where externally visible.",
                  },
                  publicAndMedia: {
                    type: "array",
                    items: { type: "string", maxLength: 200 },
                    description: "Press framing, public sentiment, NGO positions, protest activity, media coverage patterns, civil-society responses. Only coverage outcomes for things public enough to be covered.",
                  },
                  aiSystems: {
                    type: "array",
                    items: { type: "string", maxLength: 200 },
                    description: "Observable AI behaviour: red-team findings, disclosed incidents, deployment pauses, evaluation results, capability demonstrations. What's SEEN, not the hidden alignment frame.",
                  },
                  facilitatorNotes: {
                    type: "string",
                    description: "Optional gods-eye notes for facilitator only. Hidden action dynamics, trajectory reasoning, what's true vs what players can observe. Players never see this.",
                  },
                },
                required: ["labs", "geopolitics", "publicAndMedia", "aiSystems"],
              },
              labTrajectories: {
                type: "array",
                description: "Risk assessment for each lab in LAB STATUS (END). Do NOT include entries for labs that appear only in LAB STATUS (START) — they were merged, decommissioned, or renamed away this round. SECRET — facilitator-only.",
                items: {
                  type: "object",
                  properties: {
                    labName: { type: "string" },
                    safetyAdequacy: {
                      type: "string",
                      enum: ["adequate", "concerning", "dangerous", "catastrophic"],
                      description: "How adequate is safety investment relative to capability? adequate=safety keeps pace, concerning=falling behind, dangerous=large gap, catastrophic=essentially no safety at this capability level",
                    },
                    likelyFailureMode: {
                      type: "string",
                      enum: ["aligned", "deceptive", "spec-gaming", "power-concentration", "benevolent-override", "loss-of-control", "misuse"],
                      description: "Most likely outcome if current trajectory continues. aligned=safety adequate. deceptive=AI games evaluations. spec-gaming=AI exploits spec ambiguities. power-concentration=operator accumulates dangerous power. benevolent-override=AI overrides human autonomy 'for their own good'. loss-of-control=goals diverge at high capability. misuse=deliberately weaponised.",
                    },
                    reasoning: { type: "string", description: "1-2 sentences: why this assessment, what specifically is concerning or reassuring. Cite numbers from LAB STATUS (END), not role-description defaults.", maxLength: 200 },
                    signalStrength: { type: "number", description: "0-10: how advanced/visible are the warning signs? 0=speculative, 5=early indicators, 8=clear evidence, 10=actively manifesting" },
                  },
                  required: ["labName", "safetyAdequacy", "likelyFailureMode", "reasoning", "signalStrength"],
                },
              },
            },
            required: ["summary", "labTrajectories"],
          },
        });
        if (!result.output) throw new Error("Narrative LLM returned no output");
        narrativeOutput = result.output;
        narrativeModel = result.model;
        narrativeTimeMs = result.timeMs;
        narrativeTokens = result.tokens;
      } catch (narrativeErr) {
        narrativeError = narrativeErr instanceof Error ? narrativeErr.message : String(narrativeErr);
        console.error("[pipeline] Narrative LLM failed, using fallback:", narrativeErr);
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "narrating", detail: `Narrative generation failed: ${narrativeError.slice(0, 100)}. Using fallback.`, startedAt: Date.now() },
        });

        // Fallback summary: drop the succeeded actions into the labs bucket as
        // minimal outcome placeholders so the facilitator can edit from there
        // instead of a blank slate. Other buckets stay empty — better to be
        // quiet than to manufacture geopolitics/media/AI events the model
        // never actually reasoned about.
        const succeeded: typeof resolvedActions = [];
        const failed: typeof resolvedActions = [];
        for (const a of resolvedActions) (a.success ? succeeded : failed).push(a);
        const fallbackLabsBullets = succeeded.length > 0
          ? succeeded.slice(0, 5).map(a => `${a.roleName} succeeded: "${a.text}"`)
          : ["[AI summary generation failed — use Edit Summary to rewrite.]"];
        narrativeOutput = {
          summary: {
            labs: fallbackLabsBullets,
            geopolitics: [],
            publicAndMedia: [],
            aiSystems: failed.length > 0
              ? [`${failed.length} action(s) failed.`]
              : [],
          },
          labTrajectories: [],
        };
        narrativeModel = "fallback";
      }

      const activeLabNames = new Set(labsAfterApply.map((l) => l.name));
      const survivingTrajectories = narrativeOutput.labTrajectories.filter(
        (t) => activeLabNames.has(t.labName),
      );

      // Facilitator debug surfaces just the narrate pass now. The grader's
      // structured effects are persisted on submissions.actions[].structuredEffect
      // and visible in the P2 attempted-panel — no separate decide debug blob.
      const narrateDebug = {
        narrate: {
          prompt: narrativePrompt,
          response: narrativeOutput,
          error: narrativeError,
        },
      };

      await Promise.all([
        ctx.runMutation(internal.rounds.applySummaryInternal, { gameId, roundNumber, summary: narrativeOutput.summary }),
        ctx.runMutation(internal.rounds.setLabTrajectories, { gameId, roundNumber, trajectories: survivingTrajectories }),
        ctx.runMutation(internal.rounds.setAiMetaInternal, {
          gameId,
          roundNumber,
          meta: { narrativeModel, narrativeTimeMs, narrativeTokens },
        }),
        ctx.runMutation(internal.rounds.setResolveDebugInternal, {
          gameId,
          roundNumber,
          prompt: narrativePrompt,
          responseJson: JSON.stringify(narrateDebug, null, 2),
          error: narrativeError,
        }),
      ]);

      await ctx.runMutation(internal.games.finishResolveInternal, { gameId });
    } catch (err) {
      await failPipeline(ctx, gameId, "Continue-from-effect-review", err);
    }
  },
});

