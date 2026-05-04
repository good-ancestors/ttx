/**
 * Canonical lab-growth scenarios — calibration fixtures, not runtime inputs.
 *
 * Each scenario specifies starting state + per-round overrides. Tests run
 * computeLabGrowth through the scenario and compare against:
 *   - formulaExpected: tight regression pin (±5%) — fails if formula constants
 *     drift unexpectedly
 *   - csvTarget: optional loose sanity check (±100% mid / ±100% final) — confirms
 *     the formula's shape stays within the rough envelope of the AI-2027 trajectory
 *
 * The CSV envelope is intentionally loose because the formula is pure physics —
 * deceleration of trailing labs (DC plateau, Cs plateau) is event-driven in the
 * scenario story, not formula-driven. This is the cost of architectural cleanness.
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
    "OpenBrain pivots to safety from R2 (allocation-driven). Note: the CSV slowdown branch " +
    "is event-driven (alignment backtrack / model rollback), so this scenario exercises the " +
    "formula's allocation response rather than reproducing the CSV trajectory.",
  roundOverrides: {
    2: { allocations: { OpenBrain: { deployment: 30, research: 20, safety: 50 } } },
    3: { allocations: { OpenBrain: { deployment: 30, research: 20, safety: 50 } } },
    4: { allocations: { OpenBrain: { deployment: 30, research: 20, safety: 50 } } },
  },
  formulaExpected: {
    OpenBrain:  [3,   10.2, 66.5, 665,    6650],
    DeepCent:   [2.5, 6.2,  41.7, 417,    4097.9],
    Conscienta: [2,   3.2,  7.9,  33.4,   139.1],
  },
  csvTarget: {
    OpenBrain:  [3,   10,  40, 55, 500],
    DeepCent:   [2.5, 5.7, 35, 80, 250],
    Conscienta: [2,   5,   15, 40, 125],
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
