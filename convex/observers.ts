import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import { OBSERVER_FALLBACK_NAME, TAKEOVER_STALE_MS } from "./observerConstants";

export { OBSERVER_FALLBACK_NAME, TAKEOVER_STALE_MS };

export const joinAsObserver = mutation({
  args: {
    gameId: v.id("games"),
    roleId: v.string(),
    sessionId: v.string(),
    observerName: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    const table = await ctx.db
      .query("tables")
      .withIndex("by_game_and_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .first();
    if (!table) throw new Error("Role not found");
    if (!table.enabled) throw new Error("This role is not available");

    const existing = await ctx.db
      .query("tableObservers")
      .withIndex("by_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .first();

    if (existing) {
      const trimmed = args.observerName.trim();
      if (trimmed && trimmed !== existing.observerName) {
        await ctx.db.patch(existing._id, { observerName: trimmed });
      }
      return { observerId: existing._id };
    }

    const observerId = await ctx.db.insert("tableObservers", {
      gameId: args.gameId,
      roleId: args.roleId,
      sessionId: args.sessionId,
      observerName: args.observerName.trim() || OBSERVER_FALLBACK_NAME,
      joinedAt: Date.now(),
    });
    await logEvent(ctx, args.gameId, "observer_join", args.roleId, {
      sessionId: args.sessionId,
      observerName: args.observerName.trim(),
    });
    return { observerId };
  },
});

export const leaveObserver = mutation({
  args: { sessionId: v.string(), roleId: v.string(), gameId: v.id("games") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("tableObservers")
      .withIndex("by_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .first();
    if (!row) return;
    await ctx.db.delete(row._id);
    await logEvent(ctx, args.gameId, "observer_leave", args.roleId, {
      sessionId: args.sessionId,
    });
  },
});

// Observer self-promotes to driver when the seat is stale. Re-checks
// preconditions inside the transaction; OCC retries serialise concurrent calls.
//
// playerName is supplied by the caller — we don't reuse observer.observerName
// because that defaults to the literal "Observer" when no localStorage name
// was set, and a new driver should pick a real name.
export const promoteToDriver = mutation({
  args: {
    gameId: v.id("games"),
    roleId: v.string(),
    sessionId: v.string(),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const playerName = args.playerName.trim();
    if (!playerName) throw new Error("Please enter a name before taking the seat");

    const table = await ctx.db
      .query("tables")
      .withIndex("by_game_and_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .first();
    if (!table) throw new Error("Role not found");
    if (table.controlMode !== "human") {
      throw new Error("This role is not under human control");
    }
    const presence = await ctx.db
      .query("tablePresence")
      .withIndex("by_table", (q) => q.eq("tableId", table._id))
      .first();
    const lastSeen = presence?.driverLastSeenAt ?? 0;
    if (Date.now() - lastSeen < TAKEOVER_STALE_MS) {
      throw new Error("Driver is still active");
    }

    const observer = await ctx.db
      .query("tableObservers")
      .withIndex("by_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .first();
    if (!observer) throw new Error("Observer record not found — rejoin and retry");

    const previousName = table.playerName;
    const now = Date.now();
    await ctx.db.patch(table._id, {
      activeSessionId: args.sessionId,
      playerName,
      connected: true,
    });
    if (presence) {
      await ctx.db.patch(presence._id, {
        driverLastSeenAt: now,
        driverLeftAt: undefined,
      });
    } else {
      await ctx.db.insert("tablePresence", {
        gameId: args.gameId,
        tableId: table._id,
        driverLastSeenAt: now,
      });
    }
    await ctx.db.delete(observer._id);
    await logEvent(ctx, args.gameId, "seat_taken_over", args.roleId, {
      fromName: previousName,
      toName: playerName,
      sessionId: args.sessionId,
      reason: "driver_stale",
      staleMs: Date.now() - lastSeen,
    });

    return { tableId: table._id };
  },
});

export const listByRole = query({
  args: { gameId: v.id("games"), roleId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tableObservers")
      .withIndex("by_role", (q) =>
        q.eq("gameId", args.gameId).eq("roleId", args.roleId)
      )
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      sessionId: r.sessionId,
      observerName: r.observerName,
    }));
  },
});

// Per-game observer counts grouped by roleId — for the facilitator dashboard.
export const countsByGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tableObservers")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.roleId] = (counts[r.roleId] ?? 0) + 1;
    }
    return counts;
  },
});
