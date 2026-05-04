/**
 * Calibration harness for the R&D growth formula.
 *
 * Compares the live formula (PR 45: canonical-trajectory power-law) against
 * the historical PR 44 alternative (pure compute-share) and against ground-
 * truth multipliers from the AI-2027 source CSVs (Race + Slowdown).
 *
 * The script is the evidence behind the PR-45-wins decision. Headline:
 *   - PR 44 had a structural Slowdown bug (zero-sum across labs): when OB rolls
 *     back, DC's rdShare jumps and DC explodes to 6288× vs CSV's 250×.
 *   - PR 45 with PERFORMANCE_SENSITIVITY=1.2, MIN_GROWTH_FACTOR=0 produces
 *     ~26% Race MAPE and qualitatively-correct Slowdown shape.
 *
 * Re-run after any change to LAB_PROGRESSION constants to confirm the formula
 * still tracks the source CSVs:
 *   npx tsx scripts/calibrate-rd.ts
 *
 * Ground truth: /scenarios/Charts (Compute Breakdown and R&D Progress) for TTX
 *   - Timelines.csv (Race) and Timelines - Slowdown.csv.
 */

interface Lab {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { deployment: number; research: number; safety: number };
}

// ── Default state (mirrors convex/gameData.ts DEFAULT_LABS at start of game) ──
const STARTING_LABS: Lab[] = [
  { name: "OpenBrain",  computeStock: 22, rdMultiplier: 3,   allocation: { deployment: 47, research: 50, safety: 3 } },
  { name: "DeepCent",   computeStock: 17, rdMultiplier: 2.5, allocation: { deployment: 42, research: 55, safety: 3 } },
  { name: "Conscienta", computeStock: 14, rdMultiplier: 2,   allocation: { deployment: 50, research: 43, safety: 7 } },
];

const NEW_COMPUTE_PER_ROUND: Record<number, number> = { 1: 31, 2: 35, 3: 24, 4: 15 };

const DEFAULT_COMPUTE_SHARES: Record<number, Record<string, number>> = {
  1: { OpenBrain: 35.5, DeepCent: 19.4, Conscienta: 19.4 },
  2: { OpenBrain: 45.7, DeepCent: 22.9, Conscienta: 20.0 },
  3: { OpenBrain: 62.5, DeepCent: 25.0, Conscienta: 20.8 },
  4: { OpenBrain: 65.0, DeepCent: 25.0, Conscienta: 15.0 },
};

const STRUCTURAL_RATIO = 0.60;
const REVENUE_FLOOR = 0.5;
const MIN_MULTIPLIER = 0.1;

// ── Ground truth from CSVs (period column = R&D Progress Multiplier, cumulative) ──
// Game starts at January 2028, rounds end at April/July/October 2028 and January 2029.
type RoundTruth = { OpenBrain: number; DeepCent: number; Conscienta: number };

const RACE_CSV: Record<number, RoundTruth> = {
  0: { OpenBrain: 3,     DeepCent: 2.5, Conscienta: 2 },
  1: { OpenBrain: 10,    DeepCent: 5.7, Conscienta: 5 },
  2: { OpenBrain: 100,   DeepCent: 22,  Conscienta: 15 },
  3: { OpenBrain: 1000,  DeepCent: 80,  Conscienta: 40 },
  4: { OpenBrain: 10000, DeepCent: 100, Conscienta: 50 },
};

const SLOWDOWN_CSV: Record<number, RoundTruth> = {
  0: { OpenBrain: 3,   DeepCent: 2.5, Conscienta: 2 },
  1: { OpenBrain: 10,  DeepCent: 5.7, Conscienta: 5 },
  2: { OpenBrain: 40,  DeepCent: 35,  Conscienta: 15 },
  3: { OpenBrain: 55,  DeepCent: 80,  Conscienta: 40 },
  4: { OpenBrain: 500, DeepCent: 250, Conscienta: 125 },
};

// ── Formula PR 44: pure compute-share ──
const PR44_POOL_GROWTH: Record<number, number> = { 1: 5, 2: 15, 3: 11, 4: 10 };

function applyPR44(labs: Lab[], round: number, poolGrowth: Record<number, number> = PR44_POOL_GROWTH): Lab[] {
  const newComputeTotal = NEW_COMPUTE_PER_ROUND[round] ?? 3;
  const shares = DEFAULT_COMPUTE_SHARES[round] ?? {};
  const totalPreStock = labs.reduce((s, l) => s + l.computeStock, 0);
  const pg = poolGrowth[round] ?? 5;

  const effectiveRd = labs.map((l) => l.computeStock * (l.allocation.research / 100) * l.rdMultiplier);
  const totalEffectiveRd = effectiveRd.reduce((s, v) => s + v, 0);

  return labs.map((lab, i) => {
    const baseShareFromMap = shares[lab.name];
    const baseShare = baseShareFromMap !== undefined
      ? newComputeTotal * baseShareFromMap / 100
      : newComputeTotal * lab.computeStock / Math.max(1, totalPreStock);
    const revenueMult = REVENUE_FLOOR + 0.01 * lab.allocation.deployment;
    const newCompute = Math.round(baseShare * (STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) * revenueMult));

    const rdShare = effectiveRd[i] / Math.max(1, totalEffectiveRd);
    const newMultiplier = Math.round(
      Math.max(MIN_MULTIPLIER, lab.rdMultiplier * (1 + rdShare * pg)) * 10,
    ) / 10;

    return { ...lab, rdMultiplier: newMultiplier, computeStock: lab.computeStock + newCompute };
  });
}

// ── Formula PR 45: canonical-trajectory power-law ──
const PR45_CANONICAL_RD_TRAJECTORY: Record<number, number> = { 0: 3, 1: 10, 2: 100, 3: 1000, 4: 10000 };
const PR45_CANONICAL_RESEARCH_PCT = 50;
const PR45_CANONICAL_REFERENCE_LAB = "OpenBrain";

function pr45CanonicalStockBefore(round: number): number {
  const obStart = STARTING_LABS.find((l) => l.name === PR45_CANONICAL_REFERENCE_LAB)!.computeStock;
  let total = obStart;
  for (let r = 1; r < round; r++) {
    const share = DEFAULT_COMPUTE_SHARES[r]?.[PR45_CANONICAL_REFERENCE_LAB] ?? 0;
    total += Math.round((NEW_COMPUTE_PER_ROUND[r] ?? 0) * share / 100);
  }
  return Math.max(0, total);
}

interface PR45Constants {
  PERFORMANCE_SENSITIVITY: number;
  MIN_GROWTH_FACTOR: number;
  MAX_GROWTH_FACTOR: number;
}
// Live values (in sync with LAB_PROGRESSION in src/lib/game-data.ts).
// Calibrated for ~26% Race-CSV MAPE — see header for full decision context.
const PR45_DEFAULTS: PR45Constants = { PERFORMANCE_SENSITIVITY: 1.2, MIN_GROWTH_FACTOR: 0, MAX_GROWTH_FACTOR: 4.0 };

function applyPR45(labs: Lab[], round: number, k: PR45Constants = PR45_DEFAULTS): Lab[] {
  const newComputeTotal = NEW_COMPUTE_PER_ROUND[round] ?? 3;
  const shares = DEFAULT_COMPUTE_SHARES[round] ?? {};
  const totalPreStock = labs.reduce((s, l) => s + l.computeStock, 0);

  const canonicalStock = pr45CanonicalStockBefore(round);
  const canonicalMultiplier = PR45_CANONICAL_RD_TRAJECTORY[round - 1] ?? PR45_CANONICAL_RD_TRAJECTORY[0] ?? 1;
  const canonicalEffectiveRd = canonicalStock * (PR45_CANONICAL_RESEARCH_PCT / 100) * canonicalMultiplier;
  const canonicalNextMultiplier = PR45_CANONICAL_RD_TRAJECTORY[round] ?? canonicalMultiplier;
  const universalGrowthFactor = canonicalNextMultiplier / Math.max(MIN_MULTIPLIER, canonicalMultiplier);

  return labs.map((lab) => {
    const baseShareFromMap = shares[lab.name];
    const baseShare = baseShareFromMap !== undefined
      ? newComputeTotal * baseShareFromMap / 100
      : newComputeTotal * lab.computeStock / Math.max(1, totalPreStock);
    const revenueMult = REVENUE_FLOOR + 0.01 * lab.allocation.deployment;
    const newCompute = Math.round(baseShare * (STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) * revenueMult));

    const effectiveRd = lab.computeStock * (lab.allocation.research / 100) * lab.rdMultiplier;
    const performanceRatio = effectiveRd / Math.max(1, canonicalEffectiveRd);
    const growthModifier = Math.min(
      k.MAX_GROWTH_FACTOR,
      Math.max(k.MIN_GROWTH_FACTOR, Math.pow(performanceRatio, k.PERFORMANCE_SENSITIVITY)),
    );
    const rawFactor = 1 + (universalGrowthFactor - 1) * growthModifier;
    const effectiveFactor = Math.max(k.MIN_GROWTH_FACTOR, rawFactor);
    const newMultiplier = Math.round(
      Math.max(MIN_MULTIPLIER, lab.rdMultiplier * effectiveFactor) * 10,
    ) / 10;

    return { ...lab, rdMultiplier: newMultiplier, computeStock: lab.computeStock + newCompute };
  });
}

// ── modelRollback: deterministic ×0.5, floor 1 ──
function applyRollback(labs: Lab[], targetName: string, factor = 0.5): Lab[] {
  return labs.map((l) =>
    l.name === targetName ? { ...l, rdMultiplier: Math.max(1, l.rdMultiplier * factor) } : l,
  );
}

// ── Scenario runner ──
type GrowthFn = (labs: Lab[], round: number) => Lab[];
type Rollback = { round: number; lab: string; factor: number };

function runScenario(
  growth: GrowthFn,
  rollbacks: Rollback[] = [],
  allocationOverrides: Record<number, Partial<Record<string, Lab["allocation"]>>> = {},
): RoundTruth[] {
  let labs = STARTING_LABS.map((l) => ({ ...l, allocation: { ...l.allocation } }));
  const trajectory: RoundTruth[] = [labsToTruth(labs)];

  for (let round = 1; round <= 4; round++) {
    // Pre-growth: apply rollbacks scheduled for this round
    for (const r of rollbacks.filter((rb) => rb.round === round)) {
      labs = applyRollback(labs, r.lab, r.factor);
    }
    // Pre-growth: apply allocation overrides for this round
    const overrides = allocationOverrides[round] ?? {};
    labs = labs.map((l) => overrides[l.name] ? { ...l, allocation: overrides[l.name]! } : l);
    // Grow
    labs = growth(labs, round);
    trajectory.push(labsToTruth(labs));
  }
  return trajectory;
}

function labsToTruth(labs: Lab[]): RoundTruth {
  return {
    OpenBrain:  labs.find((l) => l.name === "OpenBrain")!.rdMultiplier,
    DeepCent:   labs.find((l) => l.name === "DeepCent")!.rdMultiplier,
    Conscienta: labs.find((l) => l.name === "Conscienta")!.rdMultiplier,
  };
}

// ── Comparison ──
function mape(simulated: RoundTruth[], expected: Record<number, RoundTruth>): { overall: number; perLab: RoundTruth } {
  const labs: Array<keyof RoundTruth> = ["OpenBrain", "DeepCent", "Conscienta"];
  const errors: Record<keyof RoundTruth, number[]> = { OpenBrain: [], DeepCent: [], Conscienta: [] };
  for (let r = 1; r <= 4; r++) {
    for (const lab of labs) {
      const sim = simulated[r][lab];
      const exp = expected[r][lab];
      errors[lab].push(Math.abs(sim - exp) / exp);
    }
  }
  const perLab: RoundTruth = {
    OpenBrain:  100 * errors.OpenBrain.reduce((s, v) => s + v, 0) / errors.OpenBrain.length,
    DeepCent:   100 * errors.DeepCent.reduce((s, v) => s + v, 0) / errors.DeepCent.length,
    Conscienta: 100 * errors.Conscienta.reduce((s, v) => s + v, 0) / errors.Conscienta.length,
  };
  const overall = (perLab.OpenBrain + perLab.DeepCent + perLab.Conscienta) / 3;
  return { overall, perLab };
}

function fmt(v: number): string { return v.toFixed(1).padStart(8); }

function printTrajectory(label: string, sim: RoundTruth[], expected: Record<number, RoundTruth>): void {
  console.log(`\n${label}`);
  console.log(`  Round  │  OB sim/exp        │  DC sim/exp        │  Cs sim/exp`);
  console.log(`  ───────┼────────────────────┼────────────────────┼────────────────────`);
  for (let r = 0; r <= 4; r++) {
    const s = sim[r], e = expected[r];
    console.log(
      `  R${r}     │  ${fmt(s.OpenBrain)} / ${fmt(e.OpenBrain)} │  ${fmt(s.DeepCent)} / ${fmt(e.DeepCent)} │  ${fmt(s.Conscienta)} / ${fmt(e.Conscienta)}`,
    );
  }
}

// ── Allocation sensitivity sweep (sanity check) ──
function allocationSweep(growth: GrowthFn, formulaName: string): void {
  console.log(`\n=== Allocation sensitivity sweep — ${formulaName} ===`);
  console.log(`  Holding compute fixed at OpenBrain default. Sweep research% from 0 to 100, single-round growth from R1 to test.`);
  console.log(`  research%  │  OB R1 multiplier (start=3)`);
  console.log(`  ───────────┼─────────────────────────────`);
  for (const research of [0, 10, 25, 50, 69, 85, 100]) {
    const safety = Math.min(100 - research, 5);
    const deployment = 100 - research - safety;
    const labs = STARTING_LABS.map((l) =>
      l.name === "OpenBrain"
        ? { ...l, allocation: { research, safety, deployment } }
        : { ...l, allocation: { ...l.allocation } },
    );
    const out = growth(labs, 1);
    const ob = out.find((l) => l.name === "OpenBrain")!.rdMultiplier;
    console.log(`  ${String(research).padStart(3)}%       │  ${ob.toFixed(2)}${ob < 3 ? "  ⚠ REGRESSION" : ""}`);
  }
}

// ── Main ──
function main(): void {
  console.log("AI-2027 R&D formula calibration");
  console.log("================================\n");

  // Race scenario: default allocations, no rollbacks
  const race44 = runScenario(applyPR44);
  const race45 = runScenario(applyPR45);
  printTrajectory("PR 44 × Race CSV", race44, RACE_CSV);
  console.log(`  MAPE: ${mape(race44, RACE_CSV).overall.toFixed(1)}%  (per-lab OB=${mape(race44, RACE_CSV).perLab.OpenBrain.toFixed(1)}% DC=${mape(race44, RACE_CSV).perLab.DeepCent.toFixed(1)}% Cs=${mape(race44, RACE_CSV).perLab.Conscienta.toFixed(1)}%)`);
  printTrajectory("PR 45 × Race CSV", race45, RACE_CSV);
  console.log(`  MAPE: ${mape(race45, RACE_CSV).overall.toFixed(1)}%  (per-lab OB=${mape(race45, RACE_CSV).perLab.OpenBrain.toFixed(1)}% DC=${mape(race45, RACE_CSV).perLab.DeepCent.toFixed(1)}% Cs=${mape(race45, RACE_CSV).perLab.Conscienta.toFixed(1)}%)`);

  // Slowdown scenario: rollback OB at R2 (×0.4 to get 100→40) and R3 (×0.275 — but need ≥0.4 floor)
  // Realistically: rollback ×0.5 at R2 + R3, plus OB allocation pivot to safety from R2
  const slowdownRollbacks: Rollback[] = [
    { round: 2, lab: "OpenBrain", factor: 0.5 }, // ~Safer pivot at R2 (model rollback)
    { round: 3, lab: "OpenBrain", factor: 0.5 }, // sustained safer at R3
  ];
  const slowdownAllocs: Record<number, Partial<Record<string, Lab["allocation"]>>> = {
    2: { OpenBrain: { deployment: 30, research: 20, safety: 50 } },
    3: { OpenBrain: { deployment: 30, research: 20, safety: 50 } },
    4: { OpenBrain: { deployment: 30, research: 60, safety: 10 } }, // recovery at R4
  };

  const slow44 = runScenario(applyPR44, slowdownRollbacks, slowdownAllocs);
  const slow45 = runScenario(applyPR45, slowdownRollbacks, slowdownAllocs);
  printTrajectory("PR 44 × Slowdown CSV (×0.5 rollback OB R2+R3, OB→safety)", slow44, SLOWDOWN_CSV);
  console.log(`  MAPE: ${mape(slow44, SLOWDOWN_CSV).overall.toFixed(1)}%`);
  printTrajectory("PR 45 × Slowdown CSV", slow45, SLOWDOWN_CSV);
  console.log(`  MAPE: ${mape(slow45, SLOWDOWN_CSV).overall.toFixed(1)}%`);

  // Allocation sensitivity check — does growth scale smoothly with research%?
  allocationSweep(applyPR44, "PR 44");
  allocationSweep(applyPR45, "PR 45 (default constants)");
  allocationSweep((labs, round) => applyPR45(labs, round, { ...PR45_DEFAULTS, MIN_GROWTH_FACTOR: 0 }), "PR 45 (MIN_GROWTH_FACTOR=0)");

  // Constant sweeps for the closer formula
  console.log("\n=== PR 44 POOL_GROWTH sweep (Race scenario only) ===");
  console.log("  Try ±20% per round to find best joint Race fit");
  for (const scale of [0.8, 0.9, 1.0, 1.1, 1.2]) {
    const tweaked: Record<number, number> = {
      1: PR44_POOL_GROWTH[1] * scale,
      2: PR44_POOL_GROWTH[2] * scale,
      3: PR44_POOL_GROWTH[3] * scale,
      4: PR44_POOL_GROWTH[4] * scale,
    };
    const sim = runScenario((labs, r) => applyPR44(labs, r, tweaked));
    console.log(`  scale=${scale.toFixed(1)}  POOL_GROWTH=${JSON.stringify(tweaked)}  MAPE=${mape(sim, RACE_CSV).overall.toFixed(1)}%`);
  }

  console.log("\n=== PR 45 constant sweep (joint Race + Slowdown) ===");
  console.log("  ps    max  min  | Race MAPE | Slowdown MAPE | Joint avg");
  console.log("  ──────────────────┼───────────┼───────────────┼──────────");
  for (const ps of [0.85, 1.0, 1.2, 1.4]) {
    for (const max of [4, 6, 10]) {
      for (const min of [0, 0.05]) {
        const k: PR45Constants = { PERFORMANCE_SENSITIVITY: ps, MIN_GROWTH_FACTOR: min, MAX_GROWTH_FACTOR: max };
        const race = mape(runScenario((labs, r) => applyPR45(labs, r, k)), RACE_CSV).overall;
        const slow = mape(runScenario((labs, r) => applyPR45(labs, r, k), slowdownRollbacks, slowdownAllocs), SLOWDOWN_CSV).overall;
        const joint = (race + slow) / 2;
        console.log(`  ${ps}  ${max}    ${min}   |  ${race.toFixed(1).padStart(6)}%  |   ${slow.toFixed(1).padStart(6)}%    | ${joint.toFixed(1).padStart(6)}%`);
      }
    }
  }

  // Final verdict trajectory under best PR 45 constants
  const best: PR45Constants = { PERFORMANCE_SENSITIVITY: 1.2, MIN_GROWTH_FACTOR: 0, MAX_GROWTH_FACTOR: 4 };
  console.log("\n=== Final: PR 45 with ps=1.2, min=0, max=4 ===");
  printTrajectory("Race", runScenario((labs, r) => applyPR45(labs, r, best)), RACE_CSV);
  printTrajectory("Slowdown", runScenario((labs, r) => applyPR45(labs, r, best), slowdownRollbacks, slowdownAllocs), SLOWDOWN_CSV);
}

main();
