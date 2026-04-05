import { describe, it, expect, beforeAll } from "vitest";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

// These tests run against the local Convex dev server.
// Start with: npx convex dev

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET || "coral-ember-drift-sage";
const convex = new ConvexHttpClient(CONVEX_URL);

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

  it("should have correct default world state", async () => {
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.worldState.capability).toBe(3);
    expect(game!.worldState.alignment).toBe(3);
    expect(game!.worldState.tension).toBe(4);
  });

  it("should have 3 tracked labs with correct starting data", async () => {
    const game = await convex.query(api.games.get, { gameId });
    expect(game!.labs).toHaveLength(3);
    const ob = game!.labs.find((l) => l.roleId === "openbrain-ceo");
    expect(ob).toBeDefined();
    expect(ob!.computeStock).toBe(22);
    expect(ob!.rdMultiplier).toBe(3);
    const con = game!.labs.find((l) => l.roleId === "conscienta-ceo");
    expect(con).toBeDefined();
    expect(con!.computeStock).toBe(14);
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
      computeAllocation: { users: 40, capability: 55, safety: 5 },
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
    const proposalId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: "openbrain-ceo",
      fromRoleName: "OpenBrain CEO",
      toRoleId: "us-president",
      toRoleName: "United States",
      actionText: "We propose sharing Agent-2 access with the government",
      requestType: "endorsement",
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
    await convex.mutation(api.requests.respond, {
      proposalId: proposals[0]._id,
      status: "accepted",
    });

    const updated = await convex.query(api.requests.getByGameAndRound, {
      gameId,
      roundNumber: 1,
    });
    expect(updated[0].status).toBe("accepted");
  });

  it("should decline a proposal", async () => {
    const proposalId = await convex.mutation(api.requests.send, {
      gameId,
      roundNumber: 1,
      fromRoleId: "china-president",
      fromRoleName: "China",
      toRoleId: "openbrain-ceo",
      toRoleName: "OpenBrain CEO",
      actionText: "Propose joint safety research",
      requestType: "endorsement",
    });

    await convex.mutation(api.requests.respond, {
      proposalId,
      status: "declined",
    });

    const proposals = await convex.query(api.requests.getByGameAndRound, {
      gameId,
      roundNumber: 1,
    });
    const declined = proposals.find((p) => p._id === proposalId);
    expect(declined!.status).toBe("declined");
  });
});

describe("World State Updates", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
  });

  it("should update world state", async () => {
    await convex.mutation(api.games.updateWorldState, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      worldState: {
        capability: 5,
        alignment: 2,
        tension: 7,
        awareness: 6,
        regulation: 3,
        australia: 4,
      },
    });

    const game = await convex.query(api.games.get, { gameId });
    expect(game!.worldState.capability).toBe(5);
    expect(game!.worldState.tension).toBe(7);
  });
});

describe("Lab Updates", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
  });

  it("should update lab data", async () => {
    await convex.mutation(api.games.updateLabs, { facilitatorToken: FACILITATOR_TOKEN,
      gameId,
      labs: [
        {
          name: "OpenBrain",
          roleId: "openbrain-ceo",
          computeStock: 33,
          rdMultiplier: 10,
          allocation: { users: 30, capability: 65, safety: 5 },
        },
        {
          name: "DeepCent",
          roleId: "deepcent-ceo",
          computeStock: 23,
          rdMultiplier: 5,
          allocation: { users: 35, capability: 63, safety: 2 },
        },
      ],
    });

    const game = await convex.query(api.games.get, { gameId });
    const ob = game!.labs.find((l) => l.roleId === "openbrain-ceo")!;
    expect(ob.computeStock).toBe(33);
    expect(ob.rdMultiplier).toBe(10);
  });
});
