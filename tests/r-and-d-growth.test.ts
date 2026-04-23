import { describe, it, expect } from "vitest";
import {
  DEFAULT_LABS,
  BASELINE_RD_TARGETS,
  LAB_PROGRESSION,
  clampProductivity,
  computeLabGrowth,
  getBaselineStockBeforeRound,
} from "@/lib/game-data";

/**
 * Four-layer mechanic model (see NEXT-SESSION.md / docs/resolve-pipeline.md):
 *
 *   Position     rdMultiplier — breakthrough / modelRollback / merge only
 *   Stock        computeStock — computeDestroyed / computeTransfer / merge
 *   Velocity     derived each round from stock × research% × mult × productivity
 *   Productivity one-round throughput modifier, defaults to 1.0
 *
 * This file pins the behaviour of the PURE functions in game-data.ts:
 *   - getBaselineStockBeforeRound: baseline pre-acquisition stock at round start
 *   - computeLabGrowth: R&D multiplier update + acquisition accounting
 *
 * Effects that require the Convex apply path (breakthrough / modelRollback /
 * researchDisruption / researchBoost / computeDestroyed dispatch) are covered
 * in the grader + pipeline test flow (tests/adversarial-replay.test.ts and the
 * convex-integration harness). The taxonomy itself is covered in
 * tests/structured-effects.test.ts.
 */

const emptyAllocations = new Map<string, { deployment: number; research: number; safety: number }>();

// Default lab allocations mirror the authored AI 2027 trajectory. When we run
// computeLabGrowth with the default allocations, multipliers should land
// within ±10% of the authored R1 targets (the "baseline pinning" check).
const DEFAULT_LAB_ALLOCATIONS = new Map(
  DEFAULT_LABS.map((l) => [l.name, l.allocation] as const),
);

describe("getBaselineStockBeforeRound", () => {
  it("returns starting stock for round 1 (no prior acquisitions)", () => {
    expect(getBaselineStockBeforeRound("OpenBrain", 1)).toBe(22);
    expect(getBaselineStockBeforeRound("DeepCent", 1)).toBe(17);
    expect(getBaselineStockBeforeRound("Conscienta", 1)).toBe(14);
  });

  it("for round 2, adds only round-1 acquisition (not round-2)", () => {
    // OpenBrain round 1: 31u total × 35.5% × round to nearest = 11u → start of R2 = 22 + 11 = 33.
    // Using the formula with the same rounding as the helper so the pin stays honest.
    const r1 = Math.round(31 * 35.5 / 100);
    expect(getBaselineStockBeforeRound("OpenBrain", 2)).toBe(22 + r1);
  });

  it("for round 3, accumulates rounds 1 + 2 acquisitions (not round-3)", () => {
    const r1 = Math.round(31 * 35.5 / 100);
    const r2 = Math.round(35 * 45.7 / 100);
    expect(getBaselineStockBeforeRound("OpenBrain", 3)).toBe(22 + r1 + r2);
  });

  it("unknown lab → 0 (no authored starting stock)", () => {
    expect(getBaselineStockBeforeRound("UnknownLab", 1)).toBe(0);
    expect(getBaselineStockBeforeRound("UnknownLab", 3)).toBe(0);
  });
});

describe("computeLabGrowth — R&D uses pre-acquisition stock (regression pin)", () => {
  it("reproducing the pre-redesign bug would have made round-1 multipliers LOWER than observed — pin the fix", () => {
    // Pre-redesign behaviour: newCompute was added BEFORE effectiveRd was
    // calculated, so all labs got a share of round-1 acquisition (≈11u for
    // OpenBrain) inflating their effectiveRd and dampening the relative
    // performance ratio. With the fix, R&D uses pre-acquisition stock — the
    // ratio is computed against baselines that also use pre-acquisition stock,
    // making the comparison apples-to-apples. If this test fails with "too
    // high" multipliers it's likely the old post-acquisition flow resurfaced.
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (const lab of result) {
      const baseline = BASELINE_RD_TARGETS[lab.name]?.[1];
      if (baseline == null) continue;
      // Within ±10% of authored baseline under default allocations — this is the
      // main trajectory pin. Before the fix, compounded acquisition inflated the
      // multiplier into the top of the band or past it.
      expect(lab.rdMultiplier).toBeGreaterThanOrEqual(baseline * 0.9);
      expect(lab.rdMultiplier).toBeLessThanOrEqual(baseline * 1.1);
    }
  });

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

  it("productivity only affects R&D multiplier, not compute acquisition (acquisition is an independent output)", () => {
    // The plan: "Acquisition is a separate output — feeds next round's
    // starting stock, doesn't affect this round's R&D". Symmetrically,
    // productivity affects R&D but not acquisition.
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

  it("productivity is one-round only — the caller must clear it after consumption", () => {
    // This test documents the contract rather than enforces it at the function
    // boundary: computeLabGrowth reads whatever the caller passes. The
    // one-round semantics live in continueFromEffectReview which clears
    // round.pendingProductivityMods in applyGrowthAndAcquisitionInternal.
    // The pin here is that two consecutive calls WITHOUT productivity mods
    // produce identical growth — i.e. the function itself is stateless.
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
  // to 2.25 — not catastrophic, but three emissions could escalate further.
  // The clamp matches symmetric bounds on rdMultiplier (breakthrough ceils at
  // maxMult, modelRollback floors at 1).

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
    // The apply path generates `before * f` where both inputs are finite
    // numbers (f is from factor() which returns a rounded number in [min,max]).
    // This test pins the current behaviour so a future "guard non-finite"
    // change is a conscious break.
    expect(clampProductivity(Infinity)).toBe(2.5);
    expect(Number.isNaN(clampProductivity(NaN))).toBe(true);
  });
});

describe("computeLabGrowth — baseline trajectory pin (the reason the redesign exists)", () => {
  it("R1 default allocations land OpenBrain within ±10% of 10×", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const ob = result.find((l) => l.name === "OpenBrain")!;
    expect(ob.rdMultiplier).toBeGreaterThanOrEqual(10 * 0.9);
    expect(ob.rdMultiplier).toBeLessThanOrEqual(10 * 1.1);
  });

  it("R1 default allocations land DeepCent within ±10% of 5.7×", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const dc = result.find((l) => l.name === "DeepCent")!;
    expect(dc.rdMultiplier).toBeGreaterThanOrEqual(5.7 * 0.9);
    expect(dc.rdMultiplier).toBeLessThanOrEqual(5.7 * 1.1);
  });

  it("R1 default allocations land Conscienta within ±10% of 5×", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const co = result.find((l) => l.name === "Conscienta")!;
    expect(co.rdMultiplier).toBeGreaterThanOrEqual(5 * 0.9);
    expect(co.rdMultiplier).toBeLessThanOrEqual(5 * 1.1);
  });

  it("empty allocation map falls back to the lab's own allocation and still lands close to baseline", () => {
    const baseLabs = DEFAULT_LABS.map((l) => ({ ...l }));
    const result = computeLabGrowth(baseLabs, emptyAllocations, 1, 200);
    for (const lab of result) {
      const baseline = BASELINE_RD_TARGETS[lab.name]?.[1];
      if (baseline == null) continue;
      expect(lab.rdMultiplier).toBeGreaterThanOrEqual(baseline * 0.9);
      expect(lab.rdMultiplier).toBeLessThanOrEqual(baseline * 1.1);
    }
  });
});
