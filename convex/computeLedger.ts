// Compute ledger — single source of truth for compute movements.
//
// INVARIANT: table.computeStock (cache) === sum(amount WHERE roleId=X AND status=settled)
//
// All writes go through emitTransaction/settlePending/cancelPending so the cache
// stays consistent. Never patch table.computeStock directly.

import { v } from "convex/values";
import { mutation, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertFacilitator, assertNotResolving } from "./events";
import { readRuntime } from "./gameRuntime";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionType =
  | "starting"
  | "acquired"
  | "transferred"
  | "adjusted"
  | "merged"
  | "facilitator";

export type TransactionStatus = "pending" | "settled";

export interface EmitArgs {
  gameId: Id<"games">;
  roundNumber: number;
  type: TransactionType;
  status: TransactionStatus;
  roleId: string;
  amount: number;
  counterpartyRoleId?: string;
  reason?: string;
  actionId?: string;
  submissionId?: Id<"submissions">;
}

// ─── Helpers (pure, not exported) ─────────────────────────────────────────────

async function patchTableStock(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roleId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const table = await ctx.db
    .query("tables")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", roleId))
    .first();
  if (!table) return;
  const next = Math.max(0, (table.computeStock ?? 0) + delta);
  await ctx.db.patch(table._id, { computeStock: next });
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/** Write one ledger row. If status=settled, also updates the role's cached table.computeStock. */
export async function emitTransaction(ctx: MutationCtx, args: EmitArgs): Promise<Id<"computeTransactions">> {
  const id = await ctx.db.insert("computeTransactions", {
    gameId: args.gameId,
    roundNumber: args.roundNumber,
    createdAt: Date.now(),
    type: args.type,
    status: args.status,
    roleId: args.roleId,
    counterpartyRoleId: args.counterpartyRoleId,
    amount: args.amount,
    reason: args.reason,
    actionId: args.actionId,
    submissionId: args.submissionId,
  });
  if (args.status === "settled") {
    await patchTableStock(ctx, args.gameId, args.roleId, args.amount);
  }
  return id;
}

/** Emit a matched pair of rows (transferred or merged) — caller gives the two amounts. */
export async function emitPair(ctx: MutationCtx, args: {
  gameId: Id<"games">;
  roundNumber: number;
  type: "transferred" | "merged";
  status: TransactionStatus;
  fromRoleId: string;
  toRoleId: string;
  amount: number;           // positive; the magnitude of the transfer
  reason?: string;
  actionId?: string;
  submissionId?: Id<"submissions">;
}): Promise<{ fromId: Id<"computeTransactions">; toId: Id<"computeTransactions"> }> {
  if (args.amount <= 0) {
    throw new Error(`emitPair requires positive amount, got ${args.amount}`);
  }
  const base = {
    gameId: args.gameId,
    roundNumber: args.roundNumber,
    type: args.type,
    status: args.status,
    reason: args.reason,
    actionId: args.actionId,
    submissionId: args.submissionId,
  } as const;
  const fromId = await emitTransaction(ctx, {
    ...base,
    roleId: args.fromRoleId,
    counterpartyRoleId: args.toRoleId,
    amount: -Math.abs(args.amount),
  });
  const toId = await emitTransaction(ctx, {
    ...base,
    roleId: args.toRoleId,
    counterpartyRoleId: args.fromRoleId,
    amount: Math.abs(args.amount),
  });
  return { fromId, toId };
}

/** Transition a pending row to settled. Updates the cached stock. */
export async function settlePending(
  ctx: MutationCtx,
  txId: Id<"computeTransactions">,
): Promise<void> {
  const tx = await ctx.db.get(txId);
  if (!tx) return;
  if (tx.status === "settled") return;
  await ctx.db.patch(txId, { status: "settled" });
  await patchTableStock(ctx, tx.gameId, tx.roleId, tx.amount);
}

/** Cancel a pending row — delete. Used for action refund / edit. No-op if already settled. */
export async function cancelPending(
  ctx: MutationCtx,
  txId: Id<"computeTransactions">,
): Promise<void> {
  const tx = await ctx.db.get(txId);
  if (!tx) return;
  if (tx.status === "settled") return;
  await ctx.db.delete(txId);
}

/** Cancel all pending rows tied to a specific action (submission action edit/delete/fail).
 *  Optional filter: limit to rows involving a specific counterparty pair — used when cancelling
 *  a single request within an action that has multiple transfers. */
export async function cancelPendingForAction(
  ctx: MutationCtx,
  gameId: Id<"games">,
  actionId: string,
  opts?: { involvingRoleId?: string },
): Promise<number> {
  const rows = await ctx.db
    .query("computeTransactions")
    .withIndex("by_action", (q) => q.eq("gameId", gameId).eq("actionId", actionId))
    .collect();
  let cancelled = 0;
  for (const r of rows) {
    if (r.status !== "pending") continue;
    if (opts?.involvingRoleId) {
      if (r.roleId !== opts.involvingRoleId && r.counterpartyRoleId !== opts.involvingRoleId) continue;
    }
    await ctx.db.delete(r._id);
    cancelled++;
  }
  return cancelled;
}

/** Settle all pending rows tied to a specific action (successful roll). */
export async function settlePendingForAction(
  ctx: MutationCtx,
  gameId: Id<"games">,
  actionId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("computeTransactions")
    .withIndex("by_action", (q) => q.eq("gameId", gameId).eq("actionId", actionId))
    .collect();
  let settled = 0;
  for (const r of rows) {
    if (r.status === "pending") {
      await ctx.db.patch(r._id, { status: "settled" });
      await patchTableStock(ctx, r.gameId, r.roleId, r.amount);
      settled++;
    }
  }
  return settled;
}

/** Wipe narrative-driven regenerable rows for a round — settled acquired / adjusted / merged —
 *  and refund the cache. Preserves starting / transferred / facilitator (non-regenerable) AND
 *  pending rows (player-action-owned escrows: foundLab + send targets, settled/cancelled by
 *  rollAllInternal). Pending rows have an `actionId` and must survive resolve re-runs so the
 *  dice-roll settle/cancel pass still has something to act on. */
export async function clearRegenerableRows(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
): Promise<number> {
  const rows = await ctx.db
    .query("computeTransactions")
    .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId).eq("roundNumber", roundNumber))
    .collect();
  let deleted = 0;
  for (const r of rows) {
    // Preserve any row with actionId — those are player-action-owned escrows/settlements
    // (send targets, foundLab), owned by roll-all not narrative. Also preserve pending.
    if (r.actionId) continue;
    if (r.status !== "settled") continue;
    if (r.type === "acquired" || r.type === "adjusted" || r.type === "merged") {
      await patchTableStock(ctx, r.gameId, r.roleId, -r.amount);
      await ctx.db.delete(r._id);
      deleted++;
    }
  }
  return deleted;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/** Sum of all settled rows for a role — the authoritative current stock.
 *  In normal operation this equals table.computeStock; useful for audits. */
export async function getStock(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  roleId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("computeTransactions")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", roleId))
    .collect();
  let total = 0;
  for (const r of rows) {
    if (r.status === "settled") total += r.amount;
  }
  return Math.max(0, total);
}

/** Sum of pending send-escrows (negative rows) for a role in a given round.
 *  This is the compute the player has committed but not yet spent. */
export async function getPendingEscrow(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  roleId: string,
  roundNumber: number,
): Promise<number> {
  const rows = await ctx.db
    .query("computeTransactions")
    .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId).eq("roundNumber", roundNumber))
    .collect();
  let escrowed = 0;
  for (const r of rows) {
    if (r.status === "pending" && r.roleId === roleId && r.amount < 0) {
      escrowed += -r.amount;
    }
  }
  return escrowed;
}

/** Available-to-spend balance — cached settled stock minus current-round pending sends. */
export async function getAvailableStock(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  roleId: string,
  roundNumber: number,
): Promise<number> {
  const table = await ctx.db
    .query("tables")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", roleId))
    .first();
  const settled = table?.computeStock ?? 0;
  const escrowed = await getPendingEscrow(ctx, gameId, roleId, roundNumber);
  return Math.max(0, settled - escrowed);
}

// ─── Exposed internal query/mutation for scripts/tests ────────────────────────

/** Clear regenerable rows for a round — used at the start of a re-resolve so the
 *  pipeline reads table.computeStock at the correct pre-growth baseline. */
export const clearRegenerableRowsInternal = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await clearRegenerableRows(ctx, args.gameId, args.roundNumber);
  },
});

/** Settled "transferred" rows for a round with no actionId — i.e. facilitator
 *  direct transfers and AI-initiated direct transfers, which happen outside the
 *  player-action escrow flow. Used by the apply phase to surface those compute
 *  movements in the round's mechanicsLog. */
export const getDirectTransfersInternal = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("computeTransactions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
      .collect();
    return rows.filter((r) =>
      r.type === "transferred" && r.status === "settled" && !r.actionId,
    );
  },
});

/** All settled rows for a round. Used by the merger replay path to recover
 *  authoritative transferred amounts from the ledger when re-resolving (the
 *  cached labs.computeStock already reflects post-pinned state, so the ledger
 *  is the only consistent source for the absorbed quantity). */
export const getSettledRowsForRoundInternal = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("computeTransactions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
      .collect();
    return rows.filter((r) => r.status === "settled");
  },
});

/** Facilitator-triggered wrapper — used by the test harness to pin the regenerate
 *  preserves-pending-escrow invariant without running the LLM pipeline. Also usable
 *  by a facilitator to manually reset a round's narrative-driven compute moves. */
export const clearRegenerableRowsFacilitator = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    assertNotResolving(await readRuntime(ctx, args.gameId));
    return await clearRegenerableRows(ctx, args.gameId, args.roundNumber);
  },
});

export type ComputeTransaction = Doc<"computeTransactions">;
