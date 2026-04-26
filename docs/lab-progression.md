# Lab R&D Progression Mechanics

## Source Material

The progression is based on the AI 2027 scenario CSV files:
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines.csv` (race)
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines - Slowdown.csv`

## Baseline Targets (Race Scenario)

Each game round covers ~3 months starting January 2028.

| Lab | Start | R1 (Apr) | R2 (Jul) | R3 (Oct) | R4 (Jan 29) |
|-----|-------|----------|----------|----------|-------------|
| OpenBrain | 3x | 10x | 100x | 1,000x | 10,000x |
| DeepCent | 2.5x | 5.7x | 22x | 80x | 100x |
| Conscienta | 2x | 5x | 15x | 40x | 50x |

## Core Mechanic: Recursive Self-Improvement

The R&D multiplier represents how much AI accelerates its own R&D. Higher multiplier = faster growth = higher multiplier. This positive feedback loop is what makes the race exponential.

```
effectiveRd = computeStock x capabilityAllocation% x currentMultiplier
```

The leading lab compounds fastest because their existing multiplier amplifies new R&D.

## Two Growth Paths

### Race Path (capability allocation >= 60% of baseline)

Exponential growth toward CSV baseline targets. Player allocation and compute deviations adjust the rate:

- **Allocation boost** (e.g., 80% vs 55% baseline): `pow(ratio, 0.5)` = diminishing returns but meaningful
- **Allocation cut** (e.g., 40% vs 50% baseline): `pow(ratio, 1.3)` = steeper penalty
- **Compute boost** (e.g., DPA consolidation): `pow(computeRatio, 0.3)` = compounds over rounds

### Safer Path (capability allocation < 60% of baseline)

When a lab cuts R&D below the threshold, the recursive loop **breaks**. Growth becomes linear:

```
growthRate = 1 + allocRatio x 2.5 x computeFactor
```

At 20% capability (allocRatio = 0.4): ~2x per round
At 40% capability (allocRatio = 0.8, near threshold): ~3x per round

Capped at 3.5x per round maximum.

### Why the Threshold Exists

Cutting below ~60% of baseline R&D means the lab is no longer feeding capability improvements back into the recursive loop. They're doing alignment, interpretability, Safer model research -- important work that doesn't compound the way raw capability R&D does.

## Scenario Outcomes

### Race (default allocations)
```
OpenBrain:  3x -> 10x -> 100x -> 1,000x  (exponential, ~10x/round)
DeepCent:   2.5x -> 6x -> 22x -> 95x     (exponential, slower)
Conscienta: 2x -> 5x -> 15x -> 45x       (exponential, slowest)
```

### Slowdown (OpenBrain pivots to Safer in R2)
```
OpenBrain:  3x -> 10x -> 20x -> 27x      (linear after pivot)
DeepCent:   2.5x -> 6x -> 25x -> 107x    (overtakes, exponential)
Conscienta: 2x -> 5x -> 15x -> 40x       (unchanged)
```

### Slowdown + DPA (OpenBrain gets consolidated US compute)
```
OpenBrain:  3x -> 10x -> 24x -> 55x      (linear but boosted, matches CSV)
DeepCent:   2.5x -> 6x -> 25x -> 80x     (still overtakes but closer)
```

### Catch-up (DeepCent goes 85% capability)
```
OpenBrain:  3x -> 10x -> 100x -> 760x    (exponential)
DeepCent:   2.5x -> 7x -> 29x -> 91x     (closes gap, can't overtake)
Conscienta: 2x -> 5.5x -> 20x -> 44x     (slight boost at 65% cap)
```

## Player Agency Levers

1. **CEO allocation**: The most impactful decision. Crossing the 60% threshold is the race/slowdown fork.
2. **Compute acquisition**: DPA consolidation, trade deals, sanctions can dramatically change compute stocks. Doubling compute roughly doubles Safer path growth.
3. **Re-entering the race**: Shifting allocation back above 60% restarts the exponential -- but from wherever you are, having lost rounds of compounding.
4. **AI event modifiers**: Sanctions, sabotage, Taiwan invasion, weight theft -- the grader emits structured effects (computeDestroyed / researchDisruption / breakthrough / modelRollback / transferOwnership) that the deterministic apply path executes alongside the baseline R&D growth.

## Compute Growth

From the source material: "the stock of compute is vastly more important than the flow on a timescale of months."

- Global new compute per round: 5, 3, 2, 2 (game units, declining)
- New compute distributed proportional to existing stock share
- Early rounds: acquisition matters (labs fight for share of new production)
- Later rounds: stocks dominate (what you have >> what's being produced)

## Implementation

File: `src/app/api/resolve/route.ts`, in the `applyResolution` function.

The lab update runs after the main resolve AI call:
1. Apply CEO allocation changes from submissions
2. Distribute new compute proportional to stock share
3. Calculate effectiveRd for each lab (stock x allocation% x multiplier)
4. Check threshold: above 60% = race path, below = Safer path
5. Apply AI event modifiers (separate Haiku call)
6. Write to Convex via `updateLabs` + `snapshotState`

## Testing

```bash
npx tsx scripts/test-lab-progression.ts race      # Default progression
npx tsx scripts/test-lab-progression.ts slowdown   # OB pivots to Safer
npx tsx scripts/test-lab-progression.ts catchup    # DC goes aggressive
npx tsx scripts/test-lab-progression.ts all        # All three
```
