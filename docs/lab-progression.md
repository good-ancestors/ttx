# Lab R&D Progression Mechanics

## Source Material

The progression is anchored to the AI 2027 leading-lab trajectory. Source CSVs:
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines.csv` (race)
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines - Slowdown.csv`

## Canonical Race Trajectory

There is **one** reference curve, shared by every lab:

| Round | Multiplier | Per-round growth (g) |
|-------|-----------|----------------------|
| 0 (start) | 3× | — |
| 1 (Apr) | 10× | 3.33× |
| 2 (Jul) | 100× | 10× |
| 3 (Oct) | 1,000× | 10× |
| 4 (Jan 29) | 10,000× | 10× |

Defined in `src/lib/game-data.ts` as `CANONICAL_RD_TRAJECTORY`. Derived from OpenBrain's row in the source CSV — the "racing flat out" reference profile.

## Core Mechanic: Recursive Self-Improvement

The R&D multiplier represents how much AI accelerates its own R&D. Higher multiplier = faster growth = higher multiplier. This positive feedback loop is what makes the race exponential.

```
effectiveRd = computeStock × (research% / 100) × currentMultiplier × productivity
```

## Growth Formula (Universal)

Every lab grows against the same canonical baseline:

```
canonicalEffectiveRd  = canonicalStock × CANONICAL_RESEARCH_PCT × canonicalMultiplier
performanceRatio      = lab.effectiveRd / canonicalEffectiveRd
growthModifier        = clamp( performanceRatio ^ PERFORMANCE_SENSITIVITY, MIN, MAX )
universalGrowthFactor = canonicalNextMultiplier / canonicalMultiplier   // e.g. 10 in R4
factor                = 1 + (universalGrowthFactor - 1) × growthModifier
newMultiplier         = lab.rdMultiplier × factor
```

**Constants** (`LAB_PROGRESSION` in `src/lib/game-data.ts`):
- `PERFORMANCE_SENSITIVITY = 0.85` — sub-linear: out-investing pays off but with diminishing returns.
- `MIN_GROWTH_FACTOR = 0.05` — even at 0% research a lab grows minutely (industry spillover).
- `MAX_GROWTH_FACTOR = 4.0` — caps drama at 4× canonical pace per round.
- `maxMultiplier(round)` — per-round multiplier ceiling: 200 / 200 / 2000 / 15000.

**Reference profile** (the canonical pace):
- Compute trajectory: OpenBrain's CSV starting stock + per-round CSV shares (`CANONICAL_REFERENCE_LAB`).
- Research allocation: 50% (`CANONICAL_RESEARCH_PCT`).
- Multiplier: prior round's `CANONICAL_RD_TRAJECTORY` value.

A lab matching all three exactly hits the canonical trajectory. Deviations in either direction shift growth via `performanceRatio`.

## Why This is Name-Blind

Two labs with identical `computeStock`, `allocation`, `rdMultiplier`, and `productivity` grow identically — regardless of name, role, or starting position. The CSV's per-lab numbers (DeepCent peaks at 100×, Conscienta at 50×) are *outcomes of one set of choices*, not destinies. A trailing lab that goes 100% research with comparable compute can break out and challenge the leader.

This was explicitly the redesign goal — see the bug report: with the prior per-lab `BASELINE_RD_TARGETS`, DeepCent capped at ~2× growth per round in R4 because its baselineGrowthFactor was hard-coded at 100/80 = 1.25, while OpenBrain's was 10×. Lab name determined trajectory.

## Player Agency Levers

1. **CEO allocation**: Research% is the single biggest dial. 100% research with reference compute roughly doubles the canonical growth factor; 0% floors at MIN_GROWTH_FACTOR.
2. **Compute acquisition**: DPA consolidation, trade deals, sanctions, weights theft change `computeStock` directly. More compute → higher `effectiveRd` → higher `performanceRatio` → faster growth.
3. **Compounding**: A lab that pulls ahead in any round amplifies subsequent rounds (its `currentMultiplier` term in `effectiveRd` is itself elevated).
4. **AI event modifiers**: `researchDisruption` / `researchBoost` enter as one-round multiplicative `productivityMods` (clamped to [0.25, 2.5] per `clampProductivity`). `breakthrough` / `modelRollback` adjust `rdMultiplier` directly. `computeDestroyed` / `computeTransfer` shift `computeStock`.

## Compute Acquisition (Independent Channel)

R&D growth runs on PRE-acquisition stock — trailing labs don't get a free boost from compute that hasn't landed yet. Acquisition is a separate output:

```
baseShare    = newComputeTotal × DEFAULT_COMPUTE_SHARES[round][labName] / 100
              (or proportional to current stock if no CSV share — e.g. player-founded labs)
revenueMult  = REVENUE_FLOOR + 0.01 × deployment%             // 0.5 .. 1.5
newCompute   = baseShare × ( STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) × revenueMult )
```

`COMPUTE_ACQUISITION = { STRUCTURAL_RATIO: 0.60, REVENUE_FLOOR: 0.5 }`. At authored CEO defaults (deployment ≈ 42–50%) this yields ≈1.0× the CSV share, so the scenario's compute curve is preserved. Extremes: deployment=0 → 0.80×, deployment=100 → 1.20×.

From the source material: "the stock of compute is vastly more important than the flow on a timescale of months." Round-by-round shares (declining from 31 to 15 game units): early rounds compete for production, late rounds depend on accumulated stock.

## Implementation

- Pure logic: `src/lib/game-data.ts` — `computeLabGrowth`, `getCanonicalStockBeforeRound`, `clampProductivity`.
- Apply path: `src/app/api/resolve/route.ts` (`applyResolution`) calls `computeLabGrowth` after CEO allocation changes are folded in. AI event modifiers run as a separate Haiku call and feed `productivityMods`.

## Testing

```bash
npm test                                              # unit pins (tests/r-and-d-growth.test.ts)
npx tsx scripts/test-lab-progression.ts race          # E2E scenario simulator
npx tsx scripts/test-lab-progression.ts slowdown      # OpenBrain pivots to Safer
npx tsx scripts/test-lab-progression.ts catchup       # DeepCent goes aggressive
npx tsx scripts/test-lab-progression.ts all
```

The scenario simulator's CSV deltas (e.g. `+47% vs CSV`) are now diagnostic, not prescriptive — they show how far each lab strays from the original AI 2027 trajectory under the player's actions, which is the point.
