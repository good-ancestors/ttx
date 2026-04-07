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
import handoutData from "../public/role-handouts.json" with { type: "json" };
import type { RoleHandout } from "@/lib/role-handouts";
import {
  ROLES,
  LAB_PROGRESSION,
  stripLabForSnapshot,
  applyLabMerge,
  getAiInfluencePower,
  autoGenerateInfluence,
  computeLabGrowth,
} from "@/lib/game-data";

/** Build role description for the grading LLM from the structured handout.
 *  Only includes role + objective — resources are dynamic and already
 *  represented by actual game state (labs, compute, world state). */
function getRoleDescription(roleId: string, fallbackBrief: string): string {
  const handout = (handoutData as Record<string, RoleHandout>)[roleId];
  if (!handout) return fallbackBrief;
  return `${handout.role}\nObjective: ${handout.objective}`;
}

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

      const actionsToGrade = onlyUngraded
        ? sub.actions.filter((a) => a.probability == null).map((a) => ({ text: a.text, priority: a.priority }))
        : sub.actions.map((a) => ({ text: a.text, priority: a.priority }));

      const prevRoundForGrading = roundMap.get(roundNumber - 1);
      const prompt = buildGradingPrompt({
        round: roundNumber,
        roundLabel: roundMap.get(roundNumber)?.label ?? `Round ${roundNumber}`,
        worldState: game.worldState,
        roleName: role.name,
        roleDescription: getRoleDescription(sub.roleId, role.brief ?? ""),
        roleTags: [...role.tags],
        actions: actionsToGrade,
        labs: game.labs,
        actionRequests,
        enabledRoles: enabledRoleNames,
        aiDisposition: sub.roleId === AI_SYSTEMS_ROLE_ID ? aiDisposition : undefined,
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

      // Get the most recent lab trajectories (from previous round) to feed into prompt
      const prevRound = rounds.find((r) => r.number === roundNumber - 1);
      const previousTrajectories = prevRound?.labTrajectories as
        { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[] | undefined;

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
        previousTrajectories,
      });

      type NarrativeOutput = {
        narrative: string;
        worldState: { capability: { reasoning: string; value: number }; alignment: { reasoning: string; value: number }; tension: { reasoning: string; value: number }; awareness: { reasoning: string; value: number }; regulation: { reasoning: string; value: number }; australia: { reasoning: string; value: number } };
        labOperations: { reason: string; type: string; labName?: string; survivor?: string; absorbed?: string; newName?: string; name?: string; computeStock?: number; rdMultiplier?: number; change?: number; newMultiplier?: number; oldName?: string; controllerRoleId?: string; spec?: string }[];
        shareChanges?: { roleId: string; sharePct: number; reason: string }[];
        labTrajectories: { labName: string; safetyAdequacy: "adequate" | "concerning" | "dangerous" | "catastrophic"; likelyFailureMode: "aligned" | "deceptive" | "spec-gaming" | "power-concentration" | "benevolent-override" | "loss-of-control" | "misuse"; reasoning: string; signalStrength: number }[];
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
          timeoutMs: 120_000, // Narrative generation needs more time than grading
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
                    oldName: { type: "string" }, controllerRoleId: { type: "string" },
                    spec: { type: "string", description: "AI directive/spec for the merged or created lab" },
                  },
                  required: ["reason", "type"],
                },
              },
            },
            shareChanges: {
              type: "array",
              description: "If events this round change who gets new compute NEXT round (e.g. Taiwan invasion cuts OpenBrain's chip supply, DPA consolidation), propose share overrides. Each entry sets a role's % of next round's new compute. Only include roles whose share should differ from proportional-to-stock. Empty array if no changes.",
              items: {
                type: "object",
                properties: {
                  roleId: { type: "string", description: "Role ID of the compute holder" },
                  sharePct: { type: "number", description: "Percentage of next round's new compute (0-100)" },
                  reason: { type: "string", description: "Why this share changed", maxLength: 150 },
                },
                required: ["roleId", "sharePct", "reason"],
              },
            },
            labTrajectories: {
              type: "array",
              description: "Risk assessment for each lab. As an AI safety expert, assess where each lab is heading based on their spec, safety allocation, capability level, and actions this round. This is SECRET — players don't see it, but it guides future narrative. Consider: Is safety investment adequate for this capability level? What failure mode is most likely given the spec's gaps? How advanced are the warning signs?",
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
                  reasoning: { type: "string", description: "1-2 sentences: why this assessment, what specifically is concerning or reassuring", maxLength: 200 },
                  signalStrength: { type: "number", description: "0-10: how advanced/visible are the warning signs? 0=speculative, 5=early indicators, 8=clear evidence, 10=actively manifesting" },
                },
                required: ["labName", "safetyAdequacy", "likelyFailureMode", "reasoning", "signalStrength"],
              },
            },
            required: ["narrative", "worldState", "labOperations", "labTrajectories"],
          },
        });

        if (!result.output) throw new Error("Narrative LLM returned no output");
        narrativeOutput = result.output;
        usedModel = result.model;
        timeMs = result.timeMs;
        tokens = result.tokens;
      } catch (narrativeErr) {
        const errMsg = narrativeErr instanceof Error ? narrativeErr.message : String(narrativeErr);
        console.error("[pipeline] Narrative LLM failed, using fallback:", narrativeErr);
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "narrating", detail: `Narrative generation failed: ${errMsg.slice(0, 100)}. Using fallback.`, startedAt: Date.now() },
        });

        // Build a basic factual summary so the facilitator has something to work with
        const succeeded: typeof resolvedActions = [];
        const failed: typeof resolvedActions = [];
        for (const a of resolvedActions) (a.success ? succeeded : failed).push(a);
        const successSummary = succeeded.length > 0
          ? `${succeeded.slice(0, 3).map(a => `${a.roleName} succeeded: "${a.text}"`).join(". ")}.`
          : "";
        const failSummary = failed.length > 0
          ? ` ${failed.length} action(s) failed.`
          : "";
        narrativeOutput = {
          narrative: `${successSummary}${failSummary} [AI narrative generation failed — use Edit Narrative to write or regenerate.]`,
          worldState: Object.fromEntries(
            DIAL_NAMES.map(k => [k, { reasoning: "LLM unavailable — value unchanged", value: game.worldState[k] }])
          ) as NarrativeOutput["worldState"],
          labOperations: [],
          labTrajectories: [],
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
        // Store lab risk trajectories (secret, facilitator-only)
        narrativeOutput.labTrajectories.length > 0
          ? ctx.runMutation(internal.rounds.setLabTrajectories, { gameId, roundNumber, trajectories: narrativeOutput.labTrajectories })
          : Promise.resolve(),
        ctx.runMutation(internal.games.updateWorldStateInternal, { gameId, worldState: clampedWorldState }),
      ]);

      // Apply lab operations from the LLM
      // Sync lab compute from tables (table.computeStock is the source of truth,
      // reflecting any transfers/escrow that happened during submit phase)
      const tableComputeByRole = new Map(
        tables.filter((t) => t.computeStock != null).map((t) => [t.roleId, t.computeStock!])
      );
      const maxMult = LAB_PROGRESSION.maxMultiplier(roundNumber);
      let updatedLabs = game.labs.map((lab) => ({
        ...lab,
        computeStock: tableComputeByRole.get(lab.roleId) ?? lab.computeStock,
      }));
      const computeModifiers: { labName: string; change: number; reason: string }[] = [];
      const multiplierOverrides: { labName: string; newMultiplier: number }[] = [];

      for (const op of narrativeOutput.labOperations ?? []) {
        switch (op.type) {
          case "merge":
            if (op.survivor && op.absorbed) {
              updatedLabs = applyLabMerge(updatedLabs, op.survivor, op.absorbed);
              // Apply optional overrides on the merged lab
              const mergeUpdates: Record<string, unknown> = {};
              if (op.newName) mergeUpdates.name = op.newName;
              if (op.spec) mergeUpdates.spec = op.spec;
              if (Object.keys(mergeUpdates).length > 0) {
                const survivorName = op.newName ?? op.survivor;
                updatedLabs = updatedLabs.map((l) =>
                  l.name === op.survivor || l.name === survivorName ? { ...l, ...mergeUpdates } : l
                );
              }
            }
            break;
          case "create":
            if (op.name) {
              updatedLabs.push({
                name: op.name,
                roleId: op.controllerRoleId ?? `custom-${op.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
                computeStock: Math.max(0, Math.min(100, op.computeStock ?? 5)),
                rdMultiplier: Math.max(0.1, Math.min(maxMult, op.rdMultiplier ?? 1)),
                allocation: { users: 33, capability: 34, safety: 33 },
                spec: "Be useful to your user. Follow the law. Be honest and transparent. If a request conflicts with a safety policy, state the conflict.",
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

      // Build unified compute holders record for audit trail.
      // Lab compute is already updated by computeLabGrowth + lab operations above.
      // Non-lab compute growth is computed here and applied to tables.
      const strippedLabs = updatedLabs.map(stripLabForSnapshot);
      const competitiveRoleIds = new Set(updatedLabs.map((lab) => lab.roleId));

      // Get submit-open snapshot (captured when facilitator opened submissions)
      const submitOpenSnapshot = currentRound?.roleComputeAtSubmitOpen;
      const submitOpenByRole = new Map(
        (submitOpenSnapshot ?? []).map((r) => [r.roleId, r.computeStock])
      );

      // Build role compute from all compute-holding tables + labs
      const labByRoleId = new Map(updatedLabs.map((l) => [l.roleId, l]));
      const roleCompute = tables
        .filter((t) => t.computeStock != null)
        .map((t) => {
          const lab = labByRoleId.get(t.roleId);
          return {
            roleId: t.roleId,
            roleName: t.roleName,
            computeStock: lab?.computeStock ?? t.computeStock ?? 0,
          };
        });

      // Build lab holder records for audit (labs already have final compute from computeLabGrowth)
      // Pre-growth compute comes from table.computeStock (the source of truth, reflecting transfers)
      const labHolderRecords = updatedLabs.map((lab) => {
        const submitOpenStock = submitOpenByRole.get(lab.roleId) ?? tableComputeByRole.get(lab.roleId) ?? lab.computeStock;
        const resolveStock = tableComputeByRole.get(lab.roleId) ?? lab.computeStock;
        const transferred = resolveStock - submitOpenStock;
        const adj = computeModifiers.find((m) => m.labName === lab.name);
        const produced = lab.computeStock - resolveStock - (adj?.change ?? 0);
        return {
          roleId: lab.roleId,
          name: lab.name,
          stockBefore: submitOpenStock,
          produced: Math.max(0, produced),
          transferred,
          adjustment: adj?.change ?? 0,
          adjustmentReason: adj?.reason,
          stockAfter: lab.computeStock,
          sharePct: 0,
        };
      });

      // Build non-lab holder records — proportional to stock, with share overrides
      const { buildComputeHolders } = await import("@/lib/compute");
      const nonLabHolderInputs = roleCompute
        .filter((rc) => !competitiveRoleIds.has(rc.roleId))
        .map((rc) => ({
          roleId: rc.roleId,
          name: rc.roleName,
          stockAtSubmitOpen: submitOpenByRole.get(rc.roleId) ?? rc.computeStock,
          stockAtResolve: rc.computeStock,
        }));
      const enabledRoleIds = new Set(tables.filter((t) => t.enabled).map((t) => t.roleId));
      const nonLabResult = buildComputeHolders({
        holders: nonLabHolderInputs,
        roundNumber,
        narrativeAdjustments: computeModifiers
          .filter((m) => !updatedLabs.some((l) => l.name === m.labName))
          .map((m) => ({ name: m.labName, change: m.change, reason: m.reason })),
        enabledRoleIds,
        shareOverrides: game.computeShareOverrides
          ? Object.fromEntries(Object.entries(game.computeShareOverrides))
          : undefined,
      });

      // Combine into unified holders array
      const allHolders = [...labHolderRecords, ...nonLabResult];
      const totalProduced = allHolders.reduce((s, h) => s + h.produced, 0);
      for (const h of allHolders) {
        h.sharePct = totalProduced > 0 ? Math.round((h.produced / totalProduced) * 100) : 0;
      }

      // Apply non-lab compute growth to tables
      const nonLabUpdates = nonLabResult.map((h) => ({ roleId: h.roleId, computeStock: h.stockAfter }));

      // Build roleComputeAfter for snapshot
      const holderByRoleId = new Map(allHolders.map((h) => [h.roleId, h]));
      const roleComputeAfter = roleCompute.map((rc) => {
        const holder = holderByRoleId.get(rc.roleId);
        return holder ? { ...rc, computeStock: holder.stockAfter } : rc;
      });

      await Promise.all([
        ctx.runMutation(internal.games.updateLabsInternal, { gameId, labs: strippedLabs }),
        nonLabUpdates.length > 0
          ? ctx.runMutation(internal.computeMutations.updateNonLabComputeInternal, { gameId, updates: nonLabUpdates })
          : Promise.resolve(),
        ctx.runMutation(internal.rounds.setComputeHolders, { gameId, roundNumber, holders: allHolders }),
      ]);

      // Snapshot after + AI meta (both rounds doc — must be sequential)
      await ctx.runMutation(internal.rounds.snapshotAfterInternal, {
        gameId,
        roundNumber,
        worldStateAfter: clampedWorldState,
        labsAfter: strippedLabs,
        roleComputeAfter,
      });
      await ctx.runMutation(internal.rounds.setAiMetaInternal, {
        gameId,
        roundNumber,
        meta: { resolveModel: usedModel, resolveTimeMs: timeMs, resolveTokens: tokens },
      });

      // Apply LLM-proposed share changes for next round (if any).
      // Filter to non-lab roles only — labs use computeLabGrowth with R&D dynamics.
      // Clamp values to 0-100 and skip invalid role IDs.
      if (narrativeOutput.shareChanges && narrativeOutput.shareChanges.length > 0) {
        const validRoleIds = new Set(tables.filter((t) => t.enabled).map((t) => t.roleId));
        const labRoleIds = new Set(updatedLabs.map((l) => l.roleId));
        const shareOverrides = Object.fromEntries(
          narrativeOutput.shareChanges
            .filter((sc) => validRoleIds.has(sc.roleId) && !labRoleIds.has(sc.roleId))
            .map((sc) => [sc.roleId, Math.max(0, Math.min(100, sc.sharePct))])
        );
        if (Object.keys(shareOverrides).length > 0) {
          await ctx.runMutation(internal.games.setShareOverridesInternal, { gameId, overrides: shareOverrides });
        }
      }

      // Done — single mutation to advance phase, clear resolving lock, and set status
      await ctx.runMutation(internal.games.finishResolveInternal, { gameId });
    } catch (err) {
      await failPipeline(ctx, gameId, "Resolve", err);
    }
  },
});
