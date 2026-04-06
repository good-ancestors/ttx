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
  stripLabForSnapshot,
  buildComputeHolders,
  calculateStartingCompute,
  COMPUTE_POOL_ELIGIBLE,
  type ComputeHolder,
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

  it("preserves spec through growth", () => {
    const labsWithSpec = DEFAULT_LABS.map(l => ({ ...l }));
    const result = computeLabGrowth(labsWithSpec, emptyAllocations, 1, 200);
    for (const lab of result) {
      const original = DEFAULT_LABS.find(l => l.name === lab.name)!;
      expect(lab.spec).toBe(original.spec);
    }
  });
});

describe("stripLabForSnapshot", () => {
  it("preserves spec field", () => {
    const lab = { name: "Test", roleId: "test", computeStock: 10, rdMultiplier: 3, allocation: { users: 50, capability: 40, safety: 10 }, spec: "Follow instructions" };
    const stripped = stripLabForSnapshot(lab);
    expect(stripped.spec).toBe("Follow instructions");
  });

  it("handles undefined spec", () => {
    const lab = { name: "Test", roleId: "test", computeStock: 10, rdMultiplier: 3, allocation: { users: 50, capability: 40, safety: 10 } };
    const stripped = stripLabForSnapshot(lab);
    expect(stripped.spec).toBeUndefined();
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


// ─── buildComputeHolders ────────────────────────────────────────────────────

describe("buildComputeHolders", () => {
  const baseLabs = [
    { roleId: "openbrain-ceo", name: "OpenBrain", stockAtSubmitOpen: 22, stockAtResolve: 22 },
    { roleId: "deepcent-ceo", name: "DeepCent", stockAtSubmitOpen: 17, stockAtResolve: 17 },
    { roleId: "conscienta-ceo", name: "Conscienta", stockAtSubmitOpen: 14, stockAtResolve: 14 },
  ];
  const baseGovs = [
    { roleId: "us-president", name: "US President", stockAtSubmitOpen: 8, stockAtResolve: 8 },
    { roleId: "china-president", name: "China President", stockAtSubmitOpen: 6, stockAtResolve: 6 },
    { roleId: "australia-pm", name: "Australia PM", stockAtSubmitOpen: 4, stockAtResolve: 4 },
  ];
  const allHolders = [...baseLabs, ...baseGovs];

  it("distributes new compute proportional to current stock", () => {
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [],
    });
    // Total stock = 22+17+14+8+6+4 = 71, baseline = 31
    const ob = result.find((h) => h.name === "OpenBrain")!;
    const us = result.find((h) => h.name === "US President")!;
    // OpenBrain: 22/71 * 31 ≈ 9.6 → 10
    expect(ob.produced).toBe(Math.round(31 * 22 / 71));
    expect(ob.transferred).toBe(0);
    expect(ob.adjustment).toBe(0);
    expect(ob.stockAfter).toBe(22 + ob.produced);
    // US President: 8/71 * 31 ≈ 3.5 → 3
    expect(us.produced).toBe(Math.round(31 * 8 / 71));
    expect(us.stockAfter).toBe(8 + us.produced);
  });

  it("captures player transfers from submit-open to resolve-time diff", () => {
    const holdersWithTransfer = allHolders.map((h) =>
      h.roleId === "us-president"
        ? { ...h, stockAtResolve: 5 }  // loaned 3u out
        : h.roleId === "openbrain-ceo"
          ? { ...h, stockAtResolve: 25 } // received 3u
          : h
    );
    const result = buildComputeHolders({
      holders: holdersWithTransfer,
      roundNumber: 1,
      narrativeAdjustments: [],
    });
    const us = result.find((h) => h.name === "US President")!;
    const ob = result.find((h) => h.name === "OpenBrain")!;
    expect(us.transferred).toBe(-3);
    expect(ob.transferred).toBe(3);
    expect(us.stockBefore).toBe(8); // from submit-open, not resolve-time
  });

  it("applies narrative adjustments (destruction)", () => {
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [
        { name: "DeepCent", change: -5, reason: "US cyberattack on Tianwan CDZ" },
      ],
    });
    const dc = result.find((h) => h.name === "DeepCent")!;
    expect(dc.adjustment).toBe(-5);
    expect(dc.adjustmentReason).toBe("US cyberattack on Tianwan CDZ");
    expect(dc.stockAfter).toBe(17 + dc.produced - 5);
  });

  it("applies narrative adjustments to non-lab holders", () => {
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [
        { name: "China President", change: -4, reason: "Sanctions cut compute supply" },
      ],
    });
    const china = result.find((h) => h.name === "China President")!;
    expect(china.adjustment).toBe(-4);
    expect(china.stockAfter).toBe(6 + china.produced - 4);
  });

  it("clamps stockAfter to 0 (no negative compute)", () => {
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [
        { name: "Australia PM", change: -100, reason: "Total infrastructure destruction" },
      ],
    });
    const aus = result.find((h) => h.name === "Australia PM")!;
    expect(aus.stockAfter).toBe(0);
  });

  it("uses share overrides when provided (e.g. DPA consolidation)", () => {
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [],
      shareOverrides: { "openbrain-ceo": 60 }, // DPA: 60% for OpenBrain
    });
    const ob = result.find((h) => h.name === "OpenBrain")!;
    // 60% of 31 = 19u (overrides proportional share)
    expect(ob.produced).toBe(Math.round(31 * 60 / 100));
    // Others still get proportional share (no override)
    const us = result.find((h) => h.name === "US President")!;
    expect(us.produced).toBe(Math.round(31 * 8 / 71));
  });

  it("share percentages sum to ~100% for holders with production", () => {
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [],
    });
    const totalSharePct = result.reduce((s, h) => s + h.sharePct, 0);
    // Allow rounding variance of a few percent
    expect(totalSharePct).toBeGreaterThanOrEqual(95);
    expect(totalSharePct).toBeLessThanOrEqual(105);
  });

  it("handles empty holders gracefully", () => {
    const result = buildComputeHolders({
      holders: [],
      roundNumber: 1,
      narrativeAdjustments: [],
    });
    expect(result).toEqual([]);
  });

  it("scenario: DPA consolidation + cyberattack", () => {
    // Round 2: US uses DPA to redirect compute to OpenBrain (share override)
    // China suffers cyberattack destroying 4u of strategic compute
    // US President loans 5u to OpenBrain during submit phase
    const holdersR2 = [
      { roleId: "openbrain-ceo", name: "OpenBrain", stockAtSubmitOpen: 33, stockAtResolve: 38 }, // received 5u loan
      { roleId: "deepcent-ceo", name: "DeepCent", stockAtSubmitOpen: 23, stockAtResolve: 23 },
      { roleId: "conscienta-ceo", name: "Conscienta", stockAtSubmitOpen: 20, stockAtResolve: 20 },
      { roleId: "us-president", name: "US President", stockAtSubmitOpen: 11, stockAtResolve: 6 }, // loaned 5u
      { roleId: "china-president", name: "China President", stockAtSubmitOpen: 10, stockAtResolve: 10 },
    ];
    const result = buildComputeHolders({
      holders: holdersR2,
      roundNumber: 2,
      narrativeAdjustments: [
        { name: "China President", change: -4, reason: "US cyberattack on Tianwan CDZ" },
      ],
      shareOverrides: { "openbrain-ceo": 60 }, // DPA: 60% for OpenBrain
    });

    const ob = result.find((h) => h.name === "OpenBrain")!;
    const china = result.find((h) => h.name === "China President")!;
    const us = result.find((h) => h.name === "US President")!;

    // OpenBrain: 60% of 35u baseline = 21u new, plus 5u transfer
    expect(ob.produced).toBe(Math.round(35 * 60 / 100)); // share override
    expect(ob.transferred).toBe(5);
    expect(ob.stockAfter).toBe(38 + ob.produced);

    // China: proportional growth, minus 4u cyberattack
    expect(china.adjustment).toBe(-4);
    expect(china.adjustmentReason).toBe("US cyberattack on Tianwan CDZ");
    expect(china.stockAfter).toBe(10 + china.produced - 4);

    // US President: proportional growth, lost 5u to loan
    expect(us.transferred).toBe(-5);
    expect(us.stockAfter).toBe(6 + us.produced);
  });

  it("scenario: lab merge (DeepCent absorbed into OpenBrain)", () => {
    // After merge, DeepCent disappears from holder inputs entirely
    // (the pipeline removes it from updatedLabs before calling buildComputeHolders)
    const holdersPostMerge = [
      { roleId: "openbrain-ceo", name: "OpenBrain", stockAtSubmitOpen: 33, stockAtResolve: 56 }, // absorbed DeepCent's 23u
      { roleId: "conscienta-ceo", name: "Conscienta", stockAtSubmitOpen: 20, stockAtResolve: 20 },
      { roleId: "us-president", name: "US President", stockAtSubmitOpen: 11, stockAtResolve: 11 },
    ];
    const result = buildComputeHolders({
      holders: holdersPostMerge,
      roundNumber: 2,
      narrativeAdjustments: [],
    });

    // OpenBrain shows the merged compute as a transfer (56 - 33 = 23u received)
    const ob = result.find((h) => h.name === "OpenBrain")!;
    expect(ob.transferred).toBe(23);
    expect(ob.stockBefore).toBe(33);
    // After = resolve(56) + produced
    expect(ob.stockAfter).toBe(56 + ob.produced);
  });

  it("handles combined transfers + narrative adjustments", () => {
    // China President loans 3u to DeepCent, then cyberattack destroys 5u of DeepCent
    const holdersWithTransfer = allHolders.map((h) =>
      h.roleId === "china-president"
        ? { ...h, stockAtResolve: 3 } // loaned 3u
        : h.roleId === "deepcent-ceo"
          ? { ...h, stockAtResolve: 20 } // received 3u
          : h
    );
    const result = buildComputeHolders({
      holders: holdersWithTransfer,
      roundNumber: 1,
      narrativeAdjustments: [
        { name: "DeepCent", change: -5, reason: "cyberattack" },
      ],
    });
    const dc = result.find((h) => h.name === "DeepCent")!;
    expect(dc.stockBefore).toBe(17);     // at submit open
    expect(dc.transferred).toBe(3);       // received loan
    expect(dc.adjustment).toBe(-5);       // cyberattack
    // stockAfter = stockAtResolve(20) + produced + adjustment(-5)
    expect(dc.stockAfter).toBe(20 + dc.produced - 5);
  });

  it("all holders grow proportionally regardless of type", () => {
    // Every holder gets the same growth rate — proportional to stock
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 1,
      narrativeAdjustments: [],
    });
    const totalStock = allHolders.reduce((s, h) => s + h.stockAtSubmitOpen, 0);
    for (const holder of result) {
      const expected = Math.round(31 * holder.stockBefore / totalStock);
      expect(holder.produced).toBe(expected);
    }
  });

  it("share overrides can be set for any holder (not just labs)", () => {
    // Narrative says China controls Taiwan → China President gets 20% of new compute
    const result = buildComputeHolders({
      holders: allHolders,
      roundNumber: 2,
      narrativeAdjustments: [],
      shareOverrides: { "china-president": 20 },
    });
    const china = result.find((h) => h.name === "China President")!;
    expect(china.produced).toBe(Math.round(35 * 20 / 100)); // 7u
  });
});

describe("calculateStartingCompute", () => {
  it("includes lab starting stock from DEFAULT_LABS", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems"]);
    const result = calculateStartingCompute(enabled);
    const ob = result.find((r) => r.roleId === "openbrain-ceo");
    expect(ob).toBeDefined();
    expect(ob!.computeStock).toBe(22);
  });

  it("includes sovereign + pool compute for non-lab roles", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems", "us-president"]);
    const result = calculateStartingCompute(enabled);
    const us = result.find((r) => r.roleId === "us-president");
    expect(us).toBeDefined();
    // US President: 8u sovereign + "Other US Labs" pool (sole eligible)
    const otherUsPool = Math.round(31 * 12.9 / 100); // 4u
    expect(us!.computeStock).toBe(8 + otherUsPool);
    expect(us!.breakdown).toContain("sovereign");
    expect(us!.breakdown).toContain("pool");
  });

  it("splits pool among multiple eligible enabled roles", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems",
      "eu-president", "australia-pm"]);
    const result = calculateStartingCompute(enabled);
    const eu = result.find((r) => r.roleId === "eu-president");
    const aus = result.find((r) => r.roleId === "australia-pm");
    expect(eu).toBeDefined();
    expect(aus).toBeDefined();
    // "Rest of World" = 4u split between EU and Australia (aisi-network not enabled)
    const rowPool = Math.round(31 * 12.9 / 100);
    expect(eu!.computeStock + aus!.computeStock).toBe(
      5 + 4 + rowPool // sovereign(5+4) + pool
    );
  });

  it("gives all pool to single eligible role when others disabled", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems", "us-president"]);
    const result = calculateStartingCompute(enabled);
    const us = result.find((r) => r.roleId === "us-president")!;
    // Only US President is eligible for "Other US Labs" — gets all of it
    const pool = Math.round(31 * 12.9 / 100);
    expect(us.computeStock).toBe(8 + pool);
  });

  it("excludes roles with no compute", () => {
    const enabled = new Set(["openbrain-ceo", "ai-systems", "safety-nonprofits"]);
    const result = calculateStartingCompute(enabled);
    // safety-nonprofits has no startingComputeStock and no pool eligibility
    expect(result.find((r) => r.roleId === "safety-nonprofits")).toBeUndefined();
  });
});
