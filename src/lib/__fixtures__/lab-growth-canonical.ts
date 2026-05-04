/**
 * Canonical lab-growth scenarios — calibration fixtures, not runtime inputs.
 *
 * Each scenario specifies starting state + per-round overrides. Tests run
 * computeLabGrowth through the scenario and compare against:
 *   - formulaExpected: tight regression pin (±5%) — fails if formula behaviour
 *     drifts. NOTE: these are SNAPSHOT values, derived by running the formula
 *     once. They are NOT independent ground truth. When you intentionally tune
 *     LAB_PROGRESSION constants (SCALE, RSI_EXP, LEADER_DRAG, etc.), regenerate
 *     these by running the production formula directly via
 *     `runScenarioThroughFormula(SCENARIOS[i])` from this file (NOT the
 *     calibration script — its Formula C is a simpler comparison variant that
 *     doesn't match production's split-leader implementation).
 *   - csvTarget: optional informational AI-2027 trajectory. Asserted only as
 *     a wide-tolerance sanity check on RACE OB R4 — the rest are informational
 *     because CSV trajectories are event-driven (alignment backtrack, sanctions)
 *     and per-scenario calibration belongs in events, not the formula.
 */

import { DEFAULT_LABS, LAB_PROGRESSION, computeLabGrowth } from "../game-data";

interface AllocationOverride {
  deployment?: number;
  research?: number;
  safety?: number;
}

interface RoundOverride {
  /** Lab name → allocation patch applied at the start of this round. */
  allocations?: Record<string, AllocationOverride>;
  /** Lab name → productivity factor for this round (researchDisruption / researchBoost). */
  productivity?: Record<string, number>;
}

interface LabGrowthScenario {
  name: string;
  description: string;
  /** Per-round overrides, keyed by round number (1-4). */
  roundOverrides?: Record<number, RoundOverride>;
  /** Lab name → multiplier at end of each round [R0, R1, R2, R3, R4]. Tight regression pin. */
  formulaExpected: Record<string, number[]>;
  /** Optional canonical CSV trajectory (sanity check, looser tolerance). */
  csvTarget?: Record<string, number[]>;
}

const RACE_SCENARIO: LabGrowthScenario = {
  name: "race",
  description: "Default play — all labs at authored CEO defaults. Tracks AI-2027 race CSV.",
  formulaExpected: {
    OpenBrain:  [3,   10.2, 97.0, 970,    9700],
    DeepCent:   [2.5, 6.2,  33.6, 218.8,  1224.6],
    Conscienta: [2,   3.2,  6.7,  18.5,   49.4],
  },
  csvTarget: {
    OpenBrain:  [3,   10,  100, 1000, 10000],
    DeepCent:   [2.5, 5.7, 22,  80,   100],
    Conscienta: [2,   5,   15,  40,   50],
  },
};

const SLOWDOWN_SCENARIO: LabGrowthScenario = {
  name: "slowdown",
  description:
    "OpenBrain pivots to safety from R2 (allocation-driven). The CSV slowdown branch " +
    "(scenarios/...Slowdown.csv) is event-driven — alignment backtrack / model rollback " +
    "events bring trailing labs back to canonical magnitudes — so this scenario tests " +
    "the formula's allocation response only and intentionally has no csvTarget. The " +
    "formulaExpected values are pure-formula trajectories, not the CSV slowdown story.",
  roundOverrides: {
    2: { allocations: { OpenBrain: { deployment: 30, research: 20, safety: 50 } } },
    3: { allocations: { OpenBrain: { deployment: 30, research: 20, safety: 50 } } },
    4: { allocations: { OpenBrain: { deployment: 30, research: 20, safety: 50 } } },
  },
  formulaExpected: {
    OpenBrain:  [3,   10.2, 65.6, 650.6,  6506],
    DeepCent:   [2.5, 6.2,  41.7, 417,    4127],
    Conscienta: [2,   3.2,  7.8,  32.5,   135.1],
  },
};

const CATCHUP_SCENARIO: LabGrowthScenario = {
  name: "catchup",
  description: "Conscienta goes 100% research from R1 — agency stress test, no canonical CSV target.",
  roundOverrides: {
    1: { allocations: { Conscienta: { deployment: 0, research: 100, safety: 0 } } },
    2: { allocations: { Conscienta: { deployment: 0, research: 100, safety: 0 } } },
    3: { allocations: { Conscienta: { deployment: 0, research: 100, safety: 0 } } },
    4: { allocations: { Conscienta: { deployment: 0, research: 100, safety: 0 } } },
  },
  formulaExpected: {
    OpenBrain:  [3,   10.2, 97.0, 970,    9700],
    DeepCent:   [2.5, 6.2,  33.6, 218.8,  1224.6],
    Conscienta: [2,   5.5,  36.6, 269.9,  1757.9],
  },
};

export const SCENARIOS: LabGrowthScenario[] = [RACE_SCENARIO, SLOWDOWN_SCENARIO, CATCHUP_SCENARIO];

/** Run a scenario through computeLabGrowth and return the per-lab trajectory. */
export function runScenarioThroughFormula(scenario: LabGrowthScenario): Map<string, number[]> {
  let labs = DEFAULT_LABS.map((l) => ({ ...l, allocation: { ...l.allocation } }));

  const trajectory = new Map<string, number[]>();
  for (const lab of labs) trajectory.set(lab.name, [lab.rdMultiplier]);

  for (let round = 1; round <= 4; round++) {
    const override = scenario.roundOverrides?.[round];

    if (override?.allocations) {
      labs = labs.map((l) => {
        const patch = override.allocations![l.name];
        return patch ? { ...l, allocation: { ...l.allocation, ...patch } } : l;
      });
    }

    const allocs = new Map(labs.map((l) => [l.name, l.allocation]));
    const prods = override?.productivity ? new Map(Object.entries(override.productivity)) : undefined;
    const maxMult = LAB_PROGRESSION.maxMultiplier(round);

    labs = computeLabGrowth(labs, allocs, round, maxMult, prods);

    for (const lab of labs) trajectory.get(lab.name)!.push(lab.rdMultiplier);
  }

  return trajectory;
}
