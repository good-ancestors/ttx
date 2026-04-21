// Atomic resolve apply — single mutation that lands lab CRUD + ledger writes + snapshot.
// Kept out of pipeline.ts because that module is "use node" (actions only); mutations must
// live in a default Convex runtime module.

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

export const applyResolveInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    mergeOps: v.array(v.object({
      survivorLabId: v.id("labs"),
      absorbedLabId: v.id("labs"),
      newName: v.optional(v.string()),
      newSpec: v.optional(v.string()),
      reason: v.string(),
    })),
    decommissionOps: v.array(v.object({ labId: v.id("labs") })),
    transferOps: v.array(v.object({ labId: v.id("labs"), newOwnerRoleId: v.optional(v.string()) })),
    multiplierUpdates: v.array(v.object({ labId: v.id("labs"), rdMultiplier: v.number() })),
    acquired: v.array(v.object({ roleId: v.string(), amount: v.number() })),
    adjusted: v.array(v.object({ roleId: v.string(), amount: v.number(), reason: v.string() })),
    merged: v.array(v.object({ fromRoleId: v.string(), toRoleId: v.string(), amount: v.number(), reason: v.string() })),
  },
  handler: async (ctx, args) => {
    // Validate — every labId exists and belongs to this game. Fail fast before any writes.
    const labIds: Id<"labs">[] = [
      ...args.mergeOps.flatMap((m) => [m.survivorLabId, m.absorbedLabId]),
      ...args.decommissionOps.map((d) => d.labId),
      ...args.transferOps.map((t) => t.labId),
      ...args.multiplierUpdates.map((u) => u.labId),
    ];
    for (const id of labIds) {
      const lab = await ctx.db.get(id);
      if (!lab || lab.gameId !== args.gameId) {
        throw new Error(`Lab ${id} not found or wrong game — aborting resolve apply`);
      }
    }

    // Ledger: wipe regenerable rows, emit fresh acquired/adjusted/merged
    await clearRegenerableRows(ctx, args.gameId, args.roundNumber);
    for (const row of args.acquired) {
      if (row.amount === 0) continue;
      await emitTransaction(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "acquired",
        status: "settled",
        roleId: row.roleId,
        amount: row.amount,
        reason: "Round pool share",
      });
    }
    for (const row of args.adjusted) {
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

    // Structural lab mutations
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
    for (const u of args.multiplierUpdates) {
      await updateLabRdMultiplierInternal(ctx, u.labId, u.rdMultiplier);
    }
  },
});
