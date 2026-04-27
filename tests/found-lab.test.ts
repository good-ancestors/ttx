import { describe, it, expect, beforeAll } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexTestClient, FACILITATOR_TOKEN } from "./convex-test-client";

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

const convex = getConvexTestClient();

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
    // Don't assume actionIndex=0 — NPC pre-generation writes sample actions on startGame,
    // so the draft lands wherever the append puts it. Just assert it was returned.
    expect(actionIndex).toBeGreaterThanOrEqual(0);

    const afterDraft = await convex.query(api.submissions.getByGameAndRound, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const draftedSub = afterDraft.find((s) => s._id === submissionId)!;
    const draftEntry = draftedSub.actions[actionIndex];
    expect(draftEntry.actionStatus).toBe("draft");
    expect(draftEntry.foundLab).toBeUndefined();
    const draftActionId = draftEntry.actionId;

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
    expect(upgrade.actionIndex).toBe(actionIndex);
    expect(upgrade.actionId).toBe(draftActionId);

    const afterSubmit = await convex.query(api.submissions.getByGameAndRound, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const upgraded = afterSubmit.find((s) => s._id === submissionId)!;
    // Action count didn't grow — the upgrade replaced the draft in place rather than appending.
    expect(upgraded.actions).toHaveLength(draftedSub.actions.length);
    const upgradedAction = upgraded.actions[actionIndex];
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

// ─── Settlement scenarios via rollAllFacilitator harness ─────────────────────

describe("foundLab: settlement via rollAllFacilitator", () => {
  it("success path: rolled-success creates the lab row, owner = founder, escrow settles cache", async () => {
    const { gameId, founderTableId } = await setupGameInSubmitPhase();
    const beforeTable = await convex.query(api.tables.get, { tableId: founderTableId });
    const before = beforeTable!.computeStock ?? 0;
    expect(before).toBeGreaterThanOrEqual(15);

    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: founderTableId,
      gameId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: "Stand up an eval-first lab",
      priority: 1,
      foundLab: { name: "EvalCorp", seedCompute: 15 },
    });
    // Force success.
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    // Lab exists, owned by founder.
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    const newLab = labs.find((l) => l.name === "EvalCorp");
    expect(newLab).toBeDefined();
    expect(newLab!.ownerRoleId).toBe(FOUNDER_ROLE);

    // Cache deducted by seedCompute (settled escrow).
    const afterTable = await convex.query(api.tables.get, { tableId: founderTableId });
    expect(afterTable!.computeStock).toBe(before - 15);
  });

  it("failure path: rolled-failure cancels escrow, no lab created, cache unchanged", async () => {
    const { gameId, founderTableId } = await setupGameInSubmitPhase();
    const beforeTable = await convex.query(api.tables.get, { tableId: founderTableId });
    const before = beforeTable!.computeStock ?? 0;

    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: founderTableId,
      gameId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: "Stand up a doomed lab",
      priority: 1,
      foundLab: { name: "ShouldNotExist", seedCompute: 15 },
    });
    // Force failure.
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 0, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    // No lab by that name.
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    expect(labs.find((l) => l.name === "ShouldNotExist")).toBeUndefined();

    // Cache unchanged (escrow was cancelled, never settled).
    const afterTable = await convex.query(api.tables.get, { tableId: founderTableId });
    expect(afterTable!.computeStock).toBe(before);
  });

  it("regenerate preserves pending foundLab escrow (bug #8 from review)", async () => {
    const { gameId, founderTableId } = await setupGameInSubmitPhase();
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: founderTableId,
      gameId,
      roundNumber: 1,
      roleId: FOUNDER_ROLE,
      text: "Lab-founding action with pending escrow",
      priority: 1,
      foundLab: { name: "PendingLab", seedCompute: 12 },
    });
    const tableBefore = await convex.query(api.tables.get, { tableId: founderTableId });
    const balanceBefore = tableBefore!.computeStock ?? 0;

    // Run regenerate (clears narrative-owned acquired/adjusted/merged settled rows, must
    // preserve pending actionId-owned rows — that's the fix under test).
    await convex.mutation(api.computeLedger.clearRegenerableRowsFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    // The pending foundLab escrow must survive: attempting to spend the full balance
    // on something else would fail if it survived (12u still reserved).
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: founderTableId,
        gameId,
        roundNumber: 1,
        roleId: FOUNDER_ROLE,
        text: "Try to send all balance — escrow must still be holding 12u back",
        priority: 1,
        computeTargets: [{ roleId: OTHER_ROLE, amount: balanceBefore, direction: "send" }],
      }),
    ).rejects.toThrow(/Insufficient compute/);
  });
});
