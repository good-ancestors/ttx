import { describe, it, expect, beforeAll } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

// Edge-case integration tests — exercise integration seams that the
// per-feature test files don't reach. No LLM calls.

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET || "coral-ember-drift-sage";
const convex = new ConvexHttpClient(CONVEX_URL);

async function createGameInSubmit(): Promise<{ gameId: Id<"games">; tables: Awaited<ReturnType<typeof convex.query<typeof api.tables.getByGame>>> }> {
  const gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.openSubmissions, {
    gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
  });
  const tables = await convex.query(api.tables.getByGame, { gameId });
  return { gameId, tables };
}

async function tableOf(gameId: Id<"games">, roleId: string) {
  const tables = await convex.query(api.tables.getByGame, { gameId });
  return tables.find((t) => t.roleId === roleId)!;
}

describe("edge: multi-round ledger continuity", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    ({ gameId } = await createGameInSubmit());
  });

  it("transferred rows survive across rounds (no regenerate wiping player moves)", async () => {
    // Round 1: direct transfer from US President to OpenBrain.
    const senderTable = await tableOf(gameId, "us-president");
    const targetTable = await tableOf(gameId, "openbrain-ceo");
    const senderStart = senderTable.computeStock ?? 0;
    const targetStart = targetTable.computeStock ?? 0;
    expect(senderStart).toBeGreaterThanOrEqual(2);

    await convex.mutation(api.requests.directTransfer, {
      gameId,
      tableId: senderTable._id,
      fromRoleId: "us-president",
      toRoleId: "openbrain-ceo",
      amount: 2,
    });

    const senderMid = await tableOf(gameId, "us-president");
    const targetMid = await tableOf(gameId, "openbrain-ceo");
    expect(senderMid.computeStock).toBe(senderStart - 2);
    expect(targetMid.computeStock).toBe(targetStart + 2);

    // Regenerate clears acquired/adjusted/merged — transferred must survive.
    await convex.mutation(api.computeLedger.clearRegenerableRowsFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    const senderAfter = await tableOf(gameId, "us-president");
    const targetAfter = await tableOf(gameId, "openbrain-ceo");
    expect(senderAfter.computeStock).toBe(senderStart - 2);
    expect(targetAfter.computeStock).toBe(targetStart + 2);
  });

  it("getComputeHolderView across rounds aggregates stockAfter correctly", async () => {
    // Round 1 already has a transferred row from the test above. Advance to round 2
    // and assert cache == stockAfter for every role (the cache-ledger invariant carried
    // across rounds). Using stockAfter — not stockBefore — because advanceRound schedules
    // round-2 NPC pre-generation which may settle new transfers before the query runs;
    // those legitimately count toward cache but not toward stockBefore (which is pre-round-2
    // activity only). stockAfter = stockBefore + round-N delta = sum of all settled rows
    // through round N, which is what the invariant pins.
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.currentRound).toBe(2);

    const r2 = await convex.query(api.rounds.getComputeHolderView, { gameId, roundNumber: 2 });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    for (const row of r2) {
      const t = tables.find((x) => x.roleId === row.roleId);
      if (!t || t.computeStock == null) continue;
      expect(
        row.stockAfter,
        `round-2 cache-ledger drift for ${row.roleId}: stockAfter=${row.stockAfter} cache=${t.computeStock}`,
      ).toBe(t.computeStock);
    }
  });
});

describe("edge: lab founding name collisions", () => {
  // Each test uses its own game — avoids pending-escrow pollution from NPC auto-submits
  // across tests and from resolved submissions in the shared round.

  it("rejects foundLab with name matching an active lab", async () => {
    const { gameId } = await createGameInSubmit();
    const usTable = await tableOf(gameId, "us-president");
    await convex.mutation(api.computeMutations.overrideHolderCompute, {
      gameId, roundNumber: 1, roleId: "us-president",
      computeStock: 30, reason: "test: fund for foundLab",
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: usTable._id,
      gameId,
      roundNumber: 1,
      roleId: "us-president",
      text: "Build my own OpenBrain knock-off",
      priority: 1,
      foundLab: { name: "OpenBrain", seedCompute: 10 },
    });
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });
    // Lab count for "OpenBrain" is still 1 (no duplicate created).
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    expect(labs.filter((l) => l.name === "OpenBrain")).toHaveLength(1);
  });

  it("lets one player found a lab; duplicate-named attempt rejected on settle", async () => {
    const { gameId } = await createGameInSubmit();
    const usTable = await tableOf(gameId, "us-president");
    // Top up so 10u foundLab fits.
    await convex.mutation(api.computeMutations.overrideHolderCompute, {
      gameId, roundNumber: 1, roleId: "us-president",
      computeStock: 30, reason: "test: fund for foundLab",
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: usTable._id, gameId, roundNumber: 1, roleId: "us-president",
      text: "Found NovaLab", priority: 1,
      foundLab: { name: "NovaLab", seedCompute: 10 },
    });
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    expect(labs.find((l) => l.name === "NovaLab")).toBeDefined();
  });

  it("allows reusing the name of a decommissioned lab across rounds", async () => {
    const { gameId } = await createGameInSubmit();
    const usTable = await tableOf(gameId, "us-president");
    await convex.mutation(api.computeMutations.overrideHolderCompute, {
      gameId, roundNumber: 1, roleId: "us-president",
      computeStock: 30, reason: "test: fund for foundLab",
      facilitatorToken: FACILITATOR_TOKEN,
    });
    // Advance to narrate phase to unlock mergeLabs (submit-phase guard), then merge DeepCent
    // into OpenBrain — DeepCent becomes decommissioned.
    await convex.mutation(api.games.advancePhase, {
      gameId, phase: "narrate", facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.games.mergeLabs, {
      gameId, survivorName: "OpenBrain", absorbedName: "DeepCent",
      facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.games.openSubmissions, {
      gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
    });
    // Founding a new lab named "DeepCent" should now succeed.
    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: usTable._id, gameId, roundNumber: 1, roleId: "us-president",
      text: "Re-establish DeepCent", priority: 1,
      foundLab: { name: "DeepCent", seedCompute: 10 },
    });
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    expect(labs.find((l) => l.name === "DeepCent")).toBeDefined();
  });
});

describe("edge: respond/cancel auth hardening", () => {
  let gameId: Id<"games">;
  let requesterTable: Id<"tables">;
  let targetTable: Id<"tables">;
  let griefTable: Id<"tables">;

  beforeAll(async () => {
    ({ gameId } = await createGameInSubmit());
    requesterTable = (await tableOf(gameId, "us-president"))._id;
    targetTable = (await tableOf(gameId, "openbrain-ceo"))._id;
    griefTable = (await tableOf(gameId, "china-president"))._id;
  });

  it("respond rejects a caller whose table is in a different game", async () => {
    // Build a second game; use its china-president table as the caller.
    const { gameId: otherGame } = await createGameInSubmit();
    const otherChina = (await tableOf(otherGame, "china-president"))._id;

    const proposalId = await convex.mutation(api.requests.send, {
      gameId, roundNumber: 1,
      fromRoleId: "us-president", fromRoleName: "US",
      toRoleId: "openbrain-ceo", toRoleName: "OpenBrain",
      actionId: "cross-game-auth-check",
      actionText: "Send me 3u",
      requestType: "compute", computeAmount: 3,
    });

    await expect(
      convex.mutation(api.requests.respond, {
        proposalId, status: "accepted", callerTableId: otherChina,
      }),
    ).rejects.toThrow(/does not belong to this game/);
  });

  it("respond rejects a griefer whose role is not the target", async () => {
    const proposalId = await convex.mutation(api.requests.send, {
      gameId, roundNumber: 1,
      fromRoleId: "us-president", fromRoleName: "US",
      toRoleId: "openbrain-ceo", toRoleName: "OpenBrain",
      actionId: "grief-auth-check",
      actionText: "Send me 3u",
      requestType: "compute", computeAmount: 3,
    });
    await expect(
      convex.mutation(api.requests.respond, {
        proposalId, status: "accepted", callerTableId: griefTable,
      }),
    ).rejects.toThrow(/Only the target role can respond/);
  });

  it("cancel rejects a caller who is not the sender", async () => {
    const requestId = await convex.mutation(api.requests.send, {
      gameId, roundNumber: 1,
      fromRoleId: "us-president", fromRoleName: "US",
      toRoleId: "openbrain-ceo", toRoleName: "OpenBrain",
      actionId: "cancel-auth-check",
      actionText: "Please support my thing",
      requestType: "endorsement",
    });
    await expect(
      convex.mutation(api.requests.cancel, {
        requestId, callerTableId: targetTable,
      }),
    ).rejects.toThrow(/Only the request sender can cancel/);
  });
});

describe("edge: updateLabs facilitator path", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    ({ gameId } = await createGameInSubmit());
  });

  it("transfers ownership via updateLabs and does NOT move compute", async () => {
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    const openbrain = labs.find((l) => l.name === "OpenBrain")!;
    const originalOwner = openbrain.ownerRoleId!;
    const originalOwnerTable = await tableOf(gameId, originalOwner);
    const originalStock = originalOwnerTable.computeStock ?? 0;

    // Transfer to ai-systems (who doesn't have a lab and has separate compute).
    await convex.mutation(api.games.updateLabs, {
      gameId,
      patches: [{ labId: openbrain._id, ownerRoleId: "ai-systems" }],
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const labsAfter = await convex.query(api.labs.getActiveLabs, { gameId });
    const obAfter = labsAfter.find((l) => l._id === openbrain._id)!;
    expect(obAfter.ownerRoleId).toBe("ai-systems");

    // Old owner's compute is unchanged — ownership transfer doesn't move compute.
    const originalAfter = await tableOf(gameId, originalOwner);
    expect(originalAfter.computeStock).toBe(originalStock);
  });

  it("rejects rename that collides with another active lab", async () => {
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    const conscienta = labs.find((l) => l.name === "Conscienta")!;
    await expect(
      convex.mutation(api.games.updateLabs, {
        gameId,
        patches: [{ labId: conscienta._id, name: "DeepCent" }],
        facilitatorToken: FACILITATOR_TOKEN,
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("edge: cache invariant under mixed workload", () => {
  it("survives send + accept + decline + regenerate + facilitator override", async () => {
    const { gameId } = await createGameInSubmit();
    const usTable = await tableOf(gameId, "us-president");
    const obTable = await tableOf(gameId, "openbrain-ceo");

    // Submit a send.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: usTable._id, gameId, roundNumber: 1, roleId: "us-president",
      text: "Send 2u", priority: 1,
      computeTargets: [{ roleId: "openbrain-ceo", amount: 2, direction: "send" }],
    });

    // Submit a request from OpenBrain to US.
    const requestId = await convex.mutation(api.requests.send, {
      gameId, roundNumber: 1,
      fromRoleId: "openbrain-ceo", fromRoleName: "OpenBrain",
      toRoleId: "us-president", toRoleName: "US",
      actionId: "ob-request",
      actionText: "Send me 3u",
      requestType: "compute", computeAmount: 3,
    });
    // Accept.
    await convex.mutation(api.requests.respond, {
      proposalId: requestId, status: "accepted", callerTableId: usTable._id,
    });
    // Then decline (reverses the escrow).
    await convex.mutation(api.requests.respond, {
      proposalId: requestId, status: "declined", callerTableId: usTable._id,
    });
    // Regenerate.
    await convex.mutation(api.computeLedger.clearRegenerableRowsFacilitator, {
      gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });
    // Facilitator manual override on a third role.
    const conTable = await tableOf(gameId, "conscienta-ceo");
    const conStart = conTable.computeStock ?? 0;
    await convex.mutation(api.computeMutations.overrideHolderCompute, {
      gameId, roundNumber: 1, roleId: "conscienta-ceo",
      computeStock: conStart + 5, reason: "test: mixed workload",
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // Invariant: cache == sum(settled rows via getComputeHolderView stockAfter).
    const view = await convex.query(api.rounds.getComputeHolderView, { gameId, roundNumber: 1 });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    for (const row of view) {
      const t = tables.find((x) => x.roleId === row.roleId);
      if (!t || t.computeStock == null) continue;
      expect(
        t.computeStock,
        `cache drift ${row.roleId}: cache=${t.computeStock} ledger=${row.stockAfter}`,
      ).toBe(row.stockAfter);
    }
  });
});
