import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { labTrajectoryValidator } from "./schema";
import { assertFacilitator } from "./events";

/** Find a single round by game + number using compound index (1 doc read). */
async function findRound(ctx: QueryCtx | MutationCtx, gameId: Id<"games">, roundNumber: number) {
  return ctx.db.query("rounds")
    .withIndex("by_game_and_number", (q) => q.eq("gameId", gameId).eq("number", roundNumber))
    .first();
}

/** Narrow projection of `round.summary` — outcomes/stateOfPlay/pressures for the
 *  current shape, plus the legacy 4-domain buckets that older rounds still carry.
 *  Drops `facilitatorNotes` (facilitator-only). Reused by every read query that
 *  surfaces summary; centralised so adding a new narrative field requires
 *  exactly one edit. */
type RoundSummary = NonNullable<Doc<"rounds">["summary"]>;
type ProjectedSummary = Pick<
  RoundSummary,
  "outcomes" | "stateOfPlay" | "pressures" | "labs" | "geopolitics" | "publicAndMedia" | "aiSystems"
>;

// Rot guard: every key on `RoundSummary` must either be projected or explicitly
// redacted (currently only `facilitatorNotes`). Adding a new schema field fails
// type-check here until the maintainer decides which bucket it belongs in.
type _UnclassifiedSummaryKeys = Exclude<keyof RoundSummary, keyof ProjectedSummary | "facilitatorNotes">;
const _summaryAllowlistCheck: _UnclassifiedSummaryKeys extends never ? true : {
  ERROR: "Add new summary key to projectSummary or extend the redaction list";
  UNCLASSIFIED: _UnclassifiedSummaryKeys;
} = true;
void _summaryAllowlistCheck;

export function projectSummary(s: RoundSummary | undefined): ProjectedSummary | undefined {
  if (!s) return undefined;
  return {
    outcomes: s.outcomes,
    stateOfPlay: s.stateOfPlay,
    pressures: s.pressures,
    labs: s.labs,
    geopolitics: s.geopolitics,
    publicAndMedia: s.publicAndMedia,
    aiSystems: s.aiSystems,
  };
}

export const getByGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

// Lightweight version for facilitator sidebar — only fields needed by the
// RdProgressChart and the snapshot-restore dropdown. The `RoundLite` consumer
// type (src/components/facilitator/types.ts) reflects this shape.
//
// Deliberately omits `summary` (full prose blob, can be tens of KB) and the
// `_id`/`_creationTime`/`gameId` metadata: GameTimeline reads `summary` via
// `api.rounds.getByGame` (only mounted on `status === "finished"`), and no
// consumer of this projection keys on `_id`. Trimming halves the per-tick wire
// cost when the rounds doc invalidates (every pipeline phase patch fires).
export const getByGameLightweight = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return rounds.map((r) => ({
      number: r.number,
      label: r.label,
      labsAfter: r.labsAfter,
      hasLabsBefore: r.labsBefore != null,
      // Project just the rdMultiplier override entries from mechanicsLog so the
      // chart can layer them on top of the (immutable) labsAfter snapshot.
      // Trimmed to {subject, after, sequence} to keep the wire shape small —
      // mechanicsLog can hold up to 200 entries per round.
      rdOverrides: (r.mechanicsLog ?? [])
        .filter((e) => e.source === "facilitator-edit" && e.field === "rdMultiplier")
        .map((e) => ({ subject: e.subject, after: e.after, sequence: e.sequence })),
    }));
  },
});

export const getCurrent = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const round = await findRound(ctx, args.gameId, game.currentRound);
    if (!round) return null;

    // Explicit allowlist (not strip-spread) — the round doc accumulates hot-
    // write fields (mechanicsLog, appliedOps, etc.) on every pipeline phase
    // patch, and doc-level invalidation re-pushes the subscription each time.
    // Bounding the wire shape here means adding a new round field doesn't
    // silently bloat every facilitator subscriber. The `CurrentRound` type
    // (src/components/facilitator/types.ts) is derived from this return.
    return {
      number: round.number,
      label: round.label,
      summary: projectSummary(round.summary),
      aiMeta: round.aiMeta,
      appliedOps: round.appliedOps,
      mechanicsLog: round.mechanicsLog,
    };
  },
});

/** Facilitator-only: raw LLM prompt + response for the resolve narrative call. */
export const getResolveDebug = query({
  args: { gameId: v.id("games"), roundNumber: v.number(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    return round?.resolveDebug ?? null;
  },
});

// Lightweight player-facing query — only fields players need, no games doc dependency.
// Takes roundNumber directly to avoid reading the games doc (which changes on every
// phase/timer/pipeline update and would cause spurious re-renders for all 30 players).
export const getForPlayer = query({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_game_and_number", (q) => q.eq("gameId", args.gameId).eq("number", args.roundNumber))
      .first();
    if (!round) return null;

    return {
      _id: round._id,
      number: round.number,
      label: round.label,
      summary: projectSummary(round.summary),
    };
  },
});

export const applySummary = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    summary: v.object({
      outcomes: v.optional(v.string()),
      stateOfPlay: v.optional(v.string()),
      pressures: v.optional(v.string()),
      facilitatorNotes: v.optional(v.string()),
      // Legacy 4-domain fields (older rounds) — accepted for compat during edit.
      labs: v.optional(v.array(v.string())),
      geopolitics: v.optional(v.array(v.string())),
      publicAndMedia: v.optional(v.array(v.string())),
      aiSystems: v.optional(v.array(v.string())),
    }),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { summary: args.summary });
  },
});

export const clearResolution = mutation({
  args: { gameId: v.id("games"), roundNumber: v.number(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return;
    await ctx.db.patch(round._id, { summary: undefined });
  },
});

export const setAiMeta = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    aiMeta: v.object({
      resolveModel: v.optional(v.string()),
      resolveTimeMs: v.optional(v.number()),
      resolveTokens: v.optional(v.number()),
      narrativeModel: v.optional(v.string()),
      narrativeTimeMs: v.optional(v.number()),
      narrativeTokens: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return;

    await ctx.db.patch(round._id, { aiMeta: args.aiMeta });
  },
});

// ─── Pipeline internal mutations ──────────────────────────────────────────────

export const getForPipeline = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await findRound(ctx, args.gameId, args.roundNumber);
  },
});

export const getAllForPipeline = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.query("rounds").withIndex("by_game", (q) => q.eq("gameId", args.gameId)).collect();
  },
});

export const setResolveNonce = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number(), nonce: v.string() },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (round) await ctx.db.patch(round._id, { resolveNonce: args.nonce });
  },
});

export const applySummaryInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    summary: v.object({
      outcomes: v.optional(v.string()),
      stateOfPlay: v.optional(v.string()),
      pressures: v.optional(v.string()),
      facilitatorNotes: v.optional(v.string()),
      labs: v.optional(v.array(v.string())),
      geopolitics: v.optional(v.array(v.string())),
      publicAndMedia: v.optional(v.array(v.string())),
      aiSystems: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (round) await ctx.db.patch(round._id, { summary: args.summary });
  },
});

/** Build a labSnapshotValidator-shaped array from the current labs table + tables cache. */
async function buildLabSnapshot(ctx: MutationCtx, gameId: Id<"games">) {
  const [labs, tables] = await Promise.all([
    ctx.db.query("labs").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect(),
    ctx.db.query("tables").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect(),
  ]);
  const stockByRole = new Map(tables.map((t) => [t.roleId, t.computeStock ?? 0] as const));
  return labs.map((l) => ({
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
  }));
}

export const snapshotBeforeInternal = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round || round.labsBefore) return; // Already snapshotted
    const labsBefore = await buildLabSnapshot(ctx, args.gameId);
    await ctx.db.patch(round._id, { labsBefore });
  },
});

export const snapshotAfterInternal = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return;
    const labsAfter = await buildLabSnapshot(ctx, args.gameId);
    await ctx.db.patch(round._id, { labsAfter });
  },
});

export const setLabTrajectories = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    trajectories: v.array(labTrajectoryValidator),
  },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (round) await ctx.db.patch(round._id, { labTrajectories: args.trajectories });
  },
});

/** Write the P7 applied-ops list for facilitator review. Rendered on the effect-review
 *  screen so the facilitator sees what the decide LLM proposed, what actually landed,
 *  and what was rejected by the validator (conflicts, invalid roleIds, last-active-lab
 *  guard, etc.). */
export const setAppliedOpsInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    appliedOps: v.array(v.object({
      type: v.string(),
      status: v.union(v.literal("applied"), v.literal("rejected")),
      summary: v.string(),
      reason: v.optional(v.string()),
      category: v.optional(v.string()),
      opType: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (round) await ctx.db.patch(round._id, { appliedOps: args.appliedOps });
  },
});

/** Read the pending (not-yet-materialised) acquisition amounts for a round, joined with
 *  role display names. Shown in the "New Compute Acquired" panel during narrate — the
 *  facilitator sees what will land at Advance. Falls back to settled `acquired` ledger
 *  rows for legacy rounds that were resolved before the deferral landed. */
export const getPendingAcquired = query({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return [];

    const tables = await ctx.db.query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const nameByRole = new Map(tables.map((t) => [t.roleId, t.roleName] as const));

    if (round.pendingAcquired && round.pendingAcquired.length > 0) {
      return round.pendingAcquired
        .filter((r) => r.amount !== 0)
        .map((r) => ({ roleId: r.roleId, name: nameByRole.get(r.roleId) ?? r.roleId, amount: r.amount, pending: true as const }));
    }

    // Fallback: legacy rounds resolved pre-deferral have acquired rows in the ledger.
    const acquired = await ctx.db.query("computeTransactions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
      .filter((q) => q.eq(q.field("type"), "acquired"))
      .collect();
    const byRole = new Map<string, number>();
    for (const row of acquired) {
      byRole.set(row.roleId, (byRole.get(row.roleId) ?? 0) + row.amount);
    }
    return [...byRole.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([roleId, amount]) => ({ roleId, name: nameByRole.get(roleId) ?? roleId, amount, pending: false as const }));
  },
});

/** Facilitator-edit path for pending acquisition: overwrite the full `pendingAcquired`
 *  array with new per-role amounts. Used by the editable "New Compute Acquired" panel.
 *  No mechanicsLog write — acquisition entries are emitted as P0 on the *next* round
 *  when materialisePendingAcquired fires at Advance, not during this round's resolve. */
export const updatePendingAcquired = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    amounts: v.array(v.object({ roleId: v.string(), amount: v.number() })),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) throw new Error(`Round ${args.roundNumber} not found`);
    // Acquisition is conserved non-negative compute flowing in. Reject non-finite
    // values (NaN/Infinity pass v.number()) and any negative amount — a negative
    // "acquired" row would violate the ledger invariant that `acquired` entries
    // only ever add compute.
    for (const r of args.amounts) {
      if (!Number.isFinite(r.amount)) throw new Error(`updatePendingAcquired: amount for ${r.roleId} is not a finite number`);
      if (r.amount < 0) throw new Error(`updatePendingAcquired: amount for ${r.roleId} must be >= 0 (got ${r.amount})`);
    }
    const nonZero = args.amounts.filter((r) => r.amount !== 0);
    await ctx.db.patch(round._id, { pendingAcquired: nonZero });
  },
});

export const setResolveDebugInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    prompt: v.string(),
    responseJson: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return;
    await ctx.db.patch(round._id, {
      resolveDebug: {
        prompt: args.prompt,
        responseJson: args.responseJson,
        error: args.error,
        capturedAt: Date.now(),
      },
    });
  },
});

export const setAiMetaInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    meta: v.object({
      resolveModel: v.optional(v.string()),
      resolveTimeMs: v.optional(v.number()),
      resolveTokens: v.optional(v.number()),
      narrativeModel: v.optional(v.string()),
      narrativeTimeMs: v.optional(v.number()),
      narrativeTokens: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const round = await findRound(ctx, args.gameId, args.roundNumber);
    if (!round) return;
    // Merge with existing meta
    const existing = round.aiMeta ?? {};
    await ctx.db.patch(round._id, {
      aiMeta: { ...existing, ...Object.fromEntries(Object.entries(args.meta).filter(([, v]) => v !== undefined)) },
    });
  },
});

/** Derived compute holder view for a round — aggregates computeTransactions into the
 *  {stockBefore, acquired, transferred, adjusted, merged, facilitator, stockAfter} shape
 *  the ComputeFlowPanel / ComputeDetailTable consume. Replaces the old stored
 *  round.computeHolders which is now unnecessary. */
export const getComputeHolderView = query({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    // Range-scan settled rows in this round or earlier. Narrower than a full
    // game scan, which matters as games accumulate transactions round-over-round.
    const allTx = await ctx.db
      .query("computeTransactions")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).lte("roundNumber", args.roundNumber),
      )
      .collect();
    // `starting` rows are emitted at roundNumber=1 but represent seed stock present before
    // the first round's activity — always in priorRounds regardless of target.
    const priorRounds = allTx.filter((t) =>
      t.status === "settled" &&
      (t.roundNumber < args.roundNumber || t.type === "starting")
    );
    const thisRound = allTx.filter(
      (t) => t.roundNumber === args.roundNumber && t.type !== "starting"
    );

    const stockBeforeByRole = new Map<string, number>();
    for (const tx of priorRounds) {
      stockBeforeByRole.set(tx.roleId, (stockBeforeByRole.get(tx.roleId) ?? 0) + tx.amount);
    }

    // Gather roleIds that appear either as holders before this round OR have activity this round.
    const roleIds = new Set<string>([...stockBeforeByRole.keys(), ...thisRound.map((t) => t.roleId)]);

    // Pull role names from tables (role metadata).
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const roleNameById = new Map(tables.map((t) => [t.roleId, t.roleName] as const));

    const rows: {
      roleId: string;
      name: string;
      stockBefore: number;
      acquired: number;
      transferred: number;
      adjusted: number;
      merged: number;
      facilitator: number;
      stockAfter: number;
    }[] = [];

    for (const roleId of roleIds) {
      const stockBefore = Math.max(0, stockBeforeByRole.get(roleId) ?? 0);
      let acquired = 0, transferred = 0, adjusted = 0, merged = 0, facilitator = 0;
      for (const tx of thisRound) {
        if (tx.roleId !== roleId) continue;
        // Include pending `transferred` rows so planned/soft-take transfers are visible
        // in the detail table and reflected in stockAfter. Other types only count when
        // settled (pending escrow for foundings, etc. hasn't actually moved compute).
        const include = tx.status === "settled" || (tx.type === "transferred" && tx.status === "pending");
        if (!include) continue;
        switch (tx.type) {
          case "acquired": acquired += tx.amount; break;
          case "transferred": transferred += tx.amount; break;
          case "adjusted": adjusted += tx.amount; break;
          case "merged": merged += tx.amount; break;
          case "facilitator": facilitator += tx.amount; break;
          case "starting": break; // already folded into stockBefore above; filtered out of thisRound
        }
      }
      const delta = acquired + transferred + adjusted + merged + facilitator;
      const stockAfter = Math.max(0, stockBefore + delta);
      if (stockBefore === 0 && delta === 0) continue; // skip inert rows
      rows.push({
        roleId,
        name: roleNameById.get(roleId) ?? roleId,
        stockBefore,
        acquired,
        transferred,
        adjusted,
        merged,
        facilitator,
        stockAfter,
      });
    }

    return rows.sort((a, b) => b.stockAfter - a.stockAfter);
  },
});

