import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { logEvent, assertFacilitator } from "./events";
import { COMPUTE_POOL_ELIGIBLE, calculatePoolAllocations, AI_SYSTEMS_ROLE_ID } from "./gameData";

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
        // activeSessionId is needed mid-game so the picker can distinguish
        // "active human driver" from "human seat that nobody is in" (driver
        // disconnected / facilitator toggled away). Sent as a presence flag
        // (truthy/falsy) rather than the raw id to avoid leaking session
        // tokens to the picker page.
        seatHeld: !!t.activeSessionId,
      }));
  },
});

// Player claims a role from the role picker (Jackbox-style join flow).
//
// Lobby: any role can be claimed.
// Mid-game: claimable when the seat is *empty* — controlMode is "ai" or
// "npc", or "human" but no active session (driver disconnected / facilitator
// toggled away). Active human seats are NOT claimable from the picker; the
// existing observer + 90s heartbeat-stale flow handles involuntary takeover,
// and the in-driver "Hand off seat" button handles voluntary handoff.
//
// AI Systems is a special case: its hidden disposition is the load-bearing
// secret of the game. The picker can claim it only if the seat is already
// abandoned (controlMode "human" + no active session); claiming directly
// from "ai" mode requires the facilitator to flip controlMode first.
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
    if (game.status === "finished") throw new Error("Game has finished");

    const table = await ctx.db
      .query("tables")
      .withIndex("by_game_and_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .first();
    if (!table) throw new Error("Role not found");
    if (!table.enabled) throw new Error("This role is not available");

    if (game.status !== "lobby") {
      const isActiveHuman =
        table.controlMode === "human" && table.connected && !!table.activeSessionId
        && table.activeSessionId !== args.sessionId;
      if (isActiveHuman) {
        throw new Error("This seat has an active driver — observe instead, or wait for them to hand off");
      }
      const isAbandoned =
        table.controlMode === "human" && (!table.activeSessionId || !table.connected);
      const isAiSystems = table.roleId === AI_SYSTEMS_ROLE_ID;
      if (isAiSystems && !isAbandoned) {
        throw new Error("AI Systems can only be claimed after the facilitator releases it");
      }
    }

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

    const previousMode = table.controlMode;
    const previousName = table.playerName;
    await ctx.db.patch(table._id, {
      connected: true,
      controlMode: "human",
      activeSessionId: args.sessionId,
      playerName: args.playerName.trim() || undefined,
    });
    await upsertPresence(ctx, table, Date.now());
    // Mid-game claims log a richer event for the audit trail and any future
    // public-announcement UI; lobby claims keep the original event shape.
    if (game.status === "lobby") {
      await logEvent(ctx, args.gameId, "player_connect", args.roleId, {
        sessionId: args.sessionId,
        via: "role_picker",
        playerName: args.playerName.trim(),
      });
    } else {
      await logEvent(ctx, args.gameId, "seat_claimed_mid_game", args.roleId, {
        sessionId: args.sessionId,
        playerName: args.playerName.trim(),
        fromMode: previousMode,
        fromName: previousName,
      });
    }

    return { tableId: table._id };
  },
});

// Driver explicitly hands off the seat. Clears the session and backdates the
// presence heartbeat so observer takeover banners activate immediately rather
// than waiting the 90s involuntary-disconnect grace. controlMode stays
// "human" so the seat is "abandoned human" and any picker user can claim it.
export const handOffSeat = mutation({
  args: { tableId: v.id("tables"), sessionId: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    if (table.activeSessionId !== args.sessionId) return;
    const previousName = table.playerName;
    await ctx.db.patch(args.tableId, {
      connected: false,
      activeSessionId: undefined,
    });
    const presence = await ctx.db
      .query("tablePresence")
      .withIndex("by_table", (q) => q.eq("tableId", args.tableId))
      .first();
    // Backdate beyond the takeover stale threshold so the banner activates now.
    const longAgo = Date.now() - 10 * 60_000;
    if (presence) {
      await ctx.db.patch(presence._id, { driverLastSeenAt: longAgo });
    } else {
      await ctx.db.insert("tablePresence", {
        gameId: table.gameId,
        tableId: args.tableId,
        driverLastSeenAt: longAgo,
      });
    }
    await logEvent(ctx, table.gameId, "seat_handed_off", table.roleId, {
      sessionId: args.sessionId,
      fromName: previousName,
    });
  },
});

export const get = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tableId);
  },
});

// Driver heartbeat — patched periodically by the active driver tab while the
// page is visible. Read by the takeover gate; the legacy `connected` boolean
// only flips on clean unloads, which mobile browsers routinely skip.
//
// Writes go to the `tablePresence` companion doc rather than `tables`, so
// heartbeat traffic doesn't invalidate any query that reads `tables` rows
// (notably getForPlayer, which fans out to every subscriber in the game).
const DRIVER_PING_DEBOUNCE_MS = 15_000;

async function upsertPresence(
  ctx: MutationCtx,
  table: { _id: Id<"tables">; gameId: Id<"games"> },
  now: number,
) {
  const existing = await ctx.db
    .query("tablePresence")
    .withIndex("by_table", (q) => q.eq("tableId", table._id))
    .first();
  if (existing) {
    if (now - existing.driverLastSeenAt < DRIVER_PING_DEBOUNCE_MS) return;
    await ctx.db.patch(existing._id, { driverLastSeenAt: now });
    return;
  }
  await ctx.db.insert("tablePresence", {
    gameId: table.gameId,
    tableId: table._id,
    driverLastSeenAt: now,
  });
}

export const pingDriver = mutation({
  args: { tableId: v.id("tables"), sessionId: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) return;
    if (table.activeSessionId !== args.sessionId) return;
    await upsertPresence(ctx, table, Date.now());
  },
});

export const getPresence = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tablePresence")
      .withIndex("by_table", (q) => q.eq("tableId", args.tableId))
      .first();
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
    // After a takeover, the previous driver's beforeunload still fires and
    // calls setConnected({connected: false}). Without a session-match guard
    // it would clear activeSessionId and kick the new driver. Bail silently
    // when the disconnecting session no longer owns the seat.
    if (!args.connected && args.sessionId && table?.activeSessionId
        && table.activeSessionId !== args.sessionId) {
      return;
    }
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
    if (args.connected && table) {
      await upsertPresence(ctx, table, Date.now());
    }
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

    // Recompute pool allocations and reset each pool role's "starting" ledger row to match.
    // Still lobby-only, so only "starting" rows should exist — delete the old, insert fresh.
    const poolAllocations = calculatePoolAllocations(enabledRoleIds);
    const poolAffectedRoles = new Set(Object.values(COMPUTE_POOL_ELIGIBLE).flatMap((w) => Object.keys(w)));
    for (const t of allTables) {
      if (!poolAffectedRoles.has(t.roleId)) continue;
      const targetStock = poolAllocations.get(t.roleId) ?? 0;
      if (targetStock === (t.computeStock ?? 0)) continue;
      // Wipe existing starting rows and reseed
      const existingRows = await ctx.db
        .query("computeTransactions")
        .withIndex("by_game_and_role", (q) => q.eq("gameId", t.gameId).eq("roleId", t.roleId))
        .collect();
      for (const r of existingRows) {
        if (r.type === "starting") await ctx.db.delete(r._id);
      }
      if (targetStock > 0) {
        await ctx.db.insert("computeTransactions", {
          gameId: t.gameId,
          roundNumber: 1,
          createdAt: Date.now(),
          type: "starting",
          status: "settled",
          roleId: t.roleId,
          amount: targetStock,
          reason: "Pool allocation (lobby reshuffle)",
        });
      }
      await ctx.db.patch(t._id, { computeStock: targetStock > 0 ? targetStock : undefined });
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
    // Only the AI Systems role has a disposition — reject attempts to set it on
    // any other table. Prior to this, any client could claim any tableId and
    // set its aiDisposition until it was populated.
    if (table.roleId !== AI_SYSTEMS_ROLE_ID) {
      throw new Error("Only the AI Systems role has a disposition");
    }
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
