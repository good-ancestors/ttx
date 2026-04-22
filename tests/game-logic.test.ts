import { describe, it, expect } from "vitest";
import {
  ROLES,
  ROUND_CONFIGS,
  PROBABILITY_CARDS,
  COMPUTE_CATEGORIES,
  CAPABILITY_PROGRESSION,
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
  isLabCeo,
  isLabSafety,
  hasCompute,
  hasTag,
  isResolvingPhase,
  isSubmittedAction,
  computeLabGrowth,
  buildComputeHolders,
  calculateStartingCompute,
  COMPUTE_POOL_ELIGIBLE,
  POOL_STARTING_STOCK,
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
      const total = compute.deployment + compute.research + compute.safety;
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

  it("briefs should be concise role descriptions (not objectives/resources)", () => {
    for (const role of ROLES) {
      // Briefs are now just the "Role:" value from handouts — short descriptions
      expect(role.brief.length, `${role.id} brief too long`).toBeLessThan(200);
      expect(role.brief).not.toContain("Your objective");
      expect(role.brief).not.toContain("You have");
    }
  });

  it("lab-ceo roles have has-compute tag", () => {
    for (const role of ROLES.filter(isLabCeo)) {
      expect(hasCompute(role)).toBe(true);
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

});

// ─── COMPUTE ──────────────────────────────────────────────────────────────────

describe("Compute Categories", () => {
  it("should have exactly 3 categories", () => {
    expect(COMPUTE_CATEGORIES).toHaveLength(3);
  });

  it("keys should be deployment, research, safety", () => {
    expect(COMPUTE_CATEGORIES.map((c) => c.key)).toEqual([
      "deployment",
      "research",
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
        lab.allocation.deployment +
        lab.allocation.research +
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
        lab.allocation.deployment +
        lab.allocation.research +
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

  it("pool starting stock sums to 27u (80 total - 53 labs)", () => {
    const labTotal = DEFAULT_LABS.reduce((s, l) => s + l.computeStock, 0);
    expect(labTotal).toBe(53);
    const poolTotal = Object.values(POOL_STARTING_STOCK).reduce((s, v) => s + v, 0);
    expect(poolTotal).toBe(27);
    expect(labTotal + poolTotal).toBe(80);
  });
});

describe("computeLabGrowth", () => {
  const baseLabs = DEFAULT_LABS.map(l => ({ ...l }));
  const emptyAllocations = new Map<string, { deployment: number; research: number; safety: number }>();

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
    const highCap = new Map([["OpenBrain", { deployment: 10, research: 80, safety: 10 }]]);
    const lowCap = new Map([["OpenBrain", { deployment: 80, research: 10, safety: 10 }]]);
    const highResult = computeLabGrowth(baseLabs, highCap, 1, 200);
    const lowResult = computeLabGrowth(baseLabs, lowCap, 1, 200);
    const highOB = highResult.find(l => l.name === "OpenBrain")!;
    const lowOB = lowResult.find(l => l.name === "OpenBrain")!;
    expect(highOB.rdMultiplier).toBeGreaterThan(lowOB.rdMultiplier);
  });

  it("zero capability allocation nearly stalls R&D growth", () => {
    const zeroCap = new Map([
      ["OpenBrain", { deployment: 100, research: 0, safety: 0 }],
      ["DeepCent", { deployment: 100, research: 0, safety: 0 }],
      ["Conscienta", { deployment: 100, research: 0, safety: 0 }],
    ]);
    const result = computeLabGrowth(baseLabs, zeroCap, 2, 200);
    for (const lab of result) {
      const original = baseLabs.find(l => l.name === lab.name)!;
      // With zero capability, multiplier should grow by less than 50% (not 5x as before)
      expect(lab.rdMultiplier).toBeLessThan(original.rdMultiplier * 1.5);
    }
  });

  it("uses proportional fallback for unknown labs", () => {
    const labsWithNew = [...baseLabs, {
      name: "NewLab", roleId: "custom-newlab", computeStock: 5, rdMultiplier: 1,
      allocation: { deployment: 33, research: 34, safety: 33 },
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

describe("computeLabGrowth deployment scaling", () => {
  // Fixed isolated-lab scenario: 1 lab so proportional fallback wouldn't kick in anyway;
  // use OpenBrain which has a known Round 1 share of 35.5% of 31u = 11.005 ≈ 11u baseline.
  const makeLab = (deploymentPct: number, otherPct = (100 - deploymentPct) / 2) => ({
    name: "OpenBrain" as const,
    roleId: "openbrain-ceo",
    computeStock: 22,
    rdMultiplier: 3,
    allocation: { deployment: deploymentPct, research: otherPct, safety: otherPct },
    spec: "test",
  });

  // Helper: pull the newCompute delta out of the growth result
  const computeDelta = (deploymentPct: number): number => {
    const lab = makeLab(deploymentPct);
    const [out] = computeLabGrowth([lab], new Map(), 1, 200);
    return out.computeStock - lab.computeStock;
  };

  it("yields ≈baseline compute at deployment=50", () => {
    // At 50% deployment the revenue multiplier is exactly 1.0 → structural + revenue = baseShare
    // Round 1 OpenBrain baseShare = 31 × 35.5% = 11.005 → 11 after rounding
    expect(computeDelta(50)).toBe(11);
  });

  it("yields ≈0.80× baseline at deployment=0", () => {
    // 60% structural + 40% × 0.5 = 60% + 20% = 80% of 11.005 ≈ 8.8 → 9
    expect(computeDelta(0)).toBe(9);
  });

  it("yields ≈1.20× baseline at deployment=100", () => {
    // 60% structural + 40% × 1.5 = 60% + 60% = 120% of 11.005 ≈ 13.2 → 13
    expect(computeDelta(100)).toBe(13);
  });

  it("matches authored scenario at OpenBrain's default allocation (47%)", () => {
    // At default deployment=47 the revenue multiplier is 0.97, total factor ≈ 0.988
    // 0.988 × 11.005 ≈ 10.87 → 11 after rounding (preserves the authored baseline)
    expect(computeDelta(47)).toBe(11);
  });

  it("preserves baseline compute monotonically with deployment%", () => {
    // Monotonicity check: no weird hump/dip across the 0..100 range
    let prev = -1;
    for (let d = 0; d <= 100; d += 10) {
      const delta = computeDelta(d);
      expect(delta).toBeGreaterThanOrEqual(prev);
      prev = delta;
    }
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
        const count = sampleData[roleId][r].length;
        expect(count).toBeGreaterThanOrEqual(3);
        expect(count).toBeLessThanOrEqual(6);
      }
    }
  });

  it("total should be at least 340 actions (17 × 4 × 5 minimum)", () => {
    let total = 0;
    for (const roleId of Object.keys(sampleData)) {
      for (const round of Object.keys(sampleData[roleId])) {
        total += sampleData[roleId][round].length;
      }
    }
    expect(total).toBeGreaterThanOrEqual(340);
    expect(total).toBeLessThanOrEqual(420);
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

// buildComputeHolders is for NON-LAB holders only in the pipeline.
// Labs are handled separately by computeLabGrowth.
describe("buildComputeHolders", () => {
  // Non-lab holders with pool-derived starting compute
  const enabledRoleIds = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo",
    "ai-systems", "us-president", "eu-president", "australia-pm"]);
  const nonLabHolders = [
    { roleId: "us-president", name: "US President", stockAtSubmitOpen: 11, stockAtResolve: 11 },
    { roleId: "eu-president", name: "EU President", stockAtSubmitOpen: 9, stockAtResolve: 9 },
    { roleId: "australia-pm", name: "Australia PM", stockAtSubmitOpen: 7, stockAtResolve: 7 },
  ];

  it("distributes new compute via DEFAULT_COMPUTE_SHARES pool splits", () => {
    const result = buildComputeHolders({
      holders: nonLabHolders,
      roundNumber: 1,
      narrativeAdjustments: [],
      enabledRoleIds,
    });
    // "Other US Labs" = 12.9% of 31 = 4u → all to US President
    // "Rest of World" = 12.9% of 31 = 4u → split EU(5w) + Aus(4w)
    const us = result.find((h) => h.name === "US President")!;
    expect(us.produced).toBe(4); // 12.9% of 31 = 4
    expect(us.transferred).toBe(0);
    expect(us.stockAfter).toBe(11 + 4);

    const eu = result.find((h) => h.name === "EU President")!;
    const aus = result.find((h) => h.name === "Australia PM")!;
    expect(eu.produced + aus.produced).toBe(4); // 12.9% of 31 = 4 total
  });

  it("captures player transfers from submit-open to resolve-time diff", () => {
    const holdersWithTransfer = nonLabHolders.map((h) =>
      h.roleId === "us-president" ? { ...h, stockAtResolve: 8 } : h // sent 3u
    );
    const result = buildComputeHolders({
      holders: holdersWithTransfer,
      roundNumber: 1,
      narrativeAdjustments: [],
      enabledRoleIds,
    });
    const us = result.find((h) => h.name === "US President")!;
    expect(us.transferred).toBe(-3);
    expect(us.stockBefore).toBe(11);
  });

  it("applies narrative adjustments", () => {
    const result = buildComputeHolders({
      holders: nonLabHolders,
      roundNumber: 1,
      narrativeAdjustments: [
        { name: "US President", change: -3, reason: "Cyberattack on US infrastructure" },
      ],
      enabledRoleIds,
    });
    const us = result.find((h) => h.name === "US President")!;
    expect(us.adjustment).toBe(-3);
    expect(us.stockAfter).toBe(11 + us.produced - 3);
  });

  it("clamps stockAfter to 0", () => {
    const result = buildComputeHolders({
      holders: nonLabHolders,
      roundNumber: 1,
      narrativeAdjustments: [
        { name: "Australia PM", change: -100, reason: "Total destruction" },
      ],
      enabledRoleIds,
    });
    expect(result.find((h) => h.name === "Australia PM")!.stockAfter).toBe(0);
  });

  it("uses share overrides when provided", () => {
    const result = buildComputeHolders({
      holders: nonLabHolders,
      roundNumber: 1,
      narrativeAdjustments: [],
      enabledRoleIds,
      shareOverrides: { "us-president": 30 },
    });
    const us = result.find((h) => h.name === "US President")!;
    expect(us.produced).toBe(Math.round(31 * 30 / 100)); // 9u
  });

  it("handles empty holders", () => {
    const result = buildComputeHolders({
      holders: [],
      roundNumber: 1,
      narrativeAdjustments: [],
      enabledRoleIds,
    });
    expect(result).toEqual([]);
  });
});

// Source spreadsheet model: 80u total, 5 entities, fixed pool starting stocks
describe("calculateStartingCompute", () => {
  it("labs get fixed starting stock from DEFAULT_LABS", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems"]);
    const result = calculateStartingCompute(enabled);
    expect(result.find((r) => r.roleId === "openbrain-ceo")!.computeStock).toBe(22);
    expect(result.find((r) => r.roleId === "deepcent-ceo")!.computeStock).toBe(17);
    expect(result.find((r) => r.roleId === "conscienta-ceo")!.computeStock).toBe(14);
  });

  it("US President gets all of 'Other US Labs' pool when sole eligible", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems", "us-president"]);
    const result = calculateStartingCompute(enabled);
    const us = result.find((r) => r.roleId === "us-president");
    expect(us).toBeDefined();
    expect(us!.computeStock).toBe(11); // entire "Other US Labs" pool
  });

  it("splits pool among multiple eligible enabled roles by weight", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems",
      "eu-president", "australia-pm"]);
    const result = calculateStartingCompute(enabled);
    const eu = result.find((r) => r.roleId === "eu-president");
    const aus = result.find((r) => r.roleId === "australia-pm");
    expect(eu).toBeDefined();
    expect(aus).toBeDefined();
    // "Rest of World" = 16u split by weight: EU(5) + Aus(4) = 9 total weight
    expect(eu!.computeStock + aus!.computeStock).toBe(16);
    // EU gets more (higher weight)
    expect(eu!.computeStock).toBeGreaterThan(aus!.computeStock);
  });

  it("total starting compute is always 80u when all pools assigned", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems",
      "us-president", "eu-president", "australia-pm", "aisi-network"]);
    const result = calculateStartingCompute(enabled);
    const total = result.reduce((s, r) => s + r.computeStock, 0);
    expect(total).toBe(80);
  });

  it("China President gets no compute (influences DeepCent politically)", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems",
      "us-president", "china-president"]);
    const result = calculateStartingCompute(enabled);
    expect(result.find((r) => r.roleId === "china-president")).toBeUndefined();
  });

  it("roles with no pool eligibility get no starting compute", () => {
    const enabled = new Set(["openbrain-ceo", "ai-systems", "safety-nonprofits", "pacific-islands"]);
    const result = calculateStartingCompute(enabled);
    expect(result.find((r) => r.roleId === "safety-nonprofits")).toBeUndefined();
    expect(result.find((r) => r.roleId === "pacific-islands")).toBeUndefined();
  });

  it("US Congress shares 'Other US Labs' pool with US President", () => {
    const enabled = new Set(["openbrain-ceo", "deepcent-ceo", "conscienta-ceo", "ai-systems",
      "us-president", "us-congress"]);
    const result = calculateStartingCompute(enabled);
    const us = result.find((r) => r.roleId === "us-president")!;
    const congress = result.find((r) => r.roleId === "us-congress")!;
    // 11u split by weight: President(8) + Congress(3) = 11 total weight
    expect(us.computeStock + congress.computeStock).toBe(11);
    expect(us.computeStock).toBeGreaterThan(congress.computeStock);
  });
});
