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
 *                drag = (lab_effRd / effort_leader_effRd)^LEADER_DRAG  (live, no phantom)
 *                diffusion = research × √(self.mult / capability_leader.mult) × DIFFUSION_RATE
 *                            × (1 + COOPERATION_BOOST · worldSafety)
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

  // Non-circular CSV sanity check. formulaExpected is a snapshot of the formula's
  // own output; assertions against it would still pass if the formula drifted
  // wholesale away from the AI-2027 trajectory. This pins the leader's R4 against
  // independent ground truth (CSV) at a wide tolerance — catches regressions that
  // re-pin formulaExpected mechanically without flagging that the dramatic arc
  // has shifted.
  it("race scenario: OB R4 within 0.5×–2× of CSV target (independent sanity check)", () => {
    const traj = runScenarioThroughFormula(SCENARIOS[0]);
    const obR4 = traj.get("OpenBrain")![4];
    const csvR4 = SCENARIOS[0].csvTarget!.OpenBrain[4];
    expect(obR4).toBeGreaterThan(csvR4 * 0.5);
    expect(obR4).toBeLessThan(csvR4 * 2);
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
    const csInput = labs.find((l) => l.name === "Conscienta")!;
    const result = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const cs = result.find((l) => l.name === "Conscienta")!;
    // Multiplier should be unchanged from the input (no growth at all).
    // Pin to the input lab's mult, not a literal — input could change.
    expect(cs.rdMultiplier).toBe(csInput.rdMultiplier);
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

  it("acquisition arrives in returned stock", () => {
    // Acquisition runs each round (proportional share of NEW_COMPUTE_PER_GAME_ROUND).
    const labs = fresh();
    const r = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (const lab of r) {
      const original = labs.find((l) => l.name === lab.name)!;
      expect(lab.computeStock).toBeGreaterThan(original.computeStock);
    }
  });

  it("R&D this round uses pre-acquisition stock (regression: prior bug fed acquisition into same-round R&D)", () => {
    // The prior-redesign bug: acquisition was added to computeStock BEFORE
    // computing effectiveRd, so each lab got a free multiplier boost from compute
    // that "hadn't yet landed." This test pins the fix.
    //
    // Strategy: manually pre-add OpenBrain's expected R1 acquisition to its
    // input compute, run growth with the SAME total stock OB would have at the
    // end of R1 — then compare R&D output to a normal run. If R&D used pre-
    // acquisition stock, the manual-prefatten run produces a higher rdMultiplier
    // (because prefatten run sees more compute when computing R&D).
    const labs = fresh();
    const normal = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const obNormal = normal.find((l) => l.name === "OpenBrain")!;
    const obAcquisition = obNormal.computeStock - 22;
    expect(obAcquisition).toBeGreaterThan(0);

    const prefattenedLabs = fresh().map((l) =>
      l.name === "OpenBrain" ? { ...l, computeStock: 22 + obAcquisition } : l,
    );
    const prefattened = computeLabGrowth(prefattenedLabs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const obPrefattened = prefattened.find((l) => l.name === "OpenBrain")!;

    // If R&D this round used post-acquisition stock, both runs would produce
    // the same multiplier (because OB's effRd input would be identical).
    // The fix means the prefattened run sees more compute → higher mult.
    expect(obPrefattened.rdMultiplier).toBeGreaterThan(obNormal.rdMultiplier);
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

  it("single-lab array — lab is its own leader, no NaN, growth happens", () => {
    // Founder lab edge case: only one active lab. labRatio = 1 (self is its own
    // effort leader), no peer for diffusion gap (gapRatio = 1). Should produce
    // finite, sensible growth.
    const lone = [{ ...DEFAULT_LABS[0], allocation: { ...DEFAULT_LABS[0].allocation } }];
    const result = computeLabGrowth(lone, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const ob = result[0];
    expect(Number.isFinite(ob.rdMultiplier)).toBe(true);
    expect(Number.isFinite(ob.computeStock)).toBe(true);
    expect(ob.rdMultiplier).toBeGreaterThan(DEFAULT_LABS[0].rdMultiplier);
  });

  it("capability leader at 0% research — drag falls back to effort leader, no spike", () => {
    // The singularity guard: if the multiplier-leader allocates 0% to research,
    // they have effRd = 0. Naive "leader = capability leader" would make
    // labRatio = effRd/0 → undefined or fall back to 1, letting trailing labs
    // grow at MAX. The fix uses effort leader (max effRd this round), so
    // trailing labs are still dragged by the lab that's actually researching.
    const obSandbags = new Map<string, { deployment: number; research: number; safety: number }>([
      ["OpenBrain", { deployment: 100, research: 0, safety: 0 }], // capability leader, 0 research
      ["DeepCent", { deployment: 30, research: 70, safety: 0 }], // becomes effort leader
      ["Conscienta", { deployment: 50, research: 43, safety: 7 }],
    ]);
    const result = computeLabGrowth(fresh(), obSandbags, 1, 200);

    const ob = result.find((l) => l.name === "OpenBrain")!;
    const dc = result.find((l) => l.name === "DeepCent")!;
    const cs = result.find((l) => l.name === "Conscienta")!;

    // OB at 0% research → no growth.
    expect(ob.rdMultiplier).toBe(3);
    // DC and Cs grow but DC (effort leader) outpaces Cs.
    expect(dc.rdMultiplier).toBeGreaterThan(2.5);
    expect(cs.rdMultiplier).toBeGreaterThan(2);
    expect(dc.rdMultiplier).toBeGreaterThan(cs.rdMultiplier);
    // Critical assertion — Cs should NOT spike to RSI ceiling. Without the
    // effort-leader fallback, Cs.labRatio would default to 1 and growth ≈ 10×.
    // With the fix, Cs is dragged by DC (effort leader), so growth is modest.
    expect(cs.rdMultiplier).toBeLessThan(2 * 10); // strictly under MAX_GROWTH
  });

  it("founder lab not in DEFAULT_COMPUTE_SHARES falls back to proportional acquisition", () => {
    // Player-founded labs aren't in DEFAULT_COMPUTE_SHARES — acquisition goes
    // through the proportional fallback (lab.computeStock / totalPreStock).
    const founderLab = {
      name: "PlayerFounded",
      computeStock: 5,
      rdMultiplier: 1,
      allocation: { deployment: 50, research: 50, safety: 0 },
    };
    const labs = [...fresh(), founderLab];
    const result = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    const founded = result.find((l) => l.name === "PlayerFounded")!;
    // Should receive SOME acquisition (proportional to its 5/(22+17+14+5)=8.6% share).
    expect(founded.computeStock).toBeGreaterThan(5);
    // Should grow modestly via diffusion (high gap to OB) — not zero, not max.
    expect(founded.rdMultiplier).toBeGreaterThan(1);
    expect(founded.rdMultiplier).toBeLessThan(5);
  });

  it("productivity is one-round only — first call's mods don't carry into second", () => {
    // The pipeline clears pendingProductivityMods between rounds; the function
    // just reads what's passed in. Verify a no-mod call after a mod call
    // matches the no-mod baseline (i.e. mods on call 1 don't pollute call 2).
    const labs = fresh();
    const baseline = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200, new Map([["OpenBrain", 0.5]]));
    const afterModded = computeLabGrowth(labs, DEFAULT_LAB_ALLOCATIONS, 1, 200);
    for (let i = 0; i < baseline.length; i++) {
      expect(afterModded[i].rdMultiplier).toBe(baseline[i].rdMultiplier);
      expect(afterModded[i].computeStock).toBe(baseline[i].computeStock);
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
