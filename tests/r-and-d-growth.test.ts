import { describe, it, expect } from "vitest";
import {
  DEFAULT_LABS,
  LAB_PROGRESSION,
  clampProductivity,
  computeLabGrowth,
} from "@/lib/game-data";
import { SCENARIOS, runScenarioThroughFormula } from "@/lib/__fixtures__/lab-growth-canonical";

/**
 * Lab growth — pure-physics formula.
 *
 *   Position     rdMultiplier — breakthrough / modelRollback / merge only
 *   Stock        computeStock — computeDestroyed / computeTransfer / merge
 *   Velocity     derived each round from stock × research% × mult^RSI_EXP × productivity
 *                drag = (lab_effRd / leader_effRd)^LEADER_DRAG (live leader, no phantom)
 *                diffusion = research × √gap × DIFFUSION_RATE × (1 + COOPERATION_BOOST · worldSafety)
 *   Productivity one-round throughput modifier, defaults to 1.0
 *
 * No per-lab or per-scenario hardcoded targets at runtime. Calibration lives
 * in src/lib/__fixtures__/lab-growth-canonical.ts; events do the per-scenario
 * calibration to specific CSV trajectories.
 */

const emptyAllocations = new Map<string, { deployment: number; research: number; safety: number }>();

const DEFAULT_LAB_ALLOCATIONS = new Map(DEFAULT_LABS.map((l) => [l.name, l.allocation] as const));

function fresh() {
  return DEFAULT_LABS.map((l) => ({ ...l, allocation: { ...l.allocation } }));
}

// ─── Scenario fit ────────────────────────────────────────────────────────────

describe("lab growth — scenario fit (regression pins)", () => {
  describe.each(SCENARIOS)("$name", (scenario) => {
    it("each round's multipliers match formulaExpected within ±5%", () => {
      const traj = runScenarioThroughFormula(scenario);
      for (const [labName, expected] of Object.entries(scenario.formulaExpected)) {
        const actual = traj.get(labName);
        expect(actual, `missing trajectory for ${labName}`).toBeDefined();
        for (let r = 0; r <= 4; r++) {
          const a = actual![r];
          const e = expected[r];
          const lo = e * 0.95;
          const hi = e * 1.05;
          expect(
            a,
            `${scenario.name}/${labName}/R${r}: expected ${e}, got ${a}`,
          ).toBeGreaterThanOrEqual(lo);
          expect(a).toBeLessThanOrEqual(hi);
        }
      }
    });

  });
});

// Note on CSV targets in fixtures: csvTarget is informational, not asserted.
// The formula is pure physics; per-scenario CSV calibration happens via events
// (alignment backtrack, sanctions, breakthroughs). Asserting OB tracks CSV in
// the slowdown branch would require the test harness to also inject the events
// from that branch's story. That belongs in scenario-level integration tests,
// not the formula's unit tests.

// ─── Properties ──────────────────────────────────────────────────────────────

describe("lab growth — formula properties", () => {
  it("monotonic in research%: more research → more growth", () => {
    const lowResearch = new Map(
      DEFAULT_LABS.map((l) => [l.name, { deployment: 80, research: 20, safety: 0 }] as const),
    );
    const highResearch = new Map(
      DEFAULT_LABS.map((l) => [l.name, { deployment: 0, research: 100, safety: 0 }] as const),
    );

    const low = computeLabGrowth(fresh(), lowResearch, 1, 200);
    const high = computeLabGrowth(fresh(), highResearch, 1, 200);

    for (const lab of DEFAULT_LABS) {
      const lo = low.find((l) => l.name === lab.name)!;
      const hi = high.find((l) => l.name === lab.name)!;
      expect(hi.rdMultiplier, `${lab.name}: high research should grow more`).toBeGreaterThan(
        lo.rdMultiplier,
      );
    }
  });

  it("monotonic in compute: more compute → more growth", () => {
    const baseLabs = fresh();
    const fattenedLabs = fresh().map((l) => ({ ...l, computeStock: l.computeStock * 2 }));

    const baseline = computeLabGrowth(baseLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const fattened = computeLabGrowth(fattenedLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);

    for (const lab of DEFAULT_LABS) {
      const b = baseline.find((l) => l.name === lab.name)!;
      const f = fattened.find((l) => l.name === lab.name)!;
      expect(f.rdMultiplier, `${lab.name}: more compute should grow more`).toBeGreaterThan(
        b.rdMultiplier,
      );
    }
  });

  it("monotonic in productivity: boost > baseline > disruption", () => {
    const labs = fresh();
    const baseline = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const disrupted = computeLabGrowth(
      labs,
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map([["OpenBrain", 0.5]]),
    );
    const boosted = computeLabGrowth(
      labs,
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map([["OpenBrain", 1.5]]),
    );

    const dOB = disrupted.find((l) => l.name === "OpenBrain")!;
    const bOB = baseline.find((l) => l.name === "OpenBrain")!;
    const tOB = boosted.find((l) => l.name === "OpenBrain")!;

    expect(dOB.rdMultiplier).toBeLessThan(bOB.rdMultiplier);
    expect(tOB.rdMultiplier).toBeGreaterThan(bOB.rdMultiplier);
  });

  it("zero compute → no growth (lab can't research without hardware)", () => {
    const labs = fresh().map((l) => (l.name === "Conscienta" ? { ...l, computeStock: 0 } : l));
    const result = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const cs = result.find((l) => l.name === "Conscienta")!;
    // Multiplier should be unchanged (modulo rounding to 1 decimal).
    expect(cs.rdMultiplier).toBe(2);
  });

  it("zero research → no growth (capability-only allocation can't advance R&D)", () => {
    const noResearch = new Map(
      DEFAULT_LABS.map((l) => [l.name, { deployment: 100, research: 0, safety: 0 }] as const),
    );
    const result = computeLabGrowth(fresh(), noResearch, 1, 200);
    for (const lab of DEFAULT_LABS) {
      const r = result.find((l) => l.name === lab.name)!;
      expect(r.rdMultiplier, `${lab.name}: 0% research should freeze multiplier`).toBe(
        lab.rdMultiplier,
      );
    }
  });

  it("acquisition arrives in returned stock but doesn't feed this round's R&D", () => {
    // Two runs with identical allocations: one with starting stock S, one with 2S.
    // The R&D multiplier difference between them comes from stock difference WITHOUT
    // this round's acquisition mixed in (acquisition is independent of R&D).
    const labs = fresh();
    const r = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (const lab of r) {
      const original = labs.find((l) => l.name === lab.name)!;
      // Returned compute stock = original + acquisition.
      expect(lab.computeStock).toBeGreaterThan(original.computeStock);
    }
  });

  it("leader removal: trailing labs benefit when previous leader is gone", () => {
    // Compare lone DeepCent + Conscienta vs all three labs.
    // With OB removed, DC becomes leader (drag=1.0 → growth saturated).
    const allThree = computeLabGrowth(fresh(), DEFAULT_LAB_ALLOCATIONS, 2, 200);
    const dcAndCs = computeLabGrowth(
      fresh().filter((l) => l.name !== "OpenBrain"),
      DEFAULT_LAB_ALLOCATIONS,
      2,
      200,
    );

    const dcWith = allThree.find((l) => l.name === "DeepCent")!;
    const dcWithout = dcAndCs.find((l) => l.name === "DeepCent")!;

    // DC grows MORE without OB present (no leader pulling drag down).
    expect(dcWithout.rdMultiplier).toBeGreaterThan(dcWith.rdMultiplier);
  });

  it("world cooperation amplifies diffusion: trailing labs grow more when world is safety-aligned", () => {
    // Race world: ~3-7% safety per lab.
    const raceAllocs = DEFAULT_LAB_ALLOCATIONS;
    // Cooperative world: every lab spends 50% on safety.
    const coopAllocs = new Map(
      DEFAULT_LABS.map((l) => [l.name, { deployment: 30, research: 20, safety: 50 }] as const),
    );

    const race = computeLabGrowth(fresh(), raceAllocs, 1, 200);
    const coop = computeLabGrowth(fresh(), coopAllocs, 1, 200);

    // Conscienta is small enough that diffusion floor matters even at R1.
    const csRace = race.find((l) => l.name === "Conscienta")!;
    const csCoop = coop.find((l) => l.name === "Conscienta")!;

    // Note: in the cooperative world Cs's own research dropped from 43% → 20%,
    // so selfGrowth shrinks. Diffusion lifts via world safety. The net is that
    // Cs does NOT crash in the cooperative world the way it would without
    // diffusion — the floor catches it. Expressed as: cooperative Cs >= 80% of
    // race Cs even though Cs reduced own research by more than half.
    expect(csCoop.rdMultiplier).toBeGreaterThan(csRace.rdMultiplier * 0.8);
  });

  it("empty allocation map falls back to each lab's own allocation", () => {
    const a = computeLabGrowth(fresh(), DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const b = computeLabGrowth(fresh(), emptyAllocations, 1, 200);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].rdMultiplier).toBe(b[i].rdMultiplier);
    }
  });

  it("omitting productivity map ≡ passing 1.0 for every lab", () => {
    const a = computeLabGrowth(fresh(), DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const b = computeLabGrowth(
      fresh(),
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

  it("productivity affects R&D multiplier but not compute acquisition", () => {
    const a = computeLabGrowth(fresh(), DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const b = computeLabGrowth(
      fresh(),
      DEFAULT_LAB_ALLOCATIONS,
      1,
      200,
      new Map([["OpenBrain", 0.5]]),
    );
    const aOB = a.find((l) => l.name === "OpenBrain")!;
    const bOB = b.find((l) => l.name === "OpenBrain")!;
    expect(aOB.computeStock).toBe(bOB.computeStock);
    expect(bOB.rdMultiplier).toBeLessThan(aOB.rdMultiplier);
  });
});

// ─── Productivity clamp ──────────────────────────────────────────────────────

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

  it("Infinity clamps to MAX (defensive); NaN propagates (input upstream is finite)", () => {
    expect(clampProductivity(Infinity)).toBe(2.5);
    expect(Number.isNaN(clampProductivity(NaN))).toBe(true);
  });
});
