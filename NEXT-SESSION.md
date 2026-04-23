# Next Session — Post-refactor playtest readiness

## State at handoff (2026-04-23 afternoon)

**Open PR:** [#21 — Resolve pipeline refactor + three-section UI + structured-effect grader](https://github.com/good-ancestors/ttx/pull/21)
**Branch:** `t3code/clarify-attempted-versus-happened`

Prod Convex backend: `compassionate-hyena-205` — needs redeploy after this PR merges.
Dev Convex backend: `oceanic-lapwing-232`.
Passphrase: `coral-ember-drift-sage`.

## What landed in the structured-effect refactor

Replaces the two-pass grade→decide-LLM pipeline with a single batched grading call that emits `{probability, reasoning, confidence, structuredEffect}` per action. Apply phase now reads submission fields deterministically — no second LLM.

**Backend**
- Schema: `submissions.actions[].structuredEffect` (discriminated union, 8 variants) + `confidence` (`"high"|"medium"|"low"`)
- Prompt: `buildBatchedGradingPrompt` — single prompt across all roles with effect taxonomy, preconditions, confidence semantics
- Grading call: `gradeAllBatched` — one Anthropic tool-use call, matches results by stable `actionId`
- Apply path: reads each successful action's effect, dispatches through existing mutations; skips pinned-effect actions (already settled in rollAllImpl)
- New effect variant: `computeTransfer` (narrative compute moves between two role pools)
- Deleted: `buildResolveDecidePrompt`, `DecideOutput`, decide debug save, decide-half of aiMeta
- Validator: `normaliseStructuredEffect` projects the flat LLM payload to the typed union; malformed shapes collapse to `narrativeOnly`

**UI**
- `EffectEditor` component — compact badge showing effect type + summary, click to open popover with type dropdown + type-specific field editor (merge / decommission / computeChange / multiplierOverride / transferOwnership / computeTransfer / foundLab / narrativeOnly)
- Low-confidence effects render with warning tint; popover offers "Looks good" acknowledgement
- Post-dice the badge is locked (change via Re-resolve)
- Projector-view is read-only
- `overrideStructuredEffect` mutation threads the edit + acknowledgement

**Tests**
- 26 new unit tests for `normaliseStructuredEffect` covering every variant + all malformed inputs
- Batched grading prompt has 3 new tests
- 153 total passing

## Prod deploy checklist

1. Merge PR #21 to main
2. Vercel auto-builds the frontend
3. `npx convex deploy` for prod backend
4. Create a fresh test game on prod (old games have no `structuredEffect` on actions — they'll render fine in archives but can't be re-resolved)
5. Smoke-test one round end-to-end:
   - Start game, open submissions
   - NPC tables auto-submit
   - Human table submits a mix: one obvious mechanical action, one narrative action, one borderline
   - Grade Remaining
   - Verify effect badges appear on rows, confidence indicators show
   - Try editing one effect (change type, save)
   - Try acknowledging a low-confidence one
   - Roll Dice
   - Verify applied ops in P7 match what was shown at P2
   - Continue to narrative
6. Tear down test game, create real playtest game

## Outstanding follow-ups (priority order)

### P1 — Playtest polish (if signal appears during smoke test)

1. **Player-side structured-effect detection** — when a player types freeform text that smells mechanical ("merge", "nationalize", "transfer X compute"), nudge them toward the structured UI (mergeLab picker, compute-send panel). Prevents the grader from having to guess and catches intent-shape mismatches at submit time.

2. **Pre-fill structured effects in NPC sample data** — `convex/sampleActionsData.ts` action texts can hand-carry their intended `structuredEffect` + `confidence: "high"`. NPC rounds become fully deterministic and free (no LLM call needed for grading NPCs), and the facilitator gets a consistent signal each playtest. Requires augmenting the generator script + the sample JSON. Generator already exists at `scripts/generate-sample-actions-data.mjs`.

3. **Continue-button click-through gate for low-confidence effects** — currently the low-confidence badge draws attention and auto-expands the editor, but the facilitator can still hit Roll Dice without reviewing. Add a gate: if any low-confidence action has not been acknowledged (confidence upgraded to high via Save or "Looks good"), the Grade / Roll button is disabled with a "Review {N} flagged effects" tooltip.

### P2 — Integration scenarios

4. **Effect-path scenario harness fixtures.** `tests/scenarios/` has the harness + one `example-forced-merger` fixture. That one still works because `mergeLab` is a pinned effect. New fixtures for the grader-emitted paths need real-LLM runs to exercise end-to-end — expensive to run but each round-worth of real output is a regression-safety investment:
   - TSMC bombed (computeChange cascade + decommission)
   - Cyber takedown (computeTransfer attacker → target)
   - Successful hostile merger without pinned mergeLab (grader must emit merge effect from freeform text)
   - Low-confidence acknowledgement flow
   - Lab founding + compute seed via `foundLab` pinned effect

### P3 — Architecture cleanup

5. **Lab split effect type.** Today lab splits aren't in the taxonomy — fold into `foundLab` + `computeTransfer` pair or add a dedicated `splitLab` variant. Blocks a class of narrative: a lab disputes internally and its safety team spins off a new competitor. Needs UI + prompt + apply-path work.

6. **Split `labOperation` / `StructuredEffect` union consistency.** The apply phase internally builds flat arrays of per-type op records (`mergeOps`, `decommissionOps`, `computeTransferPairs`, etc.) then dispatches to mutations. Could collapse to a single discriminated union shared with the validator for a cleaner apply-path call site.

7. **Section-header visual hierarchy** (from prior session). S1/S2/S3 each have their own card title; a unified band or tint would make the three-part structure obvious on projection. Low value, low urgency.

## How to resume

```
Read NEXT-SESSION.md,
  docs/resolve-pipeline.md,
  tests/structured-effects.test.ts (pattern for future shape-level tests).

Smoke-test the PR #21 branch on prod. If the grader-emitted structured
effects match facilitator expectations across a playtest round, the
refactor is ready. If the effect editor UI needs polish after a real
session, that feedback should shape P1 priorities before the next
playtest. The decide LLM is gone — all mechanical state changes come
from either (a) player-pinned submission fields or (b) grader-emitted
structuredEffect, optionally edited by the facilitator at P2.
```
