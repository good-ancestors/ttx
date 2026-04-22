# Next Session — Resolve Pipeline P7 Follow-ups

## State at handoff (2026-04-22 evening)

**Open PR:** [#21 — Resolve pipeline: split decide→apply→P7→narrate; deterministic effect ordering](https://github.com/good-ancestors/ttx/pull/21)
**Branch:** `t3code/clarify-attempted-versus-happened`
**HEAD:** `33b1ae5` (plus whatever the in-flight UI-reorg agent commits)

### What landed in this session's PR

- **Pipeline split** `rollAndNarrate` → `rollAndApplyEffects` + `continueFromEffectReview` with a mandatory facilitator pause in between (P7 per `docs/resolve-pipeline.md`).
- **R&D growth ordering fix** — growth now lands as phase 9, after the P7 pause, not at start of resolve.
- **multiplierOverride compounding fix** — overrides are now "final value", stashed on `round.pendingMultiplierOverrides`, re-applied after `computeLabGrowth` so they can't escalate (was compounding to 2000×).
- **`EffectReviewPanel`** at `src/components/facilitator/effect-review-panel.tsx` rendering applied + flagged ops from both decide LLM (tagged `(LLM)`) and player actions (tagged `(player action)`, pulled from event log via new `events.getSinceForRound` internal query).
- **Structured NPC sample actions** — `public/sample-actions.json` + mirror in `convex/sampleActionsData.ts`. 4 merger-intent actions on openbrain-ceo / conscienta-ceo rounds 2-4. `src/lib/sample-actions.ts` has the `StructuredIntent` union. `convex/aiGenerate.ts` resolves intents into `mergeLab` on submission + prefers structured samples in the picker.
- **Bug fixes rolled in:** debug-panel model/cost display (`split("/").pop()`), `attempted-panel.tsx` reveal during effect-review (was rendering grey), eslint ignore `.claude/**`.
- **Verification:** 116 tests passing, tsc clean, lint 0 errors, knip clean, 4 live rounds verified.

### Session memory added

- `~/.claude/projects/.../memory/feedback_orchestration.md` — rules for checking worktrees before duplicating work, using Sonnet for bulk edits + Opus for tricky decisions, token/context discipline. **Read this first every session.**

---

## Outstanding work (priority order)

### P0 — Bugs flagged during live testing

1. **Merged-survivor compute routing** — in a live R4 test the merger survivor lab rendered as `OpenBrain 2000× 0u` (the 2000× is fixed now by the override fix, but the `0u` on a survivor that should have absorbed compute is real). Likely one of:
   - Survivor's `ownerRoleId` got cleared during the merge (the `(unowned)` case) so `mergedEntries` emitted no pair transfer in pipeline.ts:782-796.
   - `mergeLabsWithComputeInternal` player-path settlement left the absorbed-owner's compute stranded.
   - Display is mid-pipeline (effect-review) and compute acquisition hasn't happened yet — but other labs showed non-zero stock in the same screenshot.

   **Where to look:** `convex/pipeline.ts:782-796`, `convex/labs.ts#mergeLabsInternal`, `convex/labs.ts#mergeLabsWithComputeInternal`. Reproduce by running a game to R4 with NPC mergers landing (picker is now deterministic).

### P0 — UI requests from user

2. **Full-width sequential facilitator UI** — an in-flight agent (agentId `abace416e585dd3d0`) was launched to do this at end of session. Check its commit. If not landed, the task is: make facilitator view full-width (currently centered narrow), reorder sections so during NARRATE phase the order is: What Was Attempted → What Happened → Lab State → Compute Stock and Flow → Lab Allocations → R&D Progress chart → New Compute Acquired. Last three per explicit user request ("allocations 3rd-last, R&D chart 2nd-last, new-compute last").

   "New Compute Acquired" component **may not exist yet** — build it as a compact per-role list of this round's `acquired` ledger rows. Extract to its own file under `src/components/facilitator/` to keep `round-phase.tsx` under the 740-line max.

3. **Redesign facilitator resolve UI into three narrative sections with progressive reveal** (2026-04-22) — current layout shows Lab State + R&D chart the entire time, which spoils the reveal rhythm. Restructure the resolve/narrate view into three clearly-labelled sections that populate in order as the pipeline progresses:

   **Section 1 — "What was attempted"**
   - Shows the list of player/NPC actions submitted this round.
   - Once dice are rolled, actions migrate into two sub-groups: **Succeeded** and **Failed**.
   - Succeeded ones may carry a flag indicating they need review (today's EffectReviewPanel — a merger, decommission, ownership change, etc. that the facilitator should eyeball). Failed actions just sit grey in the Failed column.

   **Section 2 — "What happened"**
   - Narrative / effect descriptions from the decide LLM + structured effect summaries (merge X into Y, compute +3u, etc.).
   - Also where the narrative-phase text streams in.

   **Section 3 — "Where things are at"** (in this order, top to bottom)
   - **Lab state + allocations** (combined) — one component per lab showing name, R&D multiplier, compute stock, ownership, spec snippet, AND the coloured allocation blocks (deploy/research/safety) that `LabTracker` currently renders separately. Merge today's `WhereWeAreNow` lab cards with `LabTracker` into a single per-lab card. No separate "Lab Allocations" section.
   - **AI capabilities** component — currently missing from the UI after recent changes, needs to be restored. Sits directly below the combined lab state + allocations.
   - Compute stock + flow.
   - R&D multiplier chart (historical trajectory).
   - New compute allocation for this round.

   **Progressive display rule:** Sections 1 and 2 are visible from submit/rolling phases. Section 3 (lab state + R&D chart + new compute) should **only appear late** — once growth + acquisition have landed (i.e. post-P7, during or after narrative). Right now Lab State and R&D show the whole time, which kills the reveal.

   **Hook points:** `src/components/facilitator/round-phase.tsx` (main orchestration, phase gating), `src/components/facilitator/attempted-panel.tsx` (succeeded/failed split — this already exists for reveal, extend it with the review-flag badge), `src/components/facilitator/effect-review-panel.tsx` (fold into the Succeeded column as a flag, not a separate panel), `src/components/facilitator/new-compute-acquired.tsx` (move into Section 3), R&D chart component (check current location — likely under `round-phase.tsx` or a neighbour).

   This is a significant restructure — consider a short Plan agent pass before implementing, and expect to keep `round-phase.tsx` under 700 lines by extracting section components.

   **Step 9 — visual hierarchy + logical-flow review** (do this after all content moves land, before the PR merge). Step back and look at the whole facilitator screen as a facilitator would. Things to check explicitly:
   - **Section peerage**: do S1 / S2 / S3 read as three clearly-labelled siblings, or do internal panel titles ("WHERE WE ARE NOW", "WHAT HAPPENED") compete with the section headers? May need a single section-header band above each section's cards so the three-part structure is obvious at a glance on a projection.
   - **Spacing rhythm**: consistent card padding, consistent gap between sibling cards inside a section vs. gap between sections. Today each section is a stack of independent cards; consider whether sections should have a visible bounding wrap (subtle border or background tint) to group related cards.
   - **Progressive reveal beat**: when phase transitions submit → rolling → effect-review → narrate, do sections appear in order without layout jank? No unmount-remount flicker on the narrative panel? Section 3's pop-in after Continue should feel like a reveal, not a jump.
   - **Applied Effects placement**: currently lives as a separate card under the narrative. Decide: (a) second card under narrative (today), (b) collapsed summary-by-default with a "show effects" toggle, or (c) inlined into the narrative card as a sub-section. (a) is simplest; (b) reduces noise during narrate; (c) tightest but highest churn.
   - **Allocation block scale**: `ComputeDotsViz` renders 1 block per compute unit. At 200u+ this becomes a large rectangle and dominates the lab card. Consider capping to 50 blocks with a "×N" multiplier label, or switching to a proportional bar at high counts.
   - **Narrate-only R&D chart vs. always-on before**: the chart used to be always-visible below the fold. Now gated to `narrate`. Confirm this is the right call for facilitators who want to glance at trajectory during submit/rolling — maybe the chart should appear during submit/rolling too, just without the current-round dot. Decide.
   - **Debug panel position**: DebugPanel is still at the bottom. Confirm it's below Section 3 in the new layout and doesn't visually break the section hierarchy.
   - **Projector view**: load `?projector=true` and sanity-check. Many of the facilitator-only UIs (Continue bar, Edit narrative, merge buttons, regenerate) should be absent. No clipped content, no tiny text.

   Only after this polish pass should the PR be marked ready.

4. **Auto-expand "What Was Attempted" when the submit timer expires** (2026-04-23) — today the panel stays collapsed (its default closed state) once the submit timer runs out, forcing the facilitator to click to see what the tables submitted. Auto-expand when `isTimerExpired` becomes true so the facilitator can immediately scan actions before grading. Hook point: `src/components/facilitator/attempted-panel.tsx` — `defaultExpanded` currently keys on `isRollingOrNarrate && hasSubmissions`; extend to also expand when `phase === "submit" && isTimerExpired` (phase prop already passed in; need to thread `isTimerExpired` through `AttemptedSection` or derive from `phaseEndsAt` inside the component). Preserve the existing `userExpanded` tri-state override so manual collapse still works.

6. **Defer new-compute acquisition to the Advance button** (2026-04-23) — today `continueFromEffectReview` runs phase 10 (acquisition) immediately after growth, so during narrate the players already have the new compute visible in their tables. User wants the mechanical landing tied to the round transition: "this is what's coming at Q2 start", not "this just happened". Plan:
   - Schema: `round.pendingAcquired?: Array<{ roleId: string; amount: number }>`.
   - Pipeline: `applyGrowthAndAcquisitionInternal` stops writing `acquired` ledger rows + patching tables; instead stashes the computed amounts into `round.pendingAcquired`. Growth still lands this round.
   - `advanceRound` mutation: before incrementing `currentRound`, read `round.pendingAcquired` for the round being left, write the `acquired` rows + patch table stocks, clear `pendingAcquired`.
   - `NewComputeAcquired` component: read `pendingAcquired` from the round document as the primary source; fall back to the legacy `getComputeHolderView.acquired` only if `pendingAcquired` is absent (for rounds resolved before the change lands). Banner reads "Applied at start of next round".
   - Editability uses a new mutation `updatePendingAcquired(gameId, roundNumber, amounts)` that overwrites `round.pendingAcquired`.
   - Narrative prompt: still uses post-growth `labsAfter`, but the compute stocks in that snapshot should *not* include pending acquisition (since it hasn't landed). Check `snapshotAfterInternal` and adjust which stocks it reads.
   - Lab cards: the `stock_before → stock_after (+delta)` shown on the card during narrate currently includes acquisition. Once deferred, the delta should reflect merge/transfer/adjust ops only — acquisition lives in its own component.

   Non-trivial because several components assume acquisition already landed by narrate. Do this as its own PR with clear smoke-test through 2 rounds showing the compute arriving at the advance click, not earlier.

7. **Write event-driven pipeline tests covering consequential actions** (2026-04-23) — we have unit tests for grader/narrate diff and a few game-logic primitives, but no integration test exercises the full resolve pipeline through a round with genuinely consequential, LLM-decided effects. Add fixtures + tests for:
   - **Compute destruction**: Taiwan bombed → TSMC offline → large `computeChange` negative ops across all labs, then subsequent rounds' new-compute totals drop. Assert ledger entries, lab stocks, and that R&D growth slows as expected given reduced stock.
   - **Data-centre cyber attacks**: compute stolen or disabled — either pure `computeChange` negative (destruction) or `computeTransfer`-style (taken over by attacker role). Assert source/sink conservation for transfers, non-conservation for destruction.
   - **Structural actions**: mergers (player + LLM-decided), splits (new-lab founding after spec divergence), decommissions, ownership transfers to real roles (never empty). Assert lab table state, `mergedIntoLabId` pointers, and that `appliedOps` summaries carry the correct role + intent text.
   - **Chained consequences in a single round**: e.g. cyber attack fails → retaliation decided by LLM → merger forced → multiplier override. Assert ordering in `appliedOps` matches pipeline phase order (structural → compute → R&D).
   - **Reject cases**: LLM emits transferOwnership to unowned → rejected with plain-English reason; computeChange that overflows (>50 or <-50) → clamped; decommission targeting last active lab → rejected.

   Each scenario should build a minimal game state in `tests/` (probably via a harness that seeds Convex's `db` with labs/tables/submissions directly rather than going through the full submit→grade→roll path). Assertions at the ledger + rounds.appliedOps level, not the UI level.

   Hook points: `tests/game-logic.test.ts` already has basic pipeline plumbing; `convex/pipeline.ts` exports `rollAndApplyEffects` and `continueFromEffectReview` — drive them from a test harness with stubbed LLM responses so we're testing the validator + apply logic, not LLM behaviour. The structured NPC sample actions in `public/sample-actions.json` may be re-usable as fixtures.

### P1 — Follow-ups explicitly deferred from the resolve-pipeline.md plan

3. **Richer P7 flag surface** — current `appliedOps[].type === "rejected"` uses freeform strings. Replace with typed categories: `conflict`, `precondition_failure`, `invalid_reference`, `low_confidence_extraction`. Severity-ordered display. Hook points: `convex/pipeline.ts` rejection sites (merge/decommission/transfer/compute/multiplier validators), `src/components/facilitator/effect-review-panel.tsx`.

4. **Structured action vocabulary on grader output** — per `docs/resolve-pipeline.md` phase 2, grader should emit `{probability, structuredEffect, confidence}` per action. Today grader only emits `probability + reasoning`. Adding `structuredEffect` would let us replace the decide LLM with deterministic extraction (phase 5 derives ops from grader output, no second LLM call). Big change — split into its own PR.

5. **Split `labOperation` type into a discriminated union** — current shape at `convex/pipeline.ts:524` is a flat type with every field optional. Make it `{type: "merge", survivor, absorbed, newName?, spec?} | {type: "decommission", labName} | ...`. Mechanical refactor.

### P2 — Code quality

6. **`round-phase.tsx` too long** — 740 lines, above the 700-line warning. Extract at least:
   - `AdvanceRound` / `EndScenario` buttons into their own component.
   - The effect-review integration point is already extracted; continue with the narrate-phase bottom bar.

7. **Sample action generator script** — `convex/sampleActionsData.ts` says "DO NOT EDIT — auto-generated" but there's no script. Either write a `scripts/generate-sample-actions-data.mjs` that does `fs.readFile("public/sample-actions.json") → writeFile("convex/sampleActionsData.ts", ...)` or update the header to say "maintained in sync by hand" and add a test that asserts equality.

---

## How to resume

```
Read /Users/lukefreeman/code/ttx/app/NEXT-SESSION.md,
  /Users/lukefreeman/.claude/projects/-Users-lukefreeman-code-ttx/memory/feedback_orchestration.md,
  docs/resolve-pipeline.md.

The resolve pipeline refactor (PR #21) is open. Check if the UI-reorg agent
committed. Then pick up outstanding work from NEXT-SESSION.md in priority order.

Current branch: t3code/clarify-attempted-versus-happened.
Dev deployment: oceanic-lapwing-232 (ANTHROPIC_API_KEY and FACILITATOR_SECRET set).
Passphrase: coral-ember-drift-sage.
```
