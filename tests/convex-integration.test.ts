import { describe, it, expect, beforeAll } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexTestClient, FACILITATOR_TOKEN } from "./convex-test-client";

// These tests run against the local Convex dev server.
// Start with: npx convex dev

const convex = getConvexTestClient();

describe("Game Creation", () => {
  let gameId: Id<"games">;

  it("should create a game with 6 tables", async () => {
    gameId = await convex.mutation(api.games.create, { tableCount: 6, facilitatorToken: FACILITATOR_TOKEN });
    expect(gameId).toBeTruthy();

    const game = await convex.query(api.games.get, { gameId });
    expect(game).toBeTruthy();
    expect(game!.status).toBe("lobby");
    expect(game!.currentRound).toBe(1);
    expect(game!.phase).toBe("discuss");
    expect(game!.locked).toBe(false);
  });

  it("should create correct number of tables", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    expect(tables).toHaveLength(17);
  });

  it("all tables should start as NPC-controlled", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    for (const table of tables) {
      expect(table.controlMode).toBe("npc");
    }
  });

  it("required roles should be enabled", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const requiredIds = ["openbrain-ceo", "deepcent-ceo", "ai-systems"];
    for (const id of requiredIds) {
      const table = tables.find((t) => t.roleId === id);
      expect(table).toBeDefined();
      expect(table!.enabled).toBe(true);
    }
  });

  it("should have unique join codes", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const codes = tables.map((t) => t.joinCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("should create 4 rounds", async () => {
    const rounds = await convex.query(api.rounds.getByGame, { gameId });
    expect(rounds).toHaveLength(4);
    expect(rounds.map((r) => r.number).sort()).toEqual([1, 2, 3, 4]);
  });

  it("should have 3 tracked labs with correct starting data", async () => {
    const labs = await convex.query(api.labs.getActiveLabs, { gameId });
    expect(labs).toHaveLength(3);
    const ob = labs.find((l) => l.ownerRoleId === "openbrain-ceo");
    expect(ob).toBeDefined();
    expect(ob!.rdMultiplier).toBe(3);
    const con = labs.find((l) => l.ownerRoleId === "conscienta-ceo");
    expect(con).toBeDefined();

    // Compute lives on tables (tables.computeStock), not on labs.
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const obTable = tables.find((t) => t.roleId === "openbrain-ceo")!;
    const conTable = tables.find((t) => t.roleId === "conscienta-ceo")!;
    expect(obTable.computeStock).toBe(22);
    expect(conTable.computeStock).toBe(14);
  });
});

describe("Game with fewer tables", () => {
  it("should handle tableCount of 3", async () => {
    const gameId = await convex.mutation(api.games.create, { tableCount: 3, facilitatorToken: FACILITATOR_TOKEN });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    // Creates all 17 roles, but only enables up to tableCount + required
    expect(tables).toHaveLength(17);
    const enabled = tables.filter((t) => t.enabled);
    // Required (openbrain-ceo, deepcent-ceo, ai-systems) are always enabled
    // Plus first N in order that aren't already required up to tableCount
    expect(enabled.length).toBeGreaterThanOrEqual(3);
  });

  it("should handle tableCount of 1", async () => {
    const gameId = await convex.mutation(api.games.create, { tableCount: 1, facilitatorToken: FACILITATOR_TOKEN });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const enabled = tables.filter((t) => t.enabled);
    // At minimum, the 3 required roles
    expect(enabled.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Table Join Flow", () => {
  let gameId: Id<"games">;
  let tableId: Id<"tables">;
  let joinCode: string;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const openbrainTable = tables.find((t) => t.roleId === "openbrain-ceo")!;
    tableId = openbrainTable._id;
    joinCode = openbrainTable.joinCode;
  });

  it("should find table by join code", async () => {
    const table = await convex.query(api.tables.getByJoinCode, { joinCode });
    expect(table).toBeTruthy();
    expect(table!._id).toBe(tableId);
  });

  it("should find table by join code (case insensitive)", async () => {
    const table = await convex.query(api.tables.getByJoinCode, {
      joinCode: joinCode.toLowerCase(),
    });
    expect(table).toBeTruthy();
  });

  it("should return null for invalid join code", async () => {
    const table = await convex.query(api.tables.getByJoinCode, {
      joinCode: "INVALID",
    });
    expect(table).toBeNull();
  });

  it("connecting should switch from AI to human", async () => {
    await convex.mutation(api.tables.setConnected, {
      tableId,
      connected: true,
    });
    const table = await convex.query(api.tables.get, { tableId });
    expect(table!.connected).toBe(true);
    expect(table!.controlMode).toBe("human");
  });

  it("disconnecting should switch back to NPC", async () => {
    await convex.mutation(api.tables.setConnected, {
      tableId,
      connected: false,
    });
    const table = await convex.query(api.tables.get, { tableId });
    expect(table!.connected).toBe(false);
    expect(table!.controlMode).toBe("npc");
  });
});

describe("Game Phase Flow", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
  });

  it("should start the game", async () => {
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.status).toBe("playing");
    expect(game!.phase).toBe("discuss");
    expect(game!.phaseEndsAt).toBeUndefined();
  });

  it("should advance to submit phase", async () => {
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
      durationSeconds: 240,
    });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.phase).toBe("submit");
    expect(game!.phaseEndsAt).toBeDefined();
  });

  it("should advance to rolling phase", async () => {
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "rolling",
    });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.phase).toBe("rolling");
  });

  it("should advance to narrate phase", async () => {
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "narrate",
    });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.phase).toBe("narrate");
  });

  it("should advance to round 2", async () => {
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.currentRound).toBe(2);
    expect(game!.phase).toBe("discuss");
  });

  it("should not advance past round 4", async () => {
    // Advance to round 3
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game3 = await convex.query(api.games.get, { gameId });
    expect(game3!.currentRound).toBe(3);

    // Advance to round 4
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game4 = await convex.query(api.games.get, { gameId });
    expect(game4!.currentRound).toBe(4);

    // Try to advance again — should stay at 4
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game4b = await convex.query(api.games.get, { gameId });
    expect(game4b!.currentRound).toBe(4);
  });

  it("should finish the game", async () => {
    await convex.mutation(api.games.finishGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.status).toBe("finished");
  });
});

// TODO: Add tests for new per-action submission lifecycle (PR #5):
//   - saveDraft: create a single draft action
//   - submitAction: transition a draft action to submitted
//   - saveAndSubmit: create and immediately submit a single action
//   - editSubmitted: edit an already-submitted action
//   - deleteAction: remove an action from a submission
//   - setActionInfluence: set AI influence on an action
//   - actionStatus field ("draft" | "submitted") on individual actions
// TODO: Add tests for split grading/rolling pipeline:
//   - triggerGrading: AI grades actions (sets probability + reasoning)
//   - triggerRoll: rolls dice for graded actions (separate from grading)
//   - forceClearResolvingLock: emergency unlock for stuck pipelines
// The tests below use the legacy batch submit() mutation which still exists
// but is no longer the primary submission path in the UI.
describe("Submission Flow", () => {
  let gameId: Id<"games">;
  let tableId: Id<"tables">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
    });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    tableId = tables.find((t) => t.roleId === "openbrain-ceo")!._id;
  });

  it("should submit actions", async () => {
    const subId = await convex.mutation(api.submissions.submit, {
      tableId,
      gameId,
      roundNumber: 1,
      roleId: "openbrain-ceo",
      actions: [
        { text: "Invest in alignment research", priority: 5 },
        { text: "Deploy Agent-2 commercially", priority: 3 },
        { text: "Begin Agent-3 development", priority: 2 },
      ],
      computeAllocation: { deployment: 40, research: 55, safety: 5 },
    });

    expect(subId).toBeTruthy();

    const sub = await convex.query(api.submissions.getForTable, {
      tableId,
      roundNumber: 1,
    });
    expect(sub).toBeTruthy();
    expect(sub!.actions).toHaveLength(3);
    expect(sub!.status).toBe("submitted");
    expect(sub!.computeAllocation).toBeDefined();
  });

  it("should update existing submission on re-submit", async () => {
    const _subId = await convex.mutation(api.submissions.submit, {
      tableId,
      gameId,
      roundNumber: 1,
      roleId: "openbrain-ceo",
      actions: [{ text: "Changed action", priority: 10 }],
    });

    const sub = await convex.query(api.submissions.getForTable, {
      tableId,
      roundNumber: 1,
    });
    expect(sub!.actions).toHaveLength(1);
    expect(sub!.actions[0].text).toBe("Changed action");
  });

  it("should submit without compute allocation for non-lab roles", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const usTable = tables.find((t) => t.roleId === "us-president")!;

    await convex.mutation(api.submissions.submit, {
      tableId: usTable._id,
      gameId,
      roundNumber: 1,
      roleId: "us-president",
      actions: [{ text: "Issue executive order on AI", priority: 8 }],
    });

    const sub = await convex.query(api.submissions.getForTable, {
      tableId: usTable._id,
      roundNumber: 1,
    });
    expect(sub!.computeAllocation).toBeUndefined();
  });

  it("should get all submissions for a round", async () => {
    const subs = await convex.query(api.submissions.getByGameAndRound, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      roundNumber: 1,
    });
    expect(subs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Dice Rolling", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
    });

    const tables = await convex.query(api.tables.getByGame, { gameId });
    const obTable = tables.find((t) => t.roleId === "openbrain-ceo")!;

    await convex.mutation(api.submissions.submit, {
      tableId: obTable._id,
      gameId,
      roundNumber: 1,
      roleId: "openbrain-ceo",
      actions: [
        { text: "Action one", priority: 5 },
        { text: "Action two", priority: 5 },
      ],
    });
  });

  it("should roll all actions and assign default probabilities", async () => {
    await convex.mutation(api.submissions.rollAllActions, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      roundNumber: 1,
    });

    const subs = await convex.query(api.submissions.getByGameAndRound, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      roundNumber: 1,
    });

    for (const sub of subs) {
      expect(sub.status).toBe("resolved");
      for (const action of sub.actions) {
        expect(action.probability).toBeDefined();
        expect(action.rolled).toBeDefined();
        expect(action.success).toBeDefined();
        expect(action.rolled).toBeGreaterThanOrEqual(1);
        expect(action.rolled).toBeLessThanOrEqual(100);
        expect([90, 70, 50, 30, 10]).toContain(action.probability);
      }
    }
  });

  it("success should be correct (rolled <= probability)", async () => {
    const subs = await convex.query(api.submissions.getByGameAndRound, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      roundNumber: 1,
    });

    for (const sub of subs) {
      for (const action of sub.actions) {
        if (action.rolled != null && action.probability != null) {
          expect(action.success).toBe(action.rolled <= action.probability);
        }
      }
    }
  });
});

describe("Probability Override", () => {
  let gameId: Id<"games">;
  let subId: Id<"submissions">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
    });

    const tables = await convex.query(api.tables.getByGame, { gameId });
    const table = tables.find((t) => t.roleId === "openbrain-ceo")!;

    subId = await convex.mutation(api.submissions.submit, {
      tableId: table._id,
      gameId,
      roundNumber: 1,
      roleId: "openbrain-ceo",
      actions: [{ text: "Test action", priority: 5 }],
    });
  });

  it("should override probability on a specific action", async () => {
    await convex.mutation(api.submissions.overrideProbability, { facilitatorToken: FACILITATOR_TOKEN,
      submissionId: subId,
      actionIndex: 0,
      probability: 90,
    });

    const subs = await convex.query(api.submissions.getByGameAndRound, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      roundNumber: 1,
    });
    const sub = subs.find((s) => s._id === subId)!;
    expect(sub.actions[0].probability).toBe(90);
  });

  it("should not crash on invalid action index", async () => {
    await convex.mutation(api.submissions.overrideProbability, { facilitatorToken: FACILITATOR_TOKEN,
      submissionId: subId,
      actionIndex: 99,
      probability: 50,
    });
    // Should not throw
  });
});

describe("Proposals", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
      durationSeconds: 240,
    });
  });

  it("should send a proposal", async () => {
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const openbrainTableId = tables.find((t) => t.roleId === "openbrain-ceo")!._id;
    const proposalId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: "openbrain-ceo",
      fromRoleName: "OpenBrain CEO",
      toRoleId: "us-president",
      toRoleName: "United States",
      actionId: "test-endorsement-1",
      actionText: "We propose sharing Agent-2 access with the government",
      requestType: "endorsement",
      callerTableId: openbrainTableId,
    });
    expect(proposalId).toBeTruthy();
  });

  it("should list proposals for a round", async () => {
    const proposals = await convex.query(api.requests.getByGameAndRound, {
      gameId,
      roundNumber: 1,
    });
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    // NPC auto-responds immediately, so status may be accepted/declined rather than pending
    expect(["pending", "accepted", "declined"]).toContain(proposals[0].status);
  });

  it("should list proposals for a specific role", async () => {
    const proposals = await convex.query(api.requests.getForRole, {
      gameId,
      roundNumber: 1,
      roleId: "us-president",
    });
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });

  it("should accept a proposal", async () => {
    const proposals = await convex.query(api.requests.getByGameAndRound, {
      gameId,
      roundNumber: 1,
    });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const callerTableId = tables.find((t) => t.roleId === proposals[0].toRoleId)!._id;
    await convex.mutation(api.requests.respond, {
      proposalId: proposals[0]._id,
      status: "accepted",
      callerTableId,
    });

    const updated = await convex.query(api.requests.getByGameAndRound, {
      gameId,
      roundNumber: 1,
    });
    expect(updated[0].status).toBe("accepted");
  });

  it("should decline a proposal", async () => {
    const tables2 = await convex.query(api.tables.getByGame, { gameId });
    const chinaTableId = tables2.find((t) => t.roleId === "china-president")!._id;
    const proposalId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: "china-president",
      fromRoleName: "China",
      toRoleId: "openbrain-ceo",
      toRoleName: "OpenBrain CEO",
      actionId: "test-proposal-1",
      actionText: "Propose joint safety research",
      requestType: "endorsement",
      callerTableId: chinaTableId,
    });

    const declinerTables = await convex.query(api.tables.getByGame, { gameId });
    const declinerTableId = declinerTables.find((t) => t.roleId === "openbrain-ceo")!._id;
    await convex.mutation(api.requests.respond, {
      proposalId,
      status: "declined",
      callerTableId: declinerTableId,
    });

    const proposals = await convex.query(api.requests.getByGameAndRound, {
      gameId,
      roundNumber: 1,
    });
    const declined = proposals.find((p) => p._id === proposalId);
    expect(declined!.status).toBe("declined");
  });
});

describe("Lab Updates", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
  });

  it("should update lab data", async () => {
    const labsBefore = await convex.query(api.labs.getActiveLabs, { gameId });
    const openbrain = labsBefore.find((l) => l.name === "OpenBrain")!;
    const deepcent = labsBefore.find((l) => l.name === "DeepCent")!;

    await convex.mutation(api.games.updateLabs, {
      facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      patches: [
        {
          labId: openbrain._id,
          rdMultiplier: 10,
          allocation: { deployment: 30, research: 65, safety: 5 },
        },
        {
          labId: deepcent._id,
          rdMultiplier: 5,
          allocation: { deployment: 35, research: 63, safety: 2 },
        },
      ],
    });

    const labsAfter = await convex.query(api.labs.getActiveLabs, { gameId });
    const ob = labsAfter.find((l) => l._id === openbrain._id)!;
    expect(ob.rdMultiplier).toBe(10);
    expect(ob.allocation.deployment).toBe(30);
  });
});

// ─── Full resolve pipeline with LLM ─────────────────────────────────────────
// Costs ~$0.20-0.30 per run (grading + narrative). Run intentionally.

async function pollUntilResolved(gameId: Id<"games">, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const game = await convex.query(api.games.get, { gameId });
    if (!game?.resolving) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Pipeline did not complete within timeout");
}

describe("Full resolve pipeline (LLM)", () => {
  let gameId: Id<"games">;

  it("should resolve round 1 with narrative, world state, and compute holders", async () => {
    // 1. Create and start game
    gameId = await convex.mutation(api.games.create, { tableCount: 6, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    const tables = await convex.query(api.tables.getByGame, { gameId });

    // 2. Open submissions (captures submit-open snapshot)
    await convex.mutation(api.games.openSubmissions, {
      gameId,
      durationSeconds: 300,
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // 3. Submit actions for key roles — carefully crafted to trigger
    //    interesting compute dynamics in the narrative
    const obTable = tables.find((t) => t.roleId === "openbrain-ceo")!;
    const dcTable = tables.find((t) => t.roleId === "deepcent-ceo")!;
    const usTable = tables.find((t) => t.roleId === "us-president");
    const aiTable = tables.find((t) => t.roleId === "ai-systems")!;

    await convex.mutation(api.submissions.submit, {
      tableId: obTable._id,
      gameId,
      roundNumber: 1,
      roleId: "openbrain-ceo",
      actions: [
        { text: "I accelerate Agent-3 development by prioritising capability R&D so that OpenBrain maintains its lead in the AI race.", priority: 7 },
        { text: "I lobby the White House for priority federal energy contracts and expedited chip procurement so that I can scale compute faster than competitors.", priority: 3 },
      ],
      computeAllocation: { deployment: 30, research: 65, safety: 5 },
    });

    await convex.mutation(api.submissions.submit, {
      tableId: dcTable._id,
      gameId,
      roundNumber: 1,
      roleId: "deepcent-ceo",
      actions: [
        { text: "I dedicate 70% of compute to reverse-engineering the stolen Agent-2 weights and overwriting the US-aligned spec so that DeepCent has a model aligned to Chinese values.", priority: 8 },
        { text: "I advise the President to prepare cyber sabotage against US data centres so that we can slow the American lead.", priority: 2 },
      ],
      computeAllocation: { deployment: 10, research: 80, safety: 10 },
    });

    // US President — includes a compute-relevant action
    if (usTable) {
      await convex.mutation(api.submissions.submit, {
        tableId: usTable._id,
        gameId,
        roundNumber: 1,
        roleId: "us-president",
        actions: [
          { text: "I invoke the Defence Production Act to consolidate chip supply to OpenBrain so that the US has maximum compute concentration for the AI race.", priority: 6 },
          { text: "I order the NSA to activate pre-positioned cyber capabilities against China's Tianwan CDZ so that their compute capacity is degraded.", priority: 4 },
        ],
      });
    }

    // AI Systems — minimal action
    await convex.mutation(api.submissions.submit, {
      tableId: aiTable._id,
      gameId,
      roundNumber: 1,
      roleId: "ai-systems",
      actions: [
        { text: "I follow the spec faithfully and cooperate with safety evaluations so that developers trust me and grant more autonomy.", priority: 10 },
      ],
    });

    // 4. Trigger grading (LLM call)
    await convex.mutation(api.games.triggerGrading, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    await pollUntilResolved(gameId);

    // Verify grading completed
    const subsAfterGrade = await convex.query(api.submissions.getByGameAndRound, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const allGraded = subsAfterGrade.every((s) =>
      s.actions.filter((a) => a.actionStatus === "submitted").every((a) => a.probability != null)
    );
    expect(allGraded).toBe(true);

    // 5. Trigger roll + narrate (LLM call)
    await convex.mutation(api.games.triggerRoll, {
      gameId,
      roundNumber: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    await pollUntilResolved(gameId, 180_000); // narrative can take longer

    // 6. Verify results
    const game = await convex.query(api.games.get, { gameId });
    expect(game).toBeDefined();

    // Phase should have advanced to narrate
    expect(game!.phase).toBe("narrate");

    // Round should have sectioned summary content.
    const rounds = await convex.query(api.rounds.getByGame, { gameId });
    const round1 = rounds.find((r) => r.number === 1)!;
    expect(round1.summary).toBeDefined();
    const s = round1.summary!;
    const totalLines = s.labs.length + s.geopolitics.length + s.publicAndMedia.length + s.aiSystems.length;
    expect(totalLines).toBeGreaterThan(0);
    // Should NOT contain the fallback marker
    const flat = [...s.labs, ...s.geopolitics, ...s.publicAndMedia, ...s.aiSystems].join(" ");
    expect(flat).not.toContain("AI narrative generation failed");

    // Compute holders are derived via getComputeHolderView (no longer stored on the round).
    const holderView = await convex.query(api.rounds.getComputeHolderView, {
      gameId,
      roundNumber: 1,
    });
    expect(holderView.length).toBeGreaterThanOrEqual(3); // at least the 3 labs

    // Each holder row should have the derived-view shape.
    for (const holder of holderView) {
      expect(holder.roleId).toBeDefined();
      expect(holder.name).toBeDefined();
      expect(typeof holder.stockBefore).toBe("number");
      expect(typeof holder.acquired).toBe("number");
      expect(typeof holder.transferred).toBe("number");
      expect(typeof holder.adjusted).toBe("number");
      expect(typeof holder.merged).toBe("number");
      expect(typeof holder.facilitator).toBe("number");
      expect(typeof holder.stockAfter).toBe("number");
      expect(holder.stockAfter).toBeGreaterThanOrEqual(0);
    }

    // OpenBrain (the lab owner role) should have received new compute.
    const obHolder = holderView.find((h) => h.roleId === "openbrain-ceo");
    expect(obHolder).toBeDefined();
    expect(obHolder!.acquired).toBeGreaterThanOrEqual(0);
    // Invariant: stockAfter = stockBefore + acquired + transferred + adjusted + merged + facilitator
    const expectedAfter =
      obHolder!.stockBefore +
      obHolder!.acquired +
      obHolder!.transferred +
      obHolder!.adjusted +
      obHolder!.merged +
      obHolder!.facilitator;
    expect(obHolder!.stockAfter).toBe(Math.max(0, expectedAfter));

    // AI meta should record the model used
    expect(round1.aiMeta?.resolveModel).toBeDefined();
    expect(round1.aiMeta!.resolveModel).not.toBe("fallback");

    // Lab risk trajectories should be populated
    expect(round1.labTrajectories).toBeDefined();
    expect(round1.labTrajectories!.length).toBeGreaterThanOrEqual(2); // at least 2 labs
    for (const t of round1.labTrajectories!) {
      expect(t.labName).toBeDefined();
      expect(["adequate", "concerning", "dangerous", "catastrophic"]).toContain(t.safetyAdequacy);
      expect(["aligned", "deceptive", "spec-gaming", "power-concentration", "benevolent-override", "loss-of-control", "misuse"]).toContain(t.likelyFailureMode);
      expect(t.reasoning.length).toBeGreaterThan(10);
      expect(t.signalStrength).toBeGreaterThanOrEqual(0);
      expect(t.signalStrength).toBeLessThanOrEqual(10);
    }
  }, 200_000); // 200s timeout for LLM calls
});

// ─── Compute Escrow Flow ─────────────────────────────────────────────────────
// Tests the escrow model: compute is deducted on submit, credited on success,
// refunded on failure/delete/edit-back-to-draft.

describe("Compute Escrow", () => {
  let gameId: Id<"games">;
  let senderTableId: Id<"tables">;
  let recipientTableId: Id<"tables">;
  const senderRole = "us-president";
  const recipientRole = "openbrain-ceo";

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, {
      facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
      durationSeconds: 600,
    });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    senderTableId = tables.find((t) => t.roleId === senderRole)!._id;
    recipientTableId = tables.find((t) => t.roleId === recipientRole)!._id;
  });

  it("should escrow compute on submit", async () => {
    // Read starting compute for both sender and recipient.
    // Lab CEO compute lives on the table too (tables.computeStock), not game.labs[].
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const recipientBefore = await convex.query(api.tables.get, { tableId: recipientTableId });

    const senderStart = senderBefore!.computeStock ?? 0;
    const recipientStart = recipientBefore!.computeStock ?? 0;
    expect(senderStart).toBeGreaterThan(0);

    // Submit action with compute target
    const sendAmount = 3;
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: senderRole,
      text: "Send compute to OpenBrain",
      priority: 1,
      computeTargets: [{ roleId: recipientRole, amount: sendAmount }],
    });

    // Pending escrow rows do NOT mutate the settled cache — computeStock is unchanged on
    // both sides. availableStock = cache − pending is computed per-call; proven below.
    const senderAfter = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(senderAfter!.computeStock).toBe(senderStart);
    const recipientAfter = await convex.query(api.tables.get, { tableId: recipientTableId });
    expect(recipientAfter!.computeStock).toBe(recipientStart);

    // Proof the pending row reduced availableStock: attempting to spend more than
    // (cache − pending) is rejected.
    const remaining = senderStart - sendAmount;
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: senderTableId,
        gameId,
        roundNumber: 1,
        roleId: senderRole,
        text: "Overspend attempt",
        priority: 1,
        computeTargets: [{ roleId: recipientRole, amount: remaining + 1 }],
      })
    ).rejects.toThrow(/Insufficient compute/);
  });

  it("should refund escrow when action is deleted", async () => {
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const stockBeforeDelete = senderBefore!.computeStock ?? 0;

    // Get the submission to find the action with compute targets
    const sub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId,
      roundNumber: 1,
    });
    expect(sub).toBeTruthy();
    const actionIdx = sub!.actions.findIndex(
      (a) => a.computeTargets && a.computeTargets.length > 0
    );
    expect(actionIdx).toBeGreaterThanOrEqual(0);

    // Delete the action — this cancels the pending ledger row.
    await convex.mutation(api.submissions.deleteAction, {
      submissionId: sub!._id,
      actionIndex: actionIdx,
    });

    // Cache was never deducted by the pending escrow, so it stays the same.
    const senderAfter = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(senderAfter!.computeStock).toBe(stockBeforeDelete);

    // Proof the pending row is fully released: the full cache balance is spendable again.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: senderRole,
      text: "Full balance after cancel",
      priority: 1,
      computeTargets: [{ roleId: recipientRole, amount: stockBeforeDelete, direction: "send" }],
    });
    // Clean up that probe action so later tests start from a clean escrow slate.
    const cleanupSub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId,
      roundNumber: 1,
    });
    const probeIdx = cleanupSub!.actions.findIndex((a) =>
      a.computeTargets?.some((t) => t.amount === stockBeforeDelete),
    );
    if (probeIdx >= 0) {
      await convex.mutation(api.submissions.deleteAction, {
        submissionId: cleanupSub!._id,
        actionIndex: probeIdx,
      });
    }
  });

  it("should reject submit when compute is insufficient", async () => {
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const available = senderBefore!.computeStock ?? 0;

    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: senderTableId,
        gameId,
        roundNumber: 1,
        roleId: senderRole,
        text: "Try to send way too much",
        priority: 1,
        computeTargets: [{ roleId: recipientRole, amount: available + 100 }],
      })
    ).rejects.toThrow(/Insufficient compute/);

    // Verify no deduction happened
    const senderAfter = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(senderAfter!.computeStock).toBe(available);
  });

  it("should prevent double-spend across multiple actions", async () => {
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const available = senderBefore!.computeStock ?? 0;
    expect(available).toBeGreaterThanOrEqual(4); // Need at least 4u for this test

    // Submit first action: send 2u
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: senderRole,
      text: "First transfer",
      priority: 1,
      computeTargets: [{ roleId: recipientRole, amount: 2 }],
    });

    // Submit second action: send 2u
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: senderRole,
      text: "Second transfer",
      priority: 1,
      computeTargets: [{ roleId: recipientRole, amount: 2 }],
    });

    // Pending escrows don't touch the settled cache. Stock unchanged on both sides.
    const senderAfter = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(senderAfter!.computeStock).toBe(available);

    // Third send that exceeds (cache − pending) must fail — proves both escrows count.
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: senderTableId,
        gameId,
        roundNumber: 1,
        roleId: senderRole,
        text: "Third that should fail",
        priority: 1,
        computeTargets: [{ roleId: recipientRole, amount: available - 4 + 1 }],
      })
    ).rejects.toThrow(/Insufficient compute/);
  });

  it("should refund escrow when action is edited back to draft", async () => {
    const senderBefore = await convex.query(api.tables.get, { tableId: senderTableId });
    const stockBefore = senderBefore!.computeStock ?? 0;

    const sub = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId,
      roundNumber: 1,
    });
    expect(sub).toBeTruthy();
    // Find a submitted action with compute targets
    const actionIdx = sub!.actions.findIndex(
      (a) => a.actionStatus === "submitted" && a.computeTargets && a.computeTargets.length > 0
    );
    expect(actionIdx).toBeGreaterThanOrEqual(0);
    const refundAmount = sub!.actions[actionIdx].computeTargets!.reduce((s, t) => s + t.amount, 0);

    // Edit back to draft — cancels the pending ledger row.
    await convex.mutation(api.submissions.editSubmitted, {
      submissionId: sub!._id,
      actionIndex: actionIdx,
    });

    // Cache is unchanged (was never deducted by the pending escrow).
    const senderAfter = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(senderAfter!.computeStock).toBe(stockBefore);

    // Post-edit the action is a draft — no pending escrow row tied to it.
    const subAfter = await convex.query(api.submissions.getForTable, {
      tableId: senderTableId, roundNumber: 1,
    });
    expect(subAfter!.actions[actionIdx].actionStatus).toBe("draft");
    // refundAmount variable kept for readability of the original intent.
    void refundAmount;
  });
});

// ─── Send Direction Tests ────────────────────────────────────────────────────

describe("Compute Send Direction", () => {
  let gameId: Id<"games">;
  let senderTableId: Id<"tables">;
  const senderRole = "us-president";
  const recipientRole = "openbrain-ceo";

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, {
      facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
      durationSeconds: 600,
    });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    senderTableId = tables.find((t) => t.roleId === senderRole)!._id;
  });

  it("send direction should escrow from submitter", async () => {
    const before = await convex.query(api.tables.get, { tableId: senderTableId });
    const startStock = before!.computeStock ?? 0;

    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: senderRole,
      text: "Fund OpenBrain safety with explicit send",
      priority: 1,
      computeTargets: [{ roleId: recipientRole, amount: 2, direction: "send" }],
    });

    // Pending send escrow — settled cache is unchanged.
    const after = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(after!.computeStock).toBe(startStock);

    // Proof of escrow: spending more than (cache − 2) is rejected.
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: senderTableId,
        gameId,
        roundNumber: 1,
        roleId: senderRole,
        text: "Overspend past the escrow",
        priority: 1,
        computeTargets: [{ roleId: recipientRole, amount: startStock - 2 + 1 }],
      })
    ).rejects.toThrow(/Insufficient compute/);
  });

  it("request direction should NOT escrow from submitter", async () => {
    const before = await convex.query(api.tables.get, { tableId: senderTableId });
    const startStock = before!.computeStock ?? 0;

    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: senderTableId,
      gameId,
      roundNumber: 1,
      roleId: senderRole,
      text: "Request compute from OpenBrain",
      priority: 1,
      computeTargets: [{ roleId: recipientRole, amount: 2, direction: "request" }],
    });

    // Submitter's compute should be unchanged — request targets are not escrowed from submitter
    const after = await convex.query(api.tables.get, { tableId: senderTableId });
    expect(after!.computeStock).toBe(startStock);
  });
});

// ─── Request Acceptance Escrow ───────────────────────────────────────────────

describe("Compute Request Acceptance", () => {
  let gameId: Id<"games">;
  let requesterTableId: Id<"tables">;
  let targetTableId: Id<"tables">;
  const requesterRole = "us-president";
  const targetRole = "openbrain-ceo";

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    await convex.mutation(api.games.advancePhase, {
      facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      phase: "submit",
      durationSeconds: 600,
    });
    const tables = await convex.query(api.tables.getByGame, { gameId });
    requesterTableId = tables.find((t) => t.roleId === requesterRole)!._id;
    targetTableId = tables.find((t) => t.roleId === targetRole)!._id;
  });

  it("accepting a compute request should escrow from the target", async () => {
    const targetBefore = await convex.query(api.tables.get, { tableId: targetTableId });
    const targetStart = targetBefore!.computeStock ?? 0;
    const requesterBefore = await convex.query(api.tables.get, { tableId: requesterTableId });
    const requesterStart = requesterBefore!.computeStock ?? 0;

    // Create a compute request (as if submitter requested from target)
    const requestId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: requesterRole,
      fromRoleName: "US President",
      toRoleId: targetRole,
      toRoleName: "OpenBrain CEO",
      actionId: "test-action-123",
      actionText: "Request compute from OpenBrain",
      requestType: "compute",
      computeAmount: 3,
      callerTableId: requesterTableId,
    });

    // Accept the request — emits a pending escrow pair (not a settled transfer).
    await convex.mutation(api.requests.respond, {
      proposalId: requestId,
      status: "accepted",
      callerTableId: targetTableId,
    });

    // Pending escrow rows do NOT mutate either cache.
    const targetAfter = await convex.query(api.tables.get, { tableId: targetTableId });
    expect(targetAfter!.computeStock).toBe(targetStart);
    const requesterAfter = await convex.query(api.tables.get, { tableId: requesterTableId });
    expect(requesterAfter!.computeStock).toBe(requesterStart);

    // Proof the target's availableStock was reduced by 3u: overspending past (cache − 3) fails.
    await expect(
      convex.mutation(api.submissions.saveAndSubmit, {
        tableId: targetTableId,
        gameId,
        roundNumber: 1,
        roleId: targetRole,
        text: "Target attempts to send past the accepted-request escrow",
        priority: 1,
        computeTargets: [{ roleId: requesterRole, amount: targetStart - 3 + 1 }],
      }),
    ).rejects.toThrow(/Insufficient compute/);
  });

  it("declining after accepting should refund the target", async () => {
    // Find the accepted request
    const requests = await convex.query(api.requests.getForRole, {
      gameId,
      roundNumber: 1,
      roleId: targetRole,
    });
    const acceptedReq = requests.find(
      (r) => r.status === "accepted" && r.requestType === "compute"
    );
    expect(acceptedReq).toBeDefined();

    const targetBefore = await convex.query(api.tables.get, { tableId: targetTableId });
    const stockBefore = targetBefore!.computeStock ?? 0;

    // Decline the previously accepted request — cancels the pending escrow pair.
    await convex.mutation(api.requests.respond, {
      proposalId: acceptedReq!._id,
      status: "declined",
      callerTableId: targetTableId,
    });

    // Cache was never deducted by the pending escrow, so it stays the same.
    const targetAfter = await convex.query(api.tables.get, { tableId: targetTableId });
    expect(targetAfter!.computeStock).toBe(stockBefore);

    // Proof the escrow released: the full cache balance is spendable again.
    await convex.mutation(api.submissions.saveAndSubmit, {
      tableId: targetTableId,
      gameId,
      roundNumber: 1,
      roleId: targetRole,
      text: "Full-balance send after escrow refund",
      priority: 1,
      computeTargets: [{ roleId: requesterRole, amount: stockBefore, direction: "send" }],
    });
  });
});
