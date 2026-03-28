import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ROLES, ROUND_CONFIGS, DEFAULT_WORLD_STATE, DEFAULT_LABS } from "./gameData";
import { logEvent } from "./events";

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
  },
  handler: async (ctx, args) => {
    const tableCount = Math.min(17, Math.max(1, args.tableCount ?? 6));

    const gameId = await ctx.db.insert("games", {
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
    const requiredIds = new Set(["openbrain-ceo", "deepcent-ceo", "ai-systems"]);
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
        title: config.title,
        narrative: config.narrative,
        capabilityLevel: config.capabilityLevel,
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
    // Enrich with table counts
    const enriched = await Promise.all(
      games.map(async (game) => {
        const tables = await ctx.db
          .query("tables")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect();
        const enabledCount = tables.filter((t) => t.enabled).length;
        const connectedCount = tables.filter((t) => t.connected).length;
        return { ...game, enabledCount, connectedCount };
      })
    );
    return enriched;
  },
});

export const remove = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
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
    worldState: v.object({
      capability: v.number(),
      alignment: v.number(),
      tension: v.number(),
      awareness: v.number(),
      regulation: v.number(),
      australia: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { worldState: args.worldState });
  },
});

export const updateLabs = mutation({
  args: {
    gameId: v.id("games"),
    labs: v.array(
      v.object({
        name: v.string(),
        roleId: v.string(),
        computeStock: v.number(),
        rdMultiplier: v.number(),
        allocation: v.object({
          users: v.number(),
          capability: v.number(),
          safety: v.number(),
        }),
        spec: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tableId, { computeStock: args.computeStock });
  },
});

export const lock = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { locked: true });
  },
});

export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      status: "playing",
      phase: "discuss",
      phaseEndsAt: undefined,
    });
    await logEvent(ctx, args.gameId, "game_start");
  },
});

export const advanceRound = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
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
  },
});

export const restoreSnapshot = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    useBefore: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;

    const rounds = await ctx.db.query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const round = rounds.find((r) => r.number === args.roundNumber);
    if (!round) return;

    // Choose before or after snapshot
    const ws = args.useBefore ? round.worldStateBefore : round.worldStateAfter;
    const labs = args.useBefore ? round.labsBefore : round.labsAfter;
    if (!ws || !labs) return;

    await ctx.db.patch(args.gameId, { worldState: ws, labs });

    // Restore role compute (only available on "after" snapshots)
    if (!args.useBefore && round.roleComputeAfter) {
      const tables = await ctx.db.query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect();
      for (const rc of round.roleComputeAfter) {
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
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { phaseEndsAt: undefined });
    await logEvent(ctx, args.gameId, "timer_skipped");
  },
});

export const addLab = mutation({
  args: {
    gameId: v.id("games"),
    name: v.string(),
    roleId: v.string(),
    computeStock: v.number(),
    rdMultiplier: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
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
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;

    const survivor = game.labs.find((l) => l.name === args.survivorName);
    const absorbed = game.labs.find((l) => l.name === args.absorbedName);
    if (!survivor || !absorbed || survivor.name === absorbed.name) return;

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

export const finishGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (game) await snapshotRound(ctx, args.gameId, game.currentRound);
    await ctx.db.patch(args.gameId, { status: "finished" });
    await logEvent(ctx, args.gameId, "game_finish");
  },
});
