// Labs — first-class entities. Compute stays on roles (tables.computeStock); labs own
// structural identity (name, spec, rdMultiplier, allocation, owner, status). Mergers
// soft-delete the absorbed lab (status="decommissioned", mergedIntoLabId=survivor).
//
// All structural writes to the labs table go through these helpers. Pipeline resolve
// and player actions call the *Internal variants so mutations can be composed.

import { v } from "convex/values";
import { query, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { emitPair } from "./computeLedger";

export type Lab = Doc<"labs">;

/** Shape that legacy code expected in game.labs[]. Returned from getLabsWithCompute
 *  as a compat shim while UI transitions. */
export interface LabWithCompute {
  labId: Id<"labs">;
  name: string;
  roleId: string | undefined;        // ownerRoleId
  computeStock: number;              // derived from owner's table.computeStock
  rdMultiplier: number;
  allocation: { deployment: number; research: number; safety: number };
  spec?: string;
  colour: string;
  status: "active" | "decommissioned";
  jurisdiction?: string;             // legal/regulatory home
}

// Default colour palette for auto-assigned labs (founder-chosen overrides).
const FALLBACK_COLOURS = [
  "#3B82F6", "#D97706", "#8B5CF6", "#10B981", "#EC4899", "#F59E0B", "#06B6D4", "#84CC16",
];

/** Pick a lab colour that isn't already in use by an active lab in this game. */
function pickColour(existing: Lab[]): string {
  const used = new Set(existing.map((l) => l.colour));
  for (const c of FALLBACK_COLOURS) {
    if (!used.has(c)) return c;
  }
  // All fallbacks taken; deterministic hash-based fallback
  return FALLBACK_COLOURS[existing.length % FALLBACK_COLOURS.length];
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/** All labs for a game, any status. */
export async function getAllLabs(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<Lab[]> {
  return await ctx.db
    .query("labs")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

/** Active labs only. Used by the pipeline, LLM prompts, chart, UI. */
export async function getActiveLabsForGame(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<Lab[]> {
  return await ctx.db
    .query("labs")
    .withIndex("by_game_and_status", (q) => q.eq("gameId", gameId).eq("status", "active"))
    .collect();
}

/** Active labs with the owner's current cached computeStock attached — convenience shim
 *  for code that used to read game.labs[]. */
export async function getLabsWithCompute(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  opts?: { includeInactive?: boolean },
): Promise<LabWithCompute[]> {
  const [labs, tables] = await Promise.all([
    opts?.includeInactive ? getAllLabs(ctx, gameId) : getActiveLabsForGame(ctx, gameId),
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
    jurisdiction: l.jurisdiction,
  }));
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/** Create a new lab. Enforces unique active name. Does NOT emit ledger rows —
 *  callers handle compute seeding separately (e.g. found-a-lab action escrows from founder). */
export async function createLabInternal(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    name: string;
    spec?: string;
    rdMultiplier: number;
    allocation: { deployment: number; research: number; safety: number };
    ownerRoleId?: string;
    colour?: string;
    createdRound: number;
    jurisdiction?: string;
  },
): Promise<Id<"labs">> {
  const active = await getActiveLabsForGame(ctx, args.gameId);
  const clash = active.find((l) => l.name === args.name);
  if (clash) throw new Error(`Active lab named "${args.name}" already exists`);
  return await ctx.db.insert("labs", {
    gameId: args.gameId,
    name: args.name,
    spec: args.spec,
    rdMultiplier: args.rdMultiplier,
    allocation: args.allocation,
    ownerRoleId: args.ownerRoleId,
    colour: args.colour ?? pickColour(active),
    status: "active",
    createdRound: args.createdRound,
    jurisdiction: args.jurisdiction,
  });
}

/** Decommission a lab (soft-delete). Never removes the row — restore still needs it. */
export async function decommissionLabInternal(
  ctx: MutationCtx,
  labId: Id<"labs">,
  opts?: { mergedIntoLabId?: Id<"labs"> },
): Promise<void> {
  await ctx.db.patch(labId, {
    status: "decommissioned",
    mergedIntoLabId: opts?.mergedIntoLabId,
    ownerRoleId: undefined,
  });
}

/** Merge two labs. Survivor absorbs structural fields as specified; absorbed goes
 *  to status=decommissioned with mergedIntoLabId=survivor. Compute movement is the
 *  caller's responsibility via the ledger (merged pair). */
export async function mergeLabsInternal(
  ctx: MutationCtx,
  args: {
    survivorLabId: Id<"labs">;
    absorbedLabId: Id<"labs">;
    newName?: string;
    newSpec?: string;
  },
): Promise<void> {
  const [survivor, absorbed] = await Promise.all([
    ctx.db.get(args.survivorLabId),
    ctx.db.get(args.absorbedLabId),
  ]);
  if (!survivor || !absorbed) throw new Error("Lab not found");
  if (survivor._id === absorbed._id) throw new Error("Cannot merge lab with itself");
  if (survivor.gameId !== absorbed.gameId) throw new Error("Labs belong to different games");

  // Validate newName uniqueness if provided
  if (args.newName && args.newName !== survivor.name) {
    const active = await getActiveLabsForGame(ctx, survivor.gameId);
    const clash = active.find((l) => l._id !== survivor._id && l.name === args.newName);
    if (clash) throw new Error(`Active lab named "${args.newName}" already exists`);
  }

  const survivorUpdates: Partial<Lab> = {};
  if (args.newName) survivorUpdates.name = args.newName;
  if (args.newSpec) survivorUpdates.spec = args.newSpec;
  // Survivor keeps higher multiplier
  survivorUpdates.rdMultiplier = Math.max(survivor.rdMultiplier, absorbed.rdMultiplier);

  if (Object.keys(survivorUpdates).length > 0) {
    await ctx.db.patch(args.survivorLabId, survivorUpdates);
  }
  await decommissionLabInternal(ctx, args.absorbedLabId, { mergedIntoLabId: args.survivorLabId });
}

/** Structural merge + automatic compute absorption: absorbed owner's full settled stock
 *  flows to the survivor owner via a settled `merged` ledger pair. Used by both
 *  facilitator-triggered merges and player mergeLab actions.
 *
 *  Returns null if either lab is no longer active (race with another merger). Throws on
 *  uniqueness / structural errors from mergeLabsInternal. Errors mid-merge (after the
 *  structural patch) are rethrown — callers must handle: on the player-action path, the
 *  result is a merged lab with compute stranded on the absorbed owner, recoverable via
 *  a facilitator ledger adjustment. */
export async function mergeLabsWithComputeInternal(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    roundNumber: number;
    survivorLabId: Id<"labs">;
    absorbedLabId: Id<"labs">;
    newName?: string;
    newSpec?: string;
    reason: string;
    actionId?: string;
  },
): Promise<{ amountMoved: number } | null> {
  const [survivor, absorbed] = await Promise.all([
    ctx.db.get(args.survivorLabId),
    ctx.db.get(args.absorbedLabId),
  ]);
  if (survivor?.status !== "active" || absorbed?.status !== "active") return null;

  await mergeLabsInternal(ctx, {
    survivorLabId: args.survivorLabId,
    absorbedLabId: args.absorbedLabId,
    newName: args.newName,
    newSpec: args.newSpec,
  });

  let amountMoved = 0;
  if (
    absorbed.ownerRoleId &&
    survivor.ownerRoleId &&
    absorbed.ownerRoleId !== survivor.ownerRoleId
  ) {
    const absorbedTable = await ctx.db
      .query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", args.gameId).eq("roleId", absorbed.ownerRoleId!))
      .first();
    amountMoved = absorbedTable?.computeStock ?? 0;
    if (amountMoved > 0) {
      await emitPair(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        type: "merged",
        status: "settled",
        fromRoleId: absorbed.ownerRoleId,
        toRoleId: survivor.ownerRoleId,
        amount: amountMoved,
        reason: args.reason,
        actionId: args.actionId,
      });
    }
  }
  return { amountMoved };
}

export async function updateLabRdMultiplierInternal(
  ctx: MutationCtx,
  labId: Id<"labs">,
  rdMultiplier: number,
): Promise<void> {
  await ctx.db.patch(labId, { rdMultiplier });
}

export async function transferLabOwnershipInternal(
  ctx: MutationCtx,
  labId: Id<"labs">,
  newOwnerRoleId: string | undefined,
): Promise<void> {
  // Ownership transfer does NOT move compute — owner's personal stock stays with them.
  // The new owner now controls the lab's structural decisions (spec, allocation) and
  // the lab's R&D uses the new owner's compute balance going forward.
  await ctx.db.patch(labId, { ownerRoleId: newOwnerRoleId });
}

// ─── Public queries ───────────────────────────────────────────────────────────

export const getActiveLabs = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await getActiveLabsForGame(ctx, args.gameId);
  },
});

export const getLabs = query({
  args: { gameId: v.id("games"), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const all = await getAllLabs(ctx, args.gameId);
    return args.includeInactive ? all : all.filter((l) => l.status === "active");
  },
});

export const getLabsWithComputeInternal = internalQuery({
  args: { gameId: v.id("games"), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return await getLabsWithCompute(ctx, args.gameId, { includeInactive: args.includeInactive });
  },
});

