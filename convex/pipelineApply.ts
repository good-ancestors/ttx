// Phase-5 structural apply + phase-9/10 growth-and-acquisition apply. Split
// because pipeline.ts is `use node` and mutations must live in a default Convex
// runtime module. See docs/resolve-pipeline.md for the full phase ordering.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  mergeLabsInternal,
  decommissionLabInternal,
  transferLabOwnershipInternal,
  updateLabRdMultiplierInternal,
  createLabInternal,
} from "./labs";
import { emitTransaction, emitPair, clearRegenerableRows } from "./computeLedger";
import { readRuntime } from "./gameRuntime";

/** One entry on round.mechanicsLog. Shared by both apply mutations so the schema
 *  stays in sync — phase-5 writes fresh (overwrite), phase-9/10 appends to existing. */
const mechanicsLogEntryValidator = v.object({
  sequence: v.number(),
  phase: v.union(v.literal(5), v.literal(9), v.literal(10), v.literal("override")),
  source: v.union(
    v.literal("player-pinned"),
    v.literal("grader-effect"),
    v.literal("natural-growth"),
    v.literal("acquisition"),
    v.literal("facilitator-edit"),
  ),
  subject: v.string(),
  field: v.union(v.literal("rdMultiplier"), v.literal("computeStock"), v.literal("productivity")),
  before: v.number(),
  after: v.number(),
  reason: v.string(),
});

export const applyDecidedEffectsInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    nonce: v.string(),
    mergeOps: v.array(v.object({
      survivorLabId: v.id("labs"),
      absorbedLabId: v.id("labs"),
      newName: v.optional(v.string()),
      newSpec: v.optional(v.string()),
      reason: v.string(),
    })),
    decommissionOps: v.array(v.object({ labId: v.id("labs") })),
    // transferOps now carries oldOwnerRoleId + computeToTransfer so the apply
    // mutation can emit a settled ledger pair (compute follows the lab). When
    // computeToTransfer is 0 or absent, only the lab doc is patched.
    transferOps: v.array(v.object({
      labId: v.id("labs"),
      newOwnerRoleId: v.optional(v.string()),
      oldOwnerRoleId: v.optional(v.string()),
      computeToTransfer: v.optional(v.number()),
    })),
    // foundLabOps: create a new lab for the founder + emit a settled ledger
    // entry debiting their pool by seedCompute. Pipeline-side already
    // validated name uniqueness, founder balance, and MIN_SEED_COMPUTE;
    // the mutation trusts those invariants and focuses on the writes.
    foundLabOps: v.array(v.object({
      founderRoleId: v.string(),
      name: v.string(),
      spec: v.optional(v.string()),
      seedCompute: v.number(),
      allocation: v.object({ deployment: v.number(), research: v.number(), safety: v.number() }),
    })),
    // Final rdMultiplier values from breakthrough / modelRollback (four-layer
    // redesign). Growth-derived updates land later in applyGrowthAndAcquisitionInternal.
    // The value here is the POST-effect multiplier — growth in phase 9 grows from
    // this base and there is no re-apply step.
    multiplierUpdates: v.array(v.object({ labId: v.id("labs"), rdMultiplier: v.number() })),
    adjusted: v.array(v.object({ roleId: v.string(), amount: v.number(), reason: v.string() })),
    merged: v.array(v.object({ fromRoleId: v.string(), toRoleId: v.string(), amount: v.number(), reason: v.string() })),
    // One-round productivity modifiers from researchDisruption / researchBoost.
    // Stashed on round.pendingProductivityMods for phase-9 growth to consume.
    productivityMods: v.array(v.object({ labId: v.id("labs"), modifier: v.number() })),
    // Phase-5 mechanics log entries. Written as the initial slice of round.mechanicsLog
    // (overwrites any stale entries from a prior resolve run). Phase 9 + 10 append.
    mechanicsLog: v.array(mechanicsLogEntryValidator),
  },
  handler: async (ctx, args) => {
    // Re-verify the resolve nonce inside the atomic mutation.
    const runtime = await readRuntime(ctx, args.gameId);
    if (runtime.resolveNonce !== args.nonce) {
      throw new Error(`Resolve nonce mismatch (expected ${args.nonce}, got ${runtime.resolveNonce ?? "null"}) — another resolve superseded this run`);
    }

    // Validate — every labId exists and (for structural ops) is still active.
    const structuralLabIds: Id<"labs">[] = [
      ...args.mergeOps.flatMap((m) => [m.survivorLabId, m.absorbedLabId]),
      ...args.decommissionOps.map((d) => d.labId),
      ...args.transferOps.map((t) => t.labId),
    ];
    const structuralLabs = await Promise.all(structuralLabIds.map((id) => ctx.db.get(id)));
    structuralLabIds.forEach((id, i) => {
      const lab = structuralLabs[i];
      if (!lab || lab.gameId !== args.gameId) {
        throw new Error(`Lab ${id} not found or wrong game — aborting resolve apply`);
      }
      if (lab.status !== "active") {
        throw new Error(`Lab ${id} (${lab.name}) is not active — structural op rejected (likely facilitator-decommissioned since resolve started)`);
      }
    });
    const multiplierLabs = await Promise.all(args.multiplierUpdates.map((u) => ctx.db.get(u.labId)));
    args.multiplierUpdates.forEach((u, i) => {
      const lab = multiplierLabs[i];
      if (!lab || lab.gameId !== args.gameId) {
        throw new Error(`Lab ${u.labId} not found or wrong game — aborting resolve apply`);
      }
    });

    // Ledger: wipe regenerable rows, then emit adjusted + merged in parallel.
    // Acquired rows land in applyGrowthAndAcquisitionInternal after R&D growth.
    await clearRegenerableRows(ctx, args.gameId, args.roundNumber);
    await Promise.all([
      ...args.adjusted.filter((r) => r.amount !== 0).map((row) => emitTransaction(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "adjusted",
        status: "settled",
        roleId: row.roleId,
        amount: row.amount,
        reason: row.reason,
      })),
      ...args.merged.filter((r) => r.amount !== 0).map((row) => emitPair(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "merged",
        status: "settled",
        fromRoleId: row.fromRoleId,
        toRoleId: row.toRoleId,
        amount: row.amount,
        reason: row.reason,
      })),
    ]);

    // Structural lab mutations. Parallelise within each bucket; buckets run
    // sequentially so merges settle before subsequent ops touch the survivor.
    await Promise.all(args.mergeOps.map((m) => mergeLabsInternal(ctx, {
      survivorLabId: m.survivorLabId,
      absorbedLabId: m.absorbedLabId,
      newName: m.newName,
      newSpec: m.newSpec,
    })));
    await Promise.all(args.decommissionOps.map((d) => decommissionLabInternal(ctx, d.labId)));
    // Ownership transfer: patch the lab's ownerRoleId, then emit a ledger pair
    // moving the old owner's compute balance to the new owner (compute follows
    // the lab — nationalisation includes the datacenter). The authoritative
    // amount is the OLD OWNER'S LIVE BALANCE at apply time, read fresh here —
    // prior phase-5 effects (computeDestroyed, computeTransfer) may have moved
    // balances since the pipeline captured computeToTransfer on args. Skip the
    // ledger emit when there's no amount to move or either side is undefined.
    await Promise.all(args.transferOps.map(async (t) => {
      await transferLabOwnershipInternal(ctx, t.labId, t.newOwnerRoleId);
      if (!t.oldOwnerRoleId || !t.newOwnerRoleId) return;
      const oldTable = await ctx.db.query("tables")
        .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", t.oldOwnerRoleId!))
        .first();
      const liveAmount = Math.max(0, oldTable?.computeStock ?? 0);
      if (liveAmount > 0) {
        await emitPair(ctx, {
          gameId: args.gameId,
          roundNumber: args.roundNumber,
          type: "transferred",
          status: "settled",
          fromRoleId: t.oldOwnerRoleId,
          toRoleId: t.newOwnerRoleId,
          amount: liveAmount,
          reason: `Lab ownership transferred — compute follows the lab`,
        });
      }
    }));
    // foundLabOps: create each new lab + settle the seedCompute debit from
    // the founder's pool. Pipeline validated uniqueness + founder balance;
    // createLabInternal defensively re-checks name uniqueness. Sequential
    // rather than parallel to avoid racing on name uniqueness within the
    // same batch (two foundLabOps proposing the same name would collide).
    for (const f of args.foundLabOps) {
      await createLabInternal(ctx, {
        gameId: args.gameId,
        name: f.name,
        spec: f.spec,
        rdMultiplier: 1,
        allocation: f.allocation,
        ownerRoleId: f.founderRoleId,
        createdRound: args.roundNumber,
      });
      await emitTransaction(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "adjusted",
        status: "settled",
        roleId: f.founderRoleId,
        amount: -f.seedCompute,
        reason: `foundLab "${f.name}" — seed compute escrow`,
      });
    }
    // Breakthrough / modelRollback final multiplier values. Growth in phase 9
    // grows from this value; there is no post-growth re-apply.
    await Promise.all(args.multiplierUpdates.map((u) => updateLabRdMultiplierInternal(ctx, u.labId, u.rdMultiplier)));

    // Stash productivity mods + write initial mechanicsLog slice on the round doc.
    const round = await ctx.db.query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", args.roundNumber))
      .first();
    if (round) {
      await ctx.db.patch(round._id, {
        pendingProductivityMods: args.productivityMods.length > 0 ? args.productivityMods : undefined,
        mechanicsLog: args.mechanicsLog,
      });
    }
  },
});

export const applyGrowthAndAcquisitionInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    nonce: v.string(),
    // Multiplier updates from deterministic R&D growth (computeLabGrowth).
    multiplierUpdates: v.array(v.object({ labId: v.id("labs"), rdMultiplier: v.number() })),
    // New compute acquired this round — labs get growth stock, non-lab roles get pool share.
    // Stashed on round.pendingAcquired, not yet written to the ledger: acquisition
    // materialises when the facilitator clicks Advance (see games.advanceRound).
    acquired: v.array(v.object({ roleId: v.string(), amount: v.number() })),
    // Phase 9 + 10 mechanics log entries to append to the existing phase-5 slice.
    // Sequence numbers are already offset by the caller.
    mechanicsLog: v.array(mechanicsLogEntryValidator),
  },
  handler: async (ctx, args) => {
    const runtime = await readRuntime(ctx, args.gameId);
    if (runtime.resolveNonce !== args.nonce) {
      throw new Error(`Resolve nonce mismatch on growth apply — another resolve superseded this run`);
    }

    // Validate + update multipliers in parallel. Missing labs are skipped
    // (likely decommissioned by a facilitator override between P7 and continue).
    const existing = await Promise.all(args.multiplierUpdates.map((u) => ctx.db.get(u.labId)));
    const validUpdates = args.multiplierUpdates.filter((_, i) => {
      const lab = existing[i];
      return lab && lab.gameId === args.gameId;
    });
    await Promise.all(validUpdates.map((u) => updateLabRdMultiplierInternal(ctx, u.labId, u.rdMultiplier)));

    // Stash acquired amounts on the round doc for materialisation at Advance.
    // Also clear pendingProductivityMods (consumed by phase-9 growth) and append
    // phase 9+10 entries to mechanicsLog.
    const round = await ctx.db.query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", args.roundNumber))
      .first();
    if (round) {
      const nonZero = args.acquired.filter((r) => r.amount !== 0);
      const priorLog = round.mechanicsLog ?? [];
      // Cap at MAX_MECHANICS_LOG_ENTRIES (= 200). Slice the new entries to fit
      // the remaining room, then append — avoids copying the full prior log
      // if priorLog is already at the cap.
      const roomLeft = Math.max(0, 200 - priorLog.length);
      const toAppend = roomLeft > 0 ? args.mechanicsLog.slice(0, roomLeft) : [];
      const newLog = toAppend.length > 0 ? [...priorLog, ...toAppend] : priorLog;
      await ctx.db.patch(round._id, {
        pendingAcquired: nonZero,
        pendingProductivityMods: undefined,
        mechanicsLog: newLog,
      });
    }
  },
});

