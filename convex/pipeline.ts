"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ─── Pipeline Stage 1: Grade all ungraded submissions ─────────────────────────

export const gradeAll = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, aiDisposition } = args;

    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "grading", detail: "Evaluating actions...", startedAt: Date.now() },
    });

    // TODO: Implement LLM grading calls
    // For now, advance to next stage
    await ctx.runMutation(internal.games.advancePhaseInternal, {
      gameId,
      phase: "rolling",
    });

    // Schedule influence step
    await ctx.scheduler.runAfter(0, internal.pipeline.awaitInfluence, {
      gameId,
      roundNumber,
      aiDisposition,
    });
  },
});

// ─── Pipeline Stage 2: Wait for AI influence ──────────────────────────────────

export const awaitInfluence = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, aiDisposition } = args;

    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "influence", detail: "Waiting for all players...", startedAt: Date.now() },
    });

    // TODO: Check if human AI player, wait/poll, or auto-generate for NPC
    // For now, schedule roll immediately
    await ctx.scheduler.runAfter(0, internal.pipeline.rollAndResolve, {
      gameId,
      roundNumber,
      aiDisposition,
    });
  },
});

// ─── Pipeline Stage 3: Roll dice + resolve events ─────────────────────────────

export const rollAndResolve = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;

    // Roll dice
    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "rolling", detail: "Rolling dice...", startedAt: Date.now() },
    });
    await ctx.runMutation(internal.submissions.rollAllInternal, { gameId, roundNumber });

    // Resolve events
    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "resolving", detail: "Resolving events...", startedAt: Date.now() },
    });

    // TODO: Call Anthropic API for resolve, write partial events, apply results

    // Schedule narrate
    await ctx.scheduler.runAfter(0, internal.pipeline.narrate, {
      gameId,
      roundNumber,
    });
  },
});

// ─── Pipeline Stage 4: Generate narrative ─────────────────────────────────────

export const narrate = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;

    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "narrating", detail: "Writing narrative...", startedAt: Date.now() },
    });

    // TODO: Call Anthropic API for narrative, write summary

    // Advance to narrate phase and clean up
    await ctx.runMutation(internal.games.advancePhaseInternal, { gameId, phase: "narrate" });
    await ctx.runMutation(internal.games.setResolvingInternal, { gameId, resolving: false });
    await ctx.runMutation(internal.games.updatePipelineStatus, {
      gameId,
      status: { step: "done", detail: "Resolution complete", startedAt: Date.now() },
    });
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
    // Check if we're still waiting for influence (another path may have already advanced)
    const game = await ctx.runQuery(internal.games.getInternal, { gameId: args.gameId });
    if (!game?.pipelineStatus || game.pipelineStatus.step !== "influence") return;

    // Timeout reached — proceed to roll
    await ctx.scheduler.runAfter(0, internal.pipeline.rollAndResolve, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      aiDisposition: args.aiDisposition,
    });
  },
});
