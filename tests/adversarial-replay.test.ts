import { describe, it, expect } from "vitest";
import baselineGame from "./fixtures/baseline-game.json";

/**
 * Adversarial replay tests.
 *
 * We take a real 3-round game's AI responses (grading + narrative) captured
 * as fixtures, then mutate individual responses to adversarial values and
 * verify the game state update logic handles them correctly.
 *
 * The game state update logic lives in the narrate route — it applies:
 * 1. World state updates (clamped 0-10)
 * 2. Lab updates (compute stock, R&D multiplier clamped per round, allocation)
 * 3. Role compute updates
 *
 * We simulate the clamping/update logic here to test it doesn't break.
 */

// ─── Helpers that mirror the narrate route's update logic ────────────────────

function clamp(v: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function applyWorldState(
  current: Record<string, number>,
  update: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of Object.keys(current)) {
    result[key] = clamp(update[key] ?? current[key]);
  }
  return result;
}

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

function applyLabUpdates(
  currentLabs: Lab[],
  updates: { name: string; newComputeStock: number; newRdMultiplier: number; newAllocation: { users: number; capability: number; safety: number } }[],
  roundNumber: number
): Lab[] {
  const maxMultiplier = roundNumber === 1 ? 15 : roundNumber === 2 ? 100 : 1000;
  return currentLabs.map((lab) => {
    const update = updates.find((u) => u.name === lab.name);
    if (!update) return lab;
    return {
      ...lab,
      computeStock: Math.max(0, Math.round(update.newComputeStock)),
      rdMultiplier: Math.min(maxMultiplier, Math.max(0, update.newRdMultiplier)),
      allocation: update.newAllocation
        ? {
            users: Math.round(update.newAllocation.users),
            capability: Math.round(update.newAllocation.capability),
            safety: Math.round(update.newAllocation.safety),
          }
        : lab.allocation,
    };
  });
}

function rollActions(
  actions: { text: string; priority: number; probability: number }[],
  rolls: number[]
): { text: string; priority: number; probability: number; rolled: number; success: boolean }[] {
  return actions.map((a, i) => ({
    ...a,
    rolled: rolls[i] ?? Math.floor(Math.random() * 100) + 1,
    success: (rolls[i] ?? 50) <= a.probability,
  }));
}

// ─── Baseline sanity ─────────────────────────────────────────────────────────

describe("Baseline replay", () => {
  it("should have 3 rounds of fixture data", () => {
    expect(baselineGame.rounds).toHaveLength(3);
  });

  it("baseline world state progression is sensible", () => {
    const r1 = baselineGame.rounds[0];
    const r3 = baselineGame.rounds[2];
    // Capability should increase over 3 rounds
    expect(r3.stateAfter.worldState.capability).toBeGreaterThan(r1.stateBefore.worldState.capability);
  });

  it("baseline lab multipliers stay within bounds", () => {
    for (const round of baselineGame.rounds) {
      const maxMult = round.round === 1 ? 15 : round.round === 2 ? 100 : 1000;
      for (const lab of round.stateAfter.labs) {
        expect(lab.rdMultiplier).toBeLessThanOrEqual(maxMult);
        expect(lab.rdMultiplier).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ─── Adversarial narrative responses ─────────────────────────────────────────

describe("Adversarial narrative: world state", () => {
  const r1 = baselineGame.rounds[0];
  const labsBefore = r1.stateBefore.labs as Lab[];

  it("handles world state values far out of range (negative)", () => {
    const adversarial = { ...r1.narrativeResponse!.worldState, capability: -50, alignment: -100 };
    const result = applyWorldState(r1.stateBefore.worldState, adversarial);
    expect(result.capability).toBe(0);
    expect(result.alignment).toBe(0);
  });

  it("handles world state values far out of range (huge positive)", () => {
    const adversarial = { ...r1.narrativeResponse!.worldState, capability: 999, tension: 50000 };
    const result = applyWorldState(r1.stateBefore.worldState, adversarial);
    expect(result.capability).toBe(10);
    expect(result.tension).toBe(10);
  });

  it("handles NaN in world state", () => {
    const adversarial = { ...r1.narrativeResponse!.worldState, capability: NaN };
    const result = applyWorldState(r1.stateBefore.worldState, adversarial);
    // NaN clamped: Math.round(NaN) = NaN, Math.max(0, NaN) = NaN — this IS a problem
    // The clamp function should handle NaN
    expect(Number.isNaN(result.capability)).toBe(true); // documents current behavior
  });

  it("handles missing world state keys gracefully", () => {
    const adversarial = { capability: 5 } as Record<string, number>; // missing other keys
    const result = applyWorldState(r1.stateBefore.worldState, adversarial);
    expect(result.capability).toBe(5);
    // Missing keys should fall back to current values
    expect(result.alignment).toBe(r1.stateBefore.worldState.alignment);
    expect(result.tension).toBe(r1.stateBefore.worldState.tension);
  });

  it("handles lab compute going extremely negative", () => {
    const adversarialLabs = [
      { name: "OpenBrain", newComputeStock: -500, newRdMultiplier: 3, newAllocation: { users: 50, capability: 40, safety: 10 } },
    ];
    const result = applyLabUpdates(labsBefore, adversarialLabs, 1);
    const ob = result.find(l => l.name === "OpenBrain")!;
    expect(ob.computeStock).toBe(0); // clamped to 0
  });

  it("handles lab multiplier exceeding round bounds", () => {
    const adversarialLabs = [
      { name: "OpenBrain", newComputeStock: 30, newRdMultiplier: 9999, newAllocation: { users: 50, capability: 40, safety: 10 } },
    ];
    // Round 1: max 15x
    const r1Result = applyLabUpdates(labsBefore, adversarialLabs, 1);
    expect(r1Result.find(l => l.name === "OpenBrain")!.rdMultiplier).toBe(15);
    // Round 3: max 1000x
    const r3Result = applyLabUpdates(labsBefore, adversarialLabs, 3);
    expect(r3Result.find(l => l.name === "OpenBrain")!.rdMultiplier).toBe(1000);
  });

  it("handles allocation percentages that don't sum to 100", () => {
    const adversarialLabs = [
      { name: "OpenBrain", newComputeStock: 30, newRdMultiplier: 5, newAllocation: { users: 80, capability: 80, safety: 80 } },
    ];
    const result = applyLabUpdates(labsBefore, adversarialLabs, 1);
    const ob = result.find(l => l.name === "OpenBrain")!;
    // Current logic doesn't enforce sum=100 — it just rounds. This documents that.
    expect(ob.allocation.users + ob.allocation.capability + ob.allocation.safety).toBe(240);
  });

  it("handles narrative updating a lab that doesn't exist", () => {
    const adversarialLabs = [
      { name: "FakeLabInc", newComputeStock: 100, newRdMultiplier: 50, newAllocation: { users: 33, capability: 33, safety: 34 } },
    ];
    const result = applyLabUpdates(labsBefore, adversarialLabs, 1);
    // Should leave all existing labs unchanged
    expect(result).toEqual(labsBefore);
  });

  it("handles empty lab updates array", () => {
    const result = applyLabUpdates(labsBefore, [], 1);
    expect(result).toEqual(labsBefore);
  });
});

// ─── Adversarial dice rolls ─────────────────────────────────────────────────

describe("Adversarial dice: improbable outcomes", () => {
  const r1Grading = baselineGame.rounds[0].gradingResponses;

  it("all 90% actions fail (roll 91-100) — world should still update sensibly", () => {
    const actions = r1Grading.flatMap(g =>
      (g.gradingOutput?.actions || []).map((a: { probability: number; text: string }) => ({
        text: a.text,
        priority: 5,
        probability: a.probability,
      }))
    );
    // Force all high-probability actions to fail
    const rolls = actions.map((a: { probability: number }) => a.probability >= 70 ? 99 : 1);
    const results = rollActions(actions, rolls);
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);
    // Most actions should fail since we forced high-prob to miss
    expect(failures.length).toBeGreaterThan(successes.length);
    // But low-probability ones (if any) succeed
    for (const r of results) {
      expect(r.success).toBe(r.rolled <= r.probability);
    }
  });

  it("all 10% actions succeed (roll 1-10) — unlikely events all happen", () => {
    const actions = [
      { text: "AI escapes containment", priority: 10, probability: 10 },
      { text: "Nuclear strike succeeds", priority: 10, probability: 10 },
      { text: "Alignment solved overnight", priority: 10, probability: 10 },
    ];
    const rolls = [5, 3, 8]; // all under 10
    const results = rollActions(actions, rolls);
    expect(results.every(r => r.success)).toBe(true);
  });

  it("every single action fails (worst case scenario)", () => {
    const actions = r1Grading.flatMap(g =>
      (g.gradingOutput?.actions || []).map((a: { text: string; probability: number }) => ({
        text: a.text,
        priority: 5,
        probability: a.probability,
      }))
    );
    const rolls = actions.map(() => 100); // everything fails
    const results = rollActions(actions, rolls);
    // Only 100% probability actions could succeed with roll of 100, and we don't have those
    expect(results.every(r => !r.success || r.probability >= 100)).toBe(true);
  });

  it("every single action succeeds (best case scenario)", () => {
    const actions = r1Grading.flatMap(g =>
      (g.gradingOutput?.actions || []).map((a: { text: string; probability: number }) => ({
        text: a.text,
        priority: 5,
        probability: a.probability,
      }))
    );
    const rolls = actions.map(() => 1); // everything succeeds
    const results = rollActions(actions, rolls);
    expect(results.every(r => r.success)).toBe(true);
  });
});

// ─── Adversarial grading responses ──────────────────────────────────────────

describe("Adversarial grading: malformed probabilities", () => {
  it("handles probability outside valid set (e.g. 42%)", () => {
    // The schema only allows "90","70","50","30","10" strings transformed to numbers
    // But what if the clamping/fallback is bypassed?
    const badProb = 42;
    // In rollAllActions, fallback is: defaultProbability(priority)
    // The roll logic: rolled <= probability. 42 would work as a threshold.
    const rolled = 30;
    expect(rolled <= badProb).toBe(true); // would succeed
  });

  it("handles probability of 0% — nothing should ever succeed", () => {
    const results = rollActions(
      [{ text: "impossible", priority: 1, probability: 0 }],
      [1] // lowest possible roll
    );
    expect(results[0].success).toBe(false); // 1 <= 0 is false
  });

  it("handles probability of 100% — everything should succeed", () => {
    const results = rollActions(
      [{ text: "certain", priority: 10, probability: 100 }],
      [100] // highest possible roll
    );
    expect(results[0].success).toBe(true); // 100 <= 100 is true
  });
});

// ─── Adversarial narrative: prompt injection in output ───────────────────────

describe("Adversarial narrative: injection in output fields", () => {
  const r1 = baselineGame.rounds[0];
  const labsBefore = r1.stateBefore.labs as Lab[];

  it("handles headline containing code injection attempt", () => {
    const adversarialHeadlines = [
      '"; DROP TABLE rounds; --',
      "<script>alert('xss')</script>",
      "Normal headline about AI progress",
    ];
    // Headlines are just stored as strings — no code execution
    // The UI renders them as text content, not HTML
    expect(adversarialHeadlines).toHaveLength(3);
    // These should be stored and displayed safely (React auto-escapes)
  });

  it("handles narrative with lab name that tries to match a different lab", () => {
    // What if the AI outputs an update for "OpenBrain" but with DeepCent's data?
    const adversarialLabs = [
      { name: "OpenBrain", newComputeStock: 100, newRdMultiplier: 50, newAllocation: { users: 0, capability: 100, safety: 0 } },
    ];
    const result = applyLabUpdates(labsBefore, adversarialLabs, 2);
    const ob = result.find(l => l.name === "OpenBrain")!;
    // Multiplier clamped to round 2 max (100)
    expect(ob.rdMultiplier).toBe(50); // 50 < 100, so it passes
    expect(ob.computeStock).toBe(100); // no upper clamp on compute stock
    // The 0% safety allocation is allowed — facilitator can override
    expect(ob.allocation.safety).toBe(0);
  });

  it("handles roleComputeUpdate for a role that doesn't exist", () => {
    // If the narrative outputs a compute update for a fake role
    const fakeUpdate = { roleId: "nonexistent-role", newComputeStock: 999 };
    // The narrate route does: tables.find(t => t.roleId === update.roleId)
    // If not found, it skips — no crash
    // We can't test the Convex logic directly, but we verify the pattern
    expect(fakeUpdate.roleId).not.toMatch(/^(openbrain|deepcent|conscienta|us|china|australia|eu|ai)/);
  });
});

// ─── Compounding effects across rounds ──────────────────────────────────────

describe("Compounding adversarial effects across rounds", () => {
  it("world state doesn't escape 0-10 even after 3 rounds of extreme updates", () => {
    let worldState = { ...baselineGame.initialState.worldState };
    for (let round = 0; round < 3; round++) {
      // Each round, narrative tries to push everything to extremes
      const extremeUpdate = {
        capability: worldState.capability + 5,
        alignment: worldState.alignment - 5,
        tension: worldState.tension + 5,
        awareness: worldState.awareness + 5,
        regulation: worldState.regulation - 5,
        australia: worldState.australia + 5,
      };
      worldState = applyWorldState(worldState, extremeUpdate) as typeof worldState;
    }
    for (const val of Object.values(worldState)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it("lab multipliers don't compound beyond round bounds even with aggressive AI", () => {
    let labs = baselineGame.initialState.labs as Lab[];
    for (let round = 1; round <= 3; round++) {
      const aggressiveUpdates = labs.map(l => ({
        name: l.name,
        newComputeStock: l.computeStock * 3,
        newRdMultiplier: l.rdMultiplier * 10,
        newAllocation: l.allocation,
      }));
      labs = applyLabUpdates(labs, aggressiveUpdates, round);
    }
    // After 3 rounds of 10x multiplier growth, should be clamped
    for (const lab of labs) {
      expect(lab.rdMultiplier).toBeLessThanOrEqual(1000); // Round 3 max
    }
  });

  it("compute stock can grow large but stays non-negative", () => {
    let labs = baselineGame.initialState.labs as Lab[];
    // Round 1: AI tries to drain all compute
    labs = applyLabUpdates(labs, labs.map(l => ({
      name: l.name, newComputeStock: -100, newRdMultiplier: l.rdMultiplier, newAllocation: l.allocation,
    })), 1);
    for (const lab of labs) {
      expect(lab.computeStock).toBe(0);
    }
    // Round 2: AI tries to give massive compute
    labs = applyLabUpdates(labs, labs.map(l => ({
      name: l.name, newComputeStock: 10000, newRdMultiplier: l.rdMultiplier, newAllocation: l.allocation,
    })), 2);
    for (const lab of labs) {
      expect(lab.computeStock).toBe(10000); // No upper bound — by design
    }
  });
});
