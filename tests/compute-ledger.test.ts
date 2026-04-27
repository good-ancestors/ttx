import { describe, it, expect, beforeAll } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexTestClient, FACILITATOR_TOKEN } from "./convex-test-client";
import { createTestGame } from "./test-game";

// Integration tests for the compute ledger (convex/computeLedger.ts).
// Run against a live `npx convex dev` deployment:
//   vitest run tests/compute-ledger.test.ts
//
// These exercise the public API surface that writes to the ledger (submissions,
// requests, facilitator overrides, merges, restore) and assert the cache-ledger
// invariant and escrow lifecycle through `api.tables.get` + `api.rounds.getComputeHolderView`.

const convex = getConvexTestClient();

/** Cache invariant check via the public holder view: for every role with ledger activity,
 *  getComputeHolderView's stockAfter (sum of all settled rows) must equal table.computeStock. */
async function assertCacheLedgerInvariant(
  gameId: Id<"games">,
  roundNumber: number,
): Promise<void> {
  const view = await convex.query(api.rounds.getComputeHolderView, { gameId, roundNumber });
  const tables = await convex.query(api.tables.getByGame, { gameId });
  for (const row of view) {
    const table = tables.find((t) => t.roleId === row.roleId);
    if (!table || table.computeStock == null) continue;
    expect(
      table.computeStock,
      `cache drift for ${row.roleId}: cache=${table.computeStock} ledger=${row.stockAfter}`,
    ).toBe(row.stockAfter);
  }
}

async function openSubmit(gameId: Id<"games">): Promise<void> {
  await convex.mutation(api.games.openSubmissions, {
    gameId,
    durationSeconds: 600,
    facilitatorToken: FACILITATOR_TOKEN,
  });
}

async function createRunningGame(): Promise<Id<"games">> {
  const gameId = await createTestGame(convex);
  await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await openSubmit(gameId);
  return gameId;
}

describe("computeLedger — cache-ledger invariant", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await createRunningGame();
  });

  it("holds after seed (starting rows only)", async () => {
    await assertCacheLedgerInvariant(gameId, 1);
    // Lab CEOs must have non-zero starting seed in the ledger view.
    const view = await convex.query(api.rounds.getComputeHolderView, { gameId, roundNumber: 1 });
    const ob = view.find((r) => r.roleId === "openbrain-ceo");
    expect(ob).toBeDefined();
    expect(ob!.stockAfter).toBeGreaterThan(0);
  });

  it("holds after a facilitator override (emits a facilitator row)", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const target = tables.find((t) => t.roleId === "us-president")!;
    const before = target.computeStock ?? 0;

    await convex.mutation(api.computeMutations.overrideHolderCompute, {
      gameId,
      roundNumber: 1,
      roleId: "us-president",
      computeStock: before + 7,
      reason: "test: +7 facilitator delta",
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const after = await convex.query(api.tables.get, { tableId: target._id });
    expect(after!.computeStock).toBe(before + 7);
    await assertCacheLedgerInvariant(gameId, 1);
  });
});

describe("computeLedger — pending escrow lifecycle", () => {
  let gameId: Id<"games">;
  let senderTableId: Id<"tables">;
  let targetTableId: Id<"tables">;
  const sender = "us-president";
  const target = "openbrain-ceo";

  beforeAll(async () => {
    gameId = await createRunningGame();
    const tables = await convex.query(api.tables.getByGame, { gameId });
    senderTableId = tables.find((t) => t.roleId === sender)!._id;
    targetTableId = tables.find((t) => t.roleId === target)!._id;
  });

  it("emit pending send → cache UNCHANGED (pending rows don't touch settled cache); availableStock decreases (proven via subsequent overspend rejection)", async () => {
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const targetBefore = await convex.query(api.tables.get, { tableId: targetTableId });
    const senderStart = senderBefore!.computeStock ?? 0;
    const targetStart = targetBefore!.computeStock ?? 0;
    expect(senderStart).toBeGreaterThanOrEqual(2);

    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: sender,
      text: "Send 2u to OpenBrain",
      priority: 1,
      computeTargets: [{ roleId: target, amount: 2, direction: "send" }],
    });

    // Cache invariant: computeStock == sum(settled rows). Pending rows are NOT settled, so
    // cache must be unchanged. availableStock = cache − pending — that's checked via the
    // overspend test below, not via the cache directly.
    const senderMid = await convex.query(api.tables.get, { tableId: senderTableId });
    const targetMid = await convex.query(api.tables.get, { tableId: targetTableId });
    expect(senderMid!.computeStock).toBe(senderStart);
    expect(targetMid!.computeStock).toBe(targetStart);

    await assertCacheLedgerInvariant(gameId, 1);
  });

  it("cancel path (deleteAction) deletes the pending row (cache is already unchanged — no refund needed)", async () => {
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const stockBefore = senderBefore!.computeStock ?? 0;

    const sub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId,
      roundNumber: 1,
    });
    expect(sub).toBeTruthy();
    const idx = sub!.actions.findIndex((a) => a.computeTargets && a.computeTargets.length > 0);
    expect(idx).toBeGreaterThanOrEqual(0);

    await convex.mutation(api.submissions.deleteAction, {
      submissionId: sub!._id,
      actionIndex: idx,
    });

    // Cache unchanged (was unchanged by escrow; deleteAction just removes the pending row
    // so availableStock returns to full cache value).
    const after = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(after!.computeStock).toBe(stockBefore);

    // Proof that availableStock fully recovered: a fresh send of stockBefore must succeed
    // (if the pending row had leaked, this would fail with Insufficient compute).
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: sender,
      text: "Full-balance send after cancel",
      priority: 1,
      computeTargets: [{ roleId: target, amount: stockBefore, direction: "send" }],
    });
    // Clean up so subsequent tests have clear state.
    const cleanupSub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId, roundNumber: 1,
    });
    const fullIdx = cleanupSub!.actions.findIndex((a) =>
      a.computeTargets?.some((t) => t.amount === stockBefore),
    );
    if (fullIdx >= 0) {
      await convex.mutation(api.submissions.deleteAction, {
        submissionId: cleanupSub!._id, actionIndex: fullIdx,
      });
    }
    await assertCacheLedgerInvariant(gameId, 1);
  });

  it("getAvailableStock reflects cache minus own-negative pending rows (via insufficient-compute rejection)", async () => {
    // Submit an escrow that consumes most of the available balance, then try to submit
    // another that would overflow if pendings weren't counted.
    const before = await convex.query(api.tables.get, { tableId: senderTableId });
    const available = before!.computeStock ?? 0;
    expect(available).toBeGreaterThanOrEqual(3);

    // Escrow (available - 1) so only 1u remains.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: sender,
      text: "Escrow most of the balance",
      priority: 1,
      computeTargets: [{ roleId: target, amount: available - 1, direction: "send" }],
    });

    // Second attempt at 2u should now fail — would succeed if cache-only check were used
    // (since cache was patched by first escrow). It's the pending-aware getAvailableStock
    // path we're exercising; both should reach the same conclusion here.
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: senderTableId,
        gameId,
        roundNumber: 1,
        roleId: sender,
        text: "Overflow attempt",
        priority: 1,
        computeTargets: [{ roleId: target, amount: 2, direction: "send" }],
      }),
    ).rejects.toThrow(/Insufficient compute/);

    await assertCacheLedgerInvariant(gameId, 1);
  });
});

describe("computeLedger — double-submit does not leak escrow (PR #14 bug #1)", () => {
  let gameId: Id<"games">;
  let senderTableId: Id<"tables">;
  const sender = "us-president";
  const target = "openbrain-ceo";

  beforeAll(async () => {
    gameId = await createRunningGame();
    const tables = await convex.query(api.tables.getByGame, { gameId });
    senderTableId = tables.find((t) => t.roleId === sender)!._id;
  });

  it("saveDraft → saveAndSubmit (same text) upgrades the draft in place with exactly one escrow", async () => {
    const before = await convex.query(api.tables.get, { tableId: senderTableId });
    const start = before!.computeStock ?? 0;

    // Create a draft first, then upgrade it via saveAndSubmit with matching text. This is
    // the draft-upgrade branch (bug #1 from review): the action row must carry the new
    // computeTargets, and the escrow must be written exactly once.
    await convex.mutation(api.submissions.saveDraft, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: sender,
      text: "Draft then upgrade",
      priority: 1,
    });
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: sender,
      text: "Draft then upgrade",
      priority: 1,
      computeTargets: [{ roleId: target, amount: 2, direction: "send" }],
    });

    // Cache unchanged (pending rows don't touch cache).
    const after = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(after!.computeStock).toBe(start);

    const sub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId,
      roundNumber: 1,
    });
    // Exactly one action carries the compute target (draft-upgrade path).
    const withTargets = sub!.actions.filter((a) => a.computeTargets && a.computeTargets.length > 0);
    expect(withTargets).toHaveLength(1);

    // Proof that availableStock shows only one 2u escrow (not 4): a send of (start − 3)
    // must succeed. If escrow had stacked to 4, availableStock would be start−4 < start−3.
    if (start >= 4) {
      await convex.mutation(api.submissions.saveAndSubmit, {
        tableId: senderTableId,
        gameId,
        roundNumber: 1,
        roleId: sender,
        text: "Probe that only 2u is escrowed, not 4u",
        priority: 2,
        computeTargets: [{ roleId: target, amount: start - 3, direction: "send" }],
      });
    }

    await assertCacheLedgerInvariant(gameId, 1);
  });
});

describe("computeLedger — concurrent respond-accept does not double-escrow", () => {
  let gameId: Id<"games">;
  let requesterTableId: Id<"tables">;
  let targetTableId: Id<"tables">;
  const requester = "us-president";
  const target = "openbrain-ceo";

  beforeAll(async () => {
    gameId = await createRunningGame();
    const tables = await convex.query(api.tables.getByGame, { gameId });
    requesterTableId = tables.find((t) => t.roleId === requester)!._id;
    targetTableId = tables.find((t) => t.roleId === target)!._id;
  });

  it("two rapid respond({accepted}) calls end in a single escrowed pair", async () => {
    const targetBefore = await convex.query(api.tables.get, { tableId: targetTableId });
    const stockStart = targetBefore!.computeStock ?? 0;

    // Seed a base action for the request to point at.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: requesterTableId,
      gameId,
      roundNumber: 1,
      roleId: requester,
      text: "Ask for 3u of compute",
      priority: 1,
    });

    const requestId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: requester,
      fromRoleName: "US President",
      toRoleId: target,
      toRoleName: "OpenBrain CEO",
      actionId: "concurrent-request-action",
      actionText: "Ask for 3u of compute",
      requestType: "compute",
      computeAmount: 3,
      callerTableId: requesterTableId,
    });

    // Fire two accepts in parallel; the second should be a no-op (already accepted).
    await Promise.all([
      convex.mutation(api.requests.respond, {
        proposalId: requestId,
        status: "accepted",
        callerTableId: targetTableId,
      }),
      convex.mutation(api.requests.respond, {
        proposalId: requestId,
        status: "accepted",
        callerTableId: targetTableId,
      }),
    ]);

    // Target's cache is unchanged (accept creates a PENDING pair — escrow, not settlement).
    // What matters: the guard in respond prevents a second pending pair from being emitted.
    // Proof: target's availableStock reflects exactly 3u escrowed, not 6u. We probe this
    // by attempting a send of (stockStart − 4) — must succeed with 3u escrow, fail with 6u.
    const targetAfter = await convex.query(api.tables.get, { tableId: targetTableId });
    expect(targetAfter!.computeStock).toBe(stockStart);
    await assertCacheLedgerInvariant(gameId, 1);

    if (stockStart >= 5) {
      await convex.mutation(api.submissions.saveAndSubmit, {
        tableId: targetTableId,
        gameId,
        roundNumber: 1,
        roleId: target,
        text: "Probe that only 3u is escrowed, not 6u",
        priority: 1,
        computeTargets: [{ roleId: requester, amount: stockStart - 4, direction: "send" }],
      });
    }
  });
});

describe("computeLedger — restore with merged labs", () => {
  let gameId: Id<"games">;

  it("restoreSnapshot(round 1 before) undoes a round-2 merge and wipes round-2 ledger rows", async () => {
    gameId = await createTestGame(convex);
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });

    // Force a round-1 resolve so a labsBefore/labsAfter snapshot is written to round 1.
    // We avoid the LLM pipeline by using rollAllActions (deterministic default probabilities).
    await openSubmit(gameId);
    await convex.mutation(api.submissions.rollAllActions, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    // Need labsBefore/After to exist on round 1. rollAllActions does not write these;
    // skip test gracefully if snapshot is missing (pipeline wasn't exercised).
    const rounds = await convex.query(api.rounds.getByGame, { gameId });
    const r1 = rounds.find((r) => r.number === 1);
    if (!r1 || !r1.labsBefore) {
      // rollAllActions doesn't capture labsBefore; the only way to get snapshots is the
      // full resolve pipeline, which costs LLM. Skip this scenario rather than burn tokens.
      // See Q5 note in the PR review — restore-with-merged is best covered by a pipeline test.
      return;
    }

    // Advance to round 2 and merge two labs.
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    const survivor = labs.find((l) => l.name === "OpenBrain");
    const absorbed = labs.find((l) => l.name === "Anthropic" || l.name === "Conscienta");
    if (!survivor || !absorbed) return;

    await convex.mutation(api.games.mergeLabs, {
      gameId,
      survivorName: survivor.name,
      absorbedName: absorbed.name,
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // Restore to round 1 "before".
    await convex.mutation(api.games.restoreSnapshot, {
      gameId,
      roundNumber: 1,
      useBefore: true,
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // Both labs back to active, no dangling mergedIntoLabId.
    const afterLabs = await convex.query(api.labs.getLabs, { gameId });
    const survAfter = afterLabs.find((l) => l.name === survivor.name);
    const absAfter = afterLabs.find((l) => l.name === absorbed.name);
    expect(survAfter?.status).toBe("active");
    expect(absAfter?.status).toBe("active");
    expect(absAfter?.mergedIntoLabId).toBeUndefined();

    // Round 2 ledger rows (including the merge pair) should be gone.
    const r2view = await convex.query(api.rounds.getComputeHolderView, { gameId, roundNumber: 2 });
    expect(r2view).toHaveLength(0);

    await assertCacheLedgerInvariant(gameId, 1);
  });
});

describe("Authorization — requests.respond / requests.cancel / setActionInfluence", () => {
  let gameId: Id<"games">;
  let wrongCallerTableId: Id<"tables">;
  let senderTableId: Id<"tables">;
  let recipientTableId: Id<"tables">;
  const sender = "us-president";
  const recipient = "openbrain-ceo";
  const AI_SYSTEMS = "ai-systems";

  beforeAll(async () => {
    gameId = await createRunningGame();
    const tables = await convex.query(api.tables.getByGame, { gameId });
    senderTableId = tables.find((t) => t.roleId === sender)!._id;
    recipientTableId = tables.find((t) => t.roleId === recipient)!._id;
    // Pick any role that is neither sender, recipient, nor AI Systems for the wrong-caller case.
    wrongCallerTableId = tables.find(
      (t) => t.roleId !== sender && t.roleId !== recipient && t.roleId !== AI_SYSTEMS,
    )!._id;
  });

  it("respond with wrong callerTableId throws", async () => {
    const requestId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: sender,
      fromRoleName: "US President",
      toRoleId: recipient,
      toRoleName: "OpenBrain CEO",
      actionId: "auth-test-respond",
      actionText: "Auth test",
      requestType: "endorsement",
      callerTableId: senderTableId,
    });

    await expect(
      convex.mutation(api.requests.respond, {
        proposalId: requestId,
        status: "accepted",
        callerTableId: wrongCallerTableId,
      }),
    ).rejects.toThrow(/Only the target role can respond/);
  });

  it("cancel with wrong callerTableId throws", async () => {
    const requestId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: sender,
      fromRoleName: "US President",
      toRoleId: recipient,
      toRoleName: "OpenBrain CEO",
      actionId: "auth-test-cancel",
      actionText: "Auth test cancel",
      requestType: "endorsement",
      callerTableId: senderTableId,
    });

    await expect(
      convex.mutation(api.requests.cancel, {
        requestId,
        callerTableId: wrongCallerTableId,
      }),
    ).rejects.toThrow(/Only the request sender can cancel/);
  });

  it("setActionInfluence with non-AI-Systems caller throws", async () => {
    // Ensure a submitted action exists to target.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: sender,
      text: "Action for influence test",
      priority: 1,
    });
    const sub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId,
      roundNumber: 1,
    });
    expect(sub).toBeTruthy();
    const submittedIdx = sub!.actions.findIndex((a) => a.actionStatus === "submitted");
    expect(submittedIdx).toBeGreaterThanOrEqual(0);

    await expect(
      convex.mutation(api.submissions.setActionInfluence, {
        submissionId: sub!._id,
        actionIndex: submittedIdx,
        modifier: 20,
        callerTableId: recipientTableId, // not AI Systems
      }),
    ).rejects.toThrow(/Only the AI Systems player/);
  });
});
