import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ROLES, ROUND_CONFIGS, DEFAULT_LABS, AI_SYSTEMS_ROLE_ID, calculatePoolAllocations } from "./gameData";
import { logEvent, assertFacilitator, assertNotResolving } from "./events";
import { internal } from "./_generated/api";
import {
  getActiveLabsForGame,
  createLabInternal,
  mergeLabsWithComputeInternal,
} from "./labs";
import { emitTransaction } from "./computeLedger";


/** Pre-generate AI/NPC actions so they're ready before submissions open. */
async function schedulePreGeneration(ctx: MutationCtx, gameId: Id<"games">, roundNumber: number) {
  await ctx.scheduler.runAfter(0, internal.aiGenerate.generateAll, { gameId, roundNumber });
}

/** Auto-snapshot a round's final state (labs, role compute). */
async function snapshotRound(ctx: MutationCtx, gameId: Id<"games">, roundNumber: number) {
  const game = await ctx.db.get(gameId);
  if (!game) return;
  const round = await ctx.db.query("rounds")
    .withIndex("by_game_and_number", (q) => q.eq("gameId", gameId).eq("number", roundNumber))
    .first();
  if (!round || round.labsAfter) return; // Already snapshotted
  const labs = await ctx.db.query("labs").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  const tables = await ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  const stockByRole = new Map(tables.map((t) => [t.roleId, t.computeStock ?? 0] as const));
  await ctx.db.patch(round._id, {
    labsAfter: labs.map((l) => ({
      labId: l._id,
      name: l.name,
      roleId: l.ownerRoleId,
      computeStock: l.ownerRoleId ? stockByRole.get(l.ownerRoleId) ?? 0 : 0,
      rdMultiplier: l.rdMultiplier,
      allocation: l.allocation,
      spec: l.spec,
      colour: l.colour,
      status: l.status,
      mergedIntoLabId: l.mergedIntoLabId,
      createdRound: l.createdRound,
      jurisdiction: l.jurisdiction,
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
      locked: false,
      joinCode: generateJoinCode(),
    });

    // Seed labs table — one row per DEFAULT_LABS entry, owner = matching CEO role.
    const LAB_COLOURS: Record<string, string> = {
      "openbrain-ceo": "#3B82F6",
      "deepcent-ceo": "#D97706",
      "conscienta-ceo": "#8B5CF6",
    };
    for (const lab of DEFAULT_LABS) {
      await ctx.db.insert("labs", {
        gameId,
        name: lab.name,
        spec: lab.spec,
        rdMultiplier: lab.rdMultiplier,
        allocation: lab.allocation,
        ownerRoleId: lab.roleId,
        colour: LAB_COLOURS[lab.roleId] ?? "#64748B",
        status: "active",
        createdRound: 1,
        jurisdiction: lab.jurisdiction,
      });
    }

    // Create tables for all roles — required roles are always enabled,
    // optional roles enabled up to tableCount. All start as AI-controlled
    // until a human joins. Roles are ordered by priority in the ROLES array.
    const requiredIds = new Set(["openbrain-ceo", "deepcent-ceo", AI_SYSTEMS_ROLE_ID]);
    let enabledCount = 0;

    // First pass: determine which roles are enabled
    const enabledRoleIds = new Set<string>();
    for (const role of ROLES) {
      const isRequired = requiredIds.has(role.id);
      const enabled = isRequired || enabledCount < tableCount;
      if (enabled) {
        enabledRoleIds.add(role.id);
        enabledCount++;
      }
    }

    // Calculate pool allocations once for all roles
    const poolAllocations = calculatePoolAllocations(enabledRoleIds);
    // Lab CEO compute — table.computeStock is the single source of truth for ALL roles
    const labComputeByRole = new Map(DEFAULT_LABS.map((l) => [l.roleId, l.computeStock]));

    // Second pass: create tables with pool-aware starting compute.
    // Stock is seeded via the ledger — `starting` row per role — so computeTransactions
    // is the authoritative history. table.computeStock is a cache; we set it here
    // directly to avoid circular "insert table then emit ledger row" ordering issues,
    // but emitTransaction will keep them in sync from this point forward.
    for (const role of ROLES) {
      const labStock = labComputeByRole.get(role.id);
      const poolStock = poolAllocations.get(role.id);
      const initialStock = labStock ?? (poolStock && poolStock > 0 ? poolStock : undefined);
      await ctx.db.insert("tables", {
        gameId,
        roleId: role.id,
        roleName: role.name,
        joinCode: generateJoinCode(),
        connected: false,
        controlMode: "npc",
        enabled: enabledRoleIds.has(role.id),
        computeStock: initialStock,
      });
      if (initialStock != null && initialStock > 0) {
        await ctx.db.insert("computeTransactions", {
          gameId,
          roundNumber: 1,
          createdAt: Date.now(),
          type: "starting",
          status: "settled",
          roleId: role.id,
          amount: initialStock,
          reason: "Starting stock",
        });
      }
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

export const getByJoinCode = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", args.joinCode.toUpperCase()))
      .first();
    if (!game) return null;
    return { _id: game._id, status: game.status, name: game.name };
  },
});

// Player-facing query — excludes pipelineStatus, resolving, resolveNonce which
// change frequently during resolve and would cause 30+ client re-renders.
// Players don't need pipeline progress — only the facilitator does.
export const getForPlayer = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;
    // Active labs + cached computeStock from tables for display.
    const [labs, tables] = await Promise.all([
      ctx.db.query("labs")
        .withIndex("by_game_and_status", (q) => q.eq("gameId", args.gameId).eq("status", "active"))
        .collect(),
      ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
    ]);
    const stockByRole = new Map(tables.map((t) => [t.roleId, t.computeStock ?? 0] as const));
    return {
      _id: game._id,
      _creationTime: game._creationTime,
      status: game.status,
      currentRound: game.currentRound,
      phase: game.phase,
      phaseEndsAt: game.phaseEndsAt,
      labs: labs.map((l) => ({
        labId: l._id,
        name: l.name,
        roleId: l.ownerRoleId,
        computeStock: l.ownerRoleId ? stockByRole.get(l.ownerRoleId) ?? 0 : 0,
        rdMultiplier: l.rdMultiplier,
        allocation: l.allocation,
        spec: l.spec,
        colour: l.colour,
      })),
      locked: game.locked,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").order("desc").take(10);
    if (games.length === 0) return [];

    // Return minimal fields — splash page doesn't need labs, etc.
    // Avoid reading tables to reduce bandwidth; use cached counts from game doc
    // if available, otherwise show 0 (acceptable for a list view).
    return games.map((game) => ({
      _id: game._id,
      _creationTime: game._creationTime,
      name: game.name,
      status: game.status,
      currentRound: game.currentRound,
      phase: game.phase,
      enabledCount: 0, // Not worth querying tables for the list view
      connectedCount: 0,
    }));
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
    const [tables, submissions, rounds, requests, events, labs, ledger] = await Promise.all([
      ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("submissions").withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("requests").withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("events").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("labs").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect(),
      ctx.db.query("computeTransactions").withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId)).collect(),
    ]);
    const allDocs = [...tables, ...submissions, ...rounds, ...requests, ...events, ...labs, ...ledger];
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
      v.literal("effect-review"),
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

/** Bulk-patch structural fields across labs. Compute stock changes must go through
 *  updateTableCompute which emits a ledger facilitator row. */
export const updateLabs = mutation({
  args: {
    gameId: v.id("games"),
    patches: v.array(v.object({
      labId: v.id("labs"),
      name: v.optional(v.string()),
      spec: v.optional(v.string()),
      rdMultiplier: v.optional(v.number()),
      allocation: v.optional(v.object({
        deployment: v.number(), research: v.number(), safety: v.number(),
      })),
      ownerRoleId: v.optional(v.union(v.string(), v.null())),
    })),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    // Same uniqueness guarantee as createLabInternal / mergeLabsInternal: no two active
    // labs in a game may share a name. Narrative-LLM ops key on name so collisions silently
    // drop one lab out of reach.
    const active = await getActiveLabsForGame(ctx, args.gameId);
    for (const p of args.patches) {
      const lab = await ctx.db.get(p.labId);
      if (!lab || lab.gameId !== args.gameId) continue;
      if (p.name !== undefined && p.name !== lab.name) {
        const clash = active.find((l) => l._id !== p.labId && l.status === "active" && l.name === p.name);
        if (clash) throw new Error(`Active lab named "${p.name}" already exists`);
      }
      const patch: Partial<typeof lab> = {};
      if (p.name !== undefined) patch.name = p.name;
      if (p.spec !== undefined) patch.spec = p.spec;
      if (p.rdMultiplier !== undefined) patch.rdMultiplier = p.rdMultiplier;
      if (p.allocation !== undefined) patch.allocation = p.allocation;
      if (p.ownerRoleId !== undefined) patch.ownerRoleId = p.ownerRoleId ?? undefined;
      if (Object.keys(patch).length > 0) await ctx.db.patch(p.labId, patch);
    }
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
    const labs = await getActiveLabsForGame(ctx, args.gameId);
    const lab = labs.find((l) => l.name === args.labName);
    if (!lab) return;
    await ctx.db.patch(lab._id, { spec: args.spec });
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
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    const game = await ctx.db.get(table.gameId);
    if (!game) return;

    // Route through emitTransaction so the cache-ledger invariant is enforced
    // centrally (patchTableStock updates the cache as a side-effect). Duplicate
    // of computeMutations.overrideHolderCompute with tableId-based lookup —
    // retained because the lobby UI passes tableId rather than roleId.
    const currentStock = table.computeStock ?? 0;
    const delta = args.computeStock - currentStock;
    if (delta !== 0) {
      await emitTransaction(ctx, {
        gameId: table.gameId,
        roundNumber: game.currentRound,
        type: "facilitator",
        status: "settled",
        roleId: table.roleId,
        amount: delta,
        reason: "Facilitator direct compute edit",
      });
    }
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
    const labsSnapshot = args.useBefore ? round.labsBefore : round.labsAfter;
    const snapshotType = args.useBefore ? "before" : "after";
    if (!labsSnapshot) throw new Error(`No ${snapshotType} snapshot data for round ${args.roundNumber}`);

    // Restore round + phase; labs table rows are restored below from the snapshot.
    // Clearing resolveNonce is critical — any in-flight rollAndNarrate that was
    // started before this restore will otherwise pass its post-LLM nonce check
    // (convex/pipelineApply.ts) and land structural mutations on top of the just-
    // restored state. Mirror the clear on the target round below.
    await ctx.db.patch(args.gameId, {
      currentRound: args.roundNumber,
      phase: args.useBefore ? "submit" : "narrate",
      phaseEndsAt: undefined,
      resolving: false,
      pipelineStatus: undefined,
      resolveNonce: undefined,
    });

    // Restore labs table: upsert from snapshot by labId; delete any current labs not in snapshot.
    // Two-pass so we can rewrite mergedIntoLabId through a labId remap — when a snapshot lab
    // was hard-deleted after the target round and has to be re-inserted, it gets a fresh _id;
    // any surviving snapshot entry whose mergedIntoLabId pointed at it would otherwise dangle.
    const currentLabs = await ctx.db.query("labs")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const snapshotIds = new Set(labsSnapshot.map((s) => s.labId));
    for (const current of currentLabs) {
      if (!snapshotIds.has(current._id)) {
        await ctx.db.delete(current._id);
      }
    }
    // Pass 1: determine target labId per snap entry (existing _id or fresh insert).
    const labIdRemap = new Map<Id<"labs">, Id<"labs">>();
    const pendingInserts: { snap: typeof labsSnapshot[number]; newId: Id<"labs"> }[] = [];
    for (const snap of labsSnapshot) {
      const existing = currentLabs.find((l) => l._id === snap.labId);
      if (existing) {
        labIdRemap.set(snap.labId, snap.labId);
      } else {
        const insertedId = await ctx.db.insert("labs", {
          gameId: args.gameId,
          name: snap.name,
          spec: snap.spec,
          rdMultiplier: snap.rdMultiplier,
          allocation: snap.allocation,
          ownerRoleId: snap.roleId,
          colour: snap.colour,
          status: snap.status,
          createdRound: snap.createdRound,
          jurisdiction: snap.jurisdiction,
          // mergedIntoLabId set in pass 2 once remap is complete.
        });
        labIdRemap.set(snap.labId, insertedId);
        pendingInserts.push({ snap, newId: insertedId });
      }
    }
    // Pass 2: patch each existing snapshot target with remapped mergedIntoLabId.
    for (const snap of labsSnapshot) {
      const targetId = labIdRemap.get(snap.labId)!;
      const remappedMerged = snap.mergedIntoLabId
        ? labIdRemap.get(snap.mergedIntoLabId) ?? undefined
        : undefined;
      const isFreshInsert = pendingInserts.some((p) => p.newId === targetId);
      if (isFreshInsert) {
        // Insert already landed name/spec/etc.; only need to set remapped mergedIntoLabId.
        if (remappedMerged) {
          await ctx.db.patch(targetId, { mergedIntoLabId: remappedMerged });
        }
      } else {
        await ctx.db.patch(targetId, {
          name: snap.name,
          spec: snap.spec,
          rdMultiplier: snap.rdMultiplier,
          allocation: snap.allocation,
          ownerRoleId: snap.roleId,
          colour: snap.colour,
          status: snap.status,
          mergedIntoLabId: remappedMerged,
          createdRound: snap.createdRound,
        });
      }
    }

    // Clear resolution data on this round if restoring to "before". Also clear
    // resolveNonce unconditionally so any in-flight pipeline run tied to this
    // round can't land post-restore (mirrors the game-level clear above).
    if (args.useBefore) {
      await ctx.db.patch(round._id, {
        summary: undefined,
        labsAfter: undefined,
        resolveNonce: undefined,
      });
    } else {
      await ctx.db.patch(round._id, { resolveNonce: undefined });
    }

    // Rebuild ledger state to match the restored point-in-time.
    // - useBefore=true: remove all rows from rounds > targetRound, plus regenerable rows
    //   (acquired/adjusted/merged) from targetRound itself. Transferred + facilitator rows
    //   within targetRound remain (player-initiated movements done during the submit phase).
    // - useBefore=false: remove all rows from rounds > targetRound. Keep targetRound fully.
    const allTx = await ctx.db.query("computeTransactions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const tx of allTx) {
      const shouldDelete =
        tx.roundNumber > args.roundNumber ||
        (args.useBefore && tx.roundNumber === args.roundNumber &&
          (tx.type === "acquired" || tx.type === "adjusted" || tx.type === "merged"));
      if (shouldDelete) {
        await ctx.db.delete(tx._id);
      }
    }
    // Recompute cached table.computeStock = sum of remaining settled rows per role.
    const remaining = await ctx.db.query("computeTransactions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId))
      .collect();
    const stockByRole = new Map<string, number>();
    for (const tx of remaining) {
      if (tx.status !== "settled") continue;
      stockByRole.set(tx.roleId, (stockByRole.get(tx.roleId) ?? 0) + tx.amount);
    }
    const tables = await ctx.db.query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const t of tables) {
      if (t.computeStock == null) continue;
      const newStock = Math.max(0, stockByRole.get(t.roleId) ?? 0);
      if (newStock !== t.computeStock) {
        await ctx.db.patch(t._id, { computeStock: newStock });
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
    rdMultiplier: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error(`Game ${args.gameId} not found`);

    const activeLabs = await getActiveLabsForGame(ctx, args.gameId);
    if (activeLabs.some((l) => l.ownerRoleId === args.roleId)) {
      throw new Error(`Role ${args.roleId} already controls a lab`);
    }

    // Enable compute tracking if the role's table didn't have it
    const table = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", args.roleId))
      .first();
    if (table && table.computeStock == null) {
      await ctx.db.patch(table._id, { computeStock: 0 });
    }

    await createLabInternal(ctx, {
      gameId: args.gameId,
      name: args.name,
      rdMultiplier: args.rdMultiplier,
      allocation: { deployment: 34, research: 33, safety: 33 },
      ownerRoleId: args.roleId,
      createdRound: game.currentRound,
    });

    await logEvent(ctx, args.gameId, "lab_added", args.roleId, {
      name: args.name,
      computeStock: table?.computeStock ?? 0,
    });
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

    // Block merges during submit phase — active escrows/requests would be orphaned
    if (game.phase === "submit") {
      throw new Error("Cannot merge labs during submit phase — wait until discussion or resolution");
    }

    if (args.survivorName === args.absorbedName) {
      throw new Error(`Cannot merge lab "${args.survivorName}" with itself`);
    }
    const activeLabs = await getActiveLabsForGame(ctx, args.gameId);
    const survivor = activeLabs.find((l) => l.name === args.survivorName);
    const absorbed = activeLabs.find((l) => l.name === args.absorbedName);
    if (!survivor) throw new Error(`Survivor lab "${args.survivorName}" not found`);
    if (!absorbed) throw new Error(`Absorbed lab "${args.absorbedName}" not found`);

    await mergeLabsWithComputeInternal(ctx, {
      gameId: args.gameId,
      roundNumber: game.currentRound,
      survivorLabId: survivor._id,
      absorbedLabId: absorbed._id,
      reason: `Facilitator-triggered merge: ${args.absorbedName} → ${args.survivorName}`,
    });

    await logEvent(ctx, args.gameId, "lab_merged", survivor.ownerRoleId, {
      survivor: args.survivorName,
      absorbed: args.absorbedName,
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

export const finishResolveInternal = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      phase: "narrate" as const,
      phaseEndsAt: undefined,
      resolving: false,
      resolvingStartedAt: undefined,
      pipelineStatus: { step: "done", detail: "Resolution complete", startedAt: Date.now() },
    });
    await logEvent(ctx, args.gameId, "phase_change", undefined, { phase: "narrate" });
  },
});

/** P7 transition — decide LLM has run and structural effects have landed. Pauses the
 *  pipeline so the facilitator can review applied ops + flagged rejections before the
 *  deterministic R&D growth + compute acquisition + narrative LLM run. The resolving
 *  lock is released during the pause; continueFromEffectReview re-acquires it. */
export const setPhaseEffectReviewInternal = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      phase: "effect-review" as const,
      phaseEndsAt: undefined,
      resolving: false,
      resolvingStartedAt: undefined,
      pipelineStatus: { step: "effect-review", detail: "Review effects, then continue to narrative", startedAt: Date.now() },
    });
    await logEvent(ctx, args.gameId, "phase_change", undefined, { phase: "effect-review" });
  },
});

/** Facilitator-triggered continue from P7. Re-acquires the resolving lock, bumps the
 *  pipeline status back into resolving, and schedules the second-half pipeline action
 *  (R&D growth → compute acquisition → narrative LLM). */
export const triggerContinueFromEffectReview = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in playing state");
    if (game.phase !== "effect-review") {
      throw new Error(`Cannot continue: game is in ${game.phase} phase, expected effect-review`);
    }
    assertNotResolving(game);

    await ctx.db.patch(args.gameId, {
      resolving: true,
      resolvingStartedAt: Date.now(),
      pipelineStatus: { step: "resolving", detail: "Applying R&D growth and compute acquisition...", startedAt: Date.now() },
    });

    await ctx.scheduler.runAfter(0, internal.pipeline.continueFromEffectReview, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
    });
  },
});

export const advancePhaseInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    phase: v.union(v.literal("discuss"), v.literal("submit"), v.literal("rolling"), v.literal("effect-review"), v.literal("narrate")),
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

    await ctx.scheduler.runAfter(0, internal.pipeline.rollAndApplyEffects, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      aiDisposition: args.aiDisposition,
    });
  },
});

export const setShareOverridesInternal = internalMutation({
  args: { gameId: v.id("games"), overrides: v.record(v.string(), v.number()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, { computeShareOverrides: args.overrides });
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

    // Submit-open snapshot is no longer needed — the ledger preserves full per-event history.
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
          reasoning: a.reasoning,
          rolled: a.rolled,
          success: a.success,
          aiInfluence: a.aiInfluence,
        })),
      })),
      proposals: requests,
    };
  },
});

export const assignLabController = mutation({
  args: {
    gameId: v.id("games"),
    labName: v.string(),
    newRoleId: v.string(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    const activeLabs = await getActiveLabsForGame(ctx, args.gameId);
    const lab = activeLabs.find((l) => l.name === args.labName);
    if (!lab) throw new Error(`Lab "${args.labName}" not found`);
    await ctx.db.patch(lab._id, { ownerRoleId: args.newRoleId });
    await logEvent(ctx, args.gameId, "lab_controller_assigned", args.newRoleId, {
      labName: args.labName,
    });
  },
});
