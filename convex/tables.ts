import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { logEvent, assertFacilitator } from "./events";
import { ROLES, COMPUTE_POOL_ELIGIBLE, getStartingComputeForRole } from "./gameData";

export const getByGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    return tables.map(({ aiDisposition: _, ...rest }) => rest);
  },
});

// Lightweight query — returns only enabled tables' roleId and roleName.
// Used by player pages that need endorsement target list without full table docs.
export const getEnabledRoleNames = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return tables
      .filter((t) => t.enabled)
      .map((t) => ({
        _id: t._id,
        roleId: t.roleId,
        roleName: t.roleName,
      }));
  },
});

// Lightweight query returning compute balances visible to all players.
// Replicates the physical game where players could see everyone's compute tokens.
const HAS_COMPUTE_ROLE_IDS: Set<string> = new Set(
  ROLES.filter((r) => (r.tags as readonly string[]).includes("has-compute")).map((r) => r.id),
);

export const getComputeOverview = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const [tables, game] = await Promise.all([
      ctx.db
        .query("tables")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect(),
      ctx.db.get(args.gameId),
    ]);

    const roles = tables
      .filter((t) => t.enabled && HAS_COMPUTE_ROLE_IDS.has(t.roleId))
      .map((t) => ({
        roleId: t.roleId,
        roleName: t.roleName,
        computeStock: t.computeStock ?? 0,
      }));

    const labs = (game?.labs ?? []).map((l) => ({
      name: l.name,
      roleId: l.roleId,
      computeStock: l.computeStock,
      rdMultiplier: l.rdMultiplier,
      allocation: l.allocation,
    }));

    return { roles, labs };
  },
});

export const getByJoinCode = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("tables")
      .withIndex("by_joinCode", (q) =>
        q.eq("joinCode", args.joinCode.toUpperCase())
      )
      .first();
    if (!table) return null;
    const { aiDisposition: _, ...rest } = table;
    return rest;
  },
});

export const get = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tableId);
  },
});

export const setConnected = mutation({
  args: {
    tableId: v.id("tables"),
    connected: v.boolean(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    const game = table ? await ctx.db.get(table.gameId) : null;
    const patch: Record<string, unknown> = {
      connected: args.connected,
    };
    // On connect, force human mode.
    // On disconnect during lobby: revert to npc (no human claimed this seat permanently).
    // On disconnect during active game: keep controlMode as human
    // so NPC/AI doesn't overwrite their actions during a momentary network blip.
    if (args.connected) {
      patch.controlMode = "human";
    } else if (game?.status === "lobby") {
      patch.controlMode = "npc";
    }
    // During active game, keep controlMode unchanged on disconnect
    // Reject if seat is already occupied by a different session
    if (args.connected && args.sessionId && table?.activeSessionId
        && table.activeSessionId !== args.sessionId && table.connected) {
      throw new Error("This seat is already occupied by another player");
    }
    // Track which browser session owns this seat
    if (args.connected && args.sessionId) {
      patch.activeSessionId = args.sessionId;
    } else if (!args.connected) {
      patch.activeSessionId = undefined;
    }
    await ctx.db.patch(args.tableId, patch);
    if (table) {
      await logEvent(ctx, table.gameId, args.connected ? "player_connect" : "player_disconnect", table.roleId, {
        sessionId: args.sessionId,
        previousSessionId: table.activeSessionId,
      });
    }
  },
});

export const setControlMode = mutation({
  args: {
    tableId: v.id("tables"),
    controlMode: v.union(v.literal("human"), v.literal("ai"), v.literal("npc")),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    await ctx.db.patch(args.tableId, { controlMode: args.controlMode });
  },
});

export const kickToAI = mutation({
  args: { tableId: v.id("tables"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    await ctx.db.patch(args.tableId, { controlMode: "ai", connected: false });
    await logEvent(ctx, table.gameId, "kick_to_ai", table.roleId);
  },
});

export const toggleEnabled = mutation({
  args: { tableId: v.id("tables"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    const newEnabled = !table.enabled;
    await ctx.db.patch(args.tableId, { enabled: newEnabled });

    // Recalculate pool-aware compute for all non-lab has-compute roles (lobby only)
    const game = await ctx.db.get(table.gameId);
    if (game?.status !== "lobby") return;

    const allTables = await ctx.db.query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", table.gameId))
      .collect();
    const enabledRoleIds = new Set(
      allTables
        .map((t) => t._id === args.tableId ? { ...t, enabled: newEnabled } : t)
        .filter((t) => t.enabled)
        .map((t) => t.roleId)
    );

    // Only recalculate for roles eligible for pool shares (not all roles)
    const poolAffectedRoles = new Set(Object.values(COMPUTE_POOL_ELIGIBLE).flatMap((w) => Object.keys(w)));
    for (const t of allTables) {
      if (!poolAffectedRoles.has(t.roleId)) continue;
      const newStock = getStartingComputeForRole(t.roleId, enabledRoleIds);
      if (newStock !== t.computeStock) {
        await ctx.db.patch(t._id, { computeStock: newStock });
      }
    }
  },
});

export const setDisposition = mutation({
  args: {
    tableId: v.id("tables"),
    disposition: v.string(),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    if (table.aiDisposition) {
      throw new Error("AI disposition already set — cannot change");
    }
    // Only allow setting disposition before actions are submitted
    const game = await ctx.db.get(table.gameId);
    if (game && game.phase !== "discuss" && game.phase !== "submit" && game.status !== "lobby") {
      throw new Error("Cannot set disposition during resolve — choose before submissions close");
    }
    await ctx.db.patch(args.tableId, { aiDisposition: args.disposition });
    await logEvent(ctx, table.gameId, "disposition_set", table.roleId, {
      disposition: args.disposition,
    });
  },
});

// ─── Pipeline internal queries ────────────────────────────────────────────────

export const setDispositionInternal = internalMutation({
  args: { tableId: v.id("tables"), disposition: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table || table.aiDisposition) return;
    await ctx.db.patch(args.tableId, { aiDisposition: args.disposition });
  },
});

export const getByGameInternal = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});
