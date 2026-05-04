/**
 * Calibration harness for the live R&D growth formula.
 *
 * Validates that the formula in `src/lib/game-data.ts` (`computeLabGrowth`):
 *   - Tracks the AI-2027 Race CSV at default play (OpenBrain anchor)
 *   - Produces a sensible Slowdown shape under modelRollback events
 *   - Holds compute monotonicity at saturation (no MAX_GROWTH_FACTOR-style ties)
 *   - Stalls cleanly at 0% research (no phantom growth)
 *
 * Live constants (sourced from game-data.ts):
 *   PERFORMANCE_SENSITIVITY = 1.2     (calibration knob: how aggressively
 *                                       outperforming canonical scales growth)
 *   SPILLOVER_RATE          = 0.15    (knowledge diffusion floor on ratio,
 *                                       research-gated; trailing labs catch ~15%
 *                                       of canonical pace at 50% research)
 *   maxMultiplier(round)              (narrative ASI ceiling: 200/200/2000/15000)
 *
 * Re-run after any LAB_PROGRESSION change:
 *   npx tsx scripts/calibrate-rd.ts
 *
 * Ground truth: /scenarios/Charts (Compute Breakdown and R&D Progress) for TTX
 *   - Timelines.csv (Race) and Timelines - Slowdown.csv.
 */
import { LAB_PROGRESSION } from "../src/lib/game-data";

interface Lab {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { deployment: number; research: number; safety: number };
  productivity?: number;
}

// ── Constants mirrored from convex/gameData.ts (kept in sync manually) ──
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

// CSV ground truth (Q1 2028 → Q1 2029 quarterly periods, mapping to game R0–R4)
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

// ── Pure-function reimplementation of computeLabGrowth (live formula) ──
const CANONICAL_RD_TRAJECTORY: Record<number, number> = { 0: 3, 1: 10, 2: 100, 3: 1000, 4: 10000 };
const CANONICAL_RESEARCH_PCT = 50;
const MIN_MULTIPLIER = 0.1;

function canonicalStockBefore(round: number): number {
  let total = 22; // OpenBrain start
  for (let r = 1; r < round; r++) {
    const share = DEFAULT_COMPUTE_SHARES[r]?.OpenBrain ?? 0;
    total += Math.round((NEW_COMPUTE_PER_ROUND[r] ?? 0) * share / 100);
  }
  return total;
}

interface FormulaParams {
  performanceSensitivity: number;
  spilloverRate: number;
}

function applyRound(labs: Lab[], round: number, params: FormulaParams): Lab[] {
  const newComputeTotal = NEW_COMPUTE_PER_ROUND[round] ?? 3;
  const shares = DEFAULT_COMPUTE_SHARES[round] ?? {};
  const totalPreStock = labs.reduce((s, l) => s + l.computeStock, 0);

  const canonicalStock = canonicalStockBefore(round);
  const canonicalMult = CANONICAL_RD_TRAJECTORY[round - 1] ?? 1;
  const canonicalEffectiveRd = canonicalStock * (CANONICAL_RESEARCH_PCT / 100) * canonicalMult;
  const canonicalNextMult = CANONICAL_RD_TRAJECTORY[round] ?? canonicalMult;
  const universalGrowthFactor = canonicalNextMult / Math.max(MIN_MULTIPLIER, canonicalMult);
  const maxMult = LAB_PROGRESSION.maxMultiplier(round);

  return labs.map((lab) => {
    const baseShareFromMap = shares[lab.name];
    const baseShare = baseShareFromMap !== undefined
      ? newComputeTotal * baseShareFromMap / 100
      : newComputeTotal * lab.computeStock / Math.max(1, totalPreStock);
    const revenueMult = REVENUE_FLOOR + 0.01 * lab.allocation.deployment;
    const newCompute = Math.round(baseShare * (STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) * revenueMult));

    const productivity = lab.productivity ?? 1;
    const effectiveRd = lab.computeStock * (lab.allocation.research / 100) * lab.rdMultiplier * productivity;
    const rawRatio = effectiveRd / Math.max(1, canonicalEffectiveRd);
    const diffusionFloor = params.spilloverRate * (lab.allocation.research / CANONICAL_RESEARCH_PCT);
    const ratio = Math.max(diffusionFloor, rawRatio);
    const modifier = Math.pow(ratio, params.performanceSensitivity);
    const factor = 1 + (universalGrowthFactor - 1) * modifier;
    const candidate = lab.rdMultiplier * Math.max(1, factor);
    const newMult = Math.round(Math.max(MIN_MULTIPLIER, Math.min(maxMult, candidate)) * 10) / 10;

    return { ...lab, rdMultiplier: newMult, computeStock: lab.computeStock + newCompute };
  });
}

type Rollback = { round: number; lab: string; factor: number };

function runScenario(
  params: FormulaParams,
  rollbacks: Rollback[] = [],
  allocationOverrides: Record<number, Partial<Record<string, Lab["allocation"]>>> = {},
): Lab[][] {
  let labs = STARTING_LABS.map((l) => ({ ...l, allocation: { ...l.allocation } }));
  const states: Lab[][] = [labs];
  for (let round = 1; round <= 4; round++) {
    for (const r of rollbacks.filter((rb) => rb.round === round)) {
      labs = labs.map((l) => l.name === r.lab
        ? { ...l, rdMultiplier: Math.max(1, l.rdMultiplier * r.factor) }
        : l);
    }
    const overrides = allocationOverrides[round] ?? {};
    labs = labs.map((l) => overrides[l.name] ? { ...l, allocation: overrides[l.name]! } : l);
    labs = applyRound(labs, round, params);
    states.push(labs);
  }
  return states;
}

function logspaceMape(states: Lab[][], expected: Record<number, RoundTruth>): { overall: number; perLab: RoundTruth } {
  const labs: Array<keyof RoundTruth> = ["OpenBrain", "DeepCent", "Conscienta"];
  const errors: Record<keyof RoundTruth, number[]> = { OpenBrain: [], DeepCent: [], Conscienta: [] };
  for (let r = 1; r <= 4; r++) {
    for (const lab of labs) {
      const sim = states[r].find((l) => l.name === lab)!.rdMultiplier;
      const exp = expected[r][lab];
      // Log-space relative error captures geometric distance better than linear MAPE
      // when values span orders of magnitude.
      errors[lab].push(Math.abs(Math.log(sim / exp)));
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

function fmt(v: number): string {
  if (v >= 10000) return (v / 1000).toFixed(0) + "k";
  if (v >= 1000) return v.toFixed(0).padStart(5);
  return v.toFixed(1).padStart(5);
}

function printTrajectory(label: string, sim: Lab[][], expected: Record<number, RoundTruth>): void {
  console.log(`\n${label}`);
  console.log(`  Round  │  OB sim/csv         │  DC sim/csv         │  Cs sim/csv`);
  console.log(`  ───────┼─────────────────────┼─────────────────────┼─────────────────────`);
  for (let r = 0; r <= 4; r++) {
    const s = sim[r], e = expected[r];
    const ob = s.find((l) => l.name === "OpenBrain")!.rdMultiplier;
    const dc = s.find((l) => l.name === "DeepCent")!.rdMultiplier;
    const cs = s.find((l) => l.name === "Conscienta")!.rdMultiplier;
    console.log(
      `  R${r}     │  ${fmt(ob)} / ${fmt(e.OpenBrain).padStart(5)}    │  ${fmt(dc)} / ${fmt(e.DeepCent).padStart(5)}    │  ${fmt(cs)} / ${fmt(e.Conscienta).padStart(5)}`,
    );
  }
}

// ── Main ──
function main(): void {
  console.log("AI-2027 R&D formula calibration (live formula)");
  console.log("==============================================\n");

  const live: FormulaParams = {
    performanceSensitivity: LAB_PROGRESSION.PERFORMANCE_SENSITIVITY,
    spilloverRate: LAB_PROGRESSION.SPILLOVER_RATE,
  };
  console.log(`Live constants:  ps=${live.performanceSensitivity}  spillover=${(live.spilloverRate * 100).toFixed(0)}%`);
  console.log(`maxMultiplier:   R1/R2=200  R3=2000  R4=15000  (ASI ceiling)`);

  // Race scenario
  const race = runScenario(live);
  printTrajectory("Race scenario (default play)", race, RACE_CSV);
  const raceErr = logspaceMape(race, RACE_CSV);
  console.log(`  Log-space error: overall=${raceErr.overall.toFixed(1)}%  OB=${raceErr.perLab.OpenBrain.toFixed(1)}% DC=${raceErr.perLab.DeepCent.toFixed(1)}% Cs=${raceErr.perLab.Conscienta.toFixed(1)}%`);

  // Slowdown scenario: OB modelRollback ×0.5 at R2 + R3, allocation pivot to safety
  const slowdownRollbacks: Rollback[] = [
    { round: 2, lab: "OpenBrain", factor: 0.5 },
    { round: 3, lab: "OpenBrain", factor: 0.5 },
  ];
  const slowdownAllocs: Record<number, Partial<Record<string, Lab["allocation"]>>> = {
    2: { OpenBrain: { deployment: 30, research: 20, safety: 50 } },
    3: { OpenBrain: { deployment: 30, research: 20, safety: 50 } },
    4: { OpenBrain: { deployment: 30, research: 60, safety: 10 } },
  };
  const slow = runScenario(live, slowdownRollbacks, slowdownAllocs);
  printTrajectory("Slowdown scenario (OB rollback ×0.5 R2+R3 + safety pivot)", slow, SLOWDOWN_CSV);
  const slowErr = logspaceMape(slow, SLOWDOWN_CSV);
  console.log(`  Log-space error: overall=${slowErr.overall.toFixed(1)}%`);

  // Compute monotonicity check (the MAX_GROWTH_FACTOR bug regression)
  console.log("\n=== Compute monotonicity at saturation ===");
  console.log("Two labs identical except compute, both 100% research.");
  console.log("  pre-R3 mult │  small (28u)  │  large (56u)  │  ratio (>1 = compute wins)");
  console.log("  ────────────┼───────────────┼───────────────┼────────────");
  for (const startMult of [50, 200, 500, 1000, 5000]) {
    const small: Lab = { name: "S", computeStock: 28, rdMultiplier: startMult,
      allocation: { deployment: 0, research: 100, safety: 0 } };
    const large: Lab = { ...small, name: "L", computeStock: 56 };
    const sAfter = applyRound([small], 3, live)[0].rdMultiplier;
    const lAfter = applyRound([large], 3, live)[0].rdMultiplier;
    const monotonic = lAfter > sAfter;
    const tieAtCap = lAfter === sAfter && lAfter === LAB_PROGRESSION.maxMultiplier(3);
    const verdict = monotonic ? "✓ monotonic" : tieAtCap ? "= ASI-tie" : "✗ FAIL";
    console.log(`  ${String(startMult).padStart(5)}×       │  ${fmt(sAfter).padStart(7)}      │  ${fmt(lAfter).padStart(7)}      │  ${(lAfter / sAfter).toFixed(2)}× ${verdict}`);
  }

  // Allocation responsiveness sweep
  console.log("\n=== Allocation responsiveness (R3, OB-equiv compute & multiplier) ===");
  console.log("Sweep research% — should be smoothly increasing, never below starting mult.");
  console.log("  research%  │  growth (mult=100 → newMult)");
  console.log("  ───────────┼──────────────────────────────");
  for (const research of [0, 10, 25, 50, 75, 100]) {
    const lab: Lab = {
      name: "T", computeStock: 47, rdMultiplier: 100,
      allocation: { deployment: 100 - research, research, safety: 0 },
    };
    const after = applyRound([lab], 3, live)[0].rdMultiplier;
    console.log(`  ${String(research).padStart(3)}%       │  100 → ${fmt(after).padStart(7)}${after < 100 ? "  ⚠ REGRESSION" : ""}`);
  }

  // Player agency: aggressive Conscienta
  const aggrCs = runScenario(live, [], {
    1: { Conscienta: { deployment: 0, research: 100, safety: 0 } },
    2: { Conscienta: { deployment: 0, research: 100, safety: 0 } },
    3: { Conscienta: { deployment: 0, research: 100, safety: 0 } },
    4: { Conscienta: { deployment: 0, research: 100, safety: 0 } },
  });
  console.log("\n=== Player agency: Conscienta goes 100% research from R1 ===");
  for (let r = 0; r <= 4; r++) {
    const s = aggrCs[r];
    const ob = s.find((l) => l.name === "OpenBrain")!.rdMultiplier;
    const dc = s.find((l) => l.name === "DeepCent")!.rdMultiplier;
    const cs = s.find((l) => l.name === "Conscienta")!.rdMultiplier;
    console.log(`  R${r}     OB=${fmt(ob).padStart(5)}  DC=${fmt(dc).padStart(5)}  Cs=${fmt(cs).padStart(5)}`);
  }
}

main();
