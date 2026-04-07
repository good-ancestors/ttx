import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { logEvent, assertFacilitator } from "./events";
import { COMPUTE_POOL_ELIGIBLE, calculatePoolAllocations } from "./gameData";

/** Patch object to fully release a seat (clear player state, revert control mode). */
function vacateSeat(controlMode: "npc" | "ai" = "npc") {
  return { connected: false, controlMode, playerName: undefined, activeSessionId: undefined } as const;
}

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

// Returns non-lab compute holders only. Labs come from game.labs (already subscribed).
// This avoids reading the games doc, which would cause spurious re-runs on phase/timer changes.
export const getComputeOverview = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const tables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const roles = tables
      .filter((t) => t.enabled && t.computeStock != null && t.computeStock > 0)
      .map((t) => ({
        roleId: t.roleId,
        roleName: t.roleName,
        computeStock: t.computeStock ?? 0,
      }));

    return { roles };
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

// Lightweight query for the role picker — only fields needed to render available/claimed roles.
export const getAvailableRoles = query({
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
        connected: t.connected,
        controlMode: t.controlMode,
        playerName: t.playerName,
      }));
  },
});

// Player claims a role from the role picker (Jackbox-style join flow).
export const claimRole = mutation({
  args: {
    gameId: v.id("games"),
    roleId: v.string(),
    sessionId: v.string(),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game has already started");

    const table = await ctx.db
      .query("tables")
      .withIndex("by_game_and_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .first();
    if (!table) throw new Error("Role not found");
    if (!table.enabled) throw new Error("This role is not available");
    if (table.connected && table.activeSessionId
        && table.activeSessionId !== args.sessionId) {
      throw new Error("This role is already claimed by another player");
    }

    // Release any other seat this session owns in the same game
    const allTables = await ctx.db
      .query("tables")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const t of allTables) {
      if (t._id !== table._id && t.activeSessionId === args.sessionId && t.connected) {
        await ctx.db.patch(t._id, vacateSeat());
      }
    }

    await ctx.db.patch(table._id, {
      connected: true,
      controlMode: "human",
      activeSessionId: args.sessionId,
      playerName: args.playerName.trim() || undefined,
    });
    await logEvent(ctx, args.gameId, "player_connect", args.roleId, {
      sessionId: args.sessionId,
      via: "role_picker",
      playerName: args.playerName.trim(),
    });

    return { tableId: table._id };
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
      // Don't clear playerName on disconnect — momentary disconnects (page reload,
      // tab switch) shouldn't lose the name. Name is cleared when facilitator
      // explicitly kicks to AI/NPC via kickToAI or when a new player claims the seat.
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
    if (args.controlMode === "human" || table.controlMode !== "human") {
      await ctx.db.patch(args.tableId, { controlMode: args.controlMode });
    } else {
      // Switching away from human — fully vacate the seat
      await ctx.db.patch(args.tableId, vacateSeat(args.controlMode));
    }
  },
});

// Player explicitly leaves their seat (via Leave button on table page).
export const leaveRole = mutation({
  args: { tableId: v.id("tables"), sessionId: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    if (table.activeSessionId && table.activeSessionId !== args.sessionId) return;
    const game = await ctx.db.get(table.gameId);
    if (game?.status !== "lobby") return;
    await ctx.db.patch(args.tableId, vacateSeat());
    await logEvent(ctx, table.gameId, "player_leave", table.roleId);
  },
});

export const kickToAI = mutation({
  args: { tableId: v.id("tables"), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    await ctx.db.patch(args.tableId, vacateSeat("ai"));
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

    // Calculate pool allocations once, then update only affected roles
    const poolAllocations = calculatePoolAllocations(enabledRoleIds);
    const poolAffectedRoles = new Set(Object.values(COMPUTE_POOL_ELIGIBLE).flatMap((w) => Object.keys(w)));
    for (const t of allTables) {
      if (!poolAffectedRoles.has(t.roleId)) continue;
      const newStock = poolAllocations.get(t.roleId) ?? undefined;
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
