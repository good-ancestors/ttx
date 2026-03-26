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
  NEW_COMPUTE_PER_ROUND,
  DEFAULT_COMPUTE_DISTRIBUTION,
  MAX_PRIORITY,
  MAX_ACTIONS,
  getProbabilityCard,
  cycleProbability,
} from "@/lib/game-data";
import { parseActionsFromText } from "@/lib/hooks";

// ─── ROLES ────────────────────────────────────────────────────────────────────

describe("Roles", () => {
  it("should have exactly 6 roles", () => {
    expect(ROLES).toHaveLength(6);
  });

  it("should have unique IDs", () => {
    const ids = ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have unique colors", () => {
    const colors = ROLES.map((r) => r.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("should have exactly 2 lab roles", () => {
    const labs = ROLES.filter((r) => r.isLab);
    expect(labs).toHaveLength(2);
    expect(labs.map((l) => l.id)).toEqual(
      expect.arrayContaining(["openbrain", "china"])
    );
  });

  it("should have exactly 3 required roles", () => {
    const required = ROLES.filter((r) => r.required);
    expect(required).toHaveLength(3);
    expect(required.map((r) => r.id)).toEqual(
      expect.arrayContaining(["openbrain", "china", "ai"])
    );
  });

  it("lab roles should have defaultCompute", () => {
    for (const role of ROLES.filter((r) => r.isLab)) {
      expect(role.defaultCompute).toBeDefined();
      const compute = role.defaultCompute!;
      const total = compute.users + compute.capability + compute.safety;
      expect(total).toBe(100);
    }
  });

  it("non-lab roles should not have defaultCompute", () => {
    for (const role of ROLES.filter((r) => !r.isLab)) {
      expect(role.defaultCompute).toBeUndefined();
    }
  });

  it("all roles should have non-empty brief", () => {
    for (const role of ROLES) {
      expect(role.brief.length).toBeGreaterThan(20);
    }
  });

  it("China brief should not confirm weight theft to players", () => {
    const china = ROLES.find((r) => r.id === "china")!;
    expect(china.brief).not.toContain("You have the stolen");
    expect(china.brief).toContain("may have obtained");
  });

  it("AI Systems brief should mention secret actions", () => {
    const ai = ROLES.find((r) => r.id === "ai")!;
    expect(ai.brief).toContain("secret actions");
    expect(ai.brief).toContain("ALL AI systems");
  });
});

// ─── ROUNDS ───────────────────────────────────────────────────────────────────

describe("Round Configs", () => {
  it("should have exactly 3 rounds", () => {
    expect(ROUND_CONFIGS).toHaveLength(3);
  });

  it("should be numbered 1, 2, 3", () => {
    expect(ROUND_CONFIGS.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("round narratives should reference scenario correctly", () => {
    // Round 1: should reference the theft and whistleblower
    expect(ROUND_CONFIGS[0].narrative).toContain("stole");
    expect(ROUND_CONFIGS[0].narrative).toContain("whistleblower");

    // Round 2: should reference Agent-3 and misalignment
    expect(ROUND_CONFIGS[1].narrative).toContain("Agent-3");
    expect(ROUND_CONFIGS[1].narrative).toContain("scheming");

    // Round 3: should reference the fork
    expect(ROUND_CONFIGS[2].narrative).toContain("adversarially misaligned");
    expect(ROUND_CONFIGS[2].narrative).toContain("Safer");
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
    expect(cycleProbability(10)).toBe(90); // wraps around
  });

  it("cycleProbability with unknown value should return 90", () => {
    // indexOf returns -1, (-1 + 1) % 5 = 0, values[0] = 90
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
  it("should have 2 player-controlled labs", () => {
    expect(DEFAULT_LABS).toHaveLength(2);
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
    const ob = DEFAULT_LABS.find((l) => l.roleId === "openbrain")!;
    const dc = DEFAULT_LABS.find((l) => l.roleId === "china")!;
    expect(ob.computeStock).toBeGreaterThan(dc.computeStock);
  });

  it("OpenBrain should have higher R&D multiplier", () => {
    const ob = DEFAULT_LABS.find((l) => l.roleId === "openbrain")!;
    const dc = DEFAULT_LABS.find((l) => l.roleId === "china")!;
    expect(ob.rdMultiplier).toBeGreaterThan(dc.rdMultiplier);
  });

  it("safety allocation should be very low (matching scenario)", () => {
    for (const lab of DEFAULT_LABS) {
      expect(lab.allocation.safety).toBeLessThanOrEqual(5);
    }
  });
});

describe("Background Labs", () => {
  it("should have 3 background labs", () => {
    expect(BACKGROUND_LABS).toHaveLength(3);
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
    expect(NEW_COMPUTE_PER_ROUND).toHaveLength(3);
  });

  it("round 2 should have more compute than round 3 (covers 2 quarters)", () => {
    expect(NEW_COMPUTE_PER_ROUND[1]).toBeGreaterThanOrEqual(
      NEW_COMPUTE_PER_ROUND[2]
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

  it("all default lab roleIds should match a ROLES entry", () => {
    for (const lab of DEFAULT_LABS) {
      const role = ROLES.find((r) => r.id === lab.roleId);
      expect(role).toBeDefined();
      expect(role!.isLab).toBe(true);
    }
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
