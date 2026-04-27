import { describe, it, expect, beforeAll } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexTestClient, FACILITATOR_TOKEN } from "./convex-test-client";
import { createTestGame } from "./test-game";

// Run with: npm run test:integration  (requires `npx convex dev` running)

const convex = getConvexTestClient();

const OPENBRAIN_CEO = "openbrain-ceo";
const DEEPCENT_CEO = "deepcent-ceo";
const CONSCIENTA_CEO = "conscienta-ceo";

async function setupGameInSubmitPhase() {
  const gameId = await createTestGame(convex);
  await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.advancePhase, {
    gameId,
    phase: "submit",
    durationSeconds: 600,
    facilitatorToken: FACILITATOR_TOKEN,
  });
  const [tables, labs] = await Promise.all([
    convex.query(api.tables.getByGame, { gameId }),
    convex.query(api.labs.getActiveLabs, { gameId }),
  ]);
  const findTable = (roleId: string) => tables.find((t) => t.roleId === roleId)!;
  const findLab = (roleId: string) => labs.find((l) => l.ownerRoleId === roleId)!;
  return {
    gameId,
    openbrainTable: findTable(OPENBRAIN_CEO),
    deepcentTable: findTable(DEEPCENT_CEO),
    conscientaTable: findTable(CONSCIENTA_CEO),
    openbrainLab: findLab(OPENBRAIN_CEO),
    deepcentLab: findLab(DEEPCENT_CEO),
    conscientaLab: findLab(CONSCIENTA_CEO),
  };
}

describe("mergeLab: submit-time validation", () => {
  let ctx: Awaited<ReturnType<typeof setupGameInSubmitPhase>>;
  beforeAll(async () => { ctx = await setupGameInSubmitPhase(); });

  it("rejects self-merge (absorbed == survivor)", async () => {
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: ctx.openbrainTable._id,
        gameId: ctx.gameId,
        roundNumber: 1,
        roleId: OPENBRAIN_CEO,
        text: "merge myself with myself",
        priority: 1,
        mergeLab: {
          absorbedLabId: ctx.openbrainLab._id,
          survivorLabId: ctx.openbrainLab._id,
        },
      }),
    ).rejects.toThrow(/Cannot merge a lab with itself/);
  });

  it("rejects when submitter owns neither lab", async () => {
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: ctx.openbrainTable._id,
        gameId: ctx.gameId,
        roundNumber: 1,
        roleId: OPENBRAIN_CEO,
        text: "merge the other two labs with each other",
        priority: 1,
        mergeLab: {
          absorbedLabId: ctx.deepcentLab._id,
          survivorLabId: ctx.conscientaLab._id,
        },
      }),
    ).rejects.toThrow(/must own either the absorbed or survivor lab/);
  });

  it("rejects newName clashing with another active lab", async () => {
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: ctx.openbrainTable._id,
        gameId: ctx.gameId,
        roundNumber: 1,
        roleId: OPENBRAIN_CEO,
        text: "merger branded as an existing lab",
        priority: 1,
        mergeLab: {
          absorbedLabId: ctx.deepcentLab._id,
          survivorLabId: ctx.openbrainLab._id,
          newName: ctx.conscientaLab.name,
        },
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("mergeLab: settlement via rollAllFacilitator", () => {
  it("success: absorbed lab decommissioned + absorbed owner's compute flows to survivor owner", async () => {
    const ctx = await setupGameInSubmitPhase();
    const absorbedBefore = await convex.query(api.tables.get, { tableId: ctx.deepcentTable._id });
    const survivorBefore = await convex.query(api.tables.get, { tableId: ctx.openbrainTable._id });
    const absorbedStock = absorbedBefore!.computeStock ?? 0;
    const survivorStock = survivorBefore!.computeStock ?? 0;
    expect(absorbedStock).toBeGreaterThan(0);

    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: ctx.openbrainTable._id,
      gameId: ctx.gameId,
      roundNumber: 1,
      roleId: OPENBRAIN_CEO,
      text: "Acquire DeepCent",
      priority: 1,
      mergeLab: {
        absorbedLabId: ctx.deepcentLab._id,
        survivorLabId: ctx.openbrainLab._id,
        newName: "OpenBrain (Global)",
      },
    });

    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId: ctx.gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    const labsAfter = await convex.query(api.labs.getLabs, { gameId: ctx.gameId, includeInactive: true });
    const absorbedAfter = labsAfter.find((l) => l._id === ctx.deepcentLab._id);
    const survivorAfter = labsAfter.find((l) => l._id === ctx.openbrainLab._id);
    expect(absorbedAfter!.status).toBe("decommissioned");
    expect(absorbedAfter!.mergedIntoLabId).toBe(ctx.openbrainLab._id);
    expect(survivorAfter!.status).toBe("active");
    expect(survivorAfter!.name).toBe("OpenBrain (Global)");

    const absorbedTableAfter = await convex.query(api.tables.get, { tableId: ctx.deepcentTable._id });
    const survivorTableAfter = await convex.query(api.tables.get, { tableId: ctx.openbrainTable._id });
    expect(absorbedTableAfter!.computeStock).toBe(0);
    expect(survivorTableAfter!.computeStock).toBe(survivorStock + absorbedStock);
  });

  it("failure: both labs stay active, no compute moves", async () => {
    const ctx = await setupGameInSubmitPhase();
    const absorbedBefore = await convex.query(api.tables.get, { tableId: ctx.deepcentTable._id });
    const survivorBefore = await convex.query(api.tables.get, { tableId: ctx.openbrainTable._id });

    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: ctx.openbrainTable._id,
      gameId: ctx.gameId,
      roundNumber: 1,
      roleId: OPENBRAIN_CEO,
      text: "Hostile takeover attempt",
      priority: 1,
      mergeLab: {
        absorbedLabId: ctx.deepcentLab._id,
        survivorLabId: ctx.openbrainLab._id,
      },
    });
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId, actionIndex, probability: 0, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId: ctx.gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    const labsAfter = await convex.query(api.labs.getActiveLabs, { gameId: ctx.gameId });
    expect(labsAfter.find((l) => l._id === ctx.deepcentLab._id)?.status).toBe("active");
    expect(labsAfter.find((l) => l._id === ctx.openbrainLab._id)?.status).toBe("active");

    const absorbedTableAfter = await convex.query(api.tables.get, { tableId: ctx.deepcentTable._id });
    const survivorTableAfter = await convex.query(api.tables.get, { tableId: ctx.openbrainTable._id });
    expect(absorbedTableAfter!.computeStock).toBe(absorbedBefore!.computeStock);
    expect(survivorTableAfter!.computeStock).toBe(survivorBefore!.computeStock);
  });

  it("race: absorbed lab already decommissioned by an earlier merger → this one no-ops", async () => {
    const ctx = await setupGameInSubmitPhase();
    const [absorbedBefore, openbrainBefore, conscientaBefore] = await Promise.all([
      convex.query(api.tables.get, { tableId: ctx.deepcentTable._id }),
      convex.query(api.tables.get, { tableId: ctx.openbrainTable._id }),
      convex.query(api.tables.get, { tableId: ctx.conscientaTable._id }),
    ]);
    const absorbedStock = absorbedBefore!.computeStock ?? 0;

    const first = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: ctx.openbrainTable._id,
      gameId: ctx.gameId,
      roundNumber: 1,
      roleId: OPENBRAIN_CEO,
      text: "Acquire DeepCent",
      priority: 1,
      mergeLab: { absorbedLabId: ctx.deepcentLab._id, survivorLabId: ctx.openbrainLab._id },
    });
    const second = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: ctx.conscientaTable._id,
      gameId: ctx.gameId,
      roundNumber: 1,
      roleId: CONSCIENTA_CEO,
      text: "Also acquire DeepCent",
      priority: 1,
      mergeLab: { absorbedLabId: ctx.deepcentLab._id, survivorLabId: ctx.conscientaLab._id },
    });

    await convex.mutation(api.submissions.overrideProbability, {
      submissionId: first.submissionId, actionIndex: first.actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.overrideProbability, {
      submissionId: second.submissionId, actionIndex: second.actionIndex, probability: 100, facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.submissions.rollAllFacilitator, {
      gameId: ctx.gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });

    const [absorbedAfter, openbrainAfter, conscientaAfter] = await Promise.all([
      convex.query(api.tables.get, { tableId: ctx.deepcentTable._id }),
      convex.query(api.tables.get, { tableId: ctx.openbrainTable._id }),
      convex.query(api.tables.get, { tableId: ctx.conscientaTable._id }),
    ]);
    expect(absorbedAfter!.computeStock).toBe(0);

    const openbrainDelta = (openbrainAfter!.computeStock ?? 0) - (openbrainBefore!.computeStock ?? 0);
    const conscientaDelta = (conscientaAfter!.computeStock ?? 0) - (conscientaBefore!.computeStock ?? 0);
    const absorbedFlowedOnce = [openbrainDelta, conscientaDelta].filter((d) => d === absorbedStock).length;
    expect(absorbedFlowedOnce).toBe(1);
  });
});

// Draft-upgrade preservation — the draft path currently doesn't carry mergeLab,
// but saveAndSubmit for the same-text upgrade case should still attach mergeLab
// on the submitted action.
describe("mergeLab: draft-upgrade preserves mergeLab on submit", () => {
  it("promotes a matching-text draft to submitted with mergeLab attached", async () => {
    const ctx = await setupGameInSubmitPhase();

    await convex.mutation(api.submissions.saveDraft, {
      tableId: ctx.openbrainTable._id,
      gameId: ctx.gameId,
      roundNumber: 1,
      roleId: OPENBRAIN_CEO,
      text: "Initiate merger with DeepCent",
      priority: 1,
    });

    const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: ctx.openbrainTable._id,
      gameId: ctx.gameId,
      roundNumber: 1,
      roleId: OPENBRAIN_CEO,
      text: "Initiate merger with DeepCent",
      priority: 1,
      mergeLab: {
        absorbedLabId: ctx.deepcentLab._id,
        survivorLabId: ctx.openbrainLab._id,
      },
    });

    const subs = await convex.query(api.submissions.getByGameAndRound, {
      gameId: ctx.gameId, roundNumber: 1, facilitatorToken: FACILITATOR_TOKEN,
    });
    const sub = subs.find((s: { _id: Id<"submissions"> }) => s._id === submissionId)!;
    const action = sub.actions[actionIndex];
    expect(action.actionStatus).toBe("submitted");
    expect(action.mergeLab).toBeDefined();
    expect(action.mergeLab!.absorbedLabId).toBe(ctx.deepcentLab._id);
    expect(action.mergeLab!.survivorLabId).toBe(ctx.openbrainLab._id);
  });
});
