import { describe, it, expect, beforeAll } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

// Integration tests for the found-a-lab action flow introduced in PR #14.
//
// Exercises:
//   - saveAndSubmit writes a pending escrow row when foundLab is set
//   - minimum seed enforcement + combined send+foundLab availability check
//   - draft-upgrade preserves foundLab on the submitted action
//
// Scenarios that require internal-only mutations (rollAllInternal for
// settlement / cancellation, clearRegenerableRowsInternal for narrative
// regenerate) are documented as skipped — they need the pipeline action or a
// test-only wrapper to be reachable from the HTTP client.
//
// Run with: npm run test:integration  (requires `npx convex dev` running)

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET || "coral-ember-drift-sage";
const convex = new ConvexHttpClient(CONVEX_URL);

// OpenBrain CEO starts with 22u compute — enough headroom for a 15u foundLab
// plus additional send targets, so we use it as the founder in most scenarios.
const FOUNDER_ROLE = "openbrain-ceo";
const OTHER_ROLE = "deepcent-ceo";

async function setupGameInSubmitPhase() {
  const gameId = await convex.mutation(api.games.create, {
    facilitatorToken: FACILITATOR_TOKEN,
  });
  await convex.mutation(api.games.startGame, {
    gameId,
    facilitatorToken: FACILITATOR_TOKEN,
  });
  await convex.mutation(api.games.advancePhase, {
    gameId,
    phase: "submit",
    durationSeconds: 600,
    facilitatorToken: FACILITATOR_TOKEN,
  });
  const tables = await convex.query(api.tables.getByGame, { gameId });
  const founderTable = tables.find((t) => t.roleId === FOUNDER_ROLE)!;
  return { gameId, founderTableId: founderTable._id, tables };
}

async function getFounderAction(
  gameId: Id<"games">,
  roundNumber: number,
  actionId: string,
) {
  const subs = await convex.query(api.submissions.getByGameAndRound, {
    gameId,
    roundNumber,
    facilitatorToken: FACILITATOR_TOKEN,
  });
  for (const sub of subs) {
    const action = sub.actions.find((a) => a.actionId === actionId);
    if (action) return { sub, action };
  }
  return null;
}

describe("foundLab: seed enforcement", () => {
  let gameId: Id<"games">;
  let founderTableId: Id<"tables">;

  beforeAll(async () => {
    ({ gameId, founderTableId } = await setupGameInSubmitPhase());
  });

  it("rejects seedCompute below the 10u minimum", async () => {
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Found a tiny lab",
        priority: 1,
        foundLab: { name: "TinyLab", seedCompute: 9 },
      }),
    ).rejects.toThrow(/Minimum 10u/);
  });

  it("rejects blank lab name", async () => {
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Found a nameless lab",
        priority: 1,
        foundLab: { name: "   ", seedCompute: 10 },
      }),
    ).rejects.toThrow(/Lab name required/);
  });
});

describe("foundLab: escrow write on submit", () => {
  let gameId: Id<"games">;
  let founderTableId: Id<"tables">;

  beforeAll(async () => {
    ({ gameId, founderTableId } = await setupGameInSubmitPhase());
  });

  it("deducts seedCompute from available stock but not from settled cache", async () => {
    const tableBefore = await convex.query(api.tables.get, {
      tableId: founderTableId,
    });
    const settledBefore = tableBefore!.computeStock ?? 0;
    expect(settledBefore).toBeGreaterThanOrEqual(15);

    const { actionId } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: founderTableId,
      gameId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: "Spin up a new research lab",
      priority: 1,
      foundLab: { name: "Alpha Lab", seedCompute: 15 },
    });

    // Settled cache unchanged — escrow is pending, not settled.
    const tableAfter = await convex.query(api.tables.get, {
      tableId: founderTableId,
    });
    expect(tableAfter!.computeStock).toBe(settledBefore);

    // Pending escrow visible to the action record.
    const hit = await getFounderAction(gameId, 1, actionId);
    expect(hit).toBeTruthy();
    expect(hit!.action.foundLab?.name).toBe("Alpha Lab");
    expect(hit!.action.foundLab?.seedCompute).toBe(15);
    expect(hit!.action.actionStatus).toBe("submitted");

    // Indirect proof the pending row exists: a second action that would need
    // more than (settled − 15u) fails with Insufficient compute.
    const remaining = settledBefore - 15;
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Send more than remaining balance",
        priority: 1,
        computeTargets: [{ roleId: OTHER_ROLE, amount: remaining + 1 }],
      }),
    ).rejects.toThrow(/Insufficient compute/);
  });

  it("refunds the pending escrow when the action is deleted", async () => {
    // Fresh game — don't entangle with prior test state.
    const {
      gameId: gId,
      founderTableId: tId,
    } = await setupGameInSubmitPhase();

    const tableBefore = await convex.query(api.tables.get, { tableId: tId });
    const settledBefore = tableBefore!.computeStock ?? 0;

    const { submissionId, actionIndex } = await convex.mutation(
      api.submissions.saveAndSubmit,
      {
        tableId: tId,
        gameId: gId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Found a lab I'll regret",
        priority: 1,
        foundLab: { name: "RegretCo", seedCompute: 12 },
      },
    );

    // After delete, the full balance should be available again.
    await convex.mutation(api.submissions.deleteAction, {
      submissionId,
      actionIndex,
    });

    // Try to spend the full starting balance — proves escrow was cancelled.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: tId,
      gameId: gId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: "Send the full balance elsewhere",
      priority: 1,
      computeTargets: [{ roleId: OTHER_ROLE, amount: settledBefore }],
    });
  });
});

describe("foundLab: combined send + foundLab availability check", () => {
  let gameId: Id<"games">;
  let founderTableId: Id<"tables">;

  beforeAll(async () => {
    ({ gameId, founderTableId } = await setupGameInSubmitPhase());
  });

  it("rejects a single action where send + foundLab together exceed available stock", async () => {
    const tableBefore = await convex.query(api.tables.get, {
      tableId: founderTableId,
    });
    const available = tableBefore!.computeStock ?? 0;
    // OpenBrain starts with 22u; pick amounts that each fit individually but
    // exceed combined.
    const sendAmount = Math.ceil(available / 2) + 1;
    const foundLabAmount = Math.ceil(available / 2) + 1;
    expect(sendAmount).toBeLessThan(available);
    expect(foundLabAmount).toBeLessThan(available);
    expect(sendAmount + foundLabAmount).toBeGreaterThan(available);

    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Send and found simultaneously",
        priority: 1,
        computeTargets: [{ roleId: OTHER_ROLE, amount: sendAmount, direction: "send" }],
        foundLab: { name: "SplitLab", seedCompute: foundLabAmount },
      }),
    ).rejects.toThrow(/Insufficient compute/);

    // Settled cache untouched — no partial writes.
    const tableAfter = await convex.query(api.tables.get, {
      tableId: founderTableId,
    });
    expect(tableAfter!.computeStock).toBe(available);

    // And the founder can still spend the full balance on something else.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: founderTableId,
      gameId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: "Full-balance send",
      priority: 1,
      computeTargets: [{ roleId: OTHER_ROLE, amount: available, direction: "send" }],
    });
  });
});

describe("foundLab: draft-upgrade preserves foundLab", () => {
  let gameId: Id<"games">;
  let founderTableId: Id<"tables">;

  beforeAll(async () => {
    ({ gameId, founderTableId } = await setupGameInSubmitPhase());
  });

  it("promotes a matching-text draft to submitted and attaches foundLab + escrow", async () => {
    const DRAFT_TEXT = "I build a new frontier lab";

    // 1. Save a draft with no foundLab.
    const { submissionId, actionIndex } = await convex.mutation(
      api.submissions.saveDraft,
      {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: DRAFT_TEXT,
        priority: 1,
      },
    );
    expect(actionIndex).toBe(0);

    const afterDraft = await convex.query(api.submissions.getByGameAndRound, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const draftedSub = afterDraft.find((s) => s._id === submissionId)!;
    expect(draftedSub.actions[0].actionStatus).toBe("draft");
    expect(draftedSub.actions[0].foundLab).toBeUndefined();
    const draftActionId = draftedSub.actions[0].actionId;

    // 2. saveAndSubmit with the same text AND a foundLab. The draft-upgrade
    //    branch should reuse the same actionId and attach foundLab.
    const upgrade = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: founderTableId,
      gameId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: DRAFT_TEXT,
      priority: 1,
      foundLab: { name: "Frontier Lab", seedCompute: 12 },
    });

    // Same submission, same action slot, same actionId — draft was upgraded.
    expect(upgrade.submissionId).toBe(submissionId);
    expect(upgrade.actionIndex).toBe(0);
    expect(upgrade.actionId).toBe(draftActionId);

    const afterSubmit = await convex.query(api.submissions.getByGameAndRound, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const upgraded = afterSubmit.find((s) => s._id === submissionId)!;
    // Still exactly one action — the upgrade must not have appended a duplicate.
    expect(upgraded.actions).toHaveLength(1);
    const upgradedAction = upgraded.actions[0];
    expect(upgradedAction.actionStatus).toBe("submitted");
    // The fix under test: foundLab field survives the draft-upgrade path.
    expect(upgradedAction.foundLab).toBeDefined();
    expect(upgradedAction.foundLab?.name).toBe("Frontier Lab");
    expect(upgradedAction.foundLab?.seedCompute).toBe(12);
    expect(upgradedAction.text).toBe(DRAFT_TEXT);

    // Escrow row is tied to the draft's original actionId — indirectly
    // confirmed by a second action exceeding the post-escrow balance.
    const table = await convex.query(api.tables.get, { tableId: founderTableId });
    const settled = table!.computeStock ?? 0;
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Try to overspend remaining balance",
        priority: 1,
        computeTargets: [{ roleId: OTHER_ROLE, amount: settled - 12 + 1 }],
      }),
    ).rejects.toThrow(/Insufficient compute/);
  });
});

// ─── Unreachable from the HTTP client ────────────────────────────────────────
// The settlement pass (create lab on success / cancel escrow on failure) lives
// in submissions.rollAllInternal — an internalMutation not reachable from
// ConvexHttpClient. The public rollAllActions mutation only rolls dice; it
// does NOT run foundLab settlement. clearRegenerableRows is only reachable
// via triggerRoll → rollAndNarrate, which runs the LLM.
//
// Pinning these would need a facilitator-gated test-only wrapper around
// rollAllInternal and clearRegenerableRowsInternal — out of scope here.
describe.skip("foundLab: settlement scenarios (rollAllInternal not public)", () => {
  it.skip("successful founding creates lab + settles escrow", () => {});
  it.skip("failed founding cancels escrow without creating lab", () => {});
  it.skip("narrative regenerate preserves pending foundLab escrow", () => {});
});
