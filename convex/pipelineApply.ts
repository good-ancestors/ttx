// Atomic resolve apply — two mutations, one per pipeline half.
// Kept out of pipeline.ts because that module is "use node" (actions only); mutations must
// live in a default Convex runtime module.
//
// Split per docs/resolve-pipeline.md P7:
//
//   applyDecidedEffectsInternal   — phase 5 (and 5.7 internal): structural ops +
//                                   adjusted compute + merged-pair ledger. The
//                                   facilitator reviews the result at P7.
//   applyGrowthAndAcquisitionInternal — phase 8/9/10: share% overrides already
//                                   live on games.computeShareOverrides by this
//                                   point; multiplier updates and acquired rows
//                                   land together so the post-state is coherent.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  mergeLabsInternal,
  decommissionLabInternal,
  transferLabOwnershipInternal,
  updateLabRdMultiplierInternal,
} from "./labs";
import { emitTransaction, emitPair, clearRegenerableRows } from "./computeLedger";

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
    transferOps: v.array(v.object({ labId: v.id("labs"), newOwnerRoleId: v.optional(v.string()) })),
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
    mechanicsLog: v.array(v.object({
      sequence: v.number(),
      phase: v.union(v.literal(5), v.literal(9), v.literal(10)),
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
    })),
  },
  handler: async (ctx, args) => {
    // Re-verify the resolve nonce inside the atomic mutation.
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.resolveNonce !== args.nonce) {
      throw new Error(`Resolve nonce mismatch (expected ${args.nonce}, got ${game.resolveNonce ?? "null"}) — another resolve superseded this run`);
    }

    // Validate — every labId exists and (for structural ops) is still active.
    const structuralLabIds: Id<"labs">[] = [
      ...args.mergeOps.flatMap((m) => [m.survivorLabId, m.absorbedLabId]),
      ...args.decommissionOps.map((d) => d.labId),
      ...args.transferOps.map((t) => t.labId),
    ];
    for (const id of structuralLabIds) {
      const lab = await ctx.db.get(id);
      if (!lab || lab.gameId !== args.gameId) {
        throw new Error(`Lab ${id} not found or wrong game — aborting resolve apply`);
      }
      if (lab.status !== "active") {
        throw new Error(`Lab ${id} (${lab.name}) is not active — structural op rejected (likely facilitator-decommissioned since resolve started)`);
      }
    }
    for (const u of args.multiplierUpdates) {
      const lab = await ctx.db.get(u.labId);
      if (!lab || lab.gameId !== args.gameId) {
        throw new Error(`Lab ${u.labId} not found or wrong game — aborting resolve apply`);
      }
    }

    // Ledger: wipe regenerable rows, then emit adjusted + merged only.
    // Acquired rows land in applyGrowthAndAcquisitionInternal after R&D growth.
    await clearRegenerableRows(ctx, args.gameId, args.roundNumber);
    for (const row of args.adjusted) {
      if (row.amount === 0) continue;
      await emitTransaction(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "adjusted",
        status: "settled",
        roleId: row.roleId,
        amount: row.amount,
        reason: row.reason,
      });
    }
    for (const row of args.merged) {
      if (row.amount === 0) continue;
      await emitPair(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "merged",
        status: "settled",
        fromRoleId: row.fromRoleId,
        toRoleId: row.toRoleId,
        amount: row.amount,
        reason: row.reason,
      });
    }

    // Structural lab mutations — these are phase 5.5/5.6/5.4/5.7 ops.
    for (const m of args.mergeOps) {
      await mergeLabsInternal(ctx, {
        survivorLabId: m.survivorLabId,
        absorbedLabId: m.absorbedLabId,
        newName: m.newName,
        newSpec: m.newSpec,
      });
    }
    for (const d of args.decommissionOps) {
      await decommissionLabInternal(ctx, d.labId);
    }
    for (const t of args.transferOps) {
      await transferLabOwnershipInternal(ctx, t.labId, t.newOwnerRoleId);
    }
    // Breakthrough / modelRollback final multiplier values. Growth in phase 9
    // grows from this value; there is no post-growth re-apply.
    for (const u of args.multiplierUpdates) {
      await updateLabRdMultiplierInternal(ctx, u.labId, u.rdMultiplier);
    }

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
    mechanicsLog: v.array(v.object({
      sequence: v.number(),
      phase: v.union(v.literal(5), v.literal(9), v.literal(10)),
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
    })),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.resolveNonce !== args.nonce) {
      throw new Error(`Resolve nonce mismatch on growth apply — another resolve superseded this run`);
    }

    for (const u of args.multiplierUpdates) {
      const lab = await ctx.db.get(u.labId);
      if (!lab || lab.gameId !== args.gameId) {
        // Multiplier update on a missing lab — skip (likely decommissioned after the decide
        // phase by a facilitator override between P7 and continue).
        continue;
      }
      await updateLabRdMultiplierInternal(ctx, u.labId, u.rdMultiplier);
    }

    // Stash acquired amounts on the round doc for materialisation at Advance.
    // Also clear pendingProductivityMods (consumed by phase-9 growth) and append
    // phase 9+10 entries to mechanicsLog.
    const round = await ctx.db.query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", args.roundNumber))
      .first();
    if (round) {
      const nonZero = args.acquired.filter((r) => r.amount !== 0);
      const priorLog = round.mechanicsLog ?? [];
      await ctx.db.patch(round._id, {
        pendingAcquired: nonZero,
        pendingProductivityMods: undefined,
        mechanicsLog: [...priorLog, ...args.mechanicsLog],
      });
    }
  },
});

