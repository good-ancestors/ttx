# Next Session

## State at handoff (2026-04-24)

**Open PR:** [#21 — Resolve pipeline refactor + three-section UI + structured-effect grader](https://github.com/good-ancestors/ttx/pull/21)
**Branch:** `t3code/clarify-attempted-versus-happened`
**HEAD:** `ed1aac8` (simplify normaliseStructuredEffect)
**PR state:** `MERGEABLE` · Vercel `SUCCESS` · 190/190 tests pass · tsc clean · lint 0 errors (15 pre-existing warnings) · knip clean.

Prod Convex backend: `compassionate-hyena-205` — clean (0 games). **Needs redeploy after PR merges.**
Dev Convex backend: `oceanic-lapwing-232` — has stale games that keep respawning; untangle if problematic.
Passphrase: `coral-ember-drift-sage` (env: `NEXT_PUBLIC_FACILITATOR_PASSPHRASE` · `FACILITATOR_SECRET`).

## What's done

The R&D + compute mechanic redesign shipped across the 7 planned slices plus
post-review follow-ups:

- **Four-layer model** (position / stock / velocity / productivity) — `docs/resolve-pipeline.md`.
- **Taxonomy landed** — 11 `StructuredEffect` variants; LLM picks magnitude only for `computeTransfer.amount`.
- **Conservation enforced** — `computeDestroyed` must be positive; `computeTransfer` must be between different roles.
- **Mechanics log** — every phase-5/9/10 write to rdMultiplier / computeStock / productivity is captured on `round.mechanicsLog[]` and rendered under Applied Effects as a collapsible audit trail.
- **Phase ordering fix** — phase 9 growth runs before phase 10 acquisition; `computeLabGrowth` uses pre-acquisition stock.
- **Validator simplified** — narrative-trigger regex + ±2× band check deleted.
- **P7 idempotency guard** — phase-9 entries in `mechanicsLog` detect prior runs, prevent double-application.
- **`continueFromEffectReview` resilience** — restoreSnapshot clears all round-doc transients; `resetLabsToSnapshotInternal` restores full structural state.
- **Low-confidence click-through gate** — Roll Dice disabled until all `confidence: "low"` rows are acknowledged.
- **Facilitator validation** — updatePendingAcquired + overrideHolderCompute reject non-finite / negative amounts.
- **NPC pre-fill** — all **402 sample actions** carry a pre-baked `structuredEffect`. Data sits in `public/sample-actions.json` ready for grader short-circuit.
- **Perf** — events table has composite `(gameId, timestamp)` index; `getSinceForRound` range-scans.
- **Code quality** — `normaliseStructuredEffect` is now table-driven; PR-wide simplify passes dropped ~400 lines.
- **Smoke-tested** on localhost via Claude Preview MCP: grade → roll → apply (4 effects applied, transferOwnership rejected by dice) → narrate all working end-to-end.

## Outstanding — ordered by leverage

### 1. Wire the NPC grader short-circuit
The data is pre-filled (402 actions with `structuredEffect`), but the pipeline still hits the grading LLM for NPC actions. Short-circuiting would make NPC rounds **free + deterministic**.

Shape of the work:
- Thread sample action's `structuredEffect` onto the submission (new optional field on submissions row).
- In `submissions.gradeAllPendingForRound` (or equivalent), if every action in a role's batch has a pre-baked effect, synthesize the graded output locally and skip the LLM call. Fall back to LLM if any action is missing a pre-baked effect (e.g. a human wrote a free-form action).
- Tests: scenario fixture that runs a full NPC-only round with no LLM calls.

Risk: moderate. Touches submission schema + grading dispatch; needs a careful fallback path for mixed human/NPC tables.

### 2. Player-side structured-effect nudge
When a human player types a freeform action that "smells mechanical" (mentions a merger, strike, compute transfer), nudge them toward the structured UI.

Shape: keyword regex over action text → inline tooltip pointing at mergeLab / foundLab / computeTargets. Low-risk UX-only change.

### 2a. Expand sample-actions compute-transfer/request coverage
The NPC/AI auto-transfer (30-50% of stock auto-sent to an endorsed lab at submission time) was removed — every ledger transfer must now originate from an action that goes through resolve. Sample actions covering `structured: {kind: "computeTransfer"}` (send) and `{kind: "computeRequest"}` (receive-from-target) are thin: ~9 current transfers across 402 actions. Expand to ~20-25 across the has-compute roles (`us-president`, `australia-pm`, `eu-president`, `us-congress`, `aisi-network`) so NPC rounds still surface realistic compute flow without the hidden auto-drip. Pair with `computeRequest` intents on lab-CEO roles so government-to-lab flows are mutual.

Risk: data-only change, low. May also need a `kind: "computeRequest"` variant if the current schema doesn't support it (check `SampleAction.structured` union).

### 3. File splits — last remaining lint warnings
Four files still trip `max-lines` (>700) after the latest cleanup pass nuked all
complexity warnings via in-place helper extraction. These are the only warnings
in the tree:

- `convex/pipeline.ts` (1193) → `apply.ts` (phase 5 dispatch) + `continue.ts` (phase 9 + 10 + narrate trigger) + `helpers.ts` (findActiveByName, logEntry, clampProductivity dispatch, plus the new `resolveAiInfluencePass` helper).
- `convex/submissions.ts` (1251) → grading mutations + submission mutations + the new settlement helpers (`settleFoundLabAction`, `settleMergeLabAction`, `settleComputeTargetsAction`) + the validate helpers (`assertSaveAndSubmitContext`, `validateFoundLabIntent`, `validateMergeLabIntent`).
- `convex/games.ts` (997) → restoreSnapshot helpers (`restoreLabsFromSnapshot`, `clearRoundResolveData`, `rebuildLedgerState`) could move to a new `convex/snapshots.ts`; lobby/lab mutations could split off too.
- `src/components/action-input.tsx` (787) → ActionCard + ActionControlsRow + the four pickers/forms could split into `action-card.tsx` + `action-pickers.tsx`.

Risk: medium-high for Convex (function references live in generated code, must regen + verify), low for client components. Do it in a separate PR with a careful verify loop.

Also: `convex/aiGenerate.ts` has two `eslint-disable-next-line complexity` comments on `generateAll` and the AI-table generation map. Pre-existing, justified by orchestration complexity. Worth tackling as part of an aiGenerate split (NPC path / AI path / submit path).

### 4. Component tests — MechanicsLogPanel + EffectEditor
MechanicsLogPanel is a local function in `happened-section.tsx`; extract + export to enable testing.

EffectEditor already exported — add tests covering `describeEffect` over every StructuredEffect variant, plus the merge-pinned render branch.

Pure addition, low risk.

### 5. mechanicsLog growth cap
No upper bound today. A malformed apply loop could in theory inflate the array. Add `if (mechanicsLogPhase5.length > 200) break` or similar defensive cap.

### 6. Scenario harness CI wiring
`tests/scenario-runner.ts` + `tests/scenarios/` exist but aren't wired to CI — each run burns real-LLM budget. A nightly scheduled run over a pinned set of scenarios (TSMC strike, hostile merger, cyber takedown) would catch end-to-end regressions. Needs a GitHub Action + budget guardrails.

### 7. Lab split effect type
Design decision: is a safety-team spin-off its own effect type (`splitLab`) or just a `foundLab` + `computeTransfer` pair? The pair expresses it today; a dedicated type would read more naturally in the narrative and the mechanics log.

### 8. "The AIs" role — secret compute acquisition + covert lab founding
Design question: should `ai-systems` actions tagged `secret: true` be allowed to (a) request compute from another role in a way that is **hidden from the target role** (the player's table sees the inbound request framed as a normal transfer from a plausible third party, letting the AI effectively "steal" compute through social engineering), and (b) found a new lab whose existence is hidden from everyone except the facilitator until a disclosure event?

Current behaviour: compute requests surface at the target's table for accept/decline and labs appear in every state panel on creation. The AI role has no asymmetric-information affordance comparable to human "secret" actions.

Considerations:
- Schema: needs a `visibility` flag on `computeTransactions` (and a filter on `getComputeHolderView` / request queries) and a `hidden: boolean` on `labs` with a parallel filter on lab views.
- UX: facilitator dashboard shows everything; targets see a plausible-but-false reason string; disclosure triggers (capability tier reached, audit event) flip the `hidden` flag and back-reveal prior history.
- Risk: enlarges the trust boundary — bugs here leak game-breaking information. Needs careful testing on view-projection queries (`getFacilitatorState`, `getComputeHolderView`, the table player endpoint).
- Alternative framing: keep mechanics as narrative-only for now and handle the deception via the facilitator's verbal description, avoiding schema churn.

Decide before wiring up.

### 9. After the PR merges
- Prod Convex deploy (`npx convex deploy --prod`).
- Smoke on prod: one fresh game, one full round, validate mechanics log renders.
- Clear out dev Convex stale games + rogue game-creation source (something respawns them — probably an abandoned browser tab or test harness).

## How to resume

```
Read NEXT-SESSION.md, docs/resolve-pipeline.md,
public/sample-actions.json (skim the structuredEffect coverage),
convex/pipeline.ts (rollAndApplyEffects + continueFromEffectReview),
convex/submissions.ts (gradeAllPendingForRound).

The pipeline is in good shape — the four-layer mental model (position /
stock / velocity / productivity) is the north star. Any new narrative
case should route through an existing layer before a new effect type is
considered.

For the NPC short-circuit (item 1): the pre-baked data is in
public/sample-actions.json and convex/sampleActionsData.ts. The wire-up
lives in convex/aiGenerate.ts (NPC submission path) and
convex/submissions.ts (grading path). A fixture scenario verifying
zero-LLM round completion is the acceptance test.

Run the full verification pipeline (tsc · lint · lint:dead · test)
between slices. Keep the tree green.
```
