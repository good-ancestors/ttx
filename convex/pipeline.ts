"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS, RESOLVE_MODELS } from "./aiModels";
import { defaultProbability, AI_SYSTEMS_ROLE_ID } from "./gameData";
import {
  buildGradingPrompt,
  buildResolveDecidePrompt,
  buildResolveNarrativePrompt,
  SCENARIO_CONTEXT,
  type ActionRequest,
} from "@/lib/ai-prompts";
import handoutData from "../public/role-handouts.json" with { type: "json" };
import type { RoleHandout } from "@/lib/role-handouts";
import type { LabWithCompute } from "./labs";
import {
  ROLES,
  LAB_PROGRESSION,
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

// Doc<"games"> no longer carries labs — kept as a comment marker for future callers.
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

async function gradeSubmissionBatch(
  ctx: ActionCtx,
  opts: {
    gameId: Id<"games">;
    labs: LabWithCompute[];
    ungraded: Submission[];
    allSubmissions: Submission[];
    rounds: Round[];
    requests: { fromRoleId: string; toRoleId: string; actionText: string; fromRoleName: string; toRoleName: string; requestType: string; computeAmount?: number; status: string }[];
    enabledRoleNames: string[];
    roundNumber: number;
    onlyUngraded?: boolean; // If true, only grade actions without probability
  },
) {
  const { gameId, labs, ungraded, allSubmissions, rounds, requests, enabledRoleNames, roundNumber, onlyUngraded } = opts;
  const GRADING_CONCURRENCY = 6;
  let completed = 0;
  const total = ungraded.length;

  // Pre-build lookup maps to avoid repeated .find() calls inside the loop
  const roleMap = new Map(ROLES.map((r) => [r.id, r]));
  const labMap = new Map(labs.filter((l) => l.roleId).map((l) => [l.roleId!, l]));
  const labByLabId = new Map(labs.map((l) => [String(l.labId), l] as const));
  const roundMap = new Map(rounds.map((r) => [r.number, r]));
  const allSubsSummary = allSubmissions.map((s) => ({
    roleId: s.roleId,
    roleName: roleMap.get(s.roleId)?.name ?? s.roleId,
    actions: s.actions.map((a) => ({ text: a.text, priority: a.priority })),
  }));

  for (let batch = 0; batch < ungraded.length; batch += GRADING_CONCURRENCY) {
    const batchSubs = ungraded.slice(batch, batch + GRADING_CONCURRENCY);
    const batchResults = await Promise.allSettled(batchSubs.map(async (sub) => {
      const role = roleMap.get(sub.roleId);
      if (!role) return;

      // Defensive guard: skip submissions where all actions are already graded
      if (sub.actions.every((a) => a.probability != null)) return;

      const otherSubs = allSubsSummary.filter((s) => s.roleId !== sub.roleId);

      const actionRequests: ActionRequest[] = (requests ?? [])
        .filter((r) => r.fromRoleId === sub.roleId || r.toRoleId === sub.roleId)
        .map((r) => ({
          actionText: r.actionText, fromRoleName: r.fromRoleName, toRoleName: r.toRoleName,
          requestType: r.requestType, computeAmount: r.computeAmount, status: r.status,
        }));

      const mergeContextFor = (a: (typeof sub.actions)[number]) => {
        if (!a.mergeLab) return undefined;
        const absorbedLab = labByLabId.get(String(a.mergeLab.absorbedLabId));
        const survivorLab = labByLabId.get(String(a.mergeLab.survivorLabId));
        if (!absorbedLab || !survivorLab) return undefined;
        return {
          absorbedLabName: absorbedLab.name,
          survivorLabName: survivorLab.name,
          submitterIsAbsorbed: absorbedLab.roleId === sub.roleId,
          newName: a.mergeLab.newName,
          newSpec: a.mergeLab.newSpec,
        };
      };
      const actionsToGrade = onlyUngraded
        ? sub.actions.filter((a) => a.probability == null).map((a) => ({ text: a.text, priority: a.priority, mergeLab: mergeContextFor(a) }))
        : sub.actions.map((a) => ({ text: a.text, priority: a.priority, mergeLab: mergeContextFor(a) }));
      // When grading only ungraded actions, still give the LLM the full picture of this role's
      // other actions — including any the facilitator has already manually graded — so competition,
      // priority budgets and narrative coherence are evaluated against the complete submission.
      const preGradedSibling = onlyUngraded
        ? sub.actions.filter((a) => a.probability != null).map((a) => ({ text: a.text, priority: a.priority }))
        : [];

      const prevRoundForGrading = roundMap.get(roundNumber - 1);
      const prompt = buildGradingPrompt({
        round: roundNumber,
        roundLabel: roundMap.get(roundNumber)?.label ?? `Round ${roundNumber}`,
        roleName: role.name,
        roleDescription: getRoleDescription(sub.roleId, role.brief ?? ""),
        roleTags: [...role.tags],
        actions: actionsToGrade,
        siblingPreGraded: preGradedSibling,
        labs,
        actionRequests,
        enabledRoles: enabledRoleNames,
        // Disposition deliberately excluded from grading — it biases probability
        // even when instructed not to. Disposition is passed to narrative phase only.
        otherSubmissions: otherSubs,
        labSpec: labMap.get(sub.roleId)?.spec,
        previousTrajectories: prevRoundForGrading?.labTrajectories as
          { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[] | undefined,
      });

      const gradedActions = await callGradingLLM(sub, prompt, onlyUngraded);
      await ctx.runMutation(internal.submissions.applyGradingInternal, {
        submissionId: sub._id,
        actions: gradedActions,
      });
    }));

    let failedCount = 0;
    for (const r of batchResults) {
      if (r.status === "rejected") {
        console.error(`[pipeline] Grading failed for submission:`, r.reason);
        failedCount++;
      } else {
        completed++;
      }
    }

    const failedSuffix = failedCount > 0 ? ` (${failedCount} used defaults)` : "";
    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "grading", detail: `Evaluating actions...${failedSuffix}`, progress: `${completed}/${total}`, startedAt: Date.now() },
    });
  }
}

// Call LLM for grading, with fallback to default probabilities
async function callGradingLLM(
  sub: Submission,
  prompt: string,
  onlyUngraded?: boolean,
): Promise<Submission["actions"]> {
  try {
    const { output } = await callAnthropic<{ actions: { text: string; probability: number; reasoning?: string }[] }>({
      models: GRADING_MODELS,
      systemPrompt: SCENARIO_CONTEXT,
      prompt,
      maxTokens: 2048,
      toolName: "grade_actions",
      schema: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                probability: { type: "number", enum: [10, 30, 50, 70, 90] },
                reasoning: { type: "string" },
              },
              required: ["text", "probability", "reasoning"],
            },
          },
        },
        required: ["actions"],
      },
    });

    if (output?.actions) {
      if (onlyUngraded) {
        let gradedIdx = 0;
        return sub.actions.map((action) => {
          if (action.probability != null) return action;
          const graded = output.actions[gradedIdx++];
          return { ...action, probability: graded?.probability ?? defaultProbability(action.priority), reasoning: graded?.reasoning };
        });
      }
      return sub.actions.map((action, i) => ({
        ...action,
        probability: output.actions[i]?.probability ?? defaultProbability(action.priority),
        reasoning: output.actions[i]?.reasoning,
      }));
    }
  } catch (err) {
    console.error(`[pipeline] Grading LLM failed for ${sub.roleId}, using defaults:`, err);
  }
  // Fallback
  return sub.actions.map((action) => ({
    ...action,
    probability: action.probability ?? defaultProbability(action.priority),
  }));
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
      // Quick check: fetch submissions first to see if there's anything to grade
      const existingSubs: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });

      // Check for missing AI/NPC submissions before proceeding
      const allTables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
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

      // Only grade actions that don't have a probability yet
      const ungraded = submissions.filter((s) =>
        s.actions.some((a) => a.actionStatus === "submitted" && a.probability == null)
      );
      const totalActions = ungraded.reduce(
        (sum, s) => sum + s.actions.filter((a) => a.actionStatus === "submitted" && a.probability == null).length,
        0,
      );
      const total = ungraded.length;

      if (total === 0) {
        // Nothing to grade — done. Skip fetching game, rounds, requests.
        await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "done", detail: "All actions graded", startedAt: Date.now() },
        });
        return;
      }

      if (submissions.length === 0) throw new Error("No submissions to grade");

      // Only fetch remaining data when we actually have things to grade
      const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
      const requests = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });
      const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
      const labs = await ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId });
      const enabledRoleNames = tables.filter((t) => t.enabled).map((t) => t.roleName);

      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "grading", detail: `Evaluating ${totalActions} action${totalActions === 1 ? "" : "s"}...`, progress: `0/${total}`, startedAt: Date.now() },
      });

      await gradeSubmissionBatch(ctx, {
        gameId, labs, ungraded, allSubmissions: submissions, rounds, requests: requests ?? [],
        enabledRoleNames, roundNumber, onlyUngraded: true,
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


export const rollAndNarrate = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  // Complexity is inherent: multi-step pipeline (roll, narrate,
  // compute lab growth, snapshot) that must run as a single atomic action.
  // eslint-disable-next-line complexity
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;
    let { aiDisposition } = args;

    try {
      // Fetch tables once for use in disposition resolution, AI influence, and snapshot
      const tablesBeforeResolve: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });

      // Resolve aiDisposition from table if not passed
      if (!aiDisposition) {
        const aiTable = tablesBeforeResolve.find((t) => t.roleId === AI_SYSTEMS_ROLE_ID && t.aiDisposition);
        if (aiTable?.aiDisposition) {
          const { getDisposition } = await import("@/lib/game-data");
          const disp = getDisposition(aiTable.aiDisposition);
          if (disp) aiDisposition = { label: disp.label, description: disp.description };
        }
      }

      // Resolve AI influence before dice roll.
      // - NPC/AI AI Systems: auto-generate keyword-based influence for OTHER players' actions
      // - Any AI Systems (including human-controlled): auto-boost its OWN submitted actions
      //   (it wants them to succeed) unless the player has set influence manually.
      {
        const aiSystemsTable = tablesBeforeResolve.find(
          (t) => t.roleId === AI_SYSTEMS_ROLE_ID && t.enabled && t.aiDisposition
        );
        if (aiSystemsTable) {
          const labsNow = await ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId });
          if (labsNow) {
            const subs: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
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

      // ═══ SPLIT RESOLVE — DECIDE PHASE ═══
      // First LLM pass: emit structural operations only (no prose). A second pass
      // will write the narrative once these ops have applied. The split keeps the
      // narrator from contradicting state — it reads a frozen end-of-round, never
      // decides state alongside the prose.
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "resolving", detail: "Deciding state changes...", startedAt: Date.now() },
      });

      const [submissions, rounds, tables, labsAtResolve]: [Submission[], Round[], Table[], LabWithCompute[]] = await Promise.all([
        ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
        ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
        ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
        ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId }),
      ]);
      const currentRound = rounds.find((r) => r.number === roundNumber);

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

      // Previous round trajectories feed into next round's trajectory assessment.
      const prevRound = rounds.find((r) => r.number === roundNumber - 1);
      const previousTrajectories = prevRound?.labTrajectories as
        { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[] | undefined;

      // Detect structural changes that happened BETWEEN last round's resolve and this
      // one (facilitator overrides via games.mergeLabs / updateLabs, etc.). Diff the
      // previous round's labsAfter against the current lab list at resolve start.
      const interRoundChanges: string[] = [];
      if (prevRound?.labsAfter) {
        const prevByName = new Map(prevRound.labsAfter.map((l) => [l.name, l] as const));
        const currentByName = new Map(labsAtResolve.map((l) => [l.name, l] as const));
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

      // Shared continuity context — passed to both decide and narrate prompts.
      const previousRoundsForPrompt = rounds
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

      const decidePrompt = buildResolveDecidePrompt({
        round: roundNumber,
        roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
        resolvedActions,
        labs: labsAtResolve,
        aiDisposition,
        previousRounds: previousRoundsForPrompt,
        interRoundChanges,
      });

      type DecideOutput = {
        labOperations: { reason: string; type: string; labName?: string; survivor?: string; absorbed?: string; newName?: string; change?: number; newMultiplier?: number; controllerRoleId?: string; spec?: string }[];
      };

      let decideOutput: DecideOutput = { labOperations: [] };
      let decideModel = "none";
      let decideTimeMs = 0;
      let decideTokens = 0;
      let decideResponseJson = "";
      let decideError: string | undefined;

      try {
        const result = await callAnthropic<DecideOutput>({
          models: RESOLVE_MODELS,
          systemPrompt: SCENARIO_CONTEXT,
          prompt: decidePrompt,
          maxTokens: 4096,
          timeoutMs: 120_000,
          toolName: "decide_round",
          schema: {
            type: "object",
            properties: {
              labOperations: {
                type: "array",
                description: "Structural operations on existing labs. Only operate on active labs listed in LAB STATUS — reference them by their exact name. You CANNOT create new labs (only players can found labs via actions) and you CANNOT rename standalone (renames happen only as side-effects of merger via newName).",
                items: {
                  type: "object",
                  properties: {
                    reason: { type: "string", description: "Why this operation is needed — reason BEFORE deciding type and values", maxLength: 200 },
                    type: { type: "string", enum: ["merge", "decommission", "computeChange", "multiplierOverride", "transferOwnership"] },
                    survivor: { type: "string", description: "Name of surviving lab (merge only)" },
                    absorbed: { type: "string", description: "Name of absorbed lab — will be decommissioned (merge only)" },
                    newName: { type: "string", description: "New name for survivor (merge only)" },
                    spec: { type: "string", description: "New AI directive for the merged lab (merge only)" },
                    labName: { type: "string", description: "Target lab name (required for non-merge ops)" },
                    change: { type: "number", description: "Compute delta (computeChange only): ±50 max" },
                    newMultiplier: { type: "number", description: "Override R&D multiplier (multiplierOverride only)" },
                    controllerRoleId: { type: "string", description: "New owner role ID (transferOwnership only); empty string = unowned" },
                  },
                  required: ["reason", "type"],
                },
              },
            },
            required: ["labOperations"],
          },
        });
        if (!result.output) throw new Error("Decide LLM returned no output");
        decideOutput = result.output;
        decideModel = result.model;
        decideTimeMs = result.timeMs;
        decideTokens = result.tokens;
        decideResponseJson = JSON.stringify(result.output, null, 2);
      } catch (decideErr) {
        decideError = decideErr instanceof Error ? decideErr.message : String(decideErr);
        console.error("[pipeline] Decide LLM failed, proceeding with no state changes:", decideErr);
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "resolving", detail: `Decide phase failed: ${decideError.slice(0, 100)}. No state changes applied.`, startedAt: Date.now() },
        });
        decideModel = "fallback";
      }

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
      const computeModifiers: { labId: Id<"labs">; change: number; reason: string }[] = [];
      const multiplierOverrides: { labId: Id<"labs">; newMultiplier: number }[] = [];
      const rejectedOps: string[] = [];

      const findActiveByName = (name: string) => workingLabs.find((l) => l.name === name);

      for (const op of decideOutput.labOperations ?? []) {
        switch (op.type) {
          case "merge":
            if (op.survivor && op.absorbed) {
              const survivor = findActiveByName(op.survivor);
              const absorbed = findActiveByName(op.absorbed);
              if (!survivor || !absorbed || survivor.labId === absorbed.labId) {
                rejectedOps.push(`merge: one of "${op.survivor}" / "${op.absorbed}" not active`);
                break;
              }
              const newName = op.newName;
              mergeOps.push({
                survivorLabId: survivor.labId,
                absorbedLabId: absorbed.labId,
                newName,
                newSpec: op.spec,
                reason: op.reason ?? `Merge ${op.absorbed} into ${op.survivor}`,
              });
              // Update working view: remove absorbed, patch survivor
              workingLabs = workingLabs
                .filter((l) => l.labId !== absorbed.labId)
                .map((l) => l.labId === survivor.labId
                  ? { ...l, name: newName ?? l.name, spec: op.spec ?? l.spec, rdMultiplier: Math.max(l.rdMultiplier, absorbed.rdMultiplier) }
                  : l);
            }
            break;
          case "decommission":
            if (op.labName) {
              const target = findActiveByName(op.labName);
              if (!target) { rejectedOps.push(`decommission: "${op.labName}" not active`); break; }
              if (workingLabs.length <= 1) { rejectedOps.push(`decommission: cannot decommission last active lab`); break; }
              decommissionOps.push({ labId: target.labId });
              workingLabs = workingLabs.filter((l) => l.labId !== target.labId);
            }
            break;
          case "computeChange":
            if (op.labName && op.change != null) {
              const target = findActiveByName(op.labName);
              if (!target || !target.roleId) { rejectedOps.push(`computeChange: "${op.labName}" not active or unowned`); break; }
              const clamped = Math.max(-50, Math.min(50, op.change));
              computeModifiers.push({ labId: target.labId, change: clamped, reason: op.reason });
              workingLabs = workingLabs.map((l) => l.labId === target.labId
                ? { ...l, computeStock: Math.max(0, l.computeStock + clamped) }
                : l);
            }
            break;
          case "multiplierOverride":
            if (op.labName && op.newMultiplier != null) {
              const target = findActiveByName(op.labName);
              if (!target) { rejectedOps.push(`multiplierOverride: "${op.labName}" not active`); break; }
              const clamped = Math.max(0.1, Math.min(maxMult, op.newMultiplier));
              multiplierOverrides.push({ labId: target.labId, newMultiplier: clamped });
              workingLabs = workingLabs.map((l) => l.labId === target.labId ? { ...l, rdMultiplier: clamped } : l);
            }
            break;
          case "transferOwnership":
            if (op.labName && op.controllerRoleId !== undefined) {
              const target = findActiveByName(op.labName);
              if (!target) { rejectedOps.push(`transferOwnership: "${op.labName}" not active`); break; }
              // Validate controllerRoleId is a real role ID (LLM sometimes emits role *name*
              // instead of ID — e.g. "Australian PM" vs "australia-pm" — which would silently
              // leave the lab unowned). Empty string is allowed and means "unowned".
              const newOwner = op.controllerRoleId || undefined;
              if (newOwner && !tablesAfterClear.some((t) => t.roleId === newOwner)) {
                rejectedOps.push(`transferOwnership: invalid roleId "${newOwner}" for "${op.labName}"`);
                break;
              }
              transferOps.push({ labId: target.labId, newOwnerRoleId: newOwner });
              workingLabs = workingLabs.map((l) => l.labId === target.labId ? { ...l, roleId: newOwner } : l);
            }
            break;
          case "create":
          case "rename":
            // Per design: labs can only be founded via player actions; rename only happens as a
            // side-effect of merge. LLM-initiated creates/renames are rejected to keep the
            // structural boundary clean.
            rejectedOps.push(`${op.type}: not allowed from narrative`);
            break;
          default:
            rejectedOps.push(`unknown op: ${op.type}`);
        }
      }
      if (rejectedOps.length > 0) {
        console.warn(`[pipeline] Rejected lab ops: ${rejectedOps.join("; ")}`);
      }

      // Apply baseline R&D growth on the in-memory working labs
      const ceoAllocations = new Map<string, { deployment: number; research: number; safety: number }>();
      for (const sub of submissions) {
        if (sub.computeAllocation) {
          const lab = workingLabs.find((l) => l.roleId === sub.roleId);
          if (lab) ceoAllocations.set(lab.name, sub.computeAllocation);
        }
      }
      const grownLabs = computeLabGrowth(workingLabs, ceoAllocations, roundNumber, maxMult);
      // Compute per-lab growth stock + multiplier deltas
      const multiplierUpdates: { labId: Id<"labs">; rdMultiplier: number }[] = [];
      for (const lab of grownLabs) {
        const pre = workingLabs.find((l) => l.name === lab.name || (l as WorkingLab).labId === (lab as WorkingLab).labId);
        if (!pre) continue;
        const preMult = pre.rdMultiplier;
        if (lab.rdMultiplier !== preMult) {
          multiplierUpdates.push({ labId: (pre as WorkingLab).labId, rdMultiplier: lab.rdMultiplier });
        }
      }
      // Apply multiplierOverride on top of growth
      for (const ov of multiplierOverrides) {
        const update = { labId: ov.labId, rdMultiplier: ov.newMultiplier };
        const existing = multiplierUpdates.findIndex((u) => u.labId === ov.labId);
        if (existing >= 0) multiplierUpdates[existing] = update;
        else multiplierUpdates.push(update);
      }

      // Build ledger entries: acquired (per lab's net stock growth from pool share),
      // adjusted (narrative computeChange), merged (pair per merger).
      const acquiredEntries: { roleId: string; amount: number }[] = [];
      // For each lab: acquired = (post-growth stock − pre-growth stock) − narrative adjustment
      const modifierByLabId = new Map(computeModifiers.map((m) => [m.labId, m]));
      for (const lab of grownLabs) {
        if (!lab.roleId) continue;
        const pre = labsAfterClear.find((l) => l.labId === (lab as WorkingLab).labId);
        if (!pre) continue;
        const preStock = pre.roleId ? tableComputeByRole.get(pre.roleId) ?? 0 : 0;
        const mod = modifierByLabId.get((lab as WorkingLab).labId);
        const acquired = lab.computeStock - preStock - (mod?.change ?? 0);
        if (acquired > 0) acquiredEntries.push({ roleId: lab.roleId, amount: acquired });
      }
      // Non-lab roles (governments, civil society) get pool share
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

      const adjustedEntries = computeModifiers
        .map((m) => {
          const lab = grownLabs.find((l) => (l as WorkingLab).labId === m.labId);
          if (!lab?.roleId) return null;
          return { roleId: lab.roleId, amount: m.change, reason: m.reason };
        })
        .filter((x): x is { roleId: string; amount: number; reason: string } => x !== null && x.amount !== 0);

      const mergedEntries: { fromRoleId: string; toRoleId: string; amount: number; reason: string }[] = [];
      for (const m of mergeOps) {
        const absorbed = labsAfterClear.find((l) => l.labId === m.absorbedLabId);
        const survivor = labsAfterClear.find((l) => l.labId === m.survivorLabId);
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

      // Apply everything atomically via a single mutation
      await ctx.runMutation(internal.pipelineApply.applyResolveInternal, {
        gameId,
        roundNumber,
        nonce,
        mergeOps,
        decommissionOps,
        transferOps,
        multiplierUpdates,
        acquired: acquiredEntries,
        adjusted: adjustedEntries,
        merged: mergedEntries,
      });
      // Snapshot labs-after for post-game restore / review. Also makes the narrative
      // pass a pure reader — everything it sees is frozen ground truth.
      await ctx.runMutation(internal.rounds.snapshotAfterInternal, { gameId, roundNumber });

      // ═══ SPLIT RESOLVE — NARRATE PHASE ═══
      // Second LLM pass: reads the frozen (labsBefore, labsAfter) pair plus the
      // action log and emits prose + risk trajectories. No state is decided here;
      // anything that contradicts labsAfter is wrong by definition.
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "narrating", detail: "Writing the story...", startedAt: Date.now() },
      });

      // Post-apply lab state — this is what the narrator sees as "end of round".
      const labsAfterApply: LabWithCompute[] = await ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId });

      const narrativePrompt = buildResolveNarrativePrompt({
        round: roundNumber,
        roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
        resolvedActions,
        labsBefore: labsAtResolve,
        labsAfter: labsAfterApply,
        aiDisposition,
        previousRounds: previousRoundsForPrompt,
        previousTrajectories,
        interRoundChanges,
      });

      type NarrativeOutput = {
        summary: {
          outcomes: string;
          stateOfPlay: string;
          pressures: string;
          facilitatorNotes?: string;
        };
        labTrajectories: { labName: string; safetyAdequacy: "adequate" | "concerning" | "dangerous" | "catastrophic"; likelyFailureMode: "aligned" | "deceptive" | "spec-gaming" | "power-concentration" | "benevolent-override" | "loss-of-control" | "misuse"; reasoning: string; signalStrength: number }[];
      };

      let narrativeOutput: NarrativeOutput;
      let narrativeModel = "none";
      let narrativeTimeMs = 0;
      let narrativeTokens = 0;
      let narrativeResponseJson = "";
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
                description: "Situation briefing for the next round. Outcome-first, forward-looking. Follow the SUMMARY STYLE rules in the prompt exactly: describe outcomes and meaning (not attempts), skip anything that didn't produce a visible change in LAB STATUS (END), don't restate numbers, and write toward the next round's setup.",
                properties: {
                  outcomes: {
                    type: "string",
                    description: "2-3 sentences. What the successful actions produced, at meaning-level. Synthesize — connect effects into coherent outcomes; do not re-list the action log. Include blocked / failed-to-land outcomes where relevant (action succeeded procedurally but LAB STATUS (END) shows the intended world change didn't happen because another effect overtook it).",
                  },
                  stateOfPlay: {
                    type: "string",
                    description: "1-2 sentences. Where key players sit now, in relative terms. Positions, leverage, momentum — not absolute numbers. Who gained, who lost, who's now exposed.",
                  },
                  pressures: {
                    type: "string",
                    description: "1-2 sentences. What's set up, contested, or at stake heading into the next round. The questions players should be thinking about between rounds.",
                  },
                  facilitatorNotes: {
                    type: "string",
                    description: "Optional gods-eye notes for facilitator only. Hidden action dynamics, trajectory reasoning, what's true vs what players can observe. Players never see this.",
                  },
                },
                required: ["outcomes", "stateOfPlay", "pressures"],
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
        narrativeResponseJson = JSON.stringify(result.output, null, 2);
      } catch (narrativeErr) {
        narrativeError = narrativeErr instanceof Error ? narrativeErr.message : String(narrativeErr);
        console.error("[pipeline] Narrative LLM failed, using fallback:", narrativeErr);
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "narrating", detail: `Narrative generation failed: ${narrativeError.slice(0, 100)}. Using fallback.`, startedAt: Date.now() },
        });

        // Minimal fallback summary so the facilitator has something to edit from.
        const succeeded: typeof resolvedActions = [];
        const failed: typeof resolvedActions = [];
        for (const a of resolvedActions) (a.success ? succeeded : failed).push(a);
        const fallbackOutcomes = succeeded.length > 0
          ? `${succeeded.slice(0, 3).map(a => `${a.roleName} succeeded: "${a.text}"`).join(". ")}.`
          : "[AI narrative generation failed — use Edit Narrative to rewrite.]";
        narrativeOutput = {
          summary: {
            outcomes: fallbackOutcomes,
            stateOfPlay: "",
            pressures: failed.length > 0
              ? `${failed.length} action(s) failed. [AI narrative generation failed — use Edit Narrative to rewrite.]`
              : "[AI narrative generation failed — use Edit Narrative to rewrite.]",
          },
          labTrajectories: [],
        };
        narrativeModel = "fallback";
      }

      // Only keep trajectories for labs that exist in the post-apply state. The
      // narrator should only emit for labsAfter labs, but guard against stale
      // entries from previousTrajectories that could leak through.
      const activeLabNames = new Set(labsAfterApply.map((l) => l.name));
      const survivingTrajectories = narrativeOutput.labTrajectories.filter(
        (t) => activeLabNames.has(t.labName),
      );

      // Save decide + narrate debug as a single JSON blob so the facilitator-only
      // debug button surfaces both passes.
      const combinedDebug = {
        decide: {
          prompt: decidePrompt,
          response: decideResponseJson ? JSON.parse(decideResponseJson) : null,
          error: decideError,
        },
        narrate: {
          prompt: narrativePrompt,
          response: narrativeResponseJson ? JSON.parse(narrativeResponseJson) : null,
          error: narrativeError,
        },
      };

      // Write narrative + trajectories + aiMeta + resolve debug in parallel.
      await Promise.all([
        ctx.runMutation(internal.rounds.applySummaryInternal, {
          gameId,
          roundNumber,
          summary: narrativeOutput.summary,
        }),
        ctx.runMutation(internal.rounds.setLabTrajectories, { gameId, roundNumber, trajectories: survivingTrajectories }),
        ctx.runMutation(internal.rounds.setAiMetaInternal, {
          gameId,
          roundNumber,
          meta: {
            resolveModel: decideModel,
            resolveTimeMs: decideTimeMs,
            resolveTokens: decideTokens,
            narrativeModel,
            narrativeTimeMs,
            narrativeTokens,
          },
        }),
        ctx.runMutation(internal.rounds.setResolveDebugInternal, {
          gameId,
          roundNumber,
          prompt: decidePrompt,
          responseJson: JSON.stringify(combinedDebug, null, 2),
          error: decideError ?? narrativeError,
        }),
      ]);

      // shareChanges removed from LLM output — share overrides are facilitator-set now
      // (games.computeShareOverrides, written via setShareOverridesInternal). LLM proposing
      // raw percentages was buggy: negatives got silently clamped, absolute-vs-delta was
      // ambiguous, and the decision blurred with narrative prose. See docs/resolve-pipeline.md.

      // Done — single mutation to advance phase, clear resolving lock, and set status
      await ctx.runMutation(internal.games.finishResolveInternal, { gameId });
    } catch (err) {
      await failPipeline(ctx, gameId, "Resolve", err);
    }
  },
});

