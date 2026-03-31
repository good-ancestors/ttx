"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS, RESOLVE_MODELS, NARRATIVE_MODELS } from "./aiModels";
import {
  buildGradingPrompt,
  buildResolvePrompt,
  buildNarrativeFromEventsPrompt,
  type ActionRequest,
} from "@/lib/ai-prompts";
import {
  ROLES,
  LAB_PROGRESSION,
  stripLabForSnapshot,
  getAiInfluencePower,
  autoGenerateInfluence,
  computeLabGrowth,
} from "@/lib/game-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type Game = Doc<"games">;
type Submission = Doc<"submissions">;
type Round = Doc<"rounds">;
type Table = Doc<"tables">;

interface ResolvedEvent {
  id: string;
  description: string;
  visibility: "public" | "covert";
  actors: string[];
  worldImpact?: string;
  sourceActions?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      // Advance to rolling phase so players see action reveal + influence panel
      await ctx.runMutation(internal.games.advancePhaseInternal, { gameId, phase: "rolling" });

      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");

      const submissions: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
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

      let completed = 0;
      await Promise.all(ungraded.map(async (sub) => {
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
          roleTags: role.tags as string[],
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
        } catch (err) {
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
        await ctx.runMutation(internal.games.updatePipelineStatus, {
          gameId,
          status: { step: "grading", detail: `Evaluating submissions...`, progress: `${completed}/${total}`, startedAt: Date.now() },
        });
      }));

      // Schedule next stage: influence
      await ctx.scheduler.runAfter(0, internal.pipeline.awaitInfluence, {
        gameId,
        roundNumber,
        aiDisposition,
      });
    } catch (err) {
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "error", error: `Grading failed: ${err instanceof Error ? err.message : String(err)}`, startedAt: Date.now() },
      });
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
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
          // Human AI player: set status and schedule timeout
          await ctx.runMutation(internal.games.updatePipelineStatus, {
            gameId,
            status: { step: "influence", detail: "Waiting for all players...", startedAt: Date.now() },
          });

          // Schedule timeout fallback (30 seconds)
          await ctx.scheduler.runAfter(30_000, internal.pipeline.influenceTimeout, {
            gameId,
            roundNumber,
            aiDisposition,
          });
          // The human player submitting influence will trigger rollAndResolve
          return;
        } else {
          // NPC/AI: auto-generate influence
          await ctx.runMutation(internal.games.updatePipelineStatus, {
            gameId,
            status: { step: "influence", detail: "Processing...", startedAt: Date.now() },
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
      await ctx.scheduler.runAfter(0, internal.pipeline.rollAndResolve, {
        gameId,
        roundNumber,
        aiDisposition,
      });
    } catch (err) {
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "error", error: `Influence failed: ${err instanceof Error ? err.message : String(err)}`, startedAt: Date.now() },
      });
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
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
    await ctx.scheduler.runAfter(0, internal.pipeline.rollAndResolve, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      aiDisposition: args.aiDisposition,
    });
  },
});

// ─── Stage 3: Roll dice + resolve events ──────────────────────────────────────

export const rollAndResolve = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;
    let { aiDisposition } = args;

    try {
      // If aiDisposition not passed (e.g. triggered by human influence submit), resolve from table data
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

      // Generate resolve nonce
      const nonce = generateNonce();
      await ctx.runMutation(internal.rounds.setResolveNonce, { gameId, roundNumber, nonce });
      await ctx.runMutation(internal.games.setResolveNonce, { gameId, nonce });

      // Snapshot before resolve
      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");
      await ctx.runMutation(internal.rounds.snapshotBeforeInternal, {
        gameId,
        roundNumber,
        worldStateBefore: game.worldState as { capability: number; alignment: number; tension: number; awareness: number; regulation: number; australia: number },
        labsBefore: game.labs.map(stripLabForSnapshot),
      });

      // Build resolve prompt
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "resolving", detail: "Resolving events...", startedAt: Date.now() },
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

      const roleCompute = tables
        .filter((t) => t.enabled && (t.computeStock ?? 0) > 0)
        .map((t) => ({ roleId: t.roleId, roleName: t.roleName, computeStock: t.computeStock ?? 0 }));

      const prompt = buildResolvePrompt({
        round: roundNumber,
        roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
        roundTitle: currentRound?.title ?? "",
        worldState: game.worldState,
        resolvedActions,
        labs: game.labs,
        roleCompute,
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

      // Call LLM for resolve with tool_use for guaranteed schema
      const { output, model: usedModel, timeMs, tokens } = await callAnthropic<{
        resolvedEvents: ResolvedEvent[];
        worldState: { capability: number; alignment: number; tension: number; awareness: number; regulation: number; australia: number };
        roleComputeUpdates?: { roleId: string; newComputeStock: number }[];
      }>({
        models: RESOLVE_MODELS,
        prompt,
        maxTokens: 8192,
        toolName: "resolve_round",
        schema: {
          type: "object",
          properties: {
            resolvedEvents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  description: { type: "string" },
                  visibility: { type: "string", enum: ["public", "covert"] },
                  actors: { type: "array", items: { type: "string" } },
                  worldImpact: { type: "string" },
                  sourceActions: { type: "array", items: { type: "string" } },
                },
                required: ["id", "description", "visibility", "actors"],
              },
            },
            worldState: {
              type: "object",
              properties: {
                capability: { type: "number" },
                alignment: { type: "number" },
                tension: { type: "number" },
                awareness: { type: "number" },
                regulation: { type: "number" },
                australia: { type: "number" },
              },
              required: ["capability", "alignment", "tension", "awareness", "regulation", "australia"],
            },
            roleComputeUpdates: {
              type: "array",
              items: {
                type: "object",
                properties: { roleId: { type: "string" }, newComputeStock: { type: "number" } },
                required: ["roleId", "newComputeStock"],
              },
            },
          },
          required: ["resolvedEvents", "worldState"],
        },
      });

      if (!output) throw new Error("Resolve LLM returned no output");
      if (!output.resolvedEvents) throw new Error(`Resolve output missing resolvedEvents. Got keys: ${Object.keys(output).join(", ")}`);
      if (!output.worldState) throw new Error(`Resolve output missing worldState. Got keys: ${Object.keys(output).join(", ")}`);

      // Write resolved events (nonce-checked)
      // Coerce worldImpact to string if the LLM returned an object
      await ctx.runMutation(internal.rounds.applyResolutionInternal, {
        gameId,
        roundNumber,
        nonce,
        resolvedEvents: (output.resolvedEvents ?? []).map((e) => ({
          id: e.id ?? `event-${Math.random().toString(36).slice(2)}`,
          description: String(e.description ?? ""),
          visibility: (e.visibility === "covert" ? "covert" : "public") as "public" | "covert",
          actors: Array.isArray(e.actors) ? e.actors.map(String) : [],
          sourceActions: Array.isArray(e.sourceActions) ? e.sourceActions.map(String) : [],
          worldImpact: typeof e.worldImpact === "string" ? e.worldImpact
            : e.worldImpact ? JSON.stringify(e.worldImpact) : undefined,
        })),
      });

      // Apply world state changes (clamped)
      const maxDelta = roundNumber >= 3 ? 4 : 3;
      const clamp = (newVal: number, current: number) => {
        const clamped = Math.max(0, Math.min(10, Math.round(newVal)));
        const delta = clamped - current;
        return Math.abs(delta) > maxDelta ? current + Math.sign(delta) * maxDelta : clamped;
      };
      const ws = game.worldState;
      const clampedWorldState = {
        capability: clamp(output.worldState.capability ?? ws.capability, ws.capability),
        alignment: clamp(output.worldState.alignment ?? ws.alignment, ws.alignment),
        tension: clamp(output.worldState.tension ?? ws.tension, ws.tension),
        awareness: clamp(output.worldState.awareness ?? ws.awareness, ws.awareness),
        regulation: clamp(output.worldState.regulation ?? ws.regulation, ws.regulation),
        australia: clamp(output.worldState.australia ?? ws.australia, ws.australia),
      };
      await ctx.runMutation(internal.games.updateWorldStateInternal, { gameId, worldState: clampedWorldState });

      // Apply lab progression using the shared growth model
      const maxMult = LAB_PROGRESSION.maxMultiplier(roundNumber);
      const ceoAllocations = new Map<string, { users: number; capability: number; safety: number }>();
      // Use allocations from submissions if CEOs submitted this round
      for (const sub of submissions) {
        if (sub.computeAllocation) {
          const lab = game.labs.find((l) => l.roleId === sub.roleId);
          if (lab) ceoAllocations.set(lab.name, sub.computeAllocation);
        }
      }
      const updatedLabs = computeLabGrowth(game.labs, ceoAllocations, roundNumber, maxMult);
      await ctx.runMutation(internal.games.updateLabsInternal, { gameId, labs: updatedLabs.map(stripLabForSnapshot) });

      // Snapshot after
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

      // Schedule narrate
      await ctx.scheduler.runAfter(0, internal.pipeline.narrate, { gameId, roundNumber });
    } catch (err) {
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "error", error: `Resolve failed: ${err instanceof Error ? err.message : String(err)}`, startedAt: Date.now() },
      });
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
    }
  },
});

// ─── Stage 4: Generate narrative ──────────────────────────────────────────────

export const narrate = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;

    try {
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "narrating", detail: "Writing narrative...", startedAt: Date.now() },
      });

      const game = await ctx.runQuery(internal.games.getInternal, { gameId });
      if (!game) throw new Error("Game not found");
      const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
      const currentRound = rounds.find((r) => r.number === roundNumber);

      if (!currentRound?.resolvedEvents?.length) throw new Error("No resolved events to narrate");

      const worldStateAfter = currentRound.worldStateAfter ?? game.worldState;
      const prevRound = rounds.find((r) => r.number === roundNumber - 1);
      const worldStateBefore = prevRound?.worldStateAfter ?? game.worldState;

      const prompt = buildNarrativeFromEventsPrompt({
        round: roundNumber,
        roundLabel: currentRound.label,
        roundTitle: currentRound.title,
        resolvedEvents: currentRound.resolvedEvents as ResolvedEvent[],
        worldStateBefore: worldStateBefore as Record<string, number>,
        worldStateAfter: worldStateAfter as Record<string, number>,
        previousRounds: rounds
          .filter((r) => r.number < roundNumber && r.summary)
          .map((r) => ({ number: r.number, label: r.label, narrative: r.summary?.narrative })),
      });

      const { output, model: usedModel, timeMs, tokens } = await callAnthropic<{ narrative: string; headlines: string[] }>({
        models: NARRATIVE_MODELS,
        prompt,
        maxTokens: 2048,
        toolName: "write_narrative",
        schema: {
          type: "object",
          properties: {
            narrative: { type: "string", description: "6-8 sentences, read aloud by facilitator in ~60-90s" },
            headlines: { type: "array", items: { type: "string" }, description: "4-6 punchy ALL CAPS news headlines" },
          },
          required: ["narrative", "headlines"],
        },
      });

      if (output) {
        await ctx.runMutation(internal.rounds.applySummaryInternal, {
          gameId,
          roundNumber,
          summary: {
            narrative: output.narrative,
            headlines: output.headlines ?? [],
            geopoliticalEvents: [],
            aiStateOfPlay: [],
          },
        });

        await ctx.runMutation(internal.rounds.setAiMetaInternal, {
          gameId,
          roundNumber,
          meta: { narrativeModel: usedModel, narrativeTimeMs: timeMs, narrativeTokens: tokens },
        });
      }

      // Done — advance to narrate phase and clean up
      await ctx.runMutation(internal.games.advancePhaseInternal, { gameId, phase: "narrate" });
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "done", detail: "Resolution complete", startedAt: Date.now() },
      });
    } catch (err) {
      await ctx.runMutation(internal.games.updatePipelineStatus, {
        gameId,
        status: { step: "error", error: `Narrate failed: ${err instanceof Error ? err.message : String(err)}`, startedAt: Date.now() },
      });
      await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
    }
  },
});
