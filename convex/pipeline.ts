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
  buildRoundNarrativePrompt,
  SCENARIO_CONTEXT,
  type ActionRequest,
} from "@/lib/ai-prompts";
import {
  ROLES,
  LAB_PROGRESSION,
  NEW_COMPUTE_PER_GAME_ROUND,
  DEFAULT_COMPUTE_SHARES,
  stripLabForSnapshot,
  applyLabMerge,
  getAiInfluencePower,
  autoGenerateInfluence,
  computeLabGrowth,
} from "@/lib/game-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type Game = Doc<"games">;
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

const DIAL_NAMES = ["capability", "alignment", "tension", "awareness", "regulation", "australia"] as const;


async function gradeSubmissionBatch(
  ctx: ActionCtx,
  opts: {
    gameId: Id<"games">;
    game: Game;
    ungraded: Submission[];
    allSubmissions: Submission[];
    rounds: Round[];
    requests: { fromRoleId: string; toRoleId: string; actionText: string; fromRoleName: string; toRoleName: string; requestType: string; computeAmount?: number; status: string }[];
    enabledRoleNames: string[];
    roundNumber: number;
    aiDisposition?: { label: string; description: string };
    onlyUngraded?: boolean; // If true, only grade actions without probability
  },
) {
  const { gameId, game, ungraded, allSubmissions, rounds, requests, enabledRoleNames, roundNumber, aiDisposition, onlyUngraded } = opts;
  const GRADING_CONCURRENCY = 6;
  let completed = 0;
  const total = ungraded.length;

  // Pre-build lookup maps to avoid repeated .find() calls inside the loop
  const roleMap = new Map(ROLES.map((r) => [r.id, r]));
  const labMap = new Map(game.labs.map((l) => [l.roleId, l]));
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

      const actionsToGrade = onlyUngraded
        ? sub.actions.filter((a) => a.probability == null).map((a) => ({ text: a.text, priority: a.priority }))
        : sub.actions.map((a) => ({ text: a.text, priority: a.priority }));

      const prompt = buildGradingPrompt({
        round: roundNumber,
        roundLabel: rounds.find((r) => r.number === roundNumber)?.label ?? `Round ${roundNumber}`,
        worldState: game.worldState,
        roleName: role.name,
        roleDescription: role.brief ?? "",
        roleTags: [...role.tags],
        actions: actionsToGrade,
        labs: game.labs,
        actionRequests,
        enabledRoles: enabledRoleNames,
        aiDisposition: sub.roleId === AI_SYSTEMS_ROLE_ID ? aiDisposition : undefined,
        otherSubmissions: otherSubs,
        labSpec: labMap.get(sub.roleId)?.spec,
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
      status: { step: "grading", detail: `Evaluating submissions...${failedSuffix}`, progress: `${completed}/${total}`, startedAt: Date.now() },
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
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, aiDisposition } = args;

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
      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");

      const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
      const requests = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });
      const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
      const enabledRoleNames = tables.filter((t) => t.enabled).map((t) => t.roleName);

      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "grading", detail: `Evaluating ${total} submissions...`, progress: `0/${total}`, startedAt: Date.now() },
      });

      await gradeSubmissionBatch(ctx, {
        gameId, game, ungraded, allSubmissions: submissions, rounds, requests: requests ?? [],
        enabledRoleNames, roundNumber, aiDisposition, onlyUngraded: true,
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
  // Complexity is inherent: multi-step pipeline (roll, narrate, apply world state,
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

      // Auto-generate AI influence for NPC/AI-controlled AI Systems (if not already set by human player)
      // Quick check: only proceed if an enabled AI Systems table exists with a disposition and is not human-controlled
      {
        const aiSystemsTable = tablesBeforeResolve.find(
          (t) => t.roleId === AI_SYSTEMS_ROLE_ID && t.enabled && t.aiDisposition && t.controlMode !== "human"
        );
        if (aiSystemsTable) {
          const game = await ctx.runQuery(internal.games.getInternal, { gameId });
          if (game) {
            const subs: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
            const power = getAiInfluencePower(game.labs);
            // Only influence actions that don't already have influence set
            const actionsToInfluence = subs.flatMap((sub) =>
              sub.actions
                .map((a, i) => ({ submissionId: sub._id as string, actionIndex: i, text: a.text, roleId: sub.roleId, aiInfluence: a.aiInfluence }))
                .filter((item) => item.aiInfluence == null)
            );
            if (actionsToInfluence.length > 0) {
              const influence = autoGenerateInfluence(aiSystemsTable.aiDisposition!, actionsToInfluence, power);
              if (influence.length > 0) {
                await ctx.runMutation(internal.submissions.applyAiInfluenceInternal, {
                  gameId,
                  roundNumber,
                  influences: influence.map((inf) => ({
                    submissionId: inf.submissionId as Id<"submissions">,
                    actionIndex: inf.actionIndex,
                    modifier: inf.modifier,
                  })),
                });
              }
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
        worldStateBefore: game.worldState as { capability: number; alignment: number; tension: number; awareness: number; regulation: number; australia: number },
        labsBefore: game.labs.map(stripLabForSnapshot),
        roleComputeBefore: tablesBeforeResolve
          .filter((table) => table.computeStock != null)
          .map((table) => ({
            roleId: table.roleId,
            roleName: table.roleName,
            computeStock: table.computeStock ?? 0,
          })),
      });

      // Start narrative LLM call — runs in parallel with dice reveal animation on client
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "narrating", detail: "Writing the story...", startedAt: Date.now() },
      });

      const [submissions, rounds, tables]: [Submission[], Round[], Table[]] = await Promise.all([
        ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
        ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
        ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
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

      const prompt = buildRoundNarrativePrompt({
        round: roundNumber,
        roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
        worldState: game.worldState,
        resolvedActions,
        labs: game.labs,
        aiDisposition,
        previousRounds: rounds
          .filter((r) => r.number < roundNumber && r.summary)
          .map((r) => ({
            number: r.number,
            label: r.label,
            narrative: r.summary?.narrative,
            worldStateAfter: r.worldStateAfter as Record<string, number> | undefined,
          })),
      });

      // Single merged call: narrative + worldState + labOperations
      type NarrativeOutput = {
        narrative: string;
        worldState: { capability: { reasoning: string; value: number }; alignment: { reasoning: string; value: number }; tension: { reasoning: string; value: number }; awareness: { reasoning: string; value: number }; regulation: { reasoning: string; value: number }; australia: { reasoning: string; value: number } };
        labOperations: { reason: string; type: string; labName?: string; survivor?: string; absorbed?: string; newName?: string; name?: string; computeStock?: number; rdMultiplier?: number; change?: number; newMultiplier?: number; oldName?: string }[];
      };

      let narrativeOutput: NarrativeOutput;
      let usedModel = "none";
      let timeMs = 0;
      let tokens = 0;

      try {
        const result = await callAnthropic<NarrativeOutput>({
          models: RESOLVE_MODELS,
          systemPrompt: SCENARIO_CONTEXT,
          prompt,
          maxTokens: 8192,
          toolName: "resolve_round",
          schema: {
            type: "object",
            properties: {
              narrative: { type: "string", description: "6-8 dramatic sentences" },
              worldState: (() => {
                const dialSchema = { type: "object", properties: { reasoning: { type: "string", description: "1 sentence", maxLength: 150 }, value: { type: "number" } }, required: ["reasoning", "value"] };
                return {
                  type: "object",
                  description: "For each dial, reason about the change BEFORE giving the value",
                  properties: Object.fromEntries(DIAL_NAMES.map((d) => [d, dialSchema])),
                  required: [...DIAL_NAMES],
                };
              })(),
              labOperations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    reason: { type: "string", description: "Why this operation is needed — reason BEFORE deciding type and values", maxLength: 200 },
                    type: { type: "string", enum: ["merge", "create", "decommission", "rename", "computeChange", "multiplierOverride"] },
                    labName: { type: "string" }, survivor: { type: "string" }, absorbed: { type: "string" },
                    newName: { type: "string" }, name: { type: "string" },
                    computeStock: { type: "number" }, rdMultiplier: { type: "number" },
                    change: { type: "number" }, newMultiplier: { type: "number" },
                    oldName: { type: "string" },
                  },
                  required: ["reason", "type"],
                },
              },
            },
            required: ["narrative", "worldState", "labOperations"],
          },
        });

        if (!result.output) throw new Error("Narrative LLM returned no output");
        narrativeOutput = result.output;
        usedModel = result.model;
        timeMs = result.timeMs;
        tokens = result.tokens;
      } catch (narrativeErr) {
        console.error("[pipeline] Narrative LLM failed, using fallback:", narrativeErr);
        narrativeOutput = {
          narrative: `Round ${roundNumber} resolved. ${resolvedActions.filter(a => a.success).length} of ${resolvedActions.length} actions succeeded. [Facilitator: edit this narrative manually using the Edit Narrative button.]`,
          worldState: Object.fromEntries(
            DIAL_NAMES.map(k => [k, { reasoning: "LLM unavailable", value: game.worldState[k] }])
          ) as NarrativeOutput["worldState"],
          labOperations: [],
        };
        usedModel = "fallback";
      }

      // Nonce check before applying changes
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

      // Write narrative + apply world state in parallel (different documents)
      const maxDelta = roundNumber >= 3 ? 4 : 3;
      const clamp = (newVal: number, current: number) => {
        if (!Number.isFinite(newVal)) return current;
        const clamped = Math.max(0, Math.min(10, Math.round(newVal)));
        const delta = clamped - current;
        return Math.abs(delta) > maxDelta ? current + Math.sign(delta) * maxDelta : clamped;
      };
      const ws = game.worldState;
      const ows = narrativeOutput.worldState;
      const clampedWorldState = Object.fromEntries(
        DIAL_NAMES.map((d) => [d, clamp(ows[d]?.value ?? ws[d], ws[d])])
      ) as typeof ws;
      // Write narrative (rounds doc) + world state (games doc) in parallel
      await Promise.all([
        ctx.runMutation(internal.rounds.applySummaryInternal, {
          gameId,
          roundNumber,
          summary: {
            narrative: narrativeOutput.narrative,
            headlines: [],
            geopoliticalEvents: [],
            aiStateOfPlay: [],
          },
        }),
        ctx.runMutation(internal.games.updateWorldStateInternal, { gameId, worldState: clampedWorldState }),
      ]);

      // Apply lab operations from the LLM
      const maxMult = LAB_PROGRESSION.maxMultiplier(roundNumber);
      let updatedLabs = [...game.labs];
      const computeModifiers: { labName: string; change: number; reason: string }[] = [];
      const multiplierOverrides: { labName: string; newMultiplier: number }[] = [];

      for (const op of narrativeOutput.labOperations ?? []) {
        switch (op.type) {
          case "merge":
            if (op.survivor && op.absorbed) {
              updatedLabs = applyLabMerge(updatedLabs, op.survivor, op.absorbed);
              if (op.newName) {
                updatedLabs = updatedLabs.map((l) => l.name === op.survivor ? { ...l, name: op.newName! } : l);
              }
            }
            break;
          case "create":
            if (op.name) {
              updatedLabs.push({
                name: op.name,
                roleId: `custom-${op.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
                computeStock: Math.max(0, Math.min(100, op.computeStock ?? 5)),
                rdMultiplier: Math.max(0.1, Math.min(maxMult, op.rdMultiplier ?? 1)),
                allocation: { users: 33, capability: 34, safety: 33 },
              });
            }
            break;
          case "decommission":
            if (op.labName) {
              const remaining = updatedLabs.filter((l) => l.name !== op.labName);
              if (remaining.length > 0) updatedLabs = remaining; // Never decommission all labs
            }
            break;
          case "rename":
            if (op.oldName && op.newName) {
              updatedLabs = updatedLabs.map((l) => l.name === op.oldName ? { ...l, name: op.newName! } : l);
            }
            break;
          case "computeChange":
            if (op.labName && op.change != null) {
              const clampedChange = Math.max(-50, Math.min(50, op.change));
              updatedLabs = updatedLabs.map((l) =>
                l.name === op.labName ? { ...l, computeStock: Math.max(0, l.computeStock + clampedChange) } : l
              );
              computeModifiers.push({ labName: op.labName, change: clampedChange, reason: op.reason });
            }
            break;
          case "multiplierOverride":
            if (op.labName && op.newMultiplier != null) {
              multiplierOverrides.push({
                labName: op.labName,
                newMultiplier: Math.max(0.1, Math.min(maxMult, op.newMultiplier)),
              });
            }
            break;
          default:
            console.warn(`[pipeline] Unknown labOperation type: ${op.type}`);
        }
      }

      // Apply baseline R&D growth on top of lab operations
      const ceoAllocations = new Map<string, { users: number; capability: number; safety: number }>();
      for (const sub of submissions) {
        if (sub.computeAllocation) {
          const lab = updatedLabs.find((l) => l.roleId === sub.roleId);
          if (lab) ceoAllocations.set(lab.name, sub.computeAllocation);
        }
      }
      updatedLabs = computeLabGrowth(updatedLabs, ceoAllocations, roundNumber, maxMult);
      if (multiplierOverrides.length > 0) {
        updatedLabs = updatedLabs.map((lab) => {
          const override = multiplierOverrides.find((item) => item.labName === lab.name);
          return override ? { ...lab, rdMultiplier: override.newMultiplier } : lab;
        });
      }

      // Update labs (games doc) + compute changes (rounds doc) in parallel
      const baselineTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;
      const roleCompute = tables
        .filter((t) => t.computeStock != null)
        .map((t) => ({ roleId: t.roleId, roleName: t.roleName, computeStock: t.computeStock ?? 0 }));
      const strippedLabs = updatedLabs.map(stripLabForSnapshot);
      const labsBeforeMap = new Map(game.labs.map((lab) => [lab.name, lab]));
      const labsAfterMap = new Map(updatedLabs.map((lab) => [lab.name, lab]));
      const allLabNames = new Set([...labsBeforeMap.keys(), ...labsAfterMap.keys()]);
      const modifierByLab = new Map(computeModifiers.map((modifier) => [modifier.labName, modifier]));
      const distribution = [...allLabNames].map((labName) => {
        const before = labsBeforeMap.get(labName);
        const after = labsAfterMap.get(labName);
        const baseline = Math.round(((DEFAULT_COMPUTE_SHARES[roundNumber]?.[labName] ?? 0) / 100) * baselineTotal);
        const modifier = modifierByLab.get(labName);
        const stockBefore = Math.round(before?.computeStock ?? 0);
        const stockAfter = Math.round(after?.computeStock ?? 0);
        return {
          labName,
          stockBefore,
          stockAfter,
          stockChange: stockAfter - stockBefore,
          baseline,
          modifier: modifier?.change ?? 0,
          sharePct: 0,
          active: !!after,
          reason: modifier?.reason,
          newTotal: stockAfter,
        };
      });
      const newComputeTotal = distribution.reduce((sum, entry) => (
        sum + Math.max(0, entry.baseline + entry.modifier)
      ), 0);
      const stockBeforeTotal = distribution.reduce((sum, entry) => sum + entry.stockBefore, 0);
      const stockAfterTotal = distribution.reduce((sum, entry) => sum + entry.stockAfter, 0);
      const distributionWithShares = distribution.map((entry) => ({
        ...entry,
        sharePct: newComputeTotal > 0 ? Math.round((Math.max(0, entry.baseline + entry.modifier) / newComputeTotal) * 100) : 0,
      }));
      const roleComputeBeforeMap = new Map(tablesBeforeResolve.map((table) => [table.roleId, table]));
      const competitiveRoleIds = new Set(updatedLabs.map((lab) => lab.roleId));
      const nonCompetitive = roleCompute
        .filter((entry) => !competitiveRoleIds.has(entry.roleId))
        .map((entry) => {
          const before = roleComputeBeforeMap.get(entry.roleId)?.computeStock ?? 0;
          const after = entry.computeStock;
          return {
            roleId: entry.roleId,
            roleName: entry.roleName,
            stockBefore: before,
            stockAfter: after,
            stockChange: after - before,
          };
        });

      await Promise.all([
        ctx.runMutation(internal.games.updateLabsInternal, { gameId, labs: strippedLabs }),
        ctx.runMutation(internal.rounds.setComputeChanges, {
          gameId,
          roundNumber,
          computeChanges: {
            newComputeTotal,
            baselineTotal,
            stockBeforeTotal,
            stockAfterTotal,
            distribution: distributionWithShares,
            nonCompetitive,
          },
        }),
      ]);

      // Snapshot after + AI meta (both rounds doc — must be sequential)
      await ctx.runMutation(internal.rounds.snapshotAfterInternal, {
        gameId,
        roundNumber,
        worldStateAfter: clampedWorldState,
        labsAfter: strippedLabs,
        roleComputeAfter: roleCompute,
      });
      await ctx.runMutation(internal.rounds.setAiMetaInternal, {
        gameId,
        roundNumber,
        meta: { resolveModel: usedModel, resolveTimeMs: timeMs, resolveTokens: tokens },
      });

      // Done — advance to narrate phase and clean up (all games doc — must be sequential)
      await ctx.runMutation(internal.games.advancePhaseInternal, { gameId, phase: "narrate" });
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "done", detail: "Resolution complete", startedAt: Date.now() },
      });
    } catch (err) {
      await failPipeline(ctx, gameId, "Resolve", err);
    }
  },
});
