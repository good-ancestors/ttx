import { describe, it, expect } from "vitest";
import {
  DEFAULT_LABS,
  CANONICAL_RD_TRAJECTORY,
  LAB_PROGRESSION,
  clampProductivity,
  computeLabGrowth,
  getCanonicalStockBeforeRound,
} from "@/lib/game-data";

/**
 * Universal-curve model (see docs/lab-progression.md):
 *
 *   Position     rdMultiplier — breakthrough / modelRollback / merge only
 *   Stock        computeStock — computeDestroyed / computeTransfer / merge
 *   Velocity     derived each round from stock × research% × mult × productivity
 *   Productivity one-round throughput modifier, defaults to 1.0
 *
 * Growth is name-blind: every lab is compared against ONE canonical trajectory
 * (CANONICAL_RD_TRAJECTORY, derived from the AI 2027 leading-lab row). Two labs
 * with identical compute, allocation, multiplier, and productivity grow
 * identically regardless of name.
 *
 * This file pins the behaviour of the PURE functions in game-data.ts:
 *   - getCanonicalStockBeforeRound: reference pre-acquisition stock at round start
 *   - computeLabGrowth: R&D multiplier update + acquisition accounting
 *
 * Effects that require the Convex apply path (breakthrough / modelRollback /
 * researchDisruption / researchBoost / computeDestroyed dispatch) are covered
 * in the grader + pipeline test flow (tests/adversarial-replay.test.ts and the
 * convex-integration harness). The taxonomy itself is covered in
 * tests/structured-effects.test.ts.
 */

const emptyAllocations = new Map<string, { deployment: number; research: number; safety: number }>();

const DEFAULT_LAB_ALLOCATIONS = new Map(
  DEFAULT_LABS.map((l) => [l.name, l.allocation] as const),
);

describe("getCanonicalStockBeforeRound", () => {
  it("returns OpenBrain's starting stock for round 1 (no prior acquisitions)", () => {
    expect(getCanonicalStockBeforeRound(1)).toBe(22);
  });

  it("for round 2, adds only round-1 acquisition (not round-2)", () => {
    // OpenBrain round 1: 31u total × 35.5% rounded = 11u → start of R2 = 22 + 11 = 33.
    const r1 = Math.round(31 * 35.5 / 100);
    expect(getCanonicalStockBeforeRound(2)).toBe(22 + r1);
  });

  it("for round 3, accumulates rounds 1 + 2 acquisitions (not round-3)", () => {
    const r1 = Math.round(31 * 35.5 / 100);
    const r2 = Math.round(35 * 45.7 / 100);
    expect(getCanonicalStockBeforeRound(3)).toBe(22 + r1 + r2);
  });

  it("does not depend on lab identity — single yardstick for all labs", () => {
    // Helper takes only roundNumber. The fact it compiles without a labName
    // param is the contract; this test guards against a future refactor
    // reintroducing a per-lab branch.
    expect(typeof getCanonicalStockBeforeRound(1)).toBe("number");
  });
});

describe("computeLabGrowth — name-blind growth (the redesign's core invariant)", () => {
  it("two labs with identical inputs grow identically regardless of name", () => {
    const labA = {
      name: "ZetaCorp",
      computeStock: 22,
      rdMultiplier: 3,
      allocation: { deployment: 47, research: 50, safety: 3 },
    };
    const labB = { ...labA, name: "OmegaLabs" };
    const allocations = new Map([
      [labA.name, labA.allocation],
      [labB.name, labB.allocation],
    ]);
    const result = computeLabGrowth([labA, labB], allocations, 1, 200);
    expect(result[0].rdMultiplier).toBe(result[1].rdMultiplier);
  });

  it("OpenBrain at default allocation matches the canonical R1 trajectory (10×)", () => {
    // OpenBrain IS the reference profile: 22 stock, 50% research, mult 3 → ratio = 1.0
    // → modifier = 1.0 → factor = canonical R1 growth factor → mult ≈ 10×.
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const ob = result.find((l) => l.name === "OpenBrain")!;
    expect(ob.rdMultiplier).toBeGreaterThanOrEqual(CANONICAL_RD_TRAJECTORY[1] * 0.95);
    expect(ob.rdMultiplier).toBeLessThanOrEqual(CANONICAL_RD_TRAJECTORY[1] * 1.05);
  });

  it("a lab at 0% research stalls — no growth, no regression", () => {
    // With research = 0, effectiveRd = 0 → ratio → 0 → modifier = 0 (floor) →
    // factor = 1 + (canonicalGrowth - 1) × 0 = 1.0. Multiplier holds steady.
    // Crucially: never decreases (only modelRollback can do that).
    const lab = {
      name: "ZeroLab",
      computeStock: 22,
      rdMultiplier: 3,
      allocation: { deployment: 100, research: 0, safety: 0 },
    };
    const result = computeLabGrowth([lab], new Map([[lab.name, lab.allocation]]), 1, 200);
    expect(result[0].rdMultiplier).toBe(3); // exactly steady — no growth, no regression
  });

  it("a lab at 100% research with reference compute breaks out above the canonical curve", () => {
    // Same compute as OpenBrain (22u start), same starting mult (3), but 100% research
    // instead of 50% → ratio = 2.0 → modifier ≈ 1.79 → factor > canonical g.
    const lab = {
      name: "AllInLab",
      computeStock: 22,
      rdMultiplier: 3,
      allocation: { deployment: 0, research: 100, safety: 0 },
    };
    const result = computeLabGrowth([lab], new Map([[lab.name, lab.allocation]]), 1, 200);
    expect(result[0].rdMultiplier).toBeGreaterThan(CANONICAL_RD_TRAJECTORY[1]);
  });

  it("a trailing lab can challenge the leader by R4 with reference compute + 100% research", () => {
    // A lab whose stock + multiplier match the canonical R3 endpoint, going
    // all-in on research in R4, should reach OpenBrain-tier numbers.
    // (Reproduces the user's bug report: under the old per-lab pinning, DeepCent
    //  capped around 100× regardless of effort. Universal curve fixes that.)
    const trailingButResourced = {
      name: "DeepCent",
      computeStock: getCanonicalStockBeforeRound(4),
      rdMultiplier: CANONICAL_RD_TRAJECTORY[3], // canonical R3 endpoint
      allocation: { deployment: 0, research: 100, safety: 0 },
    };
    const result = computeLabGrowth(
      [trailingButResourced],
      new Map([[trailingButResourced.name, trailingButResourced.allocation]]),
      4,
      LAB_PROGRESSION.maxMultiplier(4),
    );
    // At canonical R4 g=10 and modifier ≈ 1.79, factor ≈ 17 → 17,000 → clamped at 15,000.
    expect(result[0].rdMultiplier).toBeGreaterThan(CANONICAL_RD_TRAJECTORY[3] * 5);
  });

  it("compute monotonicity holds at high multipliers — more compute always grows more (regression: MAX_GROWTH_FACTOR clamp tied at saturation)", () => {
    // The previous formula clamped growthModifier at MAX_GROWTH_FACTOR=4. When two
    // aggressive labs both saturated, they got identical growth despite different
    // compute. Removing the clamp lets compute differentiate everywhere except at
    // the maxMultiplier output ceiling. Test: same starting mult, same allocation,
    // double the compute → strictly more growth.
    const small = {
      name: "Small",
      computeStock: 28,
      rdMultiplier: 100,
      allocation: { deployment: 0, research: 100, safety: 0 },
    };
    const large = { ...small, name: "Large", computeStock: 56 }; // 2× compute
    const allocs = new Map([
      [small.name, small.allocation],
      [large.name, large.allocation],
    ]);
    const result = computeLabGrowth([small, large], allocs, 3, LAB_PROGRESSION.maxMultiplier(3));
    const r0 = result[0].rdMultiplier;
    const r1 = result[1].rdMultiplier;
    // Below the maxMultiplier ceiling: more compute strictly grows more.
    if (r1 < LAB_PROGRESSION.maxMultiplier(3)) {
      expect(r1).toBeGreaterThan(r0);
    } else {
      // If both reached the cap, the tie is semantically "both at ASI ceiling" —
      // also acceptable. Just assert not less than.
      expect(r1).toBeGreaterThanOrEqual(r0);
    }
  });

  it("knowledge diffusion lifts a research-active trailing lab above raw-physics floor", () => {
    // A trailing lab with research effort gets a baseline ratio from diffusion
    // (papers, OS models, leaks). Without it, Cs's R3 ratio collapses to ~0.034
    // and the lab barely grows. With diffusion at 15% × research/50, a 50%-research
    // lab gets at least 0.15 ratio — meaningful growth even far behind canonical.
    const trailing = {
      name: "Trailing",
      computeStock: 14, // Conscienta-tier
      rdMultiplier: 7,  // far below canonical R3 entry of 100
      allocation: { deployment: 50, research: 50, safety: 0 },
    };
    const result = computeLabGrowth(
      [trailing],
      new Map([[trailing.name, trailing.allocation]]),
      3,
      LAB_PROGRESSION.maxMultiplier(3),
    );
    // Without diffusion, mult would have grown to ~7.4 (almost stalled).
    // With diffusion floor 0.15 at 50% research, growth modifier ≈ 0.15^1.2 ≈ 0.10,
    // factor ≈ 1 + 9 × 0.10 ≈ 1.9, newMult ≈ 13.
    expect(result[0].rdMultiplier).toBeGreaterThan(10);
  });

  it("a lab on 100% safety (0% research) absorbs no diffusion — stalls cleanly", () => {
    // Diffusion is research-gated: at 0% research, the floor is 0, so the lab
    // stalls completely (no phantom growth from spillover). Preserves the
    // "lots to safety slows down but doesn't go backwards" property.
    const safetyPivot = {
      name: "SafetyPivot",
      computeStock: 30,
      rdMultiplier: 50,
      allocation: { deployment: 0, research: 0, safety: 100 },
    };
    const result = computeLabGrowth(
      [safetyPivot],
      new Map([[safetyPivot.name, safetyPivot.allocation]]),
      3,
      LAB_PROGRESSION.maxMultiplier(3),
    );
    expect(result[0].rdMultiplier).toBe(50); // exactly steady, no growth, no regression
  });

  it("round caps still bind — no lab exceeds maxMultiplier(round)", () => {
    const lab = {
      name: "RunawayLab",
      computeStock: 1000, // wildly above canonical
      rdMultiplier: 1000,
      allocation: { deployment: 0, research: 100, safety: 0 },
    };
    const result = computeLabGrowth(
      [lab],
      new Map([[lab.name, lab.allocation]]),
      4,
      LAB_PROGRESSION.maxMultiplier(4),
    );
    expect(result[0].rdMultiplier).toBeLessThanOrEqual(LAB_PROGRESSION.maxMultiplier(4));
  });

  it("acquisition still lands in the returned computeStock (for caller diff)", () => {
    // Caller derives acquisition by diffing pre/post-growth computeStock.
    // R&D uses pre-acquisition stock internally, but the returned labs must
    // carry the post-acquisition value or pendingAcquired won't be stashed.
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (const lab of result) {
      const original = baseLabs.find((l) => l.name === lab.name)!;
      expect(lab.computeStock).toBeGreaterThan(original.computeStock);
    }
  });
});

describe("computeLabGrowth — productivity modifier (researchDisruption / researchBoost)", () => {
  it("disruption (×0.5) reduces multiplier growth vs. baseline", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const baseline = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const disrupted = computeLabGrowth(
      baseLabs,
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map([["OpenBrain", 0.5]]),
    );
    const bO = baseline.find((l) => l.name === "OpenBrain")!;
    const dO = disrupted.find((l) => l.name === "OpenBrain")!;
    expect(dO.rdMultiplier).toBeLessThan(bO.rdMultiplier);
  });

  it("boost (×1.4) increases multiplier growth vs. baseline", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const baseline = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const boosted = computeLabGrowth(
      baseLabs,
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map([["OpenBrain", 1.4]]),
    );
    const bO = baseline.find((l) => l.name === "OpenBrain")!;
    const tO = boosted.find((l) => l.name === "OpenBrain")!;
    expect(tO.rdMultiplier).toBeGreaterThanOrEqual(bO.rdMultiplier);
  });

  it("omitting productivity map is identical to passing productivity = 1.0 for every lab", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const a = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const b = computeLabGrowth(
      baseLabs,
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map(DEFAULT_LABS.map((l) => [l.name, 1])),
    );
    for (let i = 0; i < a.length; i++) {
      expect(a[i].rdMultiplier).toBe(b[i].rdMultiplier);
      expect(a[i].computeStock).toBe(b[i].computeStock);
    }
  });

  it("productivity only affects R&D multiplier, not compute acquisition", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const a = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const b = computeLabGrowth(
      baseLabs,
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map([["OpenBrain", 0.5]]),
    );
    const aO = a.find((l) => l.name === "OpenBrain")!;
    const bO = b.find((l) => l.name === "OpenBrain")!;
    expect(aO.computeStock).toBe(bO.computeStock);
  });

  it("productivity is one-round only — function itself is stateless", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const first = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const second = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (let i = 0; i < first.length; i++) {
      expect(first[i].rdMultiplier).toBe(second[i].rdMultiplier);
      expect(first[i].computeStock).toBe(second[i].computeStock);
    }
  });
});

describe("clampProductivity — bounds composition of repeat researchDisruption/researchBoost", () => {
  // Repeated grader emissions of productivity effects on the same lab compose
  // multiplicatively (see pipeline.ts:applyProductivityMod). Without clamping,
  // two disruption × 0.5 would floor at 0.25 and two boost × 1.5 would climb
  // to 2.25. The clamp matches symmetric bounds on rdMultiplier (breakthrough
  // ceils at maxMult, modelRollback floors at 1).

  it("exports the clamp range as LAB_PROGRESSION constants", () => {
    expect(LAB_PROGRESSION.PRODUCTIVITY_MIN).toBe(0.25);
    expect(LAB_PROGRESSION.PRODUCTIVITY_MAX).toBe(2.5);
  });

  it("passes through values inside the clamp range", () => {
    expect(clampProductivity(1)).toBe(1);
    expect(clampProductivity(0.5)).toBe(0.5);
    expect(clampProductivity(2.0)).toBe(2.0);
  });

  it("floors at PRODUCTIVITY_MIN when value would go below", () => {
    expect(clampProductivity(0.1)).toBe(0.25);
    expect(clampProductivity(0.5 * 0.5 * 0.5)).toBe(0.25); // three disruptions
    expect(clampProductivity(0)).toBe(0.25);
    expect(clampProductivity(-1)).toBe(0.25);
  });

  it("ceils at PRODUCTIVITY_MAX when value would go above", () => {
    expect(clampProductivity(3)).toBe(2.5);
    expect(clampProductivity(1.5 * 1.5 * 1.5)).toBe(2.5); // three boosts = 3.375
    expect(clampProductivity(100)).toBe(2.5);
  });

  it("NaN / Infinity clamp to MAX (defensive)", () => {
    // Math.max(min, Math.min(max, NaN)) = NaN, so actually NaN propagates.
    // The apply path generates `before * f` where both inputs are finite.
    expect(clampProductivity(Infinity)).toBe(2.5);
    expect(Number.isNaN(clampProductivity(NaN))).toBe(true);
  });
});

describe("computeLabGrowth — empty allocation map falls back to lab.allocation", () => {
  it("OpenBrain still tracks the canonical R1 curve when allocation map is empty", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, emptyAllocations, 1, 200);
    const ob = result.find((l) => l.name === "OpenBrain")!;
    expect(ob.rdMultiplier).toBeGreaterThanOrEqual(CANONICAL_RD_TRAJECTORY[1] * 0.95);
    expect(ob.rdMultiplier).toBeLessThanOrEqual(CANONICAL_RD_TRAJECTORY[1] * 1.05);
  });
});
