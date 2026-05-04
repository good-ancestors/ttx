# Lab R&D Progression Mechanics

## Source Material

The progression draws from the AI 2027 scenario CSV files:
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines.csv` (race)
- `scenarios/Charts (Compute Breakdown and R&D Progress) for TTX - Timelines - Slowdown.csv`

## AI-2027 Reference Curve

The CSV trajectory each game round covers ~3 months starting January 2028.

| Lab | Start | R1 (Apr) | R2 (Jul) | R3 (Oct) | R4 (Jan 29) |
|-----|-------|----------|----------|----------|-------------|
| OpenBrain | 3× | 10× | 100× | 1,000× | 10,000× |
| DeepCent | 2.5× | 5.7× | 22× | 80× | 100× |
| Conscienta | 2× | 5× | 15× | 40× | 50× |

These are an **aspirational reference** for the canonical AI-2027 narrative, not a hard target the formula tries to hit per-lab. The formula is calibrated so OpenBrain (the dominant compute holder under default `DEFAULT_COMPUTE_SHARES`) tracks its CSV curve at idle play; DeepCent and Conscienta drift from theirs unless players intervene.

## Growth Formula (pure compute-share)

Each round, every lab's R&D multiplier updates by:

```
effectiveRd[lab]  = computeStock × (research% / 100) × rdMultiplier × productivity
rdShare[lab]      = effectiveRd[lab] / sum(effectiveRd)
newMultiplier     = rdMultiplier × (1 + rdShare × POOL_GROWTH[round] × productivity)
```

`POOL_GROWTH = { 1: 5, 2: 15, 3: 11, 4: 10 }` is the round's growth budget for a lab capturing 100% of effectiveRd. Smaller shares grow proportionally less. Capped at the per-round `maxMultiplier` ceiling (`200 / 2000 / 15000` for R1-2 / R3 / R4).

**Why pure compute-share:** before this redesign the formula tried to nudge labs toward authored per-lab CSV targets via a bounded `growthModifier`. The bound (`MAX_GROWTH_FACTOR = 4.0`) saturated at modest player effort, leaving the lab with the steeper authored curve winning over the lab with more actual compute. See game `js7aqftxa4avkxt013889a4c6s862y66` R3 (DeepCent 28u → 1139.5×, Conscienta 56u → 931.5×) for the bug that motivated the rewrite.

The new formula has one invariant players can rely on: **more effective R&D throughput → more growth, monotonically.** Three player levers compose multiplicatively into `effectiveRd`:
- `computeStock` — accumulated through acquisition, transfers, and grants.
- `research%` — CEO allocation slider; opportunity cost is deployment/safety.
- `productivity` — one-round modifier from `researchBoost` / `researchDisruption` AI effects, clamped to `[0.25, 2.5]`.

## Acquisition (independent of growth)

`computeStock` updates from a separate per-round acquisition step:

```
baseShare    = NEW_COMPUTE_PER_GAME_ROUND[round] × DEFAULT_COMPUTE_SHARES[round][lab]
revenueMult  = REVENUE_FLOOR + 0.01 × deployment%       // 0.5 to 1.5
newCompute   = round(baseShare × (STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) × revenueMult))
```

So deployment% trades off against research%: more deployment → more compute next round, less R&D this round. R&D explicitly uses **pre-acquisition** compute so trailing labs can't get a free boost from compute that hasn't landed yet.

## Player Agency Levers

1. **CEO allocation** (research vs deployment vs safety) — the dominant per-round decision. Pushing research% to 100 maximises this round's R&D; pushing deployment maximises next round's compute.
2. **Compute acquisition / transfer** — DPA consolidation, trade deals, sanctions, weight theft, etc. dramatically reshape compute share. Since growth is pure share, every unit acquired pays back in proportionally faster R&D.
3. **AI event modifiers** — graders emit structured effects (`computeDestroyed`, `researchDisruption`, `researchBoost`, `breakthrough`, `modelRollback`, `transferOwnership`) executed by the deterministic apply path alongside the formula above.

## Implementation

- Formula: `computeLabGrowth()` in [src/lib/game-data.ts](../src/lib/game-data.ts).
- Constants: `LAB_PROGRESSION` (POOL_GROWTH, productivity clamps, maxMultiplier), `NEW_COMPUTE_PER_GAME_ROUND`, `DEFAULT_COMPUTE_SHARES` in [convex/gameData.ts](../convex/gameData.ts).
- Pipeline integration: Phase 9 in [convex/pipeline.ts](../convex/pipeline.ts).

## Testing

```bash
npm test -- r-and-d-growth.test.ts
```

The pin tests cover: compute monotonicity, the game-`js7aqftxa4avkxt013889a4c6s862y66` R3 replay, OpenBrain default-curve regression, productivity / clamp behaviour, and acquisition independence.
