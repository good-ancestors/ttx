/**
 * Calibration script — side-by-side comparison of three lab-growth-formula
 * variants explored during the design of `computeLabGrowth`. Run before tuning
 * LAB_PROGRESSION constants to see how each variant tracks the AI-2027 CSV.
 *
 *   npx tsx scripts/calibrate-lab-growth.ts
 *
 * Variants:
 *   A — minimal physics: tanh saturation only, no drag
 *   B — A + compute-share drag: share^SHARE_DRAG attenuates trailing labs
 *   C — A + leader-ratio drag: (effRd/leaderEffRd)^LEADER_DRAG attenuates trailing labs
 *
 * Formula C was selected for production; the version in game-data.ts is a
 * refinement that splits "leader" into capabilityLeader (for diffusion gap)
 * and effortLeaderEffRd (for drag) to handle the leader-sandbags-research edge
 * case. The script's Formula C uses the simpler unified-leader form for clarity
 * of the design comparison; numbers will agree with production except in
 * pathological allocations. For tightly-pinned regression checks against
 * production, use the test fixtures (src/lib/__fixtures__/lab-growth-canonical.ts).
 *
 * Effective R&D includes RSI feedback: effRd = compute × research × mult^RSI_EXP × productivity.
 * CSV targets (RACE_CSV / SLOWDOWN_CSV) are inlined for self-contained printing.
 */

import {
  DEFAULT_LABS,
  NEW_COMPUTE_PER_GAME_ROUND,
  DEFAULT_COMPUTE_SHARES,
  COMPUTE_ACQUISITION,
} from "@/lib/game-data";

// ── CSV targets, inlined for self-contained comparison ───────────────────────
// Sources:
//   RACE     — scenarios/Charts ... Timelines.csv          (rows 52, 57, 62, 67, 72)
//   SLOWDOWN — scenarios/Charts ... Timelines - Slowdown.csv (rows 52, 57, 62, 67, 72)
// Game R0 = January 2028, R1 = April 2028, ..., R4 = January 2029.
const RACE_CSV: Record<string, Record<number, number>> = {
  OpenBrain:  { 0: 3,    1: 10,   2: 100,   3: 1000, 4: 10000 },
  DeepCent:   { 0: 2.5,  1: 5.7,  2: 22,    3: 80,   4: 100   },
  Conscienta: { 0: 2,    1: 5,    2: 15,    3: 40,   4: 50    },
};
const SLOWDOWN_CSV: Record<string, Record<number, number>> = {
  // Slowdown branch is event-driven (alignment backtrack / model rollback) —
  // not driven by allocation changes. Compare loosely; my SLOWDOWN scenario
  // exercises the formula's response to allocation shifts, not event recovery.
  OpenBrain:  { 0: 3,    1: 10,   2: 40,    3: 55,   4: 500   },
  DeepCent:   { 0: 2.5,  1: 5.7,  2: 35,    3: 80,   4: 250   },
  Conscienta: { 0: 2,    1: 5,    2: 15,    3: 40,   4: 125   },
};

// ── Tunable constants (shared) ───────────────────────────────────────────────
const SCALE = 150;
const MAX_GROWTH = 10;
const RSI_EXP = 1.2;
const DIFFUSION_RATE = 0.15;
// Cooperation: world-level safety allocation amplifies knowledge spillover.
// In cooperative worlds (high safety%), labs share progress openly; in race
// worlds they hoard. Multiplies effective diffusion rate.
const COOPERATION_BOOST = 4;

// Formula B only
const SHARE_DRAG = 0.3;

// ── Types ────────────────────────────────────────────────────────────────────
type Allocation = { deployment: number; research: number; safety: number };
interface LabState {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: Allocation;
}

type FormulaFn = (
  self: LabState,
  productivity: number,
  leader: LabState,
  totalEffRd: number,
  worldSafety: number,
  scale: number,
) => number;

// ── Helpers ──────────────────────────────────────────────────────────────────
function effectiveRd(lab: LabState, productivity: number): number {
  return (
    lab.computeStock *
    (lab.allocation.research / 100) *
    Math.pow(Math.max(0.01, lab.rdMultiplier), RSI_EXP) *
    productivity
  );
}

function leaderOf(labs: LabState[]): LabState {
  return labs.reduce((best, l) => (l.rdMultiplier > best.rdMultiplier ? l : best), labs[0]);
}

// Effective diffusion rate, amplified by world cooperation (safety allocation).
function effectiveDiffusion(worldSafety: number): number {
  return DIFFUSION_RATE * (1 + COOPERATION_BOOST * worldSafety);
}

// ── Formula A: minimal physics ───────────────────────────────────────────────
const formulaA: FormulaFn = (self, productivity, leader, _totalEffRd, worldSafety, scale) => {
  const research = self.allocation.research / 100;
  const hasInputs = self.computeStock > 0 && research > 0;

  const effRd = effectiveRd(self, productivity);
  const selfGrowth = 1 + (MAX_GROWTH - 1) * Math.tanh(effRd / scale);

  const gapRatio = leader.rdMultiplier > 0 ? Math.min(1, self.rdMultiplier / leader.rdMultiplier) : 1;
  const diffusionGrowth = hasInputs
    ? 1 + (MAX_GROWTH - 1) * effectiveDiffusion(worldSafety) * research * Math.sqrt(gapRatio)
    : 1;

  return self.rdMultiplier * Math.max(selfGrowth, diffusionGrowth);
};

// ── Formula B: A + compute-share drag ────────────────────────────────────────
const formulaB: FormulaFn = (self, productivity, leader, totalEffRd, worldSafety, scale) => {
  const research = self.allocation.research / 100;
  const hasInputs = self.computeStock > 0 && research > 0;

  const effRd = effectiveRd(self, productivity);
  const share = totalEffRd > 0 ? effRd / totalEffRd : 0;
  const dragFactor = Math.pow(Math.max(0.001, share), SHARE_DRAG);
  const selfGrowth = 1 + (MAX_GROWTH - 1) * Math.tanh(effRd / scale) * dragFactor;

  const gapRatio = leader.rdMultiplier > 0 ? Math.min(1, self.rdMultiplier / leader.rdMultiplier) : 1;
  const diffusionGrowth = hasInputs
    ? 1 + (MAX_GROWTH - 1) * effectiveDiffusion(worldSafety) * research * Math.sqrt(gapRatio)
    : 1;

  return self.rdMultiplier * Math.max(selfGrowth, diffusionGrowth);
};

// ── Formula C: leader-ratio drag (live leader, no phantom anchor) ────────────
// Replaces share-of-total with ratio-to-leader. This captures "trailing labs
// grow at a fraction of the leader's pace" without having to encode the
// scenario's specific trajectory at runtime.
const LEADER_DRAG = 0.3;
const makeFormulaC = (drag: number): FormulaFn =>
  (self, productivity, leader, _totalEffRd, worldSafety, scale) => {
    const research = self.allocation.research / 100;
    const hasInputs = self.computeStock > 0 && research > 0;

    const effRd = effectiveRd(self, productivity);
    const leaderEffRd = effectiveRd(leader, 1);
    const labRatio = leaderEffRd > 0 ? Math.min(1, effRd / leaderEffRd) : 1;
    const dragFactor = Math.pow(Math.max(0.001, labRatio), drag);
    const selfGrowth = 1 + (MAX_GROWTH - 1) * Math.tanh(effRd / scale) * dragFactor;

    const gapRatio = leader.rdMultiplier > 0 ? Math.min(1, self.rdMultiplier / leader.rdMultiplier) : 1;
    const diffusionGrowth = hasInputs
      ? 1 + (MAX_GROWTH - 1) * effectiveDiffusion(worldSafety) * research * Math.sqrt(gapRatio)
      : 1;

    return self.rdMultiplier * Math.max(selfGrowth, diffusionGrowth);
  };
const formulaC: FormulaFn = makeFormulaC(LEADER_DRAG);

// ── Acquisition (mirrors production logic in computeLabGrowth) ───────────────
function acquisitionForRound(labs: LabState[], roundNumber: number): Map<string, number> {
  const newComputeTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;
  const shares = DEFAULT_COMPUTE_SHARES[roundNumber] ?? {};
  const totalPreStock = labs.reduce((s, l) => s + l.computeStock, 0);
  const { STRUCTURAL_RATIO, REVENUE_FLOOR } = COMPUTE_ACQUISITION;

  const result = new Map<string, number>();
  for (const lab of labs) {
    const sharePct = shares[lab.name];
    const baseShare =
      sharePct !== undefined
        ? (newComputeTotal * sharePct) / 100
        : (newComputeTotal * lab.computeStock) / Math.max(1, totalPreStock);
    const revenueMult = REVENUE_FLOOR + 0.01 * lab.allocation.deployment;
    const newCompute = Math.round(baseShare * (STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) * revenueMult));
    result.set(lab.name, newCompute);
  }
  return result;
}

// ── Scenario runner ──────────────────────────────────────────────────────────
type RoundOverride = Partial<
  Record<string, { allocation?: Partial<Allocation>; productivity?: number; rollbackTo?: number }>
>;

function runScenario(
  formula: FormulaFn,
  initialLabs: LabState[],
  scale: number = SCALE,
  roundOverrides?: Map<number, RoundOverride>,
): Map<string, number[]> {
  const trajectory = new Map<string, number[]>();
  for (const lab of initialLabs) trajectory.set(lab.name, [lab.rdMultiplier]);

  let state = initialLabs.map((l) => ({ ...l, allocation: { ...l.allocation } }));

  for (let round = 1; round <= 4; round++) {
    const override = roundOverrides?.get(round);
    if (override) {
      state = state.map((l) => {
        const o = override[l.name];
        if (!o) return l;
        return {
          ...l,
          allocation: o.allocation ? { ...l.allocation, ...o.allocation } : l.allocation,
          rdMultiplier: o.rollbackTo !== undefined ? o.rollbackTo : l.rdMultiplier,
        };
      });
    }

    const productivity = (name: string) => override?.[name]?.productivity ?? 1.0;

    const totalEffRd = state.reduce((s, l) => s + effectiveRd(l, productivity(l.name)), 0);
    const totalCompute = state.reduce((s, l) => s + l.computeStock, 0);
    const totalSafetyEffort = state.reduce((s, l) => s + l.computeStock * (l.allocation.safety / 100), 0);
    const worldSafety = totalCompute > 0 ? totalSafetyEffort / totalCompute : 0;
    const leader = leaderOf(state);

    const newMults = state.map((l) => formula(l, productivity(l.name), leader, totalEffRd, worldSafety, scale));
    const acquired = acquisitionForRound(state, round);

    state = state.map((l, i) => ({
      ...l,
      rdMultiplier: newMults[i],
      computeStock: l.computeStock + (acquired.get(l.name) ?? 0),
    }));

    for (const lab of state) trajectory.get(lab.name)!.push(lab.rdMultiplier);
  }

  return trajectory;
}

// ── Formatting ───────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (!isFinite(n)) return "inf";
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(2);
}

function deltaPct(actual: number, target: number): string {
  if (!target) return "—";
  const d = ((actual - target) / target) * 100;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(0)}%`;
}

function printScenario(
  name: string,
  trajA: Map<string, number[]>,
  trajB: Map<string, number[]>,
  csvTargets: Record<string, Record<number, number>> | null,
): void {
  console.log(`\n═══ ${name} ═══`);
  for (const labName of trajA.keys()) {
    const a = trajA.get(labName)!;
    const b = trajB.get(labName)!;
    const targets = csvTargets?.[labName];
    console.log(`\n  ${labName}:`);
    if (targets) {
      console.log("    Round │ Formula A │ Formula B │ CSV     │ A Δ      │ B Δ");
      console.log("    ──────┼───────────┼───────────┼─────────┼──────────┼──────────");
    } else {
      console.log("    Round │ Formula A │ Formula B");
      console.log("    ──────┼───────────┼──────────");
    }
    for (let r = 0; r <= 4; r++) {
      if (targets) {
        const csv = targets[r];
        const csvStr = csv === undefined ? "—" : fmt(csv);
        const aDelta = csv !== undefined && r > 0 ? deltaPct(a[r], csv) : "—";
        const bDelta = csv !== undefined && r > 0 ? deltaPct(b[r], csv) : "—";
        console.log(
          `    R${r}    │ ${fmt(a[r]).padStart(9)} │ ${fmt(b[r]).padStart(9)} │ ${csvStr.padStart(7)} │ ${aDelta.padStart(8)} │ ${bDelta.padStart(8)}`,
        );
      } else {
        console.log(`    R${r}    │ ${fmt(a[r]).padStart(9)} │ ${fmt(b[r]).padStart(9)}`);
      }
    }
  }
}

function fresh(): LabState[] {
  return DEFAULT_LABS.map((l) => ({
    name: l.name,
    computeStock: l.computeStock,
    rdMultiplier: l.rdMultiplier,
    allocation: { ...l.allocation },
  }));
}

// ── Scenarios ────────────────────────────────────────────────────────────────
// RACE: default play, no overrides
const RACE_OVERRIDES = undefined;

// SLOWDOWN: OpenBrain pivots to safety from R2 (mirrors AI-2027 slowdown branch)
const SLOWDOWN_OVERRIDES = new Map<number, RoundOverride>([
  [2, { OpenBrain: { allocation: { deployment: 30, research: 20, safety: 50 } } }],
  [3, { OpenBrain: { allocation: { deployment: 30, research: 20, safety: 50 } } }],
  [4, { OpenBrain: { allocation: { deployment: 30, research: 20, safety: 50 } } }],
]);

// CATCHUP: Conscienta goes 100% research from R1 — does player agency move the needle?
const CATCHUP_OVERRIDES = new Map<number, RoundOverride>([
  [1, { Conscienta: { allocation: { deployment: 0, research: 100, safety: 0 } } }],
  [2, { Conscienta: { allocation: { deployment: 0, research: 100, safety: 0 } } }],
  [3, { Conscienta: { allocation: { deployment: 0, research: 100, safety: 0 } } }],
  [4, { Conscienta: { allocation: { deployment: 0, research: 100, safety: 0 } } }],
]);

// ── Main ─────────────────────────────────────────────────────────────────────
console.log("Lab growth calibration — Formula A vs Formula B vs CSV");
console.log("══════════════════════════════════════════════════════");
console.log(
  `Constants: SCALE=${SCALE}  MAX_GROWTH=${MAX_GROWTH}  RSI_EXP=${RSI_EXP}  DIFFUSION_RATE=${DIFFUSION_RATE}  COOPERATION_BOOST=${COOPERATION_BOOST}  SHARE_DRAG=${SHARE_DRAG} (B only)`,
);

printScenario(
  "RACE — default play",
  runScenario(formulaA, fresh(), SCALE, RACE_OVERRIDES),
  runScenario(formulaB, fresh(), SCALE, RACE_OVERRIDES),
  RACE_CSV,
);
printScenario(
  "SLOWDOWN — OB allocation pivot to safety at R2 (note: actual CSV slowdown is event-driven, not allocation-driven)",
  runScenario(formulaA, fresh(), SCALE, SLOWDOWN_OVERRIDES),
  runScenario(formulaB, fresh(), SCALE, SLOWDOWN_OVERRIDES),
  SLOWDOWN_CSV,
);
printScenario(
  "CATCHUP — Conscienta 100% research from R1 (no canonical CSV target — agency stress test)",
  runScenario(formulaA, fresh(), SCALE, CATCHUP_OVERRIDES),
  runScenario(formulaB, fresh(), SCALE, CATCHUP_OVERRIDES),
  null,
);

printScenario(
  "RACE — Formula C (leader-ratio drag)",
  runScenario(formulaC, fresh(), SCALE, RACE_OVERRIDES),
  runScenario(formulaC, fresh(), SCALE, RACE_OVERRIDES),
  RACE_CSV,
);
printScenario(
  "SLOWDOWN — Formula C",
  runScenario(formulaC, fresh(), SCALE, SLOWDOWN_OVERRIDES),
  runScenario(formulaC, fresh(), SCALE, SLOWDOWN_OVERRIDES),
  SLOWDOWN_CSV,
);
printScenario(
  "CATCHUP — Formula C",
  runScenario(formulaC, fresh(), SCALE, CATCHUP_OVERRIDES),
  runScenario(formulaC, fresh(), SCALE, CATCHUP_OVERRIDES),
  null,
);

// LEADER_DRAG sweep — Formula C, RACE scenario, R4 multipliers
console.log("\n\n═══ LEADER_DRAG sweep — RACE scenario, R4 multipliers (Formula C) ═══");
console.log("    LEADER_DRAG │ OB R4    │ DC R4    │ Cs R4    │ vs CSV (10000/100/50)");
console.log("    ────────────┼──────────┼──────────┼──────────┼──────────────────────");
for (const drag of [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0]) {
  const traj = runScenario(makeFormulaC(drag), fresh(), SCALE);
  const ob = traj.get("OpenBrain")![4];
  const dc = traj.get("DeepCent")![4];
  const cs = traj.get("Conscienta")![4];
  const obDelta = deltaPct(ob, 10000);
  const dcDelta = deltaPct(dc, 100);
  const csDelta = deltaPct(cs, 50);
  console.log(`    ${drag.toFixed(2).padStart(11)} │ ${fmt(ob).padStart(8)} │ ${fmt(dc).padStart(8)} │ ${fmt(cs).padStart(8)} │ ${obDelta} / ${dcDelta} / ${csDelta}`);
}

console.log("\nCSV target (RACE, R4):  OB=10000  DC=100  Cs=50\n");
