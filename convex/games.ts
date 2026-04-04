import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ROLES, ROUND_CONFIGS, DEFAULT_WORLD_STATE, DEFAULT_LABS, AI_SYSTEMS_ROLE_ID } from "./gameData";
import { logEvent, assertFacilitator } from "./events";
import { worldStateValidator, labSnapshotValidator } from "./schema";
import { internal } from "./_generated/api";

const LOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes

function assertNotResolving(game: { resolving?: boolean; resolvingStartedAt?: number }) {
  if (game.resolving && game.resolvingStartedAt && Date.now() - game.resolvingStartedAt < LOCK_TTL_MS) {
    throw new Error("Resolution already in progress");
  }
}

/** Pre-generate AI/NPC actions so they're ready before submissions open. */
async function schedulePreGeneration(ctx: MutationCtx, gameId: Id<"games">, roundNumber: number) {
  await ctx.scheduler.runAfter(0, internal.aiGenerate.generateAll, { gameId, roundNumber });
}

/** Auto-snapshot a round's final state (world state, labs, role compute). */
async function snapshotRound(ctx: MutationCtx, gameId: Id<"games">, roundNumber: number) {
  const game = await ctx.db.get(gameId);
  if (!game) return;
  const rounds = await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  const round = rounds.find((r) => r.number === roundNumber);
  if (!round || round.worldStateAfter) return; // Already snapshotted
  const tables = await ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  await ctx.db.patch(round._id, {
    worldStateAfter: game.worldState,
    labsAfter: game.labs,
    roleComputeBefore: round.roleComputeBefore,
    roleComputeAfter: tables.filter((t) => t.computeStock != null).map((t) => ({
      roleId: t.roleId, roleName: t.roleName, computeStock: t.computeStock ?? 0,
    })),
  });
}

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const create = mutation({
  args: {
    tableCount: v.optional(v.number()),
    name: v.optional(v.string()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const tableCount = Math.min(17, Math.max(1, args.tableCount ?? 6));

    const gameId = await ctx.db.insert("games", {
      name: args.name?.trim() || undefined,
      status: "lobby",
      currentRound: 1,
      phase: "discuss",
      worldState: DEFAULT_WORLD_STATE,
      labs: DEFAULT_LABS,
      locked: false,
    });

    // Create tables for all roles — required roles are always enabled,
    // optional roles enabled up to tableCount. All start as AI-controlled
    // until a human joins. Roles are ordered by priority in the ROLES array.
    const requiredIds = new Set(["openbrain-ceo", "deepcent-ceo", AI_SYSTEMS_ROLE_ID]);
    let enabledCount = 0;

    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i];
      const isRequired = requiredIds.has(role.id);
      const enabled = isRequired || enabledCount < tableCount;
      if (enabled && !isRequired) enabledCount++;
      if (isRequired) enabledCount++; // required count toward total

      await ctx.db.insert("tables", {
        gameId,
        roleId: role.id,
        roleName: role.name,
        joinCode: generateJoinCode(),
        connected: false,
        controlMode: "ai",
        enabled,
        computeStock: ("startingComputeStock" in role ? role.startingComputeStock : undefined) as number | undefined,
      });
    }

    // Create all 3 rounds
    for (const config of ROUND_CONFIGS) {
      await ctx.db.insert("rounds", {
        gameId,
        number: config.number,
        label: config.label,
      });
    }

    return gameId;
  },
});

export const get = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").order("desc").take(20);
    if (games.length === 0) return [];

    // Batch-fetch all tables for listed games in a single pass per game
    // (Convex requires index queries per game, but we parallelise them)
    const allTablesArrays = await Promise.all(
      games.map((game) =>
        ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", game._id)).collect()
      )
    );

    return games.map((game, i) => {
      const tables = allTablesArrays[i];
      return {
        ...game,
        enabledCount: tables.filter((t) => t.enabled).length,
        connectedCount: tables.filter((t) => t.connected).length,
      };
    });
  },
});

export const rename = mutation({
  args: { gameId: v.id("games"), name: v.string(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    await ctx.db.patch(args.gameId, { name: args.name.trim() || undefined });
  },
});

export const remove = mutation({
  args: {
    gameId: v.id("games"),
    confirmation: v.string(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    if (args.confirmation !== "DELETE") {
      throw new Error("Type DELETE to confirm");
    }
    // Fetch all related data in parallel
    const [tables, submissions, rounds, requests, events] = await Promise.all([
      ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("submissions").withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("requests").withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("events").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
    ]);
    // Delete all documents
    const allDocs = [...tables, ...submissions, ...rounds, ...requests, ...events];
    for (const doc of allDocs) await ctx.db.delete(doc._id);
    await ctx.db.delete(args.gameId);
  },
});

export const advancePhase = mutation({
  args: {
    gameId: v.id("games"),
    phase: v.union(
      v.literal("discuss"),
      v.literal("submit"),
      v.literal("rolling"),
      v.literal("narrate")
    ),
    durationSeconds: v.optional(v.number()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const phaseEndsAt = args.durationSeconds
      ? Date.now() + args.durationSeconds * 1000
      : undefined;

    await ctx.db.patch(args.gameId, {
      phase: args.phase,
      phaseEndsAt,
    });
    await logEvent(ctx, args.gameId, "phase_change", undefined, { phase: args.phase, durationSeconds: args.durationSeconds });
  },
});

export const updateWorldState = mutation({
  args: {
    gameId: v.id("games"),
    worldState: worldStateValidator,
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    await ctx.db.patch(args.gameId, { worldState: args.worldState });
  },
});

export const updateLabs = mutation({
  args: {
    gameId: v.id("games"),
    labs: v.array(labSnapshotValidator),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    await ctx.db.patch(args.gameId, { labs: args.labs });
  },
});

export const updateLabSpec = mutation({
  args: {
    gameId: v.id("games"),
    labName: v.string(),
    spec: v.string(),
  },
  handler: async (ctx, args) => {
    // No facilitator auth — intentionally unprotected because BOTH facilitators
    // and lab CEO players call this (players set their lab's focus description).
    if (args.spec.length > 2000) {
      throw new Error(`Lab spec too long: ${args.spec.length}/2000 characters`);
    }
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    const updatedLabs = game.labs.map((lab) =>
      lab.name === args.labName ? { ...lab, spec: args.spec } : lab
    );
    await ctx.db.patch(args.gameId, { labs: updatedLabs });
  },
});

export const updateTableCompute = mutation({
  args: {
    tableId: v.id("tables"),
    computeStock: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    await ctx.db.patch(args.tableId, { computeStock: args.computeStock });
  },
});

export const lock = mutation({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    await ctx.db.patch(args.gameId, { locked: true });
  },
});

export const startGame = mutation({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game must be in lobby to start");
    await ctx.db.patch(args.gameId, {
      status: "playing",
      phase: "discuss",
      phaseEndsAt: undefined,
      resolving: false,
      resolvingStartedAt: undefined,
      pipelineStatus: undefined,
    });
    await logEvent(ctx, args.gameId, "game_start");
    await schedulePreGeneration(ctx, args.gameId, 1);
  },
});

export const advanceRound = mutation({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game || game.currentRound >= 4) return;

    await snapshotRound(ctx, args.gameId, game.currentRound);

    const nextRound = game.currentRound + 1;
    await ctx.db.patch(args.gameId, {
      currentRound: nextRound,
      phase: "discuss",
      phaseEndsAt: undefined,
    });
    await logEvent(ctx, args.gameId, "round_advance", undefined, { round: nextRound });
    await schedulePreGeneration(ctx, args.gameId, nextRound);
  },
});

export const restoreSnapshot = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    useBefore: v.optional(v.boolean()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error(`Game ${args.gameId} not found`);

    const rounds = await ctx.db.query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) throw new Error(`Round ${args.roundNumber} not found for game ${args.gameId}`);

    // Choose before or after snapshot
    const ws = args.useBefore ? round.worldStateBefore : round.worldStateAfter;
    const labs = args.useBefore ? round.labsBefore : round.labsAfter;
    const snapshotType = args.useBefore ? "before" : "after";
    if (!ws || !labs) throw new Error(`No ${snapshotType} snapshot data for round ${args.roundNumber}`);

    // Restore world state, labs, round, and phase
    // "Before resolve" → rewind to submit phase of that round (re-resolve)
    // "After resolve" → rewind to narrate phase of that round (re-narrate or advance)
    await ctx.db.patch(args.gameId, {
      worldState: ws,
      labs,
      currentRound: args.roundNumber,
      phase: args.useBefore ? "submit" : "narrate",
      phaseEndsAt: undefined,
      resolving: false,
      pipelineStatus: undefined,
    });

    // Clear resolution data on this round if restoring to "before"
    if (args.useBefore) {
      await ctx.db.patch(round._id, {
        resolvedEvents: undefined,
        summary: undefined,
        computeChanges: undefined,
        worldStateAfter: undefined,
        labsAfter: undefined,
        roleComputeAfter: undefined,
        partialEvents: undefined,
      });
    }

    const roleComputeSnapshot = args.useBefore ? round.roleComputeBefore : round.roleComputeAfter;
    if (roleComputeSnapshot) {
      const tables = await ctx.db.query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect();
      for (const rc of roleComputeSnapshot) {
        const table = tables.find((t) => t.roleId === rc.roleId);
        if (table) {
          await ctx.db.patch(table._id, { computeStock: rc.computeStock });
        }
      }
    }

    await logEvent(ctx, args.gameId, "snapshot_restored", undefined, {
      restoredFromRound: args.roundNumber,
      type: args.useBefore ? "before" : "after",
    });
  },
});

export const skipTimer = mutation({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    await ctx.db.patch(args.gameId, {
      // Set phaseEndsAt in the past beyond the 5-second clock-drift grace window
      // so that the guards in submissions.ts and requests.ts reject late submissions.
      phaseEndsAt: game.phase === "submit" ? Date.now() - 5001 : undefined,
    });
    await logEvent(ctx, args.gameId, "timer_skipped");
  },
});

export const adjustTimer = mutation({
  args: { gameId: v.id("games"), deltaSeconds: v.number(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game || !game.phaseEndsAt) return;
    const newEnd = Math.max(Date.now() + 1000, game.phaseEndsAt + args.deltaSeconds * 1000);
    await ctx.db.patch(args.gameId, { phaseEndsAt: newEnd });
  },
});

export const addLab = mutation({
  args: {
    gameId: v.id("games"),
    name: v.string(),
    roleId: v.string(),
    computeStock: v.number(),
    rdMultiplier: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error(`Game ${args.gameId} not found`);
    const newLab = {
      name: args.name,
      roleId: args.roleId,
      computeStock: args.computeStock,
      rdMultiplier: args.rdMultiplier,
      allocation: { users: 34, capability: 33, safety: 33 },
    };
    await ctx.db.patch(args.gameId, { labs: [...game.labs, newLab] });
    await logEvent(ctx, args.gameId, "lab_added", args.roleId, { name: args.name, computeStock: args.computeStock });
  },
});

export const mergeLabs = mutation({
  args: {
    gameId: v.id("games"),
    survivorName: v.string(),
    absorbedName: v.string(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error(`Game ${args.gameId} not found`);

    if (args.survivorName === args.absorbedName) {
      throw new Error(`Cannot merge lab "${args.survivorName}" with itself`);
    }
    const survivor = game.labs.find((l) => l.name === args.survivorName);
    const absorbed = game.labs.find((l) => l.name === args.absorbedName);
    if (!survivor) throw new Error(`Survivor lab "${args.survivorName}" not found`);
    if (!absorbed) throw new Error(`Absorbed lab "${args.absorbedName}" not found`);

    // Merge: survivor gets absorbed lab's compute, keeps higher multiplier, absorbed is removed
    const mergedLabs = game.labs
      .filter((l) => l.name !== args.absorbedName)
      .map((l) =>
        l.name === args.survivorName
          ? {
              ...l,
              computeStock: l.computeStock + absorbed.computeStock,
              rdMultiplier: Math.max(l.rdMultiplier, absorbed.rdMultiplier),
            }
          : l
      );

    await ctx.db.patch(args.gameId, { labs: mergedLabs });
    await logEvent(ctx, args.gameId, "lab_merged", survivor.roleId, {
      survivor: args.survivorName,
      absorbed: args.absorbedName,
      newComputeStock: survivor.computeStock + absorbed.computeStock,
      newRdMultiplier: Math.max(survivor.rdMultiplier, absorbed.rdMultiplier),
    });
  },
});

export const setResolving = mutation({
  args: { gameId: v.id("games"), resolving: v.boolean(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error(`Game ${args.gameId} not found`);
    if (args.resolving) assertNotResolving(game);
    await ctx.db.patch(args.gameId, {
      resolving: args.resolving,
      resolvingStartedAt: args.resolving ? Date.now() : undefined,
    });
  },
});

export const finishGame = mutation({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game must be playing to finish");
    await snapshotRound(ctx, args.gameId, game.currentRound);
    await ctx.db.patch(args.gameId, { status: "finished" });
    await logEvent(ctx, args.gameId, "game_finish");
  },
});

// ─── Pipeline internal queries/mutations (called by server-side pipeline) ─────

export const getInternal = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

export const updatePipelineStatus = internalMutation({
  args: {
    gameId: v.id("games"),
    status: v.object({
      step: v.string(),
      detail: v.optional(v.string()),
      progress: v.optional(v.string()),
      startedAt: v.number(),
      error: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { pipelineStatus: args.status });
  },
});

export const clearPipelineStatus = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { pipelineStatus: undefined });
  },
});

export const advancePhaseInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    phase: v.union(v.literal("discuss"), v.literal("submit"), v.literal("rolling"), v.literal("narrate")),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const phaseEndsAt = args.durationSeconds ? Date.now() + args.durationSeconds * 1000 : undefined;
    await ctx.db.patch(args.gameId, { phase: args.phase, phaseEndsAt });
    await logEvent(ctx, args.gameId, "phase_change", undefined, { phase: args.phase });
  },
});

export const setResolvingInternal = internalMutation({
  args: { gameId: v.id("games"), resolving: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      resolving: args.resolving,
      resolvingStartedAt: args.resolving ? Date.now() : undefined,
    });
  },
});

export const setResolveNonce = internalMutation({
  args: { gameId: v.id("games"), nonce: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { resolveNonce: args.nonce });
  },
});

export const triggerGrading = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in playing state");

    assertNotResolving(game);
    await ctx.db.patch(args.gameId, {
      resolving: true,
      resolvingStartedAt: Date.now(),
      pipelineStatus: { step: "grading", detail: "Grading remaining actions...", startedAt: Date.now() },
    });

    // Schedule grading only (no roll/narrate after)
    await ctx.scheduler.runAfter(0, internal.pipeline.gradeOnly, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      aiDisposition: args.aiDisposition,
    });
  },
});

export const triggerRoll = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiDisposition: v.optional(v.object({ label: v.string(), description: v.string() })),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in playing state");

    // Verify all submitted actions are graded
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      )
      .collect();
    const ungradedCount = subs.flatMap((s) =>
      s.actions.filter((a) => a.actionStatus === "submitted" && a.probability == null)
    ).length;
    if (ungradedCount > 0) {
      throw new Error(`${ungradedCount} submitted actions still ungraded — grade them first`);
    }

    assertNotResolving(game);

    await ctx.db.patch(args.gameId, {
      phase: "rolling",
      resolving: true,
      resolvingStartedAt: Date.now(),
      pipelineStatus: { step: "rolling", detail: "Rolling dice...", startedAt: Date.now() },
    });

    await ctx.scheduler.runAfter(0, internal.pipeline.rollAndNarrate, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      aiDisposition: args.aiDisposition,
    });
  },
});

export const updateWorldStateInternal = internalMutation({
  args: { gameId: v.id("games"), worldState: worldStateValidator },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { worldState: args.worldState });
  },
});

export const updateLabsInternal = internalMutation({
  args: { gameId: v.id("games"), labs: v.array(labSnapshotValidator) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { labs: args.labs });
  },
});

export const forceClearResolvingLock = mutation({
  args: { gameId: v.id("games"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    await ctx.db.patch(args.gameId, {
      resolving: false,
      resolvingStartedAt: undefined,
      pipelineStatus: undefined,
    });
    await logEvent(ctx, args.gameId, "force_unlock", undefined, {});
  },
});

// Open submissions and trigger server-side AI generation
export const openSubmissions = mutation({
  args: {
    gameId: v.id("games"),
    durationSeconds: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    const phaseEndsAt = Date.now() + args.durationSeconds * 1000;
    await ctx.db.patch(args.gameId, { phase: "submit", phaseEndsAt });
    await logEvent(ctx, args.gameId, "phase_change", undefined, { phase: "submit", durationSeconds: args.durationSeconds });
    await schedulePreGeneration(ctx, args.gameId, game.currentRound);
  },
});

// ─── Merged facilitator query ─────────────────────────────────────────────────
// Combines tables + submissions + requests into a single subscription to reduce
// WebSocket connection overhead. Reads 3 tables so re-runs when any changes, but
// the re-runs are cheap (indexed reads) while each subscription has connection cost.
export const getFacilitatorState = query({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const [tables, submissions, requests] = await Promise.all([
      ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("submissions").withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      ).collect(),
      ctx.db.query("requests").withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      ).collect(),
    ]);

    return {
      tables: tables.filter((t) => t.enabled).map((t) => ({
        _id: t._id,
        roleId: t.roleId,
        roleName: t.roleName,
        joinCode: t.joinCode,
        connected: t.connected,
        controlMode: t.controlMode,
        computeStock: t.computeStock,
        aiDisposition: t.aiDisposition,
      })),
      submissions: submissions.map((sub) => ({
        _id: sub._id,
        _creationTime: sub._creationTime,
        tableId: sub.tableId,
        gameId: sub.gameId,
        roundNumber: sub.roundNumber,
        roleId: sub.roleId,
        status: sub.status,
        actions: sub.actions.map((a) => ({
          text: a.text,
          priority: a.priority,
          secret: a.secret,
          actionStatus: a.actionStatus,
          probability: a.probability,
          rolled: a.rolled,
          success: a.success,
          aiInfluence: a.aiInfluence,
        })),
      })),
      proposals: requests,
    };
  },
});
