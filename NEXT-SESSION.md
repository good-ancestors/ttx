# Next Session — Resolve Pipeline + UI Polish

## State at handoff (2026-04-23 morning)

**Open PR:** [#21 — Resolve pipeline refactor + three-section UI](https://github.com/good-ancestors/ttx/pull/21)
**Branch:** `t3code/clarify-attempted-versus-happened`
**HEAD:** `9fcb6fd` (plus whatever lands this session)

Prod Convex backend: `compassionate-hyena-205` — deployed with all the shipping fixes.
Dev Convex backend: `oceanic-lapwing-232`.
Passphrase: `coral-ember-drift-sage`.

## What already landed on this branch

- Pipeline split (`rollAndNarrate` → `rollAndApplyEffects` + `continueFromEffectReview`) with P7 facilitator pause
- R&D growth ordering fix (phase 9 post-P7)
- multiplierOverride compounding fix (pending field, re-applied post-growth)
- `transferOwnership` with empty `controllerRoleId` rejected
- Decommissioned lab name resolution in player-origin merge summaries
- Three-section UI: `AttemptedSection` / `HappenedSection` / `StateSection`
- Lab cards + new-compute-acquired editable
- Deferred acquisition to Advance click (pendingAcquired)
- Auto-expand "What Was Attempted" on timer expire
- Dice-roll failures no longer leak to P7 "Flagged & Rejected"
- `advanceRound` phase/resolving guards + `updateLabs` allocation sum validation
- multiplierOverride prompt narrowed (no mergers, no safety-governance capping)
- Reusable scenario harness + example fixture

## Outstanding work (priority order)

### P0 — Clean up + tighten

1. **Move UI affordances into correct sections + tighten narrative style** (user feedback 2026-04-23):
   - **"Edit narrative" button** lives in `state-section.tsx` but should be inside/near `<NarrativePanel>` in `happened-section.tsx`.
   - **Narrative prose too fluffy.** Today `outcomes` / `stateOfPlay` / `pressures` render as paragraphs. User wants scannable bullets. Coupled changes:
     - Prompt: change `buildResolveNarrativePrompt` instructions from "2-3 sentences" to bullets / short clauses. Remove colour and speculation.
     - Schema: consider `round.summary.outcomes/stateOfPlay/pressures: Array<string>` (bullets) instead of `string`. Migration trivial since optional + regenerated.
     - Render: `narrative-panel.tsx` renders bullets when field is array. String fallback for legacy.
   - Full sweep: pencil buttons inside their owning card, section-level actions in their owning section header, projector view has none of these facilitator-only affordances.

2. **Back prompt rules with validator rejections** (continuation of the LLM-scope tightening):
   - **0u computeChange**: currently silently filtered at `pipelineApply.ts` `acquired.filter(r => r.amount !== 0)`. Should be a `precondition_failure` rejection that surfaces in P7, not silent. Reject when `op.change === 0` in `pipeline.ts` computeChange validator.
   - **multiplierOverride magnitude cap**: currently clamped to `[0.1, maxMult]` — accepts any value. Consider rejecting overrides that fall outside a narrow band (e.g. ±50% of current multiplier) unless a tagged narrative trigger is present.
   - **Every prompt rule must also be a validator rule.** Audit `buildResolveDecidePrompt` for DO/DO NOT rules and verify each has a corresponding rejection site.

3. **Correctness-review follow-ups** (from `temp-review-correctness.md`):
   - **B2** — `decommissionLabInternal` clears `mergedIntoLabId` when called without opts. Only touch when explicitly passed.
   - **B4** — `forceClearResolvingLock` leaves `resolveNonce` + phase stuck. Should clear nonce and rewind phase to last stable state.
   - **B5** — `labsAfter` snapshot frozen pre-materialisation; next round's narrative prompt sees stale pre-acquisition stocks. Either re-snapshot in `advanceRound` after materialisation, or omit `computeStock` from snapshot and join fresh from tables on read.
   - **B7** — re-resolve after LLM override carries stale `labs.rdMultiplier`. On re-resolve, also reset `labs.rdMultiplier` to `round.labsBefore` values.
   - Low/nit items under B6, B8-B12 in the review file.

4. **Unify `adjustHolderCompute` vs `overrideHolderCompute`** — dual mutation surface (one takes absolute stock, one takes delta). Pick one pattern, rewrite the other's callers, delete the loser.

### P1 — Polish + investment

5. **Visual hierarchy polish pass** — after the content-move items above, do a step-back review:
   - Section peerage: do S1/S2/S3 read as clearly-labelled siblings?
   - Spacing rhythm, consistent card padding.
   - Progressive reveal beat: no jank on phase transitions.
   - Allocation-block scale: `ComputeDotsViz` renders 1 block per compute unit; at 200u+ the block cluster dominates the card. Cap to 50 blocks with a "×N" label.
   - R&D chart gating: currently narrate-only; may want always-on during submit/rolling (without the current-round dot).
   - Projector view check (`?projector=true`).

6. **Scenario library + event-driven tests**:
   - `tests/scenarios/harness.ts` + `example-forced-merger.ts` are in place. First actual scenario to add: TSMC-bombed (large negative computeChange across all labs), verify downstream state.
   - Others: cyber takedown (compute transfer), forced merger under duress, lab splits, chained consequences, reject cases.
   - JSON-tag scenarios in `public/sample-actions.json` so NPC samples can be swapped to drive specific scenarios.

7. **P1 follow-ups from resolve-pipeline.md plan**:
   - **Structured action vocabulary on grader output**: grader emits `{probability, structuredEffect, confidence}` per action, so phase 5 derives ops from grader output (no second LLM call needed). Big change, own PR.
   - **Split `labOperation` type into discriminated union**: current flat type with every field optional. Mechanical refactor.

8. **Sample action generator script** — `convex/sampleActionsData.ts` says "DO NOT EDIT — auto-generated" but there's no generator. Write `scripts/generate-sample-actions-data.mjs` or add a test that asserts equality with `public/sample-actions.json`.

## How to resume

```
Read /Users/lukefreeman/code/ttx/app/NEXT-SESSION.md,
  /Users/lukefreeman/.claude/projects/-Users-lukefreeman-code-ttx/memory/feedback_orchestration.md,
  docs/resolve-pipeline.md.

The resolve pipeline + UI refactor (PR #21) is open. Pick up from the
priority list. `temp-review-correctness.md` + `temp-review-design.md` +
`temp-investigate-rd.md` + `temp-simplify-21.md` are the full context
for the outstanding findings.
```
