import { describe, it, expect } from "vitest";
import {
  ROLES,
  ROUND_CONFIGS,
  PROBABILITY_CARDS,
  COMPUTE_CATEGORIES,
  CAPABILITY_PROGRESSION,
  WORLD_STATE_INDICATORS,
  DEFAULT_WORLD_STATE,
  DEFAULT_LABS,
  BACKGROUND_LABS,
  NEW_COMPUTE_PER_GAME_ROUND,
  DEFAULT_COMPUTE_DISTRIBUTION,
  DEFAULT_COMPUTE_SHARES,
  MAX_PRIORITY,
  MAX_ACTIONS,
  AI_SYSTEMS_ROLE_ID,
  DEFAULT_ROUND_LABEL,
  getProbabilityCard,
  cycleProbability,
  isLabCeo,
  isLabSafety,
  hasCompute,
  hasTag,
  isResolvingPhase,
  isSubmittedAction,
  computeLabGrowth,
  applyLabMerge,
} from "@/lib/game-data";
import { parseActionsFromText } from "@/lib/hooks";

// ─── ROLES ────────────────────────────────────────────────────────────────────

describe("Roles", () => {
  it("should have exactly 17 roles", () => {
    expect(ROLES).toHaveLength(17);
  });

  it("should have unique IDs", () => {
    const ids = ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have unique colors", () => {
    const colors = ROLES.map((r) => r.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("should have exactly 3 lab-ceo roles", () => {
    const labCeos = ROLES.filter(isLabCeo);
    expect(labCeos).toHaveLength(3);
    expect(labCeos.map((l) => l.id)).toEqual(
      expect.arrayContaining(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo"])
    );
  });

  it("should have exactly 3 lab-safety roles", () => {
    const labSafety = ROLES.filter(isLabSafety);
    expect(labSafety).toHaveLength(3);
    expect(labSafety.map((l) => l.id)).toEqual(
      expect.arrayContaining(["openbrain-safety", "deepcent-safety", "conscienta-safety"])
    );
  });

  it("should have exactly 3 required roles", () => {
    const required = ROLES.filter((r) => r.required);
    expect(required).toHaveLength(3);
    expect(required.map((r) => r.id)).toEqual(
      expect.arrayContaining(["openbrain-ceo", "deepcent-ceo", "ai-systems"])
    );
  });

  it("lab-ceo roles should have defaultCompute summing to 100", () => {
    for (const role of ROLES.filter(isLabCeo)) {
      expect(role.defaultCompute).toBeDefined();
      const compute = role.defaultCompute!;
      const total = compute.users + compute.capability + compute.safety;
      expect(total).toBe(100);
    }
  });

  it("non lab-ceo roles should not have defaultCompute", () => {
    for (const role of ROLES.filter((r) => !isLabCeo(r))) {
      expect(role.defaultCompute).toBeUndefined();
    }
  });

  it("all roles should have non-empty brief", () => {
    for (const role of ROLES) {
      expect(role.brief.length).toBeGreaterThan(20);
    }
  });

  it("all roles should have at least one tag", () => {
    for (const role of ROLES) {
      expect(role.tags.length).toBeGreaterThan(0);
    }
  });

  it("lab roles should have a labId", () => {
    for (const role of ROLES.filter((r) => isLabCeo(r) || isLabSafety(r))) {
      expect(role.labId).toBeDefined();
      expect(["openbrain", "deepcent", "conscienta"]).toContain(role.labId);
    }
  });

  it("non-lab roles should not have a labId", () => {
    for (const role of ROLES.filter((r) => !isLabCeo(r) && !isLabSafety(r))) {
      expect(role.labId).toBeUndefined();
    }
  });

  it("DeepCent CEO brief should not confirm weight theft to players", () => {
    const deepcent = ROLES.find((r) => r.id === "deepcent-ceo")!;
    expect(deepcent.brief).not.toContain("You have the stolen");
    expect(deepcent.brief).toContain("stolen weights");
  });

  it("AI Systems brief should mention secret actions", () => {
    const ai = ROLES.find((r) => r.id === "ai-systems")!;
    expect(ai.brief).toContain("secret actions");
    expect(ai.brief).toContain("ALL AI systems");
  });

  it("has-compute roles should have startingComputeStock or be lab-ceo", () => {
    for (const role of ROLES.filter(hasCompute)) {
      if (isLabCeo(role)) {
        // Lab CEOs get compute from DEFAULT_LABS, not startingComputeStock
        continue;
      }
      expect(role.startingComputeStock).toBeDefined();
      expect(role.startingComputeStock).toBeGreaterThan(0);
    }
  });
});

// ─── TAG HELPERS ─────────────────────────────────────────────────────────────

describe("Tag Helpers", () => {
  it("isLabCeo returns true only for lab-ceo tagged roles", () => {
    const ceo = ROLES.find((r) => r.id === "openbrain-ceo")!;
    const safety = ROLES.find((r) => r.id === "openbrain-safety")!;
    const gov = ROLES.find((r) => r.id === "us-president")!;
    expect(isLabCeo(ceo)).toBe(true);
    expect(isLabCeo(safety)).toBe(false);
    expect(isLabCeo(gov)).toBe(false);
  });

  it("isLabSafety returns true only for lab-safety tagged roles", () => {
    const safety = ROLES.find((r) => r.id === "openbrain-safety")!;
    const ceo = ROLES.find((r) => r.id === "openbrain-ceo")!;
    expect(isLabSafety(safety)).toBe(true);
    expect(isLabSafety(ceo)).toBe(false);
  });

  it("hasCompute returns true for roles with has-compute tag", () => {
    const usPresident = ROLES.find((r) => r.id === "us-president")!;
    const pacificIslands = ROLES.find((r) => r.id === "pacific-islands")!;
    expect(hasCompute(usPresident)).toBe(true);
    expect(hasCompute(pacificIslands)).toBe(false);
  });

  it("hasTag works with any tag", () => {
    const us = ROLES.find((r) => r.id === "us-president")!;
    expect(hasTag(us, "military")).toBe(true);
    expect(hasTag(us, "regulation")).toBe(false);
  });
});

// ─── ROUNDS ───────────────────────────────────────────────────────────────────

describe("Round Configs", () => {
  it("should have exactly 4 rounds", () => {
    expect(ROUND_CONFIGS).toHaveLength(4);
  });

  it("should be numbered 1, 2, 3, 4", () => {
    expect(ROUND_CONFIGS.map((r) => r.number)).toEqual([1, 2, 3, 4]);
  });

  it("each round should have a label", () => {
    for (const round of ROUND_CONFIGS) {
      expect(round.label).toBeTruthy();
    }
  });
});

// ─── PROBABILITY CARDS ────────────────────────────────────────────────────────

describe("Probability Cards", () => {
  it("should have 5 cards", () => {
    expect(PROBABILITY_CARDS).toHaveLength(5);
  });

  it("should be ordered from highest to lowest", () => {
    const pcts = PROBABILITY_CARDS.map((p) => p.pct);
    expect(pcts).toEqual([90, 70, 50, 30, 10]);
  });

  it("labels should match source material", () => {
    expect(PROBABILITY_CARDS[0].label).toBe("Almost Certain");
    expect(PROBABILITY_CARDS[1].label).toBe("Likely");
    expect(PROBABILITY_CARDS[2].label).toBe("Possible");
    expect(PROBABILITY_CARDS[3].label).toBe("Unlikely");
    expect(PROBABILITY_CARDS[4].label).toBe("Remote");
  });

  it("getProbabilityCard should return correct card", () => {
    expect(getProbabilityCard(90).label).toBe("Almost Certain");
    expect(getProbabilityCard(10).label).toBe("Remote");
  });

  it("getProbabilityCard should default to Possible for unknown values", () => {
    expect(getProbabilityCard(42).label).toBe("Possible");
    expect(getProbabilityCard(0).label).toBe("Possible");
    expect(getProbabilityCard(100).label).toBe("Possible");
  });

  it("cycleProbability should cycle through all values", () => {
    expect(cycleProbability(90)).toBe(70);
    expect(cycleProbability(70)).toBe(50);
    expect(cycleProbability(50)).toBe(30);
    expect(cycleProbability(30)).toBe(10);
    expect(cycleProbability(10)).toBe(90);
  });

  it("cycleProbability with unknown value should return 90", () => {
    expect(cycleProbability(42)).toBe(90);
  });
});

// ─── COMPUTE ──────────────────────────────────────────────────────────────────

describe("Compute Categories", () => {
  it("should have exactly 3 categories", () => {
    expect(COMPUTE_CATEGORIES).toHaveLength(3);
  });

  it("keys should be users, capability, safety", () => {
    expect(COMPUTE_CATEGORIES.map((c) => c.key)).toEqual([
      "users",
      "capability",
      "safety",
    ]);
  });
});

describe("Default Labs", () => {
  it("should have 3 tracked labs (OpenBrain, DeepCent, Conscienta)", () => {
    expect(DEFAULT_LABS).toHaveLength(3);
  });

  it("allocations should sum to 100", () => {
    for (const lab of DEFAULT_LABS) {
      const total =
        lab.allocation.users +
        lab.allocation.capability +
        lab.allocation.safety;
      expect(total).toBe(100);
    }
  });

  it("OpenBrain should have more compute than DeepCent", () => {
    const ob = DEFAULT_LABS.find((l) => l.roleId === "openbrain-ceo")!;
    const dc = DEFAULT_LABS.find((l) => l.roleId === "deepcent-ceo")!;
    expect(ob.computeStock).toBeGreaterThan(dc.computeStock);
  });

  it("OpenBrain should have higher R&D multiplier", () => {
    const ob = DEFAULT_LABS.find((l) => l.roleId === "openbrain-ceo")!;
    const dc = DEFAULT_LABS.find((l) => l.roleId === "deepcent-ceo")!;
    expect(ob.rdMultiplier).toBeGreaterThan(dc.rdMultiplier);
  });

  it("safety allocation should match source material", () => {
    const ob = DEFAULT_LABS.find((l) => l.roleId === "openbrain-ceo")!;
    const dc = DEFAULT_LABS.find((l) => l.roleId === "deepcent-ceo")!;
    const con = DEFAULT_LABS.find((l) => l.roleId === "conscienta-ceo")!;
    // OpenBrain: 3% safety (from source: "3% of compute allocated to safety")
    expect(ob.allocation.safety).toBe(3);
    // DeepCent: ~3% safety (from source: "3% of compute allocated to your research")
    expect(dc.allocation.safety).toBeLessThanOrEqual(5);
    // Conscienta: 7% safety (from source: "industry-leading 7% of the company's compute")
    expect(con.allocation.safety).toBe(7);
  });

  it("each lab should map to a lab-ceo role", () => {
    for (const lab of DEFAULT_LABS) {
      const role = ROLES.find((r) => r.id === lab.roleId);
      expect(role).toBeDefined();
      expect(isLabCeo(role!)).toBe(true);
    }
  });
});

describe("Background Labs", () => {
  it("should have 2 background labs", () => {
    expect(BACKGROUND_LABS).toHaveLength(2);
  });

  it("allocations should sum to ~100", () => {
    for (const lab of BACKGROUND_LABS) {
      const total =
        lab.allocation.users +
        lab.allocation.capability +
        lab.allocation.safety;
      expect(total).toBe(100);
    }
  });
});

describe("Compute Distribution", () => {
  it("should have distributions for 3 rounds", () => {
    expect(DEFAULT_COMPUTE_DISTRIBUTION).toHaveLength(3);
  });

  it("new compute per round should peak early then decline (supply chain constraint)", () => {
    // Compute ramps up as fabs come online, then declines as supply chains are disrupted
    // R1=31, R2=35 (peak), R3=24, R4=15
    expect(NEW_COMPUTE_PER_GAME_ROUND[2]).toBeGreaterThanOrEqual(
      NEW_COMPUTE_PER_GAME_ROUND[1]
    );
    expect(NEW_COMPUTE_PER_GAME_ROUND[2]).toBeGreaterThanOrEqual(
      NEW_COMPUTE_PER_GAME_ROUND[3]
    );
    expect(NEW_COMPUTE_PER_GAME_ROUND[3]).toBeGreaterThanOrEqual(
      NEW_COMPUTE_PER_GAME_ROUND[4]
    );
  });
});

// ─── WORLD STATE ──────────────────────────────────────────────────────────────

describe("World State", () => {
  it("should have 6 indicators", () => {
    expect(WORLD_STATE_INDICATORS).toHaveLength(6);
  });

  it("default values should all be 0-10", () => {
    for (const [, val] of Object.entries(DEFAULT_WORLD_STATE)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it("alignment should start low (reflecting whistleblower crisis)", () => {
    expect(DEFAULT_WORLD_STATE.alignment).toBeLessThanOrEqual(4);
  });

  it("awareness should start moderate (NYT leak)", () => {
    expect(DEFAULT_WORLD_STATE.awareness).toBeGreaterThanOrEqual(3);
  });

  it("regulation should start very low", () => {
    expect(DEFAULT_WORLD_STATE.regulation).toBeLessThanOrEqual(2);
  });
});

// ─── CAPABILITY PROGRESSION ──────────────────────────────────────────────────

describe("Capability Progression", () => {
  it("should have 4 levels", () => {
    expect(CAPABILITY_PROGRESSION).toHaveLength(4);
  });

  it("Agent-4 description should mention adversarial misalignment", () => {
    const agent4 = CAPABILITY_PROGRESSION[2];
    expect(agent4.description).toContain("misaligned");
  });

  it("ASI level should mention both paths", () => {
    const asi = CAPABILITY_PROGRESSION[3];
    expect(asi.label).toContain("Safer");
    expect(asi.description).toContain("Race path");
    expect(asi.description).toContain("Slowdown path");
  });
});

// ─── ACTION PARSING ──────────────────────────────────────────────────────────

describe("parseActionsFromText", () => {
  it("should parse newline-separated actions", () => {
    const result = parseActionsFromText(
      "Invest in alignment research\nOffer government access to Agent-2\nHire safety researchers"
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("alignment");
  });

  it("should parse numbered list", () => {
    const result = parseActionsFromText(
      "1. First action here\n2. Second action here\n3. Third action here"
    );
    expect(result).toHaveLength(3);
  });

  it("should parse semicolon-separated", () => {
    const result = parseActionsFromText(
      "Action one here; Action two here; Action three here"
    );
    expect(result).toHaveLength(3);
  });

  it("should filter out short entries (< 6 chars)", () => {
    const result = parseActionsFromText("Good action here\nNo\nAnother good action");
    expect(result).toHaveLength(2);
  });

  it("should limit to 5 actions", () => {
    const result = parseActionsFromText(
      "One action\nTwo action\nThree action\nFour action\nFive action\nSix action\nSeven action"
    );
    expect(result).toHaveLength(5);
  });

  it("should return empty for blank input", () => {
    expect(parseActionsFromText("")).toHaveLength(0);
    expect(parseActionsFromText("   ")).toHaveLength(0);
  });

  it("should handle mixed numbering and newlines", () => {
    const result = parseActionsFromText(
      "1) Invest in safety\n2) Deploy Agent-2 commercially\n3) Begin Agent-3 development"
    );
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── EDGE CASES ──────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("MAX_PRIORITY should be 10", () => {
    expect(MAX_PRIORITY).toBe(10);
  });

  it("MAX_ACTIONS should be 5", () => {
    expect(MAX_ACTIONS).toBe(5);
  });

  it("all WORLD_STATE_INDICATORS keys should exist in DEFAULT_WORLD_STATE", () => {
    for (const indicator of WORLD_STATE_INDICATORS) {
      expect(DEFAULT_WORLD_STATE).toHaveProperty(indicator.key);
    }
  });

  it("compute category keys should match lab allocation keys", () => {
    const catKeys = COMPUTE_CATEGORIES.map((c) => c.key).sort();
    const allocKeys = Object.keys(DEFAULT_LABS[0].allocation).sort();
    expect(catKeys).toEqual(allocKeys);
  });
});

// ─── COMPUTE MECHANICS ──────────────────────────────────────────────────────

describe("Compute Distribution", () => {
  it("NEW_COMPUTE_PER_GAME_ROUND covers all 4 rounds", () => {
    for (let r = 1; r <= 4; r++) {
      expect(NEW_COMPUTE_PER_GAME_ROUND[r]).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_COMPUTE_SHARES covers all 4 rounds", () => {
    for (let r = 1; r <= 4; r++) {
      expect(DEFAULT_COMPUTE_SHARES[r]).toBeDefined();
      expect(Object.keys(DEFAULT_COMPUTE_SHARES[r]).length).toBeGreaterThan(0);
    }
  });

  it("shares include all 3 labs", () => {
    for (let r = 1; r <= 4; r++) {
      expect(DEFAULT_COMPUTE_SHARES[r]["OpenBrain"]).toBeDefined();
      expect(DEFAULT_COMPUTE_SHARES[r]["DeepCent"]).toBeDefined();
      expect(DEFAULT_COMPUTE_SHARES[r]["Conscienta"]).toBeDefined();
    }
  });

  it("non-lab compute roles have startingComputeStock", () => {
    const computeRoles = ROLES.filter(r => hasCompute(r) && !isLabCeo(r));
    expect(computeRoles.length).toBeGreaterThan(0);
    for (const role of computeRoles) {
      expect((role as { startingComputeStock?: number }).startingComputeStock).toBeGreaterThan(0);
    }
  });
});

describe("computeLabGrowth", () => {
  const baseLabs = DEFAULT_LABS.map(l => ({ ...l }));
  const emptyAllocations = new Map<string, { users: number; capability: number; safety: number }>();

  it("increases compute stock for all labs", () => {
    const result = computeLabGrowth(baseLabs, emptyAllocations, 1, 200);
    for (const lab of result) {
      const original = baseLabs.find(l => l.name === lab.name)!;
      expect(lab.computeStock).toBeGreaterThan(original.computeStock);
    }
  });

  it("increases R&D multipliers", () => {
    const result = computeLabGrowth(baseLabs, emptyAllocations, 1, 200);
    for (const lab of result) {
      const original = baseLabs.find(l => l.name === lab.name)!;
      expect(lab.rdMultiplier).toBeGreaterThan(original.rdMultiplier);
    }
  });

  it("respects max multiplier cap", () => {
    const result = computeLabGrowth(baseLabs, emptyAllocations, 1, 5);
    for (const lab of result) {
      expect(lab.rdMultiplier).toBeLessThanOrEqual(5);
    }
  });

  it("higher capability allocation increases growth", () => {
    const highCap = new Map([["OpenBrain", { users: 10, capability: 80, safety: 10 }]]);
    const lowCap = new Map([["OpenBrain", { users: 80, capability: 10, safety: 10 }]]);
    const highResult = computeLabGrowth(baseLabs, highCap, 1, 200);
    const lowResult = computeLabGrowth(baseLabs, lowCap, 1, 200);
    const highOB = highResult.find(l => l.name === "OpenBrain")!;
    const lowOB = lowResult.find(l => l.name === "OpenBrain")!;
    expect(highOB.rdMultiplier).toBeGreaterThan(lowOB.rdMultiplier);
  });

  it("uses proportional fallback for unknown labs", () => {
    const labsWithNew = [...baseLabs, {
      name: "NewLab", roleId: "custom-newlab", computeStock: 5, rdMultiplier: 1,
      allocation: { users: 33, capability: 34, safety: 33 },
    }];
    const result = computeLabGrowth(labsWithNew, emptyAllocations, 1, 200);
    const newLab = result.find(l => l.name === "NewLab")!;
    expect(newLab.computeStock).toBeGreaterThan(5);
  });
});

describe("applyLabMerge", () => {
  const labs = [
    { name: "A", computeStock: 20, rdMultiplier: 3 },
    { name: "B", computeStock: 10, rdMultiplier: 5 },
    { name: "C", computeStock: 15, rdMultiplier: 2 },
  ];

  it("survivor absorbs compute and takes higher multiplier", () => {
    const result = applyLabMerge(labs, "A", "B");
    expect(result).toHaveLength(2);
    const survivor = result.find(l => l.name === "A")!;
    expect(survivor.computeStock).toBe(30);
    expect(survivor.rdMultiplier).toBe(5);
  });

  it("absorbed lab is removed", () => {
    const result = applyLabMerge(labs, "A", "B");
    expect(result.find(l => l.name === "B")).toBeUndefined();
  });

  it("self-merge returns original array", () => {
    const result = applyLabMerge(labs, "A", "A");
    expect(result).toHaveLength(3);
  });

  it("merge with nonexistent lab returns original", () => {
    const result = applyLabMerge(labs, "A", "Z");
    expect(result).toHaveLength(3);
  });
});

// ─── SAMPLE ACTIONS ─────────────────────────────────────────────────────────

describe("Sample Actions", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sampleData = require("../public/sample-actions.json");

  it("should have actions for all 17 roles", () => {
    expect(Object.keys(sampleData)).toHaveLength(17);
  });

  it("should have actions for all 4 rounds per role", () => {
    for (const roleId of Object.keys(sampleData)) {
      for (let r = 1; r <= 4; r++) {
        expect(sampleData[roleId][r]).toBeDefined();
        expect(sampleData[roleId][r].length).toBeGreaterThan(0);
      }
    }
  });

  it("should have 6 actions per role per round", () => {
    for (const roleId of Object.keys(sampleData)) {
      for (let r = 1; r <= 4; r++) {
        expect(sampleData[roleId][r]).toHaveLength(6);
      }
    }
  });

  it("total should be 408 actions (17 × 4 × 6)", () => {
    let total = 0;
    for (const roleId of Object.keys(sampleData)) {
      for (const round of Object.keys(sampleData[roleId])) {
        total += sampleData[roleId][round].length;
      }
    }
    expect(total).toBe(408);
  });

  it("each action should have required fields", () => {
    for (const roleId of Object.keys(sampleData)) {
      for (const round of Object.keys(sampleData[roleId])) {
        for (const action of sampleData[roleId][round]) {
          expect(action.text).toBeTruthy();
          expect(["high", "medium", "low"]).toContain(action.priority);
          expect(typeof action.secret).toBe("boolean");
          expect(Array.isArray(action.endorseHint)).toBe(true);
        }
      }
    }
  });

  it("endorseHints should reference valid role IDs", () => {
    const validRoleIds = new Set(ROLES.map(r => r.id));
    for (const roleId of Object.keys(sampleData)) {
      for (const round of Object.keys(sampleData[roleId])) {
        for (const action of sampleData[roleId][round]) {
          for (const hint of action.endorseHint) {
            expect(validRoleIds.has(hint)).toBe(true);
          }
        }
      }
    }
  });
});

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

describe("Constants", () => {
  it("AI_SYSTEMS_ROLE_ID matches ROLES", () => {
    expect(ROLES.find(r => r.id === AI_SYSTEMS_ROLE_ID)).toBeDefined();
  });

  it("DEFAULT_ROUND_LABEL is Q1", () => {
    expect(DEFAULT_ROUND_LABEL).toBe("Q1");
  });

  it("isResolvingPhase works", () => {
    expect(isResolvingPhase("rolling")).toBe(true);
    expect(isResolvingPhase("narrate")).toBe(true);
    expect(isResolvingPhase("submit")).toBe(false);
    expect(isResolvingPhase("discuss")).toBe(false);
  });

  it("isSubmittedAction works", () => {
    expect(isSubmittedAction({ actionStatus: "submitted" })).toBe(true);
    expect(isSubmittedAction({ actionStatus: "draft" })).toBe(false);
  });
});
