# Lab R&D Progression Mechanics

## Architecture: mechanics vs content

A useful distinction when reading this code:

- **Mechanics** are generic — they would carry across to any scenario unchanged. The R&D growth formula (tanh-saturating self-growth, leader-ratio drag, cooperation-amplified diffusion), the compute split-bucket model (60% structural + 40% revenue, with deployment% modulating the revenue bucket), the structured-effects pipeline (`modelRollback`, `breakthrough`, `researchDisruption`, `computeDestroyed`, etc.).
- **Content** is AI-2027-specific data the mechanics consume. `DEFAULT_LABS` (starting compute, multiplier, allocation), `NEW_COMPUTE_PER_GAME_ROUND` (per-quarter chip pool size), `DEFAULT_COMPUTE_SHARES` (per-round baseline shares of that pool — reflects export controls, DPA consolidation, govt contracts), role briefings, AI dispositions.

The **R&D growth half** of `computeLabGrowth` reads only mechanics + per-lab state. It contains no scenario-specific tables. Per-scenario differences (race vs slowdown vs catchup) emerge from events acting on multiplier and productivity — not from the formula. Calibration against AI-2027 trajectories happens in tests via `src/lib/__fixtures__/lab-growth-canonical.ts` (snapshot pins, regenerate when intentionally tuning).

The **compute acquisition half** consumes scenario content (`DEFAULT_COMPUTE_SHARES`) as the *baseline anchor*, then applies generic mechanics on top:
- 60% structural bucket flows regardless (chip supply chains, govt contracts, investor capital)
- 40% revenue bucket scales linearly with deployment% allocation (range 0.5–1.5 → ±20% swing on baseline from player choice)
- Founder labs and other entities not in `DEFAULT_COMPUTE_SHARES` fall through to a stock-proportional share
- Events (`computeDestroyed`, `computeTransfer`, `merge`, `decommission`) reroute compute through the structured-effects path before growth runs

The reason the acquisition half retains scripted baseline shares while growth doesn't: real-world chip supply has political-economic dynamics (Taiwan capacity, US export controls, DPA, big-customer contracts) that don't emerge from any in-game state and aren't well-modelled by physics. Encoding them as authored content is honest. To swap scenarios, edit `DEFAULT_COMPUTE_SHARES` and `NEW_COMPUTE_PER_GAME_ROUND` — same as you'd edit `DEFAULT_LABS` or role briefings.

The formula keeps working sensibly when the world deviates from the AI-2027 script (leader removed, labs merged, founder labs appearing) — both halves degrade gracefully via their respective fallbacks.

## Source material

The canonical trajectories live in:
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines.csv` (race)
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines - Slowdown.csv`

These are inlined into the calibration script and test fixtures, not imported by production code.

## The formula

```
effectiveRd        = computeStock × research%/100 × multiplier^RSI_EXP × productivity

# Two leader concepts, intentionally different:
effortLeaderEffRd  = max(effectiveRd across labs)          (who's out-researching this round)
capabilityLeader   = lab with highest rdMultiplier         (who has the lead in race terms)

# Drag uses effort-leader: trailing labs can't grow past whoever's out-researching them this round.
# This avoids a singularity when the capability leader sandbags research (effRd=0): without effort-
# leader fallback, labRatio would collapse to 1 for everyone and trailing labs would spike.
labRatio    = effectiveRd / effortLeaderEffRd
dragFactor  = labRatio^LEADER_DRAG
selfGrowth  = 1 + (MAX_GROWTH - 1) × tanh(effectiveRd / SCALE) × dragFactor

# Diffusion uses capability-leader: knowledge spillover scales with what the leader has BUILT
# (multiplier), not what they're DOING this round (effRd). Spillover doesn't disappear if the
# leader sandbags one round — accumulated capability is still there to leak.
worldSafety        = compute-weighted average of safety allocations
effectiveDiffusion = DIFFUSION_RATE × (1 + COOPERATION_BOOST × worldSafety)
gapRatio           = self.multiplier / capabilityLeader.multiplier   (clamped to 1)
diffusionGrowth    = 1 + (MAX_GROWTH - 1) × effectiveDiffusion × research × √gapRatio
                     (gated: lab needs computeStock > 0 AND research% > 0)

growth     = max(selfGrowth, diffusionGrowth)
multiplier ← multiplier × growth               (clamped to MIN_MULTIPLIER, maxMultiplier(round))
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
