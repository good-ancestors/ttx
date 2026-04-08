import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { logEvent, assertPhase, assertSubmitWindowOpen, assertFacilitator } from "./events";
import { defaultProbability, AI_SYSTEMS_ROLE_ID } from "./gameData";

const PRIORITY_HARD_CAP = 12;

export function generateActionId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function validateComputeAllocation(allocation: { users: number; capability: number; safety: number }) {
  if (allocation.users < 0 || allocation.capability < 0 || allocation.safety < 0) {
    throw new Error("Compute allocation values must be >= 0");
  }
  const sum = allocation.users + allocation.capability + allocation.safety;
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
});

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
        users: v.number(),
        capability: v.number(),
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
    computeAllocation: v.object({ users: v.number(), capability: v.number(), safety: v.number() }),
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

/** Escrow "send" compute targets — deducts from submitter's table.computeStock.
 *  table.computeStock is the single source of truth for all roles.
 *  game.labs[].computeStock is a derived cache, synced at pipeline resolution.
 *  Only called for "send" direction targets; "request" targets are escrowed
 *  from the target when they accept (see requests.ts respond mutation). */
async function escrowCompute(
  ctx: MutationCtx,
  gameId: Id<"games">,
  senderRoleId: string,
  targets: { roleId: string; amount: number }[],
) {
  if (targets.length === 0) return;
  const totalAmount = targets.reduce((s, t) => s + t.amount, 0);
  if (totalAmount <= 0) return;

  const senderTable = await ctx.db.query("tables")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", senderRoleId))
    .first();
  if (!senderTable) throw new Error("Sender table not found");
  const available = senderTable.computeStock ?? 0;
  if (available < totalAmount) {
    throw new Error(`Insufficient compute: have ${available}u, need ${totalAmount}u`);
  }

  await ctx.db.patch(senderTable._id, { computeStock: available - totalAmount });
}

/** Refund escrowed compute back to sender's table.computeStock. */
async function refundEscrow(
  ctx: MutationCtx,
  gameId: Id<"games">,
  senderRoleId: string,
  targets: { roleId: string; amount: number }[],
) {
  if (targets.length === 0) return;
  const totalAmount = targets.reduce((s, t) => s + t.amount, 0);
  if (totalAmount <= 0) return;

  const senderTable = await ctx.db.query("tables")
    .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", senderRoleId))
    .first();
  if (senderTable) {
    await ctx.db.patch(senderTable._id, { computeStock: (senderTable.computeStock ?? 0) + totalAmount });
  }
}

/** Credit compute to recipients' table.computeStock — used when escrowed action succeeds. */
async function creditComputeRecipients(
  ctx: MutationCtx,
  gameId: Id<"games">,
  targets: { roleId: string; amount: number }[],
) {
  for (const target of targets) {
    const recipientTable = await ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", target.roleId))
      .first();
    if (recipientTable) {
      await ctx.db.patch(recipientTable._id, {
        computeStock: (recipientTable.computeStock ?? 0) + target.amount,
      });
    }
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

    // Escrow "send" targets — deduct from submitter's balance immediately.
    // "request" targets are NOT escrowed here; they create request docs for the
    // target to accept/decline. Escrow happens when the target accepts.
    const sendTargets = targets.filter((t) => t.direction === "send");
    if (sendTargets.length > 0) {
      await escrowCompute(ctx, args.gameId, args.roleId, sendTargets);
    }

    const existing = await findExistingSubmission(ctx, args.tableId, args.gameId, args.roundNumber);

    // Priority is assigned by rank order — 1st submitted gets highest priority.
    // Calculated server-side during grading, not enforced on submit.
    const submittedCount = existing
      ? existing.actions.filter((a) => a.actionStatus === "submitted").length
      : 0;
    const rank = submittedCount + 1; // 1-based rank

    const newAction = {
      actionId: generateActionId(),
      text: args.text,
      priority: rank,
      secret: args.secret,
      actionStatus: "submitted" as const,
      computeTargets: targets.length > 0 ? targets : undefined,
    };

    if (existing) {
      if (submittedCount >= 5) throw new Error("Maximum 5 actions per round");

      // Check if there's an existing draft with the same text — upgrade it instead of duplicating
      const existingDraftIndex = existing.actions.findIndex(
        (a) => a.actionStatus === "draft" && a.text === args.text,
      );
      if (existingDraftIndex !== -1) {
        const actions = [...existing.actions];
        actions[existingDraftIndex] = {
          ...actions[existingDraftIndex],
          priority: rank,
          secret: args.secret,
          actionStatus: "submitted" as const,
          computeTargets: targets.length > 0 ? targets : undefined,
        };
        await ctx.db.patch(existing._id, { actions, status: "submitted" });
        await logEvent(ctx, args.gameId, "action_submitted", args.roleId, {
          actionIndex: existingDraftIndex,
          text: args.text,
        });
        return { submissionId: existing._id, actionIndex: existingDraftIndex, actionId: actions[existingDraftIndex].actionId };
      }

      const actions = [...existing.actions, newAction];
      await ctx.db.patch(existing._id, { actions, status: "submitted" });
      await logEvent(ctx, args.gameId, "action_submitted", args.roleId, {
        actionIndex: actions.length - 1,
        text: args.text,
      });
      return { submissionId: existing._id, actionIndex: actions.length - 1, actionId: newAction.actionId };
    }

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
    return { submissionId: id, actionIndex: 0, actionId: newAction.actionId };
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

    // Refund escrowed "send" compute back to submitter
    const sendTargets = (action.computeTargets ?? []).filter((t) => (t.direction ?? "send") === "send");
    if (sendTargets.length > 0) {
      await refundEscrow(ctx, sub.gameId, sub.roleId, sendTargets);
    }

    // Refund escrowed "request" compute back to targets who accepted, and clean up request docs
    const requestTargets = (action.computeTargets ?? []).filter((t) => t.direction === "request");
    if (requestTargets.length > 0 && action.actionId) {
      const requests = await ctx.db.query("requests")
        .withIndex("by_from_role", (q) =>
          q.eq("gameId", sub.gameId).eq("roundNumber", sub.roundNumber).eq("fromRoleId", sub.roleId))
        .collect();
      for (const target of requestTargets) {
        const match = requests.find((r) =>
          r.toRoleId === target.roleId && r.requestType === "compute" && r.actionId === action.actionId
        );
        if (match?.status === "accepted" && match.computeAmount) {
          const targetTable = await ctx.db.query("tables")
            .withIndex("by_game_and_role", (q) => q.eq("gameId", sub.gameId).eq("roleId", target.roleId))
            .first();
          if (targetTable) {
            await ctx.db.patch(targetTable._id, {
              computeStock: (targetTable.computeStock ?? 0) + match.computeAmount,
            });
          }
        }
        if (match) await ctx.db.delete(match._id);
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

    // Refund escrowed "send" compute (request targets are escrowed from the target, not submitter)
    const sendTargets = (action.computeTargets ?? []).filter((t) => (t.direction ?? "send") === "send");
    if (sendTargets.length > 0) {
      await refundEscrow(ctx, sub.gameId, sub.roleId, sendTargets);
    }

    const actions = sub.actions.filter((_, i) => i !== args.actionIndex);
    if (actions.length === 0) {
      await ctx.db.delete(args.submissionId);
    } else {
      await ctx.db.patch(args.submissionId, { actions });
    }

    // Clean up requests for this action: refund accepted compute requests, then delete all
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
        // Refund accepted compute requests to the target who escrowed
        if (req.status === "accepted" && req.requestType === "compute" && req.computeAmount) {
          const targetTable = await ctx.db.query("tables")
            .withIndex("by_game_and_role", (q) => q.eq("gameId", sub.gameId).eq("roleId", req.toRoleId))
            .first();
          if (targetTable) {
            await ctx.db.patch(targetTable._id, {
              computeStock: (targetTable.computeStock ?? 0) + req.computeAmount,
            });
          }
        }
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

    // If dice have already been rolled, auto-reroll at the new probability
    if (action.rolled != null) {
      actions[args.actionIndex] = {
        ...action,
        probability: args.probability,
        ...rollDice(args.probability, action.aiInfluence),
      };
    } else {
      actions[args.actionIndex] = {
        ...action,
        probability: args.probability,
      };
    }

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

    // Strip grading/rolling fields, keeping everything else
    const { probability: _, rolled: __, success: ___, ...rest } = action;
    actions[args.actionIndex] = rest;

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
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId);
    if (!sub) throw new Error("Submission not found");

    const game = await ctx.db.get(sub.gameId);
    if (!game) throw new Error("Game not found");
    // Allow during submit and rolling phases (until dice are actually rolled)
    if (game.phase !== "submit" && game.phase !== "rolling") {
      throw new Error("Cannot set influence after dice are rolled");
    }
    assertSubmitWindowOpen(game);

    const action = sub.actions[args.actionIndex];
    if (!action) throw new Error("Action not found");
    if (action.actionStatus !== "submitted") throw new Error("Can only influence submitted actions");
    if (action.rolled != null) throw new Error("Cannot influence already-rolled actions");

    const actions = [...sub.actions];
    actions[args.actionIndex] = {
      ...action,
      aiInfluence: args.modifier === 0 ? undefined : args.modifier,
    };
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

/** Settle a single "request" compute target after action roll.
 *  On success: credit requester. On failure: refund target if escrowed. */
async function settleRequestTarget(
  ctx: MutationCtx,
  opts: {
    gameId: Id<"games">;
    roundNumber: number;
    submitterRoleId: string;
    actionId: string | undefined;
    target: { roleId: string; amount: number };
    success: boolean;
  },
) {
  const { gameId, roundNumber, submitterRoleId, actionId, target, success } = opts;

  // Batch: fetch request doc + both tables upfront
  const [requests, submitterTable, targetTable] = await Promise.all([
    ctx.db.query("requests")
      .withIndex("by_from_role", (q) =>
        q.eq("gameId", gameId).eq("roundNumber", roundNumber).eq("fromRoleId", submitterRoleId))
      .collect(),
    ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", submitterRoleId))
      .first(),
    ctx.db.query("tables")
      .withIndex("by_game_and_role", (q) => q.eq("gameId", gameId).eq("roleId", target.roleId))
      .first(),
  ]);
  const match = requests.find((r) =>
    r.toRoleId === target.roleId && r.requestType === "compute" && r.actionId === actionId
  );

  if (success) {
    if (match?.status === "accepted") {
      // Escrowed from target — credit the requester (submitter)
      if (submitterTable) {
        await ctx.db.patch(submitterTable._id, {
          computeStock: (submitterTable.computeStock ?? 0) + target.amount,
        });
      }
    } else if (match) {
      // Not accepted — take from target, clamped to available balance.
      // If no request doc (cancelled), skip — escrow was already refunded.
      if (!targetTable) return;
      const available = targetTable.computeStock ?? 0;
      const clamped = Math.min(target.amount, available);
      if (clamped <= 0) return;
      await ctx.db.patch(targetTable._id, { computeStock: available - clamped });
      if (submitterTable) {
        await ctx.db.patch(submitterTable._id, {
          computeStock: (submitterTable.computeStock ?? 0) + clamped,
        });
      }
    }
  } else {
    // Failure: refund escrowed compute to the target who accepted
    if (match?.status === "accepted" && targetTable) {
      await ctx.db.patch(targetTable._id, {
        computeStock: (targetTable.computeStock ?? 0) + target.amount,
      });
    }
    // If not accepted, nothing was escrowed, nothing to refund
  }
}

export const rollAllInternal = internalMutation({
  args: { gameId: v.id("games"), roundNumber: v.number() },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("submissions")
      .withIndex("by_game_and_round", (q) => q.eq("gameId", args.gameId).eq("roundNumber", args.roundNumber))
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
      await logEvent(ctx, args.gameId, "roll", sub.roleId, { round: args.roundNumber, total: rolled.length, successes: rolled.filter((a) => a.success).length });

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
      for (const action of actions) {
        if (!action.computeTargets || action.computeTargets.length === 0) continue;
        if (action.rolled == null) continue;

        const sendTargets = action.computeTargets.filter((t) => (t.direction ?? "send") === "send");
        const requestTargets = action.computeTargets.filter((t) => t.direction === "request");

        const success = !!action.success;
        if (success && sendTargets.length > 0) {
          await creditComputeRecipients(ctx, args.gameId, sendTargets);
        }
        if (!success && sendTargets.length > 0) {
          await refundEscrow(ctx, args.gameId, sub.roleId, sendTargets);
        }
        for (const target of requestTargets) {
          await settleRequestTarget(ctx, {
            gameId: args.gameId, roundNumber: args.roundNumber,
            submitterRoleId: sub.roleId, actionId: action.actionId, target, success,
          });
        }
        if (sendTargets.length > 0 || requestTargets.length > 0) {
          await logEvent(ctx, args.gameId, success ? "compute_transfer_success" : "compute_transfer_refund", sub.roleId, {
            targets: action.computeTargets,
            actionText: action.text,
          });
        }
      }
    }
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
    computeAllocation: v.optional(v.object({ users: v.number(), capability: v.number(), safety: v.number() })),
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
