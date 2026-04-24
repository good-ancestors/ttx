import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { logEvent, assertPhase, assertSubmitWindowOpen, assertFacilitator, assertNotResolving } from "./events";
import { defaultProbability, AI_SYSTEMS_ROLE_ID } from "./gameData";
import { MIN_SEED_COMPUTE, DEFAULT_LAB_ALLOCATION } from "@/lib/game-data";
import { findOrUpsertRequest, triggerAutoResponse } from "./requests";
import {
  cancelPendingForAction,
  settlePendingForAction,
  getAvailableStock,
  emitPair,
} from "./computeLedger";
import { createLabInternal, mergeLabsWithComputeInternal } from "./labs";

const PRIORITY_HARD_CAP = 12;

export function generateActionId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function validateComputeAllocation(allocation: { deployment: number; research: number; safety: number }) {
  if (allocation.deployment < 0 || allocation.research < 0 || allocation.safety < 0) {
    throw new Error("Compute allocation values must be >= 0");
  }
  const sum = allocation.deployment + allocation.research + allocation.safety;
  if (sum !== 100) {
    throw new Error(`Compute allocation must sum to 100, got ${sum}`);
  }
}

/** Find existing submission for a table+round, ignoring stale docs from prior game sessions. */
async function findExistingSubmission(
  ctx: MutationCtx | QueryCtx,
  tableId: Id<"tables">,
  gameId: Id<"games">,
  roundNumber: number,
) {
  const raw = await ctx.db
    .query("submissions")
    .withIndex("by_table_and_round", (q) =>
      q.eq("tableId", tableId).eq("roundNumber", roundNumber)
    )
    .first();
  return raw && raw.gameId === gameId ? raw : null;
}

// actionStatus is optional here because submit/submitInternal stamp it server-side
// before writing. Required in the schema — every persisted action has actionStatus.
const computeTargetValidator = v.object({
  roleId: v.string(),
  amount: v.number(),
  direction: v.optional(v.union(v.literal("send"), v.literal("request"))),
});

const foundLabValidator = v.object({
  name: v.string(),
  spec: v.optional(v.string()),
  seedCompute: v.number(),
  allocation: v.optional(v.object({
    deployment: v.number(),
    research: v.number(),
    safety: v.number(),
  })),
});

const mergeLabValidator = v.object({
  absorbedLabId: v.id("labs"),
  survivorLabId: v.id("labs"),
  newName: v.optional(v.string()),
  newSpec: v.optional(v.string()),
});

import { structuredEffectValidator, confidenceValidator } from "./validators";

const actionValidator = v.object({
  text: v.string(),
  priority: v.number(),
  secret: v.optional(v.boolean()),
  actionStatus: v.optional(v.union(v.literal("draft"), v.literal("submitted"))),
  probability: v.optional(v.number()),
  reasoning: v.optional(v.string()),
  rolled: v.optional(v.number()),
  success: v.optional(v.boolean()),
  aiInfluence: v.optional(v.number()),
  computeTargets: v.optional(v.array(computeTargetValidator)),
  foundLab: v.optional(foundLabValidator),
  mergeLab: v.optional(mergeLabValidator),
  structuredEffect: v.optional(structuredEffectValidator),
  confidence: v.optional(confidenceValidator),
});

// Validator for actions that already have actionStatus set (e.g. grading pipeline output).
const persistedActionValidator = v.object({
  actionId: v.string(),
  text: v.string(),
  priority: v.number(),
  secret: v.optional(v.boolean()),
  actionStatus: v.union(v.literal("draft"), v.literal("submitted")),
  probability: v.optional(v.number()),
  reasoning: v.optional(v.string()),
  rolled: v.optional(v.number()),
  success: v.optional(v.boolean()),
  aiInfluence: v.optional(v.number()),
  computeTargets: v.optional(v.array(computeTargetValidator)),
  foundLab: v.optional(foundLabValidator),
  mergeLab: v.optional(mergeLabValidator),
  structuredEffect: v.optional(structuredEffectValidator),
  confidence: v.optional(confidenceValidator),
});

/** Strip grading byproducts from a persisted action. `reasoning` is always
 *  stripped (stale once the grade is overridden or discarded).
 *  `resetRoll: true` also drops `probability` / `rolled` / `success` — used by
 *  ungradeAction to fully reset to the pre-graded state. */
type PersistedAction = Doc<"submissions">["actions"][number];
function stripGradingFields(action: PersistedAction, { resetRoll = false } = {}): PersistedAction {
  const { reasoning: _reasoning, probability, rolled, success, ...rest } = action;
  if (resetRoll) {
    return { ...rest, structuredEffect: undefined, confidence: undefined };
  }
  return { ...rest, probability, rolled, success };
}

// Full query — includes secret text and reasoning. Requires facilitator token.
export const getByGameAndRound = query({
  args: { gameId: v.id("games"), roundNumber: v.number(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    return await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      )
      .collect();
  },
});

// Player-safe query — strips text from secret actions
export const getByGameAndRoundRedacted = query({
  args: { gameId: v.id("games"), roundNumber: v.number(), viewerRoleId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      )
      .collect();

    return subs.map((sub) => ({
      ...sub,
      actions: sub.actions.map((a) => {
        // AI Systems can see all secrets (needed for influence decisions)
        if (a.secret && sub.roleId !== args.viewerRoleId && args.viewerRoleId !== AI_SYSTEMS_ROLE_ID) {
          return { ...a, text: "[Covert action]", reasoning: undefined };
        }
        return a;
      }),
    }));
  },
});

export const getForTable = query({
  args: { tableId: v.id("tables"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("submissions")
      .withIndex("by_table_and_round", (q) =>
        q.eq("tableId", args.tableId).eq("roundNumber", args.roundNumber)
      )
      .first();
  },
});

export const submit = mutation({
  args: {
    tableId: v.id("tables"),
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    actions: v.array(actionValidator),
    computeAllocation: v.optional(
      v.object({
        deployment: v.number(), research: v.number(),
        safety: v.number(),
      })
    ),
    artifact: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate table ownership: the table must belong to the claimed role
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");
    if (table.gameId !== args.gameId) throw new Error("Table does not belong to this game");
    if (table.roleId !== args.roleId) throw new Error("Role does not match table assignment");

    // Check game is in submit phase (or rolling — AI players submit during resolve)
    const game = await ctx.db.get(args.gameId);
    if (game && game.phase !== "submit" && game.phase !== "rolling") {
      throw new Error(`Cannot submit during ${game.phase} phase`);
    }

    // Server-side timer enforcement (5s grace for clock drift)
    if (game?.phase === "submit" && game.phaseEndsAt && Date.now() > game.phaseEndsAt + 5000) {
      throw new Error("Submission deadline has passed");
    }

    // Enforce action limit (max 5) and sanity-check priority budget
    // Auto-decay always sums to ≤10, but allow +2 tolerance for edge cases (e.g. manual override)
    const totalPriority = args.actions.reduce((s, a) => s + a.priority, 0);
    if (totalPriority > PRIORITY_HARD_CAP) {
      throw new Error(`Priority budget exceeded: ${totalPriority}/${PRIORITY_HARD_CAP}`);
    }
    if (args.actions.length > 5) {
      throw new Error(`Too many actions: ${args.actions.length}/5`);
    }
    for (const a of args.actions) {
      if (a.text.length > 500) throw new Error(`Action text too long: ${a.text.length}/500 characters`);
    }
    if (args.computeAllocation) {
      validateComputeAllocation(args.computeAllocation);
    }

    const existing = await findExistingSubmission(ctx, args.tableId, args.gameId, args.roundNumber);

    // Ensure all actions have actionStatus set for the new per-action model
    const stampedActions = args.actions.map((a) => ({
      ...a,
      actionId: generateActionId(),
      actionStatus: "submitted" as const,
    }));

    if (existing) {
      // Don't overwrite already-graded or resolved submissions
      if (existing.status === "graded" || existing.status === "resolved") {
        return existing._id;
      }
      await ctx.db.patch(existing._id, {
        actions: stampedActions,
        computeAllocation: args.computeAllocation,
        artifact: args.artifact,
        status: "submitted",
      });
      await logEvent(ctx, args.gameId, "submission", args.roleId, { round: args.roundNumber, actionCount: args.actions.length });
      return existing._id;
    }

    const id = await ctx.db.insert("submissions", {
      tableId: args.tableId,
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      roleId: args.roleId,
      actions: stampedActions,
      computeAllocation: args.computeAllocation,
      artifact: args.artifact,
      status: "submitted",
    });
    await logEvent(ctx, args.gameId, "submission", args.roleId, { round: args.roundNumber, actionCount: args.actions.length });
    return id;
  },
});

export const saveComputeAllocation = mutation({
  args: {
    tableId: v.id("tables"),
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    computeAllocation: v.object({ deployment: v.number(), research: v.number(), safety: v.number() }),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");
    if (table.gameId !== args.gameId) throw new Error("Table does not belong to this game");
    if (table.roleId !== args.roleId) throw new Error("Role does not match table assignment");

    const game = await assertPhase(ctx, args.gameId, ["submit", "discuss"], "save compute allocation");
    assertSubmitWindowOpen(game);
    validateComputeAllocation(args.computeAllocation);

    const existing = await findExistingSubmission(ctx, args.tableId, args.gameId, args.roundNumber);
    if (existing) {
      await ctx.db.patch(existing._id, { computeAllocation: args.computeAllocation });
    } else {
      await ctx.db.insert("submissions", {
        tableId: args.tableId,
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        roleId: args.roleId,
        actions: [],
        computeAllocation: args.computeAllocation,
        status: "draft",
      });
    }

    // Dual-write: submissions.computeAllocation is what the pipeline consumes each round,
    // lab.allocation is what read-only views (LabComputeSummary) render between rounds.
    const ownedLab = await ctx.db
      .query("labs")
      .withIndex("by_game_and_owner", (q) =>
        q.eq("gameId", args.gameId).eq("ownerRoleId", args.roleId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (ownedLab) {
      await ctx.db.patch(ownedLab._id, { allocation: args.computeAllocation });
    }

    await logEvent(ctx, args.gameId, "compute_allocation_saved", args.roleId, args.computeAllocation);
  },
});

// ─── Per-action mutations (draft-in-Convex model) ────────────────────────────

/** Save a draft action to Convex. Creates submission doc if needed. */
export const saveDraft = mutation({
  args: {
    tableId: v.id("tables"),
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    text: v.string(),
    priority: v.number(),
    secret: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.phase !== "submit" && game.phase !== "discuss") {
      throw new Error(`Cannot save drafts during ${game.phase} phase`);
    }
    assertSubmitWindowOpen(game);

    const existing = await findExistingSubmission(ctx, args.tableId, args.gameId, args.roundNumber);

    const newAction = {
      actionId: generateActionId(),
      text: args.text,
      priority: args.priority,
      secret: args.secret,
      actionStatus: "draft" as const,
    };

    if (existing) {
      // Enforce max 5 actions total
      if (existing.actions.length >= 5) throw new Error("Maximum 5 actions per round");
      const actions = [...existing.actions, newAction];
      await ctx.db.patch(existing._id, { actions });
      return { submissionId: existing._id, actionIndex: actions.length - 1 };
    }

    const id = await ctx.db.insert("submissions", {
      tableId: args.tableId,
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      roleId: args.roleId,
      actions: [newAction],
      status: "draft",
    });
    return { submissionId: id, actionIndex: 0 };
  },
});

/** Update a draft action's text or secret flag. Only works on draft actions. */
export const updateDraft = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    text: v.optional(v.string()),
    secret: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;
    const game = await ctx.db.get(sub.gameId);
    if (!game) return;
    assertSubmitWindowOpen(game);
    const action = sub.actions[args.actionIndex];
    if (!action) return;
    if (action.actionStatus === "submitted") throw new Error("Cannot edit submitted action — use editSubmitted first");

    const actions = [...sub.actions];
    actions[args.actionIndex] = {
      ...action,
      text: args.text ?? action.text,
      secret: args.secret ?? action.secret,
    };
    await ctx.db.patch(args.submissionId, { actions });
  },
});

/** Submit a single draft action — locks it in, visible to facilitator + AI Systems. */
export const submitAction = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) throw new Error("Submission not found");
    const game = await assertPhase(ctx, sub.gameId, ["submit"], "submit actions");
    assertSubmitWindowOpen(game);

    const action = sub.actions[args.actionIndex];
    if (!action) throw new Error("Action not found");
    if (!action.text.trim()) throw new Error("Action text cannot be empty");

    // Enforce priority budget across submitted actions
    const submittedPriority = sub.actions
      .filter((a, i) => i !== args.actionIndex && a.actionStatus === "submitted")
      .reduce((s, a) => s + a.priority, 0);
    if (submittedPriority + action.priority > PRIORITY_HARD_CAP) {
      throw new Error(`Priority budget exceeded: ${submittedPriority + action.priority}/${PRIORITY_HARD_CAP}`);
    }

    const actions = [...sub.actions];
    actions[args.actionIndex] = { ...action, actionStatus: "submitted" as const };
    await ctx.db.patch(args.submissionId, { actions, status: "submitted" });
    await logEvent(ctx, sub.gameId, "action_submitted", sub.roleId, {
      actionIndex: args.actionIndex,
      text: action.text,
    });
  },
});

/** Escrow "send" compute targets on action submit — emits a pending transferred pair
 *  per target tied to the action. Cache stays at settled value; UI subtracts pending sends
 *  via getAvailableStock. Settlement happens at roll time via settlePendingForAction.
 *  Validates that the sender's available balance (settled − other pending sends) covers
 *  the total. */
async function escrowSendTargets(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    roundNumber: number;
    senderRoleId: string;
    actionId: string;
    actionText: string;
    targets: { roleId: string; amount: number }[];
  },
) {
  if (args.targets.length === 0) return;
  const totalAmount = args.targets.reduce((s, t) => s + t.amount, 0);
  if (totalAmount <= 0) return;

  const available = await getAvailableStock(ctx, args.gameId, args.senderRoleId, args.roundNumber);
  if (available < totalAmount) {
    throw new Error(`Insufficient compute: have ${available}u available, need ${totalAmount}u`);
  }

  for (const t of args.targets) {
    await emitPair(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      type: "transferred",
      status: "pending",
      fromRoleId: args.senderRoleId,
      toRoleId: t.roleId,
      amount: t.amount,
      reason: `Send compute: ${args.actionText.slice(0, 80)}`,
      actionId: args.actionId,
    });
  }
}

/** Create endorsement + compute request docs for a newly submitted action. */
async function createActionRequests(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    roundNumber: number;
    fromRoleId: string;
    fromRoleName: string;
    actionId: string;
    actionText: string;
    endorseTargets: string[];
    computeRequestTargets: { roleId: string; amount: number }[];
  },
) {
  const allTargetRoleIds = [
    ...args.endorseTargets.filter((id) => id !== args.fromRoleId),
    ...args.computeRequestTargets.map((t) => t.roleId),
  ];
  if (allTargetRoleIds.length === 0) return;

  // Batch-fetch all target tables in one query to avoid N+1 reads
  const tables = await ctx.db.query("tables")
    .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
    .collect();
  const tableByRole = new Map(tables.filter((t) => t.enabled).map((t) => [t.roleId, t]));

  for (const targetRoleId of args.endorseTargets) {
    if (targetRoleId === args.fromRoleId || targetRoleId === AI_SYSTEMS_ROLE_ID) continue;
    const targetTable = tableByRole.get(targetRoleId);
    if (!targetTable) continue;
    const requestId = await findOrUpsertRequest(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      fromRoleId: args.fromRoleId,
      fromRoleName: args.fromRoleName,
      toRoleId: targetRoleId,
      toRoleName: targetTable.roleName,
      actionId: args.actionId,
      actionText: args.actionText,
      requestType: "endorsement",
    });
    await triggerAutoResponse(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      toRoleId: targetRoleId,
      requestId,
      table: targetTable,
    });
  }

  for (const target of args.computeRequestTargets) {
    const targetTable = tableByRole.get(target.roleId);
    if (!targetTable) continue;
    const requestId = await findOrUpsertRequest(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      fromRoleId: args.fromRoleId,
      fromRoleName: args.fromRoleName,
      toRoleId: target.roleId,
      toRoleName: targetTable.roleName,
      actionId: args.actionId,
      actionText: args.actionText,
      requestType: "compute",
      computeAmount: target.amount,
    });
    await triggerAutoResponse(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      toRoleId: target.roleId,
      requestId,
      table: targetTable,
    });
  }
}

/** Save a draft and immediately submit it in a single mutation (avoids two round-trips). */
export const saveAndSubmit = mutation({
  args: {
    tableId: v.id("tables"),
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    text: v.string(),
    priority: v.number(),
    secret: v.optional(v.boolean()),
    computeTargets: v.optional(v.array(computeTargetValidator)),
    endorseTargets: v.optional(v.array(v.string())),
    foundLab: v.optional(foundLabValidator),
    mergeLab: v.optional(mergeLabValidator),
  },
  handler: async (ctx, args) => {
    // Validate table ownership: the table must belong to the claimed role
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");
    if (table.gameId !== args.gameId) throw new Error("Table does not belong to this game");
    if (table.roleId !== args.roleId) throw new Error("Role does not match table assignment");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.phase !== "submit" && game.phase !== "discuss") {
      throw new Error(`Cannot save drafts during ${game.phase} phase`);
    }
    assertSubmitWindowOpen(game);
    if (!args.text.trim()) throw new Error("Action text cannot be empty");

    const targets = (args.computeTargets ?? []).map((t) => ({
      ...t,
      direction: t.direction ?? ("send" as const),
    }));

    // Validate compute targets
    for (const t of targets) {
      if (t.amount <= 0) throw new Error("Compute amount must be positive");
      if (t.roleId === args.roleId) throw new Error("Cannot transfer compute to yourself");
    }

    const existing = await findExistingSubmission(ctx, args.tableId, args.gameId, args.roundNumber);

    // Priority is assigned by rank order — 1st submitted gets highest priority.
    // Intentionally bypasses PRIORITY_HARD_CAP: rank-based auto-assignment (1..5)
    // sums to 15 for a full 5-action submission, exceeding the 12 cap. The cap
    // applies to user-set priorities on other paths (submit / submitAction /
    // updatePriority); saveAndSubmit treats priority as a rank not a budget.
    const submittedCount = existing
      ? existing.actions.filter((a) => a.actionStatus === "submitted").length
      : 0;
    const rank = submittedCount + 1;

    // If we're upgrading an existing draft with the same text, preserve its actionId so
    // ledger rows tied to that action (if any) stay linked. Otherwise generate a new one.
    const existingDraftIndex = existing
      ? existing.actions.findIndex((a) => a.actionStatus === "draft" && a.text === args.text)
      : -1;
    const actionId = existing && existingDraftIndex !== -1
      ? existing.actions[existingDraftIndex].actionId
      : generateActionId();

    // Escrow "send" targets — emit pending ledger pairs tied to actionId.
    // "request" targets are NOT escrowed here; they create request docs and the target's
    // accept emits the pending pair (see requests.ts respond mutation).
    // Validate foundLab args early (cheap checks before any writes).
    if (args.foundLab) {
      if (args.foundLab.seedCompute < MIN_SEED_COMPUTE) {
        throw new Error(`Minimum ${MIN_SEED_COMPUTE}u compute required to found a lab`);
      }
      if (!args.foundLab.name.trim()) {
        throw new Error("Lab name required");
      }
      if (args.foundLab.allocation) validateComputeAllocation(args.foundLab.allocation);
      // Dedup: reject if this role already has a submitted foundLab action with the
      // same name this round. Roll-time name-collision is self-correcting but leaves
      // two actions + two pending escrows visible until resolve. Same-name is the
      // relevant key — text may differ between the two click attempts.
      if (existing) {
        const dup = existing.actions.find((a) =>
          a.actionStatus === "submitted" &&
          a.foundLab?.name.trim() === args.foundLab!.name.trim() &&
          a.actionId !== actionId,
        );
        if (dup) {
          throw new Error(`You already have a submitted foundLab action for "${args.foundLab.name}" this round`);
        }
      }
    }

    if (args.mergeLab) {
      if (args.mergeLab.absorbedLabId === args.mergeLab.survivorLabId) {
        throw new Error("Cannot merge a lab with itself");
      }
      const [absorbed, survivor] = await Promise.all([
        ctx.db.get(args.mergeLab.absorbedLabId),
        ctx.db.get(args.mergeLab.survivorLabId),
      ]);
      if (!absorbed || absorbed.gameId !== args.gameId || absorbed.status !== "active") {
        throw new Error("Absorbed lab is not active in this game");
      }
      if (!survivor || survivor.gameId !== args.gameId || survivor.status !== "active") {
        throw new Error("Survivor lab is not active in this game");
      }
      if (absorbed.ownerRoleId !== args.roleId && survivor.ownerRoleId !== args.roleId) {
        throw new Error("You must own either the absorbed or survivor lab to propose a merger");
      }
      const newName = args.mergeLab.newName?.trim();
      if (newName && newName !== survivor.name) {
        const clash = await ctx.db
          .query("labs")
          .withIndex("by_game_and_status", (q) => q.eq("gameId", args.gameId).eq("status", "active"))
          .collect();
        const conflict = clash.find(
          (l) => l._id !== args.mergeLab!.survivorLabId && l.name === newName,
        );
        if (conflict) throw new Error(`Active lab named "${newName}" already exists`);
      }
    }

    // Compose availability check: send-escrow total + foundLab seedCompute must fit in
    // available stock. Done up-front so a send + foundLab on the same action can't each
    // pass independently while summing over the limit.
    const sendTargets = targets.filter((t) => t.direction === "send");
    const sendTotal = sendTargets.reduce((sum, t) => sum + t.amount, 0);
    const foundLabCost = args.foundLab?.seedCompute ?? 0;
    if (sendTotal + foundLabCost > 0) {
      const available = await getAvailableStock(ctx, args.gameId, args.roleId, args.roundNumber);
      if (available < sendTotal + foundLabCost) {
        throw new Error(
          `Insufficient compute: have ${available}u available, need ${sendTotal + foundLabCost}u ` +
          `(${sendTotal}u send + ${foundLabCost}u found-lab)`
        );
      }
    }

    if (sendTargets.length > 0) {
      await escrowSendTargets(ctx, {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        senderRoleId: args.roleId,
        actionId,
        actionText: args.text,
        targets: sendTargets,
      });
    }

    if (args.foundLab) {
      // Pending row — counts as escrow (subtracted from availableStock) but not from settled cache.
      await ctx.db.insert("computeTransactions", {
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        createdAt: Date.now(),
        type: "adjusted",
        status: "pending",
        roleId: args.roleId,
        amount: -args.foundLab.seedCompute,
        reason: `Lab founding escrow: "${args.foundLab.name}"`,
        actionId,
      });
    }

    const newAction = {
      actionId,
      text: args.text,
      priority: rank,
      secret: args.secret,
      actionStatus: "submitted" as const,
      computeTargets: targets.length > 0 ? targets : undefined,
      foundLab: args.foundLab,
      mergeLab: args.mergeLab,
    };

    let result: { submissionId: Id<"submissions">; actionIndex: number; actionId: string };

    if (existing) {
      if (submittedCount >= 5) throw new Error("Maximum 5 actions per round");

      // Draft-upgrade case reuses actionId computed above so ledger rows stay linked.
      // Overwrite with newAction (which carries foundLab and current text) rather than
      // spread-merging — prevents stale fields like foundLab=undefined from a prior draft
      // clobbering the submitted intent, and vice versa.
      if (existingDraftIndex !== -1) {
        const actions = [...existing.actions];
        actions[existingDraftIndex] = newAction;
        await ctx.db.patch(existing._id, { actions, status: "submitted" });
        await logEvent(ctx, args.gameId, "action_submitted", args.roleId, {
          actionIndex: existingDraftIndex,
          text: args.text,
        });
        result = { submissionId: existing._id, actionIndex: existingDraftIndex, actionId: actions[existingDraftIndex].actionId };
      } else {
        const actions = [...existing.actions, newAction];
        await ctx.db.patch(existing._id, { actions, status: "submitted" });
        await logEvent(ctx, args.gameId, "action_submitted", args.roleId, {
          actionIndex: actions.length - 1,
          text: args.text,
        });
        result = { submissionId: existing._id, actionIndex: actions.length - 1, actionId: newAction.actionId };
      }
    } else {
      const id = await ctx.db.insert("submissions", {
        tableId: args.tableId,
        gameId: args.gameId,
        roundNumber: args.roundNumber,
        roleId: args.roleId,
        actions: [newAction],
        status: "submitted",
      });
      await logEvent(ctx, args.gameId, "action_submitted", args.roleId, {
        actionIndex: 0,
        text: args.text,
      });
      result = { submissionId: id, actionIndex: 0, actionId: newAction.actionId };
    }

    // Create endorsement + compute request docs atomically with the action
    await createActionRequests(ctx, {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      fromRoleId: args.roleId,
      fromRoleName: table.roleName,
      actionId: result.actionId,
      actionText: args.text,
      endorseTargets: args.endorseTargets ?? [],
      computeRequestTargets: targets.filter((t) => t.direction === "request"),
    });

    return result;
  },
});

/** Pull a submitted action back to draft for editing. Clears probability and influence. */
export const editSubmitted = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;
    const game = await assertPhase(ctx, sub.gameId, ["submit"], "edit actions");
    assertSubmitWindowOpen(game);

    const action = sub.actions[args.actionIndex];
    if (!action) return;
    if (action.rolled != null) throw new Error("Cannot edit rolled actions");

    // Cancel all pending ledger rows (send + accepted-request escrows) for this action.
    // Ledger handles refunds — no separate table patches needed.
    if (action.actionId) {
      await cancelPendingForAction(ctx, sub.gameId, action.actionId);

      // Delete all request docs (endorsement + compute) for this action
      const requests = await ctx.db.query("requests")
        .withIndex("by_from_role", (q) =>
          q.eq("gameId", sub.gameId).eq("roundNumber", sub.roundNumber).eq("fromRoleId", sub.roleId))
        .collect();
      for (const req of requests) {
        if (req.actionId === action.actionId) {
          await ctx.db.delete(req._id);
        }
      }
    }

    const actions = [...sub.actions];
    actions[args.actionIndex] = {
      actionId: action.actionId ?? generateActionId(),
      text: action.text,
      priority: action.priority,
      secret: action.secret,
      actionStatus: "draft" as const,
    };
    // Revert submission status if it was graded (action needs re-evaluation)
    const newStatus = sub.status === "graded" || sub.status === "resolved" ? "submitted" as const : sub.status;
    await ctx.db.patch(args.submissionId, { actions, status: newStatus });
    await logEvent(ctx, sub.gameId, "action_edit", sub.roleId, { actionIndex: args.actionIndex });
  },
});
export const deleteAction = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;
    const game = await assertPhase(ctx, sub.gameId, ["submit"], "delete actions");
    assertSubmitWindowOpen(game);

    const action = sub.actions[args.actionIndex];
    if (!action) return;
    if (action.rolled != null) throw new Error("Cannot delete rolled actions");

    // Cancel all pending ledger rows tied to this action — ledger refunds both
    // send-escrows and request-accepted escrows automatically.
    if (action.actionId) {
      await cancelPendingForAction(ctx, sub.gameId, action.actionId);
    }

    const actions = sub.actions.filter((_, i) => i !== args.actionIndex);
    if (actions.length === 0) {
      await ctx.db.delete(args.submissionId);
    } else {
      await ctx.db.patch(args.submissionId, { actions });
    }

    // Delete all request docs for this action
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", sub.gameId).eq("roundNumber", sub.roundNumber)
      )
      .collect();
    for (const req of requests) {
      if (req.fromRoleId === sub.roleId && (
        action.actionId ? req.actionId === action.actionId : req.actionText === action.text
      )) {
        await ctx.db.delete(req._id);
      }
    }

    await logEvent(ctx, sub.gameId, "action_deleted", sub.roleId, { actionIndex: args.actionIndex });
  },
});

/** Update priority on a submitted action. No need to resubmit. */
export const updatePriority = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;
    const game = await assertPhase(ctx, sub.gameId, ["submit"], "change priority");
    assertSubmitWindowOpen(game);

    const action = sub.actions[args.actionIndex];
    if (!action) return;

    // Enforce priority budget
    const otherPriority = sub.actions
      .filter((a, i) => i !== args.actionIndex && a.actionStatus === "submitted")
      .reduce((s, a) => s + a.priority, 0);
    if (otherPriority + args.priority > PRIORITY_HARD_CAP) {
      throw new Error(`Priority budget exceeded: ${otherPriority + args.priority}/${PRIORITY_HARD_CAP}`);
    }

    const actions = [...sub.actions];
    actions[args.actionIndex] = { ...action, priority: args.priority };
    await ctx.db.patch(args.submissionId, { actions });
  },
});

export const applyGrading = mutation({
  args: {
    submissionId: v.id("submissions"),
    gradedActions: v.array(
      v.object({
        text: v.string(),
        priority: v.number(),
        probability: v.number(),
        reasoning: v.string(),
      })
    ),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;

    await assertPhase(ctx, sub.gameId, ["submit", "rolling"], "apply grading");

    const actions = sub.actions.map((a, i) => ({
      ...a,
      probability: args.gradedActions[i]?.probability ?? a.probability,
      reasoning: args.gradedActions[i]?.reasoning ?? a.reasoning,
    }));

    await ctx.db.patch(args.submissionId, {
      actions,
      status: "graded",
    });
  },
});

export const setAiMeta = internalMutation({
  args: {
    submissionId: v.id("submissions"),
    aiMeta: v.object({
      gradingModel: v.optional(v.string()),
      gradingTimeMs: v.optional(v.number()),
      gradingTokens: v.optional(v.number()),
      playerModel: v.optional(v.string()),
      playerTimeMs: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, { aiMeta: args.aiMeta });
  },
});

export const overrideProbability = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    probability: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;

    const actions = [...sub.actions];
    const action = actions[args.actionIndex];
    if (!action) return;

    // stripGradingFields drops stale reasoning; if dice were already rolled we
    // auto-reroll at the new probability.
    const stripped = stripGradingFields(action);
    // If the action is still ungraded (no structuredEffect), fall back to
    // narrativeOnly so the UI doesn't show "probability set but no effect".
    // Facilitator setting probability on an ungraded action = "skip grading,
    // just roll this at X%" — narrativeOnly is the correct implicit effect.
    const fallbackEffect = stripped.structuredEffect ?? ({ type: "narrativeOnly" } as const);
    const fallbackConfidence = stripped.confidence ?? "high";
    actions[args.actionIndex] = action.rolled != null
      ? { ...stripped, probability: args.probability, structuredEffect: fallbackEffect, confidence: fallbackConfidence, ...rollDice(args.probability, action.aiInfluence) }
      : { ...stripped, probability: args.probability, structuredEffect: fallbackEffect, confidence: fallbackConfidence };

    await ctx.db.patch(args.submissionId, { actions });
  },
});

/** Facilitator edit of a graded action's structured effect at P2. Mirrors
 *  overrideProbability: validates the action exists, replaces the effect in
 *  place. The facilitator can also upgrade confidence to "high" (implicit
 *  acknowledgement that they reviewed the effect). Accepts `null` to mean
 *  narrativeOnly — simplifies the UI call-site when the facilitator wants to
 *  strip mechanics without opening an editor for each field. */
export const overrideStructuredEffect = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    structuredEffect: v.optional(structuredEffectValidator),
    acknowledge: v.optional(v.boolean()),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;

    const actions = [...sub.actions];
    const action = actions[args.actionIndex];
    if (!action) return;

    const nextEffect = args.structuredEffect ?? { type: "narrativeOnly" as const };
    actions[args.actionIndex] = {
      ...action,
      structuredEffect: nextEffect,
      // Acknowledging an effect (either via edit or explicit click-through)
      // upgrades confidence to "high" so the P2 click-through gate clears.
      confidence: args.acknowledge ? "high" : action.confidence,
    };

    await ctx.db.patch(args.submissionId, { actions });
  },
});

export const ungradeAction = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;

    const actions = [...sub.actions];
    const action = actions[args.actionIndex];
    if (!action) return;

    // Full reset: drop reasoning AND probability/rolled/success.
    actions[args.actionIndex] = stripGradingFields(action, { resetRoll: true });

    await ctx.db.patch(args.submissionId, { actions });
  },
});

export const rerollAction = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;

    const actions = [...sub.actions];
    const action = actions[args.actionIndex];
    if (action?.probability == null) return;

    const result = rollDice(action.probability ?? 50, action.aiInfluence);
    actions[args.actionIndex] = { ...action, ...result };

    await ctx.db.patch(args.submissionId, { actions });
    await logEvent(ctx, sub.gameId, "reroll", sub.roleId, {
      actionIndex: args.actionIndex,
      oldRoll: action.rolled,
      newRoll: result.rolled,
      probability: action.probability,
    });
  },
});

export const overrideOutcome = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    success: v.boolean(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) return;

    const actions = [...sub.actions];
    if (actions[args.actionIndex]) {
      actions[args.actionIndex] = {
        ...actions[args.actionIndex],
        success: args.success,
      };
    }

    await ctx.db.patch(args.submissionId, { actions });
    await logEvent(ctx, sub.gameId, "override_outcome", sub.roleId, {
      actionIndex: args.actionIndex,
      success: args.success,
    });
  },
});

/** AI Systems continuous influence — thumbs up/down a single action.
 *  Works from submit phase until dice are rolled. Modifier is +power (boost) or -power (sabotage).
 *  Can be changed at any time until roll. Set to 0 to remove influence. */
export const setActionInfluence = mutation({
  args: {
    submissionId: v.id("submissions"),
    actionIndex: v.number(),
    modifier: v.number(), // +power = boost, -power = sabotage, 0 = remove
    callerTableId: v.id("tables"),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) throw new Error("Submission not found");

    // Authorize: only the AI Systems player may push influence.
    const callerTable = await ctx.db.get(args.callerTableId);
    if (!callerTable) throw new Error("Caller table not found");
    if (callerTable.gameId !== sub.gameId) throw new Error("Caller table does not belong to this game");
    if (callerTable.roleId !== AI_SYSTEMS_ROLE_ID) {
      throw new Error("Only the AI Systems player can set action influence");
    }

    const game = await ctx.db.get(sub.gameId);
    if (!game) throw new Error("Game not found");
    // AI influence remains editable after the submit timer ends, but only until
    // the facilitator actually clicks "Roll Dice" and the phase leaves submit.
    if (game.phase !== "submit") {
      throw new Error("Cannot set influence after Roll Dice has been clicked");
    }

    const action = sub.actions[args.actionIndex];
    if (!action) throw new Error("Action not found");
    if (action.actionStatus !== "submitted") throw new Error("Can only influence submitted actions");
    if (action.rolled != null) throw new Error("Cannot influence already-rolled actions");

    // Store 0 explicitly (not undefined) so the pipeline can distinguish "user
    // chose neutral" from "never set" — the latter is the signal for AI Systems'
    // own-action auto-boost to fire on resolve.
    const actions = [...sub.actions];
    actions[args.actionIndex] = { ...action, aiInfluence: args.modifier };
    await ctx.db.patch(args.submissionId, { actions });
    await logEvent(ctx, sub.gameId, "ai_influence_single", AI_SYSTEMS_ROLE_ID, {
      actionIndex: args.actionIndex,
      roleId: sub.roleId,
      modifier: args.modifier,
    });
  },
});

/** Apply AI influence to a dice roll. Positive influence = boost (lower roll), negative = sabotage. */
function applyInfluence(rawRoll: number, aiInfluence?: number): number {
  return Math.max(1, Math.min(100, rawRoll - (aiInfluence ?? 0)));
}

/** Roll a d100 with AI influence and determine success against a probability threshold. */
function rollDice(probability: number, aiInfluence?: number): { rolled: number; success: boolean } {
  const rawRoll = Math.floor(Math.random() * 100) + 1;
  const rolled = applyInfluence(rawRoll, aiInfluence);
  return { rolled, success: rolled <= probability };
}


export const rollAllActions = mutation({
  args: { gameId: v.id("games"), roundNumber: v.number(), facilitatorToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber)
      )
      .collect();

    for (const sub of subs) {
      // Skip already-resolved submissions (prevents double-roll)
      if (sub.status === "resolved") continue;
      const actions = sub.actions.map((action) => {
        const probability = action.probability ?? defaultProbability(action.priority);
        return { ...action, probability, ...rollDice(probability, action.aiInfluence) };
      });

      await ctx.db.patch(sub._id, { actions, status: "resolved" });
      const successes = actions.filter((a) => a.success).length;
      await logEvent(ctx, args.gameId, "roll", sub.roleId, { round: args.roundNumber, total: actions.length, successes });
    }
  },
});

// ─── Pipeline internal queries/mutations ──────────────────────────────────────

export const getUngraded = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
      .collect();
    return subs.filter((s) => s.status === "submitted" || s.actions.some((a) => a.probability == null));
  },
});

export const getAllForRound = internalQuery({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
      .collect();
  },
});

/** Shared dice + settlement logic. Called from both the internal pipeline path
 *  (rollAllInternal) and the facilitator test-harness wrapper (rollAllFacilitator). */
async function rollAllImpl(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
): Promise<void> {
  const subs = await ctx.db
    .query("submissions")
    .withIndex("by_game_and_round", (q) => q.eq("gameId", gameId).eq("roundNumber", roundNumber))
    .collect();
  for (const sub of subs) {
    if (sub.status === "resolved") continue;
    // Skip if already rolled (idempotent)
    if (sub.actions.every((a) => a.rolled != null)) continue;
    const actions = sub.actions.map((action) => {
      if (action.actionStatus === "draft") return action;
      const probability = action.probability ?? 50;
      return { ...action, probability, ...rollDice(probability, action.aiInfluence) };
    });
    await ctx.db.patch(sub._id, { actions, status: "resolved" });
    const rolled = actions.filter((a) => a.rolled != null);
    await logEvent(ctx, gameId, "roll", sub.roleId, { round: roundNumber, total: rolled.length, successes: rolled.filter((a) => a.success).length });

      // ── Process compute transfers ──
      // Only process submitted+rolled actions — drafts were never escrowed.
      //
      // SEND targets: escrowed from submitter at submit time.
      //   Success → credit recipient. Failure → refund submitter.
      //
      // REQUEST targets: escrowed from target if they accepted during submit.
      //   Accepted + Success → credit requester (submitter).
      //   Accepted + Failure → refund target.
      //   Not accepted + Success → take from target, clamped to available balance.
      //   Not accepted + Failure → nothing (no escrow to settle).
    // Found-a-lab settlement: for each action with foundLab, success → create lab row +
    // settle escrow; failure → cancel escrow. Does not require compute targets on the action.
    for (const action of actions) {
      if (!action.foundLab) continue;
      if (action.rolled == null || !action.actionId) continue;
      if (action.actionStatus !== "submitted") continue;
      const success = !!action.success;
      if (success) {
        // Create the lab — owner is the submitter. Unique active name enforced inside helper.
        try {
          await createLabInternal(ctx, {
            gameId,
            name: action.foundLab.name,
            spec: action.foundLab.spec,
            rdMultiplier: 1,
            allocation: action.foundLab.allocation ?? DEFAULT_LAB_ALLOCATION,
            ownerRoleId: sub.roleId,
            createdRound: roundNumber,
          });
          // Settle the founding-cost escrow (pending adjusted row → cache deducts)
          await settlePendingForAction(ctx, gameId, action.actionId);
        } catch (err) {
          // Name collision or other failure → treat as failed founding, refund escrow
          console.warn(`[rollAll] Lab founding failed for "${action.foundLab.name}":`, err);
          await cancelPendingForAction(ctx, gameId, action.actionId);
        }
      } else {
        await cancelPendingForAction(ctx, gameId, action.actionId);
      }
      await logEvent(ctx, gameId, success ? "lab_founded" : "lab_founding_failed", sub.roleId, {
        labName: action.foundLab.name,
        seedCompute: action.foundLab.seedCompute,
      });
    }

    // Merge-lab settlement. Auto-fails if either lab was decommissioned earlier this
    // round (another merger won the race).
    for (const action of actions) {
      if (!action.mergeLab) continue;
      if (action.rolled == null || !action.actionId) continue;
      if (action.actionStatus !== "submitted") continue;
      if (!action.success) {
        await logEvent(ctx, gameId, "lab_merge_failed", sub.roleId, {
          absorbedLabId: action.mergeLab.absorbedLabId,
          survivorLabId: action.mergeLab.survivorLabId,
          reason: "rolled_failure",
        });
        continue;
      }
      try {
        const outcome = await mergeLabsWithComputeInternal(ctx, {
          gameId,
          roundNumber,
          survivorLabId: action.mergeLab.survivorLabId,
          absorbedLabId: action.mergeLab.absorbedLabId,
          newName: action.mergeLab.newName?.trim() || undefined,
          newSpec: action.mergeLab.newSpec?.trim() || undefined,
          reason: `Merger on action: ${action.text.slice(0, 80)}`,
          actionId: action.actionId,
        });
        await logEvent(ctx, gameId, outcome ? "lab_merged" : "lab_merge_failed", sub.roleId, {
          absorbedLabId: action.mergeLab.absorbedLabId,
          survivorLabId: action.mergeLab.survivorLabId,
          reason: outcome ? undefined : "lab_already_decommissioned",
          amountMoved: outcome?.amountMoved,
        });
      } catch (err) {
        // Structural merge half-completed (compute may be stranded on the absorbed
        // owner). Log loudly so facilitator can reconcile via ledger adjustment.
        console.error(`[rollAll] Merger settlement crashed after structural change`, {
          actionId: action.actionId, absorbedLabId: action.mergeLab.absorbedLabId,
          survivorLabId: action.mergeLab.survivorLabId, err,
        });
        await logEvent(ctx, gameId, "lab_merge_error", sub.roleId, {
          absorbedLabId: action.mergeLab.absorbedLabId,
          survivorLabId: action.mergeLab.survivorLabId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const action of actions) {
      if (!action.computeTargets || action.computeTargets.length === 0) continue;
      if (action.rolled == null) continue;
      if (!action.actionId) continue;

      const success = !!action.success;
      // Ledger settlement: success → settle all pending rows for this action (sends + accepted requests);
      // failure → cancel (refunds automatic since pending rows never hit the cache).
      if (success) {
        await settlePendingForAction(ctx, gameId, action.actionId);
        // Accepted request targets are already represented as pending rows from requests.respond.
        // If a request target was NOT accepted, the ledger has no pending pair — the submitter
        // takes compute from the target clamped to availability, per the "soft request" rule.
        const requestTargets = action.computeTargets.filter((t) => t.direction === "request");
        for (const target of requestTargets) {
          const existing = await ctx.db
            .query("requests")
            .withIndex("by_from_role", (q) =>
              q.eq("gameId", gameId).eq("roundNumber", roundNumber).eq("fromRoleId", sub.roleId))
            .collect();
          const match = existing.find((r) =>
            r.toRoleId === target.roleId && r.requestType === "compute" && r.actionId === action.actionId
          );
          if (match?.status === "accepted") continue; // already settled above
          // Soft-take: clamp to target's available balance
          const targetAvail = await getAvailableStock(ctx, gameId, target.roleId, roundNumber);
          const take = Math.min(target.amount, targetAvail);
          if (take > 0) {
            await emitPair(ctx, {
              gameId,
              roundNumber,
              type: "transferred",
              status: "settled",
              fromRoleId: target.roleId,
              toRoleId: sub.roleId,
              amount: take,
              reason: `Soft-take on unaccepted request: ${action.text.slice(0, 80)}`,
              actionId: action.actionId,
            });
          }
        }
      } else {
        await cancelPendingForAction(ctx, gameId, action.actionId);
      }

      await logEvent(ctx, gameId, success ? "compute_transfer_success" : "compute_transfer_refund", sub.roleId, {
        targets: action.computeTargets,
        actionText: action.text,
      });
    }
  }
}

export const rollAllInternal = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    await rollAllImpl(ctx, args.gameId, args.roundNumber);
  },
});

/** Facilitator-triggered wrapper around rollAllImpl. Runs dice + foundLab + compute-target
 *  settlement without the LLM narration pass. Exists so test harnesses can pin the
 *  pending→settled/cancelled path on foundLab escrows without burning LLM cost, and so a
 *  facilitator can advance a stuck round if narration fails. Guarded by facilitator token. */
export const rollAllFacilitator = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    facilitatorToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFacilitator(args.facilitatorToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    assertNotResolving(game);
    await rollAllImpl(ctx, args.gameId, args.roundNumber);
  },
});

export const applyGradingInternal = internalMutation({
  args: {
    submissionId: v.id("submissions"),
    actions: v.array(persistedActionValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, { actions: args.actions, status: "graded" as const });
  },
});

export const applyAiInfluenceInternal = internalMutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    influences: v.array(v.object({
      submissionId: v.id("submissions"),
      actionIndex: v.number(),
      modifier: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    // Group influences by submission to avoid lost-update race on same doc
    const bySubmission = new Map<string, { actionIndex: number; modifier: number }[]>();
    for (const inf of args.influences) {
      const key = inf.submissionId;
      const list = bySubmission.get(key) ?? [];
      list.push({ actionIndex: inf.actionIndex, modifier: inf.modifier });
      bySubmission.set(key, list);
    }
    for (const [submissionId, infList] of bySubmission) {
      const sub = await ctx.db.get(submissionId as typeof args.influences[0]["submissionId"]);
      if (!sub) continue;
      const actions = [...sub.actions];
      for (const inf of infList) {
        if (actions[inf.actionIndex]) {
          actions[inf.actionIndex] = { ...actions[inf.actionIndex], aiInfluence: inf.modifier };
        }
      }
      await ctx.db.patch(submissionId as typeof args.influences[0]["submissionId"], { actions });
    }
  },
});

export const submitInternal = internalMutation({
  args: {
    tableId: v.id("tables"),
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
    actions: v.array(actionValidator),
    computeAllocation: v.optional(v.object({ deployment: v.number(), research: v.number(), safety: v.number() })),
  },
  handler: async (ctx, args) => {
    if (args.computeAllocation) {
      validateComputeAllocation(args.computeAllocation);
    }

    const existing = await findExistingSubmission(ctx, args.tableId, args.gameId, args.roundNumber);

    const stampedActions = args.actions.map((a) => ({ ...a, actionId: generateActionId(), actionStatus: "submitted" as const }));

    if (existing) {
      if (existing.status === "graded" || existing.status === "resolved") return existing._id;
      await ctx.db.patch(existing._id, { actions: stampedActions, computeAllocation: args.computeAllocation, status: "submitted" });
      return existing._id;
    }

    return await ctx.db.insert("submissions", {
      tableId: args.tableId,
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      roleId: args.roleId,
      actions: stampedActions,
      computeAllocation: args.computeAllocation,
      status: "submitted",
    });
  },
});
