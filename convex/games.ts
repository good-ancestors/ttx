import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ROLES, ROUND_CONFIGS, DEFAULT_LABS, AI_SYSTEMS_ROLE_ID, calculatePoolAllocations } from "./gameData";
import { logEvent, assertFacilitator, assertNotResolving } from "./events";
import { internal } from "./_generated/api";
import {
  getActiveLabsForGame,
  createLabInternal,
  mergeLabsWithComputeInternal,
} from "./labs";
import { emitTransaction, emitPair } from "./computeLedger";
import { validateComputeAllocation, stripGradingFields, escrowSendTargets, escrowFoundLab } from "./submissions";
import { patchRuntime, readRuntime } from "./gameRuntime";


/** Pre-generate AI/NPC actions so they're ready before submissions open. */
async function schedulePreGeneration(ctx: MutationCtx, gameId: Id<"games">, roundNumber: number) {
  await ctx.scheduler.runAfter(0, internal.aiGenerate.generateAll, { gameId, roundNumber });
}

/** Auto-snapshot a round's final state (labs, role compute). */
async function snapshotRound(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
  opts?: { force?: boolean },
) {
  const game = await ctx.db.get(gameId);
  if (!game) return;
  const round = await ctx.db.query("rounds")
    .withIndex("by_game_and_number", (q) => q.eq("gameId", gameId).eq("number", roundNumber))
    .first();
  if (!round) return;
  // Default: idempotent — keep existing snapshot.
  // force=true: overwrite (used by advanceRound post-materialisation to capture the
  // post-acquisition compute stocks; the narrate-phase snapshot is pre-acquisition).
  if (round.labsAfter && !opts?.force) return;
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

type LabPatch = {
  labId: Id<"labs">;
  name?: string;
  spec?: string;
  rdMultiplier?: number;
  allocation?: { deployment: number; research: number; safety: number };
  ownerRoleId?: string | null;
};

function buildLabFieldPatch(p: LabPatch): Partial<Doc<"labs">> {
  const patch: Partial<Doc<"labs">> = {};
  if (p.name !== undefined) patch.name = p.name;
  if (p.spec !== undefined) patch.spec = p.spec;
  if (p.rdMultiplier !== undefined) patch.rdMultiplier = p.rdMultiplier;
  if (p.allocation !== undefined) patch.allocation = p.allocation;
  if (p.ownerRoleId !== undefined) patch.ownerRoleId = p.ownerRoleId ?? undefined;
  return patch;
}

function validateLabPatch(p: LabPatch, lab: Doc<"labs">, otherActive: Doc<"labs">[]) {
  if (p.name !== undefined && p.name !== lab.name) {
    const clash = otherActive.find((l) => l._id !== p.labId && l.status === "active" && l.name === p.name);
    if (clash) throw new Error(`Active lab named "${p.name}" already exists`);
  }
  if (p.allocation !== undefined) validateComputeAllocation(p.allocation);
  if (p.rdMultiplier !== undefined && p.rdMultiplier < 0) {
    throw new Error(`Lab rdMultiplier must be non-negative (got ${p.rdMultiplier})`);
  }
}

/** Bulk-patch structural fields across labs. Compute stock changes must go through
 *  updateTableCompute which emits a ledger facilitator row.
 *
 *  rdMultiplier overrides also append a `phase: "override"` mechanicsLog entry on
 *  the current round. The pipeline's labsAfter snapshot stays immutable; the chart
 *  layers override entries on top so history is auditable while the displayed
 *  point reflects the corrected value. */
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
    reason: v.optional(v.string()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    // Same uniqueness guarantee as createLabInternal / mergeLabsInternal: no two active
    // labs in a game may share a name. Narrative-LLM ops key on name so collisions silently
    // drop one lab out of reach.
    const [active, game] = await Promise.all([
      getActiveLabsForGame(ctx, args.gameId),
      ctx.db.get(args.gameId),
    ]);
    const currentRound = game
      ? await ctx.db.query("rounds")
          .withIndex("by_game_and_number", (q) =>
            q.eq("gameId", args.gameId).eq("number", game.currentRound),
          )
          .first()
      : null;
    const overrideEntries: NonNullable<Doc<"rounds">["mechanicsLog"]> = [];
    let nextSequence = (currentRound?.mechanicsLog?.length ?? 0);
    const reason = args.reason?.trim() || "Facilitator override";

    for (const p of args.patches) {
      const lab = await ctx.db.get(p.labId);
      if (!lab || lab.gameId !== args.gameId) continue;
      validateLabPatch(p, lab, active);
      const fieldPatch = buildLabFieldPatch(p);
      if (Object.keys(fieldPatch).length === 0) continue;

      // Log only rdMultiplier changes — mechanicsLog tracks rdMultiplier /
      // computeStock / productivity. Allocation, spec, name, owner are
      // structural changes outside that audit scope.
      if (currentRound && p.rdMultiplier !== undefined && p.rdMultiplier !== lab.rdMultiplier) {
        overrideEntries.push({
          sequence: nextSequence++,
          phase: "override" as const,
          source: "facilitator-edit" as const,
          subject: lab.name,
          field: "rdMultiplier" as const,
          before: lab.rdMultiplier,
          after: p.rdMultiplier,
          reason,
        });
      }

      await ctx.db.patch(p.labId, fieldPatch);
    }

    if (currentRound && overrideEntries.length > 0) {
      const priorLog = currentRound.mechanicsLog ?? [];
      // Cap at 200 entries — same ceiling pipelineApply.ts:256 enforces for
      // phase-9/10 appends. Without it a facilitator with override-happy fingers
      // could push the round doc past Convex's 1MB limit.
      const roomLeft = Math.max(0, 200 - priorLog.length);
      const toAppend = overrideEntries.slice(0, roomLeft);
      if (toAppend.length > 0) {
        await ctx.db.patch(currentRound._id, {
          mechanicsLog: [...priorLog, ...toAppend],
        });
      }
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
    });
    await patchRuntime(ctx, args.gameId, {
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

    // Phase + resolving guards — advanceRound is only valid from narrate phase with no
    // in-flight resolve. A double-click on the Advance button or a stray call from an
    // earlier phase (effect-review, rolling) would otherwise skip the narrative and
    // clobber pending state. Advance from a non-narrate phase is a no-op.
    if (game.phase !== "narrate") return;
    assertNotResolving(await readRuntime(ctx, args.gameId));

    // Materialise any deferred acquisition for the round we're leaving — this is the
    // moment the new compute arrives in players' tables. Writes `acquired` ledger rows
    // keyed to the round being left + patches table.computeStock. The snapshot is then
    // re-taken with `force: true` so labsAfter captures the post-acquisition stocks
    // (narrative phase earlier wrote a pre-acquisition snapshot; we overwrite).
    await materializePendingAcquired(ctx, args.gameId, game.currentRound);

    await snapshotRound(ctx, args.gameId, game.currentRound, { force: true });

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

/** Materialise `round.pendingAcquired` into `acquired` ledger rows. Emits one settled
 *  row per role with non-zero amount, then clears the field so re-runs don't double-apply. */
async function materializePendingAcquired(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
): Promise<void> {
  const round = await ctx.db.query("rounds")
    .withIndex("by_game_and_number", (q) => q.eq("gameId", gameId).eq("number", roundNumber))
    .first();
  if (!round || !round.pendingAcquired || round.pendingAcquired.length === 0) return;

  for (const row of round.pendingAcquired) {
    if (row.amount === 0) continue;
    await emitTransaction(ctx, {
      gameId,
      roundNumber,
      type: "acquired",
      status: "settled",
      roleId: row.roleId,
      amount: row.amount,
      reason: "Round pool share (materialised at Advance)",
    });
  }
  await ctx.db.patch(round._id, { pendingAcquired: undefined });
}

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

    const useBefore = args.useBefore ?? false;
    const snapshotType = useBefore ? "before" : "after";
    const labsSnapshot = useBefore ? round.labsBefore : round.labsAfter;
    if (!labsSnapshot) {
      throw new Error(`No ${snapshotType} snapshot data for round ${args.roundNumber}`);
    }

    // Clearing resolveNonce is critical — any in-flight rollAndNarrate started
    // before this restore will otherwise pass its post-LLM nonce check
    // (convex/pipelineApply.ts) and land structural mutations on top of the
    // just-restored state. Round-level nonce is mirrored below.
    await ctx.db.patch(args.gameId, {
      currentRound: args.roundNumber,
      phase: useBefore ? "submit" : "narrate",
      phaseEndsAt: undefined,
    });
    await patchRuntime(ctx, args.gameId, {
      resolving: false,
      pipelineStatus: undefined,
      resolveNonce: undefined,
    });

    await restoreLabsFromSnapshot(ctx, args.gameId, labsSnapshot);
    await clearRoundResolveData(ctx, round._id, useBefore);
    if (useBefore) {
      // Order matters: reset submissions BEFORE rebuilding the ledger so the
      // re-emit pass can read the (now-reset) action intents and rebuild the
      // submit-phase pending escrows from them.
      await resetSubmissionsForReroll(ctx, args.gameId, args.roundNumber);
    }
    await rebuildLedgerState(ctx, args.gameId, args.roundNumber, useBefore);

    await logEvent(ctx, args.gameId, "snapshot_restored", undefined, {
      restoredFromRound: args.roundNumber,
      type: snapshotType,
    });
  },
});

/** Upsert labs from snapshot: delete labs not in snapshot, insert missing entries
 *  (with fresh _ids), patch survivors. Two-pass so mergedIntoLabId can be rewritten
 *  through the labId remap — when a snapshot lab was hard-deleted after the target
 *  round, it gets a fresh _id and any survivor pointing at it would otherwise dangle. */
async function restoreLabsFromSnapshot(
  ctx: MutationCtx,
  gameId: Id<"games">,
  labsSnapshot: NonNullable<Doc<"rounds">["labsBefore"]>,
) {
  const currentLabs = await ctx.db.query("labs")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  const currentById = new Map(currentLabs.map((l) => [l._id, l]));
  const snapshotIds = new Set(labsSnapshot.map((s) => s.labId));
  for (const current of currentLabs) {
    if (!snapshotIds.has(current._id)) {
      await ctx.db.delete(current._id);
    }
  }

  // Pass 1: determine target labId per snap entry (existing _id or fresh insert).
  const labIdRemap = new Map<Id<"labs">, Id<"labs">>();
  const freshInsertIds = new Set<Id<"labs">>();
  for (const snap of labsSnapshot) {
    if (currentById.has(snap.labId)) {
      labIdRemap.set(snap.labId, snap.labId);
      continue;
    }
    const insertedId = await ctx.db.insert("labs", {
      gameId,
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
    freshInsertIds.add(insertedId);
  }

  // Pass 2: patch survivors and rewrite mergedIntoLabId via remap.
  for (const snap of labsSnapshot) {
    const targetId = labIdRemap.get(snap.labId)!;
    const remappedMerged = snap.mergedIntoLabId
      ? labIdRemap.get(snap.mergedIntoLabId) ?? undefined
      : undefined;
    if (freshInsertIds.has(targetId)) {
      // Insert already landed name/spec/etc.; only need to set remapped mergedIntoLabId.
      if (remappedMerged) {
        await ctx.db.patch(targetId, { mergedIntoLabId: remappedMerged });
      }
      continue;
    }
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

/** Clear per-round pipeline residue. `resolveNonce` is always cleared so any
 *  in-flight pipeline run tied to this round can't land post-restore. On "before"
 *  we additionally drop all summary/snapshots/pending state so the next roll
 *  re-derives from clean state. On "after" we leave that alone — it describes
 *  the post-resolve state the user wants to restore. */
async function clearRoundResolveData(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
  useBefore: boolean,
) {
  if (!useBefore) {
    await ctx.db.patch(roundId, { resolveNonce: undefined });
    return;
  }
  await ctx.db.patch(roundId, {
    summary: undefined,
    labsAfter: undefined,
    resolveNonce: undefined,
    pendingAcquired: undefined,
    pendingProductivityMods: undefined,
    mechanicsLog: undefined,
    appliedOps: undefined,
    labTrajectories: undefined,
  });
}

/** Rebuild compute ledger to match the restored point-in-time, then refresh the
 *  cached table.computeStock from the surviving rows.
 *  - useBefore=true: drop ALL target-round rows (submit-phase escrows, roll-phase
 *    settlements, apply-phase derivations). The next call to
 *    reEmitPendingEscrowsForRound rebuilds the submit-phase pending state from
 *    the (just-reset) action intents, returning the round to a "post-submit,
 *    pre-roll" ledger configuration. Future-round rows (> target) are also dropped.
 *  - useBefore=false: keep target round intact (the round IS resolved); only drop
 *    rows from rounds > targetRound (future state we never reached). */
async function rebuildLedgerState(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
  useBefore: boolean,
) {
  const allTx = await ctx.db.query("computeTransactions")
    .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId))
    .collect();
  const shouldDelete = (tx: typeof allTx[number]) =>
    tx.roundNumber > roundNumber || (useBefore && tx.roundNumber === roundNumber);
  const stockByRole = new Map<string, number>();
  for (const tx of allTx) {
    if (shouldDelete(tx)) {
      await ctx.db.delete(tx._id);
      continue;
    }
    if (tx.status !== "settled") continue;
    stockByRole.set(tx.roleId, (stockByRole.get(tx.roleId) ?? 0) + tx.amount);
  }

  if (useBefore) {
    // Re-emit the pending escrows submit-phase would produce; without these the
    // next rollAllImpl finds no pending rows to settle and silently zeroes the
    // submitter's intent. The pending rows are status="pending" so they don't
    // contribute to settled stock totals — table.computeStock refresh below
    // remains correct.
    await reEmitPendingEscrowsForRound(ctx, gameId, roundNumber);
  }

  const tables = await ctx.db.query("tables")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  for (const t of tables) {
    if (t.computeStock == null) continue;
    const newStock = Math.max(0, stockByRole.get(t.roleId) ?? 0);
    if (newStock !== t.computeStock) {
      await ctx.db.patch(t._id, { computeStock: newStock });
    }
  }
}

/** Reset all submissions in the target round so the next triggerRoll re-runs
 *  rollAllImpl on them. Without this, rollAllImpl short-circuits on
 *  status="resolved" and the player-pinned settlement helpers (foundLab, merge,
 *  computeTargets) never re-fire — the round's structural state ends up
 *  inconsistent with the action outcomes the submissions still claim. Keeps
 *  player intent fields (text, priority, secret, computeTargets, foundLab,
 *  mergeLab); drops every grading + rolling artifact so re-grade + re-roll
 *  produce a clean run. */
async function resetSubmissionsForReroll(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
) {
  const submissions = await ctx.db.query("submissions")
    .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId).eq("roundNumber", roundNumber))
    .collect();
  for (const sub of submissions) {
    if (sub.status !== "graded" && sub.status !== "resolved") continue;
    // Only re-allocate `actions` when at least one submitted action carried
    // roll/grade artifacts; submissions with only draft actions just need
    // their status reverted.
    let dirty = false;
    const actions = sub.actions.map((a) => {
      if (a.actionStatus !== "submitted") return a;
      dirty = true;
      return stripGradingFields(a, { resetRoll: true });
    });
    await ctx.db.patch(sub._id, dirty ? { actions, status: "submitted" } : { status: "submitted" });
  }
}

/** Walk submissions + accepted compute-requests in the target round and re-emit
 *  the pending ledger rows submit-phase would have produced:
 *  - foundLab: pending `adjusted` row (-seedCompute, escrowed against submitter)
 *  - send computeTargets: pending `transferred` pair (submitter → target)
 *  - accepted compute requests: pending `transferred` pair (target → submitter)
 *  Endorsement requests have no escrow. Pending status means table.computeStock
 *  isn't affected; the rows exist for rollAllImpl's settlePendingForAction to
 *  transition to settled (or cancelPendingForAction to delete) on re-roll. */
async function reEmitPendingEscrowsForRound(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
) {
  const [submissions, requests] = await Promise.all([
    ctx.db.query("submissions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId).eq("roundNumber", roundNumber))
      .collect(),
    ctx.db.query("requests")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId).eq("roundNumber", roundNumber))
      .collect(),
  ]);

  for (const sub of submissions) {
    for (const action of sub.actions) {
      if (action.actionStatus !== "submitted" || !action.actionId) continue;

      const sendTargets = (action.computeTargets ?? []).filter((t) => t.direction === "send");
      if (sendTargets.length > 0) {
        await escrowSendTargets(ctx, {
          gameId, roundNumber,
          senderRoleId: sub.roleId,
          actionId: action.actionId,
          actionText: action.text,
          targets: sendTargets,
          // Already validated at original submit; stock baseline can shift on
          // re-emit if other actions in this round restore-pass have already
          // landed pending rows, so re-checking here would false-positive.
          skipAvailabilityCheck: true,
        });
      }

      if (action.foundLab) {
        await escrowFoundLab(ctx, {
          gameId, roundNumber,
          founderRoleId: sub.roleId,
          actionId: action.actionId,
          foundLab: action.foundLab,
        });
      }
    }
  }

  for (const req of requests) {
    if (req.status !== "accepted" || req.requestType !== "compute") continue;
    if (!req.actionId || req.computeAmount == null) continue;
    await emitPair(ctx, {
      gameId, roundNumber,
      type: "transferred", status: "pending",
      fromRoleId: req.toRoleId,    // target whose pool was escrowed on accept
      toRoleId: req.fromRoleId,    // submitter who'll receive on success
      amount: req.computeAmount,
      reason: `Accepted-request escrow: ${req.actionText.slice(0, 80)}`,
      actionId: req.actionId,
    });
  }
}

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
    if (args.resolving) assertNotResolving(await readRuntime(ctx, args.gameId));
    await patchRuntime(ctx, args.gameId, {
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
    await patchRuntime(ctx, args.gameId, { pipelineStatus: args.status });
  },
});

export const finishResolveInternal = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gameId, {
      phase: "narrate" as const,
      phaseEndsAt: undefined,
    });
    await patchRuntime(ctx, args.gameId, {
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
    });
    await patchRuntime(ctx, args.gameId, {
      resolving: false,
      resolvingStartedAt: undefined,
      // No detail text — at effect-review the pipeline is idle, waiting for
      // the facilitator. The UI suppresses the spinner/resolveStep row for
      // this step so there's no system-is-working connotation.
      pipelineStatus: { step: "effect-review", detail: "", startedAt: Date.now() },
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
    if (args.roundNumber !== game.currentRound) {
      throw new Error(`roundNumber mismatch: expected ${game.currentRound}, got ${args.roundNumber}`);
    }
    assertNotResolving(await readRuntime(ctx, args.gameId));

    await patchRuntime(ctx, args.gameId, {
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
    await patchRuntime(ctx, args.gameId, {
      resolving: args.resolving,
      resolvingStartedAt: args.resolving ? Date.now() : undefined,
    });
  },
});

export const setResolveNonce = internalMutation({
  args: { gameId: v.id("games"), nonce: v.string() },
  handler: async (ctx, args) => {
    await patchRuntime(ctx, args.gameId, { resolveNonce: args.nonce });
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

    assertNotResolving(await readRuntime(ctx, args.gameId));
    await patchRuntime(ctx, args.gameId, {
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
    if (args.roundNumber !== game.currentRound) throw new Error(`roundNumber mismatch: expected ${game.currentRound}, got ${args.roundNumber}`);

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

    assertNotResolving(await readRuntime(ctx, args.gameId));

    await ctx.db.patch(args.gameId, { phase: "rolling" });
    await patchRuntime(ctx, args.gameId, {
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

    // Rewind phase to the last stable state so retry makes sense. Otherwise a failed
    // resolve leaves the game stuck in phase "rolling" and re-triggering grade/roll
    // refuses because the phase guard doesn't recognise it. Also clear resolveNonce
    // on the current round — without it, any retry will fail the nonce check inside
    // applyDecidedEffectsInternal.
    const stablePhase =
      game.phase === "rolling" ? "submit" :
      game.phase === "effect-review" ? "submit" :
      game.phase === "narrate" ? "narrate" :
      game.phase; // discuss / submit stay as-is

    await ctx.db.patch(args.gameId, { phase: stablePhase });
    await patchRuntime(ctx, args.gameId, {
      resolving: false,
      resolvingStartedAt: undefined,
      pipelineStatus: undefined,
    });

    // Also clear the current round's resolveNonce + any pending stash, so a retry rolls
    // from a clean slate.
    const round = await ctx.db.query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", game.currentRound))
      .first();
    if (round) {
      await ctx.db.patch(round._id, {
        resolveNonce: undefined,
        pendingAcquired: undefined,
      });
    }

    await logEvent(ctx, args.gameId, "force_unlock", undefined, {
      previousPhase: game.phase,
      restoredPhase: stablePhase,
    });
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
        playerName: t.playerName,
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
          actionId: a.actionId,
          text: a.text,
          priority: a.priority,
          secret: a.secret,
          actionStatus: a.actionStatus,
          probability: a.probability,
          reasoning: a.reasoning,
          rolled: a.rolled,
          success: a.success,
          aiInfluence: a.aiInfluence,
          // Structured-effect refactor fields — must be projected through so
          // the facilitator action-row can render the effect badge + editor
          // and detect pinned effects. Without these, the UI silently shows
          // no badges even though the grader populated them correctly.
          structuredEffect: a.structuredEffect,
          confidence: a.confidence,
          mergeLab: a.mergeLab,
          foundLab: a.foundLab,
          computeTargets: a.computeTargets,
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
    // Symmetric with the pipeline's transferOwnership guard: reject empty
    // newRoleId so the facilitator can't orphan a lab via direct API call.
    // Use decommission to end a lab's existence, not ownership-to-nobody.
    if (!args.newRoleId) {
      throw new Error("assignLabController: newRoleId is required — use decommission to end a lab");
    }
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
