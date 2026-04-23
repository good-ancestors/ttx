# Next Session — Resolve Pipeline + UI Polish

## State at handoff (2026-04-23 late morning)

**Open PR:** [#21 — Resolve pipeline refactor + three-section UI](https://github.com/good-ancestors/ttx/pull/21)
**Branch:** `t3code/clarify-attempted-versus-happened`
**HEAD:** `b585cff`

Prod Convex backend: `compassionate-hyena-205` — deployed with all shipping fixes.
Dev Convex backend: `oceanic-lapwing-232`.
Passphrase: `coral-ember-drift-sage`.

## What landed this session (PR #21)

**Pipeline + architecture**
- Split `rollAndNarrate` → `rollAndApplyEffects` + `continueFromEffectReview` with P7 facilitator pause
- R&D growth ordering (phase 9 post-P7); multiplierOverride compounding fix via `pendingMultiplierOverrides`
- Deferred new-compute acquisition to Advance click via `pendingAcquired`
- `transferOwnership` with empty `controllerRoleId` rejected (structural orphan prevention)
- Decommissioned lab names resolved in player-origin merger summaries
- `decommissionLabInternal` only touches `mergedIntoLabId` when explicitly passed (B2)
- `forceClearResolvingLock` rewinds phase + clears `resolveNonce` + pending fields (B4)
- `advanceRound` phase/resolving guards + re-snapshots `labsAfter` post-materialisation (B1, B5)
- `updateLabs` server-side allocation sum=100 validation (B3)
- Re-resolve resets each lab's `rdMultiplier` + `allocation` to `labsBefore` snapshot (B7)
- `computeChange: 0` now rejected as `precondition_failure` (validator-backed, surfaces in P7)
- Dice-roll failures no longer leak into P7 "Flagged & Rejected"
- Decide-LLM prompt narrowed: `multiplierOverride` forbidden for mergers, safety-governance stealth caps, "feels right" nudges

**UI**
- Three-section progressive-reveal layout: `AttemptedSection` / `HappenedSection` / `StateSection`
- Lab cards + new-compute-acquired editable (R&D multiplier, stock, allocation, per-role %)
- `updatePendingAcquired` mutation for in-place acquisition edits that land at Advance
- Auto-expand "What Was Attempted" on timer expire
- Narrative prompt rewritten to emit bullets; panel renders `<ul>` when newline-dash format
- Edit-narrative affordance moved to a small pencil inside `NarrativePanel` header next to debug button
- R&D progress chart moved inside "Where We Are Now" card above "How Capable is AI?"
- `cap.implication` folded into main capability card (no more orphan box)
- `ComputeDotsViz` is still 1-block-per-unit (see #1 below)

**Tooling + tests**
- Reusable scenario harness (`tests/scenarios/harness.ts`) with example forced-merger fixture
- Sample-action generator script (`scripts/generate-sample-actions-data.mjs`)
- Dead `adjustHolderCompute` mutation removed

## Outstanding work (priority order)

### P0 — Polish the playtest

1. **Allocation-block scale cap** — `ComputeDotsViz` renders 1 block per compute unit. At 200u+ the block cluster dominates the lab card and overflows visually. Cap to ~50 blocks; each block represents `ceil(stock/50)` units; render "(×N)" multiplier tag if scaled. File: `src/components/lab-tracker.tsx`.

2. **multiplierOverride magnitude validator** (continuation of LLM-scope tightening) — prompt now forbids most uses but the validator still accepts any value in `[0.1, maxMult]`. Consider rejecting overrides that exceed ±50% of the current multiplier unless tagged with a narrative-trigger keyword in `reason`. Adds a P7 rejection surface for LLM overreach.

3. **Projector view audit** — load `?projector=true` and confirm no facilitator-only affordances leak (Continue bar, edit pencils on lab cards + narrative panel, Add-lab button, Regenerate, debug button, merge buttons). Tighten `isProjector` guards as needed.

4. **Section-header visual hierarchy** — S1 "What Was Attempted", S2 "What Happened", S3 "Where We Are Now" currently each have their own card title. Consider a single band/header per section so the three-part structure is obvious on projection. Or a subtle background tint per section.

### P1 — Tests + future work

5. **First real scenarios** — `tests/scenarios/` has the harness + one example. Add:
   - TSMC bombed (large negative computeChange across all labs; next round's new-compute totals drop)
   - Cyber takedown (compute transfer attacker→target)
   - Forced merger under duress
   - Lab splits (foundLab after spec divergence)
   - Chained consequences in one round

6. **Structured-effect grader output** (`docs/resolve-pipeline.md` phase 2) — grader emits `{probability, structuredEffect, confidence}` per action so phase 5 can derive ops deterministically from grader output, skipping the decide LLM. Big change, own PR.

7. **Split `labOperation` type into discriminated union** — flat type with every field optional today (`convex/pipeline.ts`). Mechanical refactor to `{type: "merge", ...} | {type: "decommission", ...} | ...`.

## How to resume

```
Read /Users/lukefreeman/code/ttx/app/NEXT-SESSION.md,
  /Users/lukefreeman/.claude/projects/-Users-lukefreeman-code-ttx/memory/feedback_orchestration.md,
  docs/resolve-pipeline.md.

The resolve pipeline + UI refactor (PR #21) is open. Pick up from the
priority list. `temp-review-correctness.md` + `temp-review-design.md` +
`temp-investigate-rd.md` + `temp-simplify-21.md` are the background
context for the fixes that already shipped this session.
```
