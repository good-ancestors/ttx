import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { labTrajectoryValidator } from "./schema";
import { assertFacilitator } from "./events";

/** Find a single round by game + number using compound index (1 doc read). */
async function findRound(ctx: QueryCtx | MutationCtx, gameId: Id<"games">, roundNumber: number) {
  return ctx.db.query("rounds")
    .withIndex("by_game_and_number", (q) => q.eq("gameId", gameId).eq("number", roundNumber))
    .first();
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

// Lightweight version for facilitator sidebar — only fields needed by
// RdProgressChart, GameTimeline chart, and snapshot restore dropdown.
export const getByGameLightweight = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return rounds.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      gameId: r.gameId,
      number: r.number,
      label: r.label,
      labsAfter: r.labsAfter,
      // Sectioned summary — four short section arrays
      summary: r.summary ? {
        labs: r.summary.labs,
        geopolitics: r.summary.geopolitics,
        publicAndMedia: r.summary.publicAndMedia,
        aiSystems: r.summary.aiSystems,
      } : undefined,
      // Minimal flags for snapshot restore dropdown
      hasLabsBefore: r.labsBefore != null,
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

    const { facilitatorNotes: _, summary, ...rest } = round;
    if (!summary) return { ...rest, summary: undefined };
    const { facilitatorNotes: __, ...summaryRest } = summary;
    return { ...rest, summary: summaryRest };
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
      summary: round.summary ? {
        labs: round.summary.labs,
        geopolitics: round.summary.geopolitics,
        publicAndMedia: round.summary.publicAndMedia,
        aiSystems: round.summary.aiSystems,
      } : undefined,
    };
  },
});

export const applySummary = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    summary: v.object({
      labs: v.array(v.string()),
      geopolitics: v.array(v.string()),
      publicAndMedia: v.array(v.string()),
      aiSystems: v.array(v.string()),
      facilitatorNotes: v.optional(v.string()),
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
      labs: v.array(v.string()),
      geopolitics: v.array(v.string()),
      publicAndMedia: v.array(v.string()),
      aiSystems: v.array(v.string()),
      facilitatorNotes: v.optional(v.string()),
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
    // All settled rows up to and including this round, for stockAfter computation.
    const allTx = await ctx.db
      .query("computeTransactions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId))
      .collect();
    // `starting` rows are emitted at roundNumber=1 but represent seed stock present before
    // the first round's activity — include them in stockBefore regardless of target round.
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
        if (tx.status !== "settled") continue;
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

