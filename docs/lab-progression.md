# Lab R&D Progression Mechanics

## Architecture: pure physics, scenarios as fixtures

`computeLabGrowth` is a pure function of each lab's own state plus live world signals (leader, world cooperation). **No per-lab or per-scenario hardcoded targets are read at runtime.** Calibration against AI-2027 trajectories happens in tests, via fixtures in `src/lib/__fixtures__/lab-growth-canonical.ts`. Per-scenario differences (race vs slowdown) are driven by events that act on multiplier and productivity — not by the formula.

This separation matters: it means the formula keeps working sensibly when the world deviates from the AI-2027 script (leader is removed, labs merge, founder labs appear), and the AI-2027 trajectories are a measurable target to calibrate against rather than a hidden assumption baked into the math.

## Source material

The canonical trajectories live in:
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines.csv` (race)
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines - Slowdown.csv`

These are inlined into the calibration script and test fixtures, not imported by production code.

## The formula

```
effectiveRd = computeStock × research%/100 × multiplier^RSI_EXP × productivity
labRatio    = effectiveRd / leader.effectiveRd       (live leader, no phantom anchor)
dragFactor  = labRatio^LEADER_DRAG
selfGrowth  = 1 + (MAX_GROWTH - 1) × tanh(effectiveRd / SCALE) × dragFactor

worldSafety       = compute-weighted average of safety allocations
effectiveDiffusion = DIFFUSION_RATE × (1 + COOPERATION_BOOST × worldSafety)
gapRatio          = self.multiplier / leader.multiplier         (clamped to 1)
diffusionGrowth   = 1 + (MAX_GROWTH - 1) × effectiveDiffusion × research × √gapRatio
                    (gated: lab needs computeStock > 0 AND research% > 0)

growth     = max(selfGrowth, diffusionGrowth)
multiplier ← multiplier × growth                       (clamped to MIN_MULTIPLIER, maxMultiplier(round))
```

### Why each piece

| Term | Why it's there |
|---|---|
| `multiplier^RSI_EXP` (RSI_EXP=1.2) | Recursive self-improvement — better AI accelerates AI research more than linearly with capability. The AI-2027 thesis. |
| `tanh(effRd / SCALE)` | Saturating growth — at high effective R&D, the bottleneck shifts from compute to research time (RSI ceiling, MAX_GROWTH = 10×/round). |
| `dragFactor = labRatio^LEADER_DRAG` | Trailing labs decelerate as they fall further behind the leader. Without it, every lab with non-trivial effRd hits the RSI ceiling and grows at the leader's rate. Live leader → no phantom anchor. |
| `worldSafety → effectiveDiffusion` | Cooperative worlds (high safety alloc) share research openly; race worlds hoard. Amplifies the diffusion floor. |
| `diffusionGrowth` (research-gated, compute-gated) | Knowledge spillover lifts trailing labs that have *some* research effort. Capability-only labs don't drift forward via spillover alone. |

## Tunable constants

All in `LAB_PROGRESSION` (game-data.ts). Calibrated jointly via `scripts/calibrate-lab-growth.ts`.

| Constant | Value | Effect |
|---|---|---|
| `SCALE` | 150 | Effective R&D level where tanh hits ~76% of MAX_GROWTH |
| `MAX_GROWTH` | 10 | Per-round growth ceiling (RSI saturation) |
| `RSI_EXP` | 1.2 | Recursive self-improvement exponent |
| `LEADER_DRAG` | 0.3 | Drag on trailing labs vs leader's effective R&D |
| `DIFFUSION_RATE` | 0.15 | Base knowledge spillover rate |
| `COOPERATION_BOOST` | 4 | World-safety amplifier on diffusion |

## Calibration fit

Run `npx tsx scripts/calibrate-lab-growth.ts` for the live report. Current default play vs CSV:

| | OB R4 | DC R4 | Cs R4 |
|---|---|---|---|
| **Formula (race)** | 9700 | 1225 | 49.4 |
| **CSV target** | 10000 | 100 | 50 |
| **Δ vs CSV** | -3% | +1125% | -1% |

OB and Cs naturally fit the CSV envelope. DC overshoots because its CSV plateau (R3=80 → R4=100) is event-driven (alignment backtrack), not formula-driven. Sanctions, model rollback, and breakthroughs do the per-scenario calibration to specific story trajectories.

## Edge cases

- **Zero compute** → effRd = 0, diffusion gated off → no growth.
- **Zero research%** → effRd = 0, diffusion gated off → no growth (capability-only allocation cannot advance R&D).
- **Leader removed mid-game** → `leader` becomes the new live front-runner; no phantom anchor.
- **All labs collapse** → `totalPreStock = 0` falls back gracefully (worldSafety = 0, no diffusion).
- **Productivity events** (researchBoost / researchDisruption) fold into effRd for one round.

## Player agency

1. **CEO allocation**: research% drives effRd directly. Going from 43% → 100% lifts Cs from R4 ~50× to R4 ~1800× in default-world play (see CATCHUP fixture).
2. **Compute acquisition**: structural pool shares + deployment%-weighted revenue bucket. Doubling compute roughly doubles effRd before saturation kicks in.
3. **Allocation safety%**: counts toward world cooperation, lifting trailing-lab diffusion globally. Trade-off: more safety = less own research = lower selfGrowth.
4. **AI event modifiers**: structured effects emitted by the grader (computeDestroyed / researchDisruption / breakthrough / modelRollback / transferOwnership) act on multiplier, stock, or productivity in the deterministic apply path, alongside the formula's growth update.

## Verification

```bash
npm test                                    # Unit tests, including scenario fixtures
npx tsx scripts/calibrate-lab-growth.ts     # Side-by-side comparison report
```

Test scenarios live in `src/lib/__fixtures__/lab-growth-canonical.ts`. Each fixture has:
- Per-round allocation/productivity overrides
- `formulaExpected` (regression pin, ±5%)
- Optional `csvTarget` (informational; not asserted because event-driven differences belong in scenario integration tests, not formula unit tests)

## Implementation

`src/lib/game-data.ts`:`computeLabGrowth`. The function is pure: same inputs always produce same outputs. Convex pipeline (`convex/pipeline.ts`) calls it in `applyGrowthAndAcquisitionInternal` with the round's CEO allocations and pending productivity mods.
