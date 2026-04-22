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
    // multiplierOverrides are LLM-initiated and apply in this phase. Growth-derived
    // multiplier updates land in applyGrowthAndAcquisitionInternal.
    multiplierOverrides: v.array(v.object({ labId: v.id("labs"), rdMultiplier: v.number() })),
    adjusted: v.array(v.object({ roleId: v.string(), amount: v.number(), reason: v.string() })),
    merged: v.array(v.object({ fromRoleId: v.string(), toRoleId: v.string(), amount: v.number(), reason: v.string() })),
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
    for (const u of args.multiplierOverrides) {
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
    // LLM-initiated multiplier overrides apply here so the facilitator sees the final
    // override value during P7 review. Growth-derived updates land later.
    for (const u of args.multiplierOverrides) {
      await updateLabRdMultiplierInternal(ctx, u.labId, u.rdMultiplier);
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
    const round = await ctx.db.query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", args.roundNumber))
      .first();
    if (round) {
      const nonZero = args.acquired.filter((r) => r.amount !== 0);
      await ctx.db.patch(round._id, { pendingAcquired: nonZero });
    }
  },
});

/** Materialise `round.pendingAcquired` into settled `acquired` ledger rows.
 *  Called by advanceRound at round-transition time. Idempotent: clearing the field
 *  after emission prevents double-apply if something re-runs. */
export const materializePendingAcquiredInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", args.roundNumber))
      .first();
    if (!round || !round.pendingAcquired || round.pendingAcquired.length === 0) return;

    for (const row of round.pendingAcquired) {
      if (row.amount === 0) continue;
      await emitTransaction(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "acquired",
        status: "settled",
        roleId: row.roleId,
        amount: row.amount,
        reason: "Round pool share (materialised at Advance)",
      });
    }
    await ctx.db.patch(round._id, { pendingAcquired: undefined });
  },
});
