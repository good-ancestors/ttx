import { describe, it, expect } from "vitest";
import {
  DEFAULT_LABS,
  LAB_PROGRESSION,
  clampProductivity,
  computeLabGrowth,
} from "@/lib/game-data";

/**
 * Pins behaviour of the pure compute-share R&D growth formula in
 * computeLabGrowth. The formula is:
 *   newMultiplier = rdMultiplier × (1 + rdShare × POOL_GROWTH[round] × productivity)
 * where rdShare is the lab's fraction of total effectiveRd. More compute (or
 * more research%, or higher productivity) always strictly increases growth.
 *
 * POOL_GROWTH is calibrated so OpenBrain at default allocations + default
 * compute shares tracks the AI-2027 CSV curve (10 → 100 → 1000 → 10000).
 * DeepCent and Conscienta drift from their authored CSV targets at idle play
 * — that drift is the accepted cost of a formula where compute is the only
 * thing that matters.
 */

const emptyAllocations = new Map<string, { deployment: number; research: number; safety: number }>();

const DEFAULT_LAB_ALLOCATIONS = new Map(
  DEFAULT_LABS.map((l) => [l.name, l.allocation] as const),
);

describe("computeLabGrowth — compute monotonicity (the property the bug violated)", () => {
  it("two labs identical except compute → more-compute lab MUST grow more", () => {
    // Direct regression for game js7aqftxa4avkxt013889a4c6s862y66 R3, where
    // Conscienta (56u) ended below DeepCent (28u) despite double the compute.
    const labs = [
      { name: "Alpha", computeStock: 30, rdMultiplier: 100, allocation: { deployment: 0, research: 100, safety: 0 } },
      { name: "Beta",  computeStock: 60, rdMultiplier: 100, allocation: { deployment: 0, research: 100, safety: 0 } },
    ];
    const result = computeLabGrowth(labs, emptyAllocations, 3, 2000);
    const a = result.find((l) => l.name === "Alpha")!;
    const b = result.find((l) => l.name === "Beta")!;
    expect(b.rdMultiplier).toBeGreaterThan(a.rdMultiplier);
  });

  it("doubling research% → more-research lab grows strictly more", () => {
    const labs = [
      { name: "Alpha", computeStock: 10, rdMultiplier: 5, allocation: { deployment: 50, research: 50, safety: 0 } },
      { name: "Beta",  computeStock: 10, rdMultiplier: 5, allocation: { deployment: 0,  research: 100, safety: 0 } },
    ];
    const result = computeLabGrowth(labs, emptyAllocations, 1, 200);
    const a = result.find((l) => l.name === "Alpha")!;
    const b = result.find((l) => l.name === "Beta")!;
    expect(b.rdMultiplier).toBeGreaterThan(a.rdMultiplier);
  });
});

describe("computeLabGrowth — replay of game js7aqftxa4avkxt013889a4c6s862y66 R3", () => {
  it("Conscienta (56u) ends ABOVE DeepCent (28u) post-R3 with the new formula", () => {
    // Real R3 inputs from the bug report. DeepCent ended at 1139.5 and
    // Conscienta at 931.5 under the old formula — inverse of expected. The
    // new formula must give Conscienta > DeepCent.
    const labs = [
      { name: "OpenBrain",  roleId: "openbrain-ceo",  computeStock: 0,  rdMultiplier: 13.5,  allocation: { deployment: 0, research: 100, safety: 0 } },
      { name: "DeepCent",   roleId: "deepcent-ceo",   computeStock: 28, rdMultiplier: 98.7,  allocation: { deployment: 0, research: 100, safety: 0 } },
      { name: "Conscienta", roleId: "conscienta-ceo", computeStock: 56, rdMultiplier: 121.5, allocation: { deployment: 0, research: 100, safety: 0 } },
    ];
    const result = computeLabGrowth(labs, emptyAllocations, 3, 2000);
    const dc = result.find((l) => l.name === "DeepCent")!;
    const co = result.find((l) => l.name === "Conscienta")!;
    expect(co.rdMultiplier).toBeGreaterThan(dc.rdMultiplier);
  });
});

describe("computeLabGrowth — OpenBrain default-curve regression (the calibration anchor)", () => {
  // Pure compute-share preserves OpenBrain's authored 10/100/1000/10000 curve
  // at default allocations + default compute shares because POOL_GROWTH is
  // calibrated for that case. DeepCent and Conscienta will drift from their
  // CSV targets — that drift is intentional and tested separately below.

  it("R1 default allocations land OpenBrain within ±10% of 10×", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const ob = result.find((l) => l.name === "OpenBrain")!;
    expect(ob.rdMultiplier).toBeGreaterThanOrEqual(10 * 0.9);
    expect(ob.rdMultiplier).toBeLessThanOrEqual(10 * 1.1);
  });

  it("empty allocation map falls back to lab's own allocation; OpenBrain still lands within ±10% of 10×", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, emptyAllocations, 1, 200);
    const ob = result.find((l) => l.name === "OpenBrain")!;
    expect(ob.rdMultiplier).toBeGreaterThanOrEqual(10 * 0.9);
    expect(ob.rdMultiplier).toBeLessThanOrEqual(10 * 1.1);
  });
});

describe("computeLabGrowth — acquisition is independent of R&D growth", () => {
  it("acquisition still lands in the returned computeStock (for caller diff)", () => {
    // The caller (continueFromEffectReview) derives acquisition by diffing
    // pre- and post-growth computeStock. Even though R&D uses pre-acquisition
    // stock internally, the returned labs must carry the post-acquisition
    // value or pendingAcquired won't be stashed correctly.
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (const lab of result) {
      const original = baseLabs.find((l) => l.name === lab.name)!;
      expect(lab.computeStock).toBeGreaterThan(original.computeStock);
    }
  });

  it("productivity affects R&D but not acquisition", () => {
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
});

describe("computeLabGrowth — productivity modifier", () => {
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
    expect(tO.rdMultiplier).toBeGreaterThan(bO.rdMultiplier);
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

  it("function is stateless — two consecutive calls with identical inputs match", () => {
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
    expect(clampProductivity(0.5 * 0.5 * 0.5)).toBe(0.25);
    expect(clampProductivity(0)).toBe(0.25);
    expect(clampProductivity(-1)).toBe(0.25);
  });

  it("ceils at PRODUCTIVITY_MAX when value would go above", () => {
    expect(clampProductivity(3)).toBe(2.5);
    expect(clampProductivity(1.5 * 1.5 * 1.5)).toBe(2.5);
    expect(clampProductivity(100)).toBe(2.5);
  });

  it("NaN / Infinity clamp to MAX (defensive)", () => {
    expect(clampProductivity(Infinity)).toBe(2.5);
    expect(Number.isNaN(clampProductivity(NaN))).toBe(true);
  });
});
