"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS, RESOLVE_MODELS } from "./aiModels";
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

// Shared error handler for pipeline stages — avoids 4x duplication
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function failPipeline(ctx: any, gameId: string, stage: string, err: unknown) {
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

function defaultProbability(priority: number): number {
  if (priority >= 8) return 70;
  if (priority >= 5) return 50;
  return 30;
}

// ─── Stage 1: Grade all ungraded submissions ──────────────────────────────────

export const gradeAll = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, aiDisposition } = args;

    try {
      // Check for missing AI/NPC submissions before proceeding
      const allTables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
      const existingSubs: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
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
        // generateAll writes submissions directly — no wait needed
      }

      // Advance to rolling phase so players see action reveal + influence panel
      await ctx.runMutation(internal.games.advancePhaseInternal, { gameId, phase: "rolling" });

      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");

      const submissions: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
      if (submissions.length === 0) throw new Error("No submissions to resolve — all tables must submit first");

      const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
      const requests = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });
      const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
      const enabledRoleNames = tables.filter((t) => t.enabled).map((t) => t.roleName);

      // Grade each submission in parallel
      const ungraded = submissions.filter((s) => s.actions.some((a) => a.probability == null));
      const total = ungraded.length;

      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "grading", detail: `Evaluating ${total} submissions...`, progress: `0/${total}`, startedAt: Date.now() },
      });

      // Grade in batches — progress updates at batch boundaries to avoid OCC conflicts
      const GRADING_CONCURRENCY = 12;
      let completed = 0;
      for (let batch = 0; batch < ungraded.length; batch += GRADING_CONCURRENCY) {
        const batchSubs = ungraded.slice(batch, batch + GRADING_CONCURRENCY);
        await Promise.all(batchSubs.map(async (sub) => {
        const role = ROLES.find((r) => r.id === sub.roleId);
        if (!role) return;

        const otherSubs = submissions
          .filter((s) => s.roleId !== sub.roleId)
          .map((s) => ({
            roleName: ROLES.find((r) => r.id === s.roleId)?.name ?? s.roleId,
            actions: s.actions.map((a) => ({ text: a.text, priority: a.priority })),
          }));

        const actionRequests: ActionRequest[] = (requests ?? [])
          .filter((r) => r.fromRoleId === sub.roleId || r.toRoleId === sub.roleId)
          .map((r) => ({
            actionText: r.actionText,
            fromRoleName: r.fromRoleName,
            toRoleName: r.toRoleName,
            requestType: r.requestType,
            computeAmount: r.computeAmount,
            status: r.status,
          }));

        const labSpec = game.labs.find((l) => l.roleId === sub.roleId)?.spec;

        const prompt = buildGradingPrompt({
          round: roundNumber,
          roundLabel: rounds.find((r) => r.number === roundNumber)?.label ?? `Round ${roundNumber}`,
          worldState: game.worldState,
          roleName: role.name,
          roleDescription: role.brief ?? "",
          roleTags: [...role.tags],
          actions: sub.actions.map((a) => ({ text: a.text, priority: a.priority })),
          labs: game.labs,
          actionRequests,
          enabledRoles: enabledRoleNames,
          aiDisposition: sub.roleId === "ai-systems" ? aiDisposition : undefined,
          otherSubmissions: otherSubs,
          labSpec,
        });

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
            const gradedActions = sub.actions.map((action, i) => ({
              ...action,
              probability: output.actions[i]?.probability ?? defaultProbability(action.priority),
              reasoning: output.actions[i]?.reasoning,
            }));
            await ctx.runMutation(internal.submissions.applyGradingInternal, {
              submissionId: sub._id,
              actions: gradedActions,
            });
          } else {
            // Fallback: assign default probabilities
            const gradedActions = sub.actions.map((action) => ({
              ...action,
              probability: defaultProbability(action.priority),
            }));
            await ctx.runMutation(internal.submissions.applyGradingInternal, {
              submissionId: sub._id,
              actions: gradedActions,
            });
          }
        } catch {
          // Fallback on any error
          const gradedActions = sub.actions.map((action) => ({
            ...action,
            probability: defaultProbability(action.priority),
          }));
          await ctx.runMutation(internal.submissions.applyGradingInternal, {
            submissionId: sub._id,
            actions: gradedActions,
          });
        }

        completed++;
      }));

        // Update progress at batch boundary (single mutation per batch avoids OCC conflicts)
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "grading", detail: `Evaluating submissions...`, progress: `${completed}/${total}`, startedAt: Date.now() },
        });
      } // end batch loop

      // Schedule next stage: influence
      await ctx.scheduler.runAfter(0, internal.pipeline.awaitInfluence, {
        gameId,
        roundNumber,
        aiDisposition,
      });
    } catch (err) {
      await failPipeline(ctx, gameId, "Grading", err);
    }
  },
});

// ─── Stage 2: Wait for AI influence ───────────────────────────────────────────

export const awaitInfluence = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, aiDisposition } = args;

    try {
      const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
      const aiSystemsTable = tables.find((t) => t.roleId === "ai-systems" && t.enabled);

      if (aiSystemsTable?.aiDisposition) {
        if (aiSystemsTable.controlMode === "human") {
          // Check if influence was already submitted (player may have acted during grading)
          const submissions: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
          const alreadyInfluenced = submissions.some((s) => s.actions.some((a) => a.aiInfluence != null));

          if (!alreadyInfluenced) {
            // Human AI player: set status and schedule timeout
            await ctx.runMutation(internal.games.updatePipelineStatus, {
              gameId,
              status: { step: "influence", detail: "Preparing dice rolls...", startedAt: Date.now() },
            });

            // Schedule timeout fallback (30 seconds)
            await ctx.scheduler.runAfter(30_000, internal.pipeline.influenceTimeout, {
              gameId,
              roundNumber,
              aiDisposition,
            });
            // The human player submitting influence will trigger rollAndNarrate
            return;
          }
          // Influence already submitted — skip wait and proceed
        } else {
          // NPC/AI: auto-generate influence
          await ctx.runMutation(internal.games.updatePipelineStatus, {
            gameId,
            status: { step: "influence", detail: "Preparing dice rolls...", startedAt: Date.now() },
          });

          const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");
          const submissions: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
          const power = getAiInfluencePower(game.labs);

          const allActions = submissions.flatMap((sub) =>
            sub.actions.map((a, i) => ({
              submissionId: sub._id as string,
              actionIndex: i,
              text: a.text,
              roleId: sub.roleId,
            }))
          );
          const influence = autoGenerateInfluence(aiSystemsTable.aiDisposition, allActions, power);
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

      // No human wait needed — proceed to roll
      await ctx.scheduler.runAfter(0, internal.pipeline.rollAndNarrate, {
        gameId,
        roundNumber,
        aiDisposition,
      });
    } catch (err) {
      await failPipeline(ctx, gameId, "Influence", err);
    }
  },
});

// ─── Influence timeout fallback ───────────────────────────────────────────────

export const influenceTimeout = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const game: Game | null = await ctx.runQuery(internal.games.getInternal, { gameId: args.gameId });
    if (!game?.pipelineStatus || game.pipelineStatus.step !== "influence") return;

    // Timeout — proceed to roll
    await ctx.scheduler.runAfter(0, internal.pipeline.rollAndNarrate, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      aiDisposition: args.aiDisposition,
    });
  },
});

// ─── Stage 3: Roll dice + narrate (merged resolve+narrate) ────────────────────


export const rollAndNarrate = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  // eslint-disable-next-line complexity
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;
    let { aiDisposition } = args;

    try {
      // Resolve aiDisposition from table if not passed
      if (!aiDisposition) {
        const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
        const aiTable = tables.find((t) => t.roleId === "ai-systems" && t.aiDisposition);
        if (aiTable?.aiDisposition) {
          const { getDisposition } = await import("@/lib/game-data");
          const disp = getDisposition(aiTable.aiDisposition);
          if (disp) aiDisposition = { label: disp.label, description: disp.description };
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
      await ctx.runMutation(internal.rounds.setResolveNonce, { gameId, roundNumber, nonce });
      await ctx.runMutation(internal.games.setResolveNonce, { gameId, nonce });

      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");

      await ctx.runMutation(internal.rounds.snapshotBeforeInternal, {
        gameId,
        roundNumber,
        worldStateBefore: game.worldState as { capability: number; alignment: number; tension: number; awareness: number; regulation: number; australia: number },
        labsBefore: game.labs.map(stripLabForSnapshot),
      });

      // Start narrative LLM call — runs in parallel with dice reveal animation on client
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "narrating", detail: "Writing the story...", startedAt: Date.now() },
      });

      const submissions: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
      const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
      const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
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
        roundTitle: currentRound?.title ?? "",
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
      const { output, model: usedModel, timeMs, tokens } = await callAnthropic<{
        narrative: string;
        worldState: { capability: { reasoning: string; value: number }; alignment: { reasoning: string; value: number }; tension: { reasoning: string; value: number }; awareness: { reasoning: string; value: number }; regulation: { reasoning: string; value: number }; australia: { reasoning: string; value: number } };
        labOperations: { reason: string; type: string; labName?: string; survivor?: string; absorbed?: string; newName?: string; name?: string; computeStock?: number; rdMultiplier?: number; change?: number; newMultiplier?: number; oldName?: string }[];
      }>({
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
              const dials = ["capability", "alignment", "tension", "awareness", "regulation", "australia"];
              return {
                type: "object",
                description: "For each dial, reason about the change BEFORE giving the value",
                properties: Object.fromEntries(dials.map((d) => [d, dialSchema])),
                required: dials,
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

      if (!output) throw new Error("Narrative LLM returned no output");

      // Nonce check before applying changes
      const gameAfterRoll = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (gameAfterRoll?.resolveNonce !== nonce) {
        console.warn("[pipeline] Nonce mismatch — another run won. Aborting.");
        return;
      }

      // Write narrative
      await ctx.runMutation(internal.rounds.applySummaryInternal, {
        gameId,
        roundNumber,
        summary: {
          narrative: output.narrative,
          headlines: [],
          geopoliticalEvents: [],
          aiStateOfPlay: [],
        },
      });

      // Apply world state (clamped)
      const maxDelta = roundNumber >= 3 ? 4 : 3;
      const clamp = (newVal: number, current: number) => {
        if (!Number.isFinite(newVal)) return current;
        const clamped = Math.max(0, Math.min(10, Math.round(newVal)));
        const delta = clamped - current;
        return Math.abs(delta) > maxDelta ? current + Math.sign(delta) * maxDelta : clamped;
      };
      const ws = game.worldState;
      const ows = output.worldState;
      const dials = ["capability", "alignment", "tension", "awareness", "regulation", "australia"] as const;
      const clampedWorldState = Object.fromEntries(
        dials.map((d) => [d, clamp(ows[d]?.value ?? ws[d], ws[d])])
      ) as typeof ws;
      await ctx.runMutation(internal.games.updateWorldStateInternal, { gameId, worldState: clampedWorldState });

      // Apply lab operations from the LLM
      const maxMult = LAB_PROGRESSION.maxMultiplier(roundNumber);
      let updatedLabs = [...game.labs];
      const computeModifiers: { labName: string; change: number; reason: string }[] = [];

      for (const op of output.labOperations ?? []) {
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
              const clampedMult = Math.max(0.1, Math.min(maxMult, op.newMultiplier));
              updatedLabs = updatedLabs.map((l) =>
                l.name === op.labName ? { ...l, rdMultiplier: clampedMult } : l
              );
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

      await ctx.runMutation(internal.games.updateLabsInternal, { gameId, labs: updatedLabs.map(stripLabForSnapshot) });

      // Record compute changes for facilitator review
      const baselineByLab = new Map(updatedLabs.map((l) => {
        const before = game.labs.find((g) => g.name === l.name)?.computeStock ?? 0;
        return [l.name, l.computeStock - before];
      }));
      const baselineTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;

      await ctx.runMutation(internal.rounds.setComputeChanges, {
        gameId,
        roundNumber,
        computeChanges: {
          newComputeTotal: baselineTotal,
          baselineTotal,
          distribution: updatedLabs.map((lab) => {
            const totalChange = baselineByLab.get(lab.name) ?? 0;
            const mod = computeModifiers.find((m) => m.labName === lab.name);
            const baseline = mod ? totalChange - mod.change : totalChange;
            return {
              labName: lab.name,
              baseline: Math.round(baseline),
              modifier: mod?.change ?? 0,
              reason: mod?.reason,
              newTotal: Math.round(lab.computeStock),
            };
          }),
        },
      });

      // Snapshot after
      const roleCompute = tables
        .filter((t) => t.enabled && (t.computeStock ?? 0) > 0)
        .map((t) => ({ roleId: t.roleId, roleName: t.roleName, computeStock: t.computeStock ?? 0 }));

      await ctx.runMutation(internal.rounds.snapshotAfterInternal, {
        gameId,
        roundNumber,
        worldStateAfter: clampedWorldState,
        labsAfter: updatedLabs.map(stripLabForSnapshot),
        roleComputeAfter: roleCompute,
      });

      // Store AI meta
      await ctx.runMutation(internal.rounds.setAiMetaInternal, {
        gameId,
        roundNumber,
        meta: { resolveModel: usedModel, resolveTimeMs: timeMs, resolveTokens: tokens },
      });

      // Done — advance to narrate phase and clean up
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
