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

### 10. Two-reviewer pass: deferred findings

A correctness lens (A) and a production-readiness lens (B) reviewed the full PR
post-simplify. Three CRIT/MAJ findings landed in this PR; the rest are deferred.

**Correctness — pipeline-iteration-vs-apply-mutation order (A-MAJ-1, A-MAJ-3).**
Pipeline iterates `effectsToApply` in submission/action order, but the apply
mutation has a fixed type-bucket order (adjusted+merged → mergeOps → decommission
→ transferOps → foundLab). When a single round mixes `computeDestroyed` /
`computeTransfer` outflow with `transferOwnership` of the same role's lab,
`mechanicsLog` `before/after` numbers (logged in pipeline iteration order) can
diverge from actual ledger end-state (which always applies adjusted before
transferOps). Fix: build the mechanics log inside the apply mutation after live-
state reads, or sort `effectsToApply` to match the apply order.

**Correctness — `resetLabsToSnapshotInternal` silent skip (A-MAJ-2).**
`convex/labs.ts:287-322` silently skips snapshot entries whose `labId` no longer
exists. Called from `pipeline.ts` on the in-place re-resolve path (no remap pass).
If a lab in `labsBefore` was hard-deleted between the original resolve and a
re-resolve, it's silently NOT recreated. Fix: error out, or use the same insert-
with-remap pass as `restoreLabsFromSnapshot`.

**Correctness — post-merge absorbed-owner pool acquisition (A-MAJ-4).**
`convex/pipeline.ts:1262-1276` builds `activeOwnerRoleIds` from post-growth
`grownLabs`. After a phase-5 merger the absorbed lab's old owner roleId is gone,
so `calculatePoolNewCompute` treats them as a non-lab pool role. For lab-CEO-
tagged roles this is wrong. Fix: also exclude lab-CEO-tagged roles from pool
acquisition, or zero the absorbed-owner's table.computeStock on merge.

**Correctness — resolving-lock release at P7 (A-MAJ-5).**
`setPhaseEffectReviewInternal` releases `resolving: false` at the P7 pause. A
stray `triggerRoll` from a different facilitator tab during P7 review would
launch a new resolve while pendingProductivityMods + mechanicsLog are still on
the round. Fix: in `triggerRoll`, also reject when `phase === "effect-review"`.

**Correctness — re-resolve through rolling-phase path (A-MAJ-6).**
`convex/pipeline.ts:567` runs `clearRegenerableRowsInternal` before
`resetLabsToSnapshotInternal` on re-resolve. On first-time resolve this is fine;
on re-resolve through the same path (no snapshot restore), `tableComputeByRole`
reflects ledger state including prior-run player-pinned settlements that are now
structurally inconsistent with the reset labs. Fix: block re-resolve through this
path entirely (force users through `restoreSnapshot`), or fully reset
`table.computeStock` from baseline + non-action ledger rows.

**Correctness — minor follow-ups (A-MIN-1..7).**
- `mergeLabsWithComputeInternal` silently drops absorbed compute on owned-into-
  unowned merge — emit `adjusted -X` instead.
- `cappedMechLog` allocates entries beyond the cap before slicing — fold the
  room-left check into `pushLog`.
- `MAX_MECHANICS_LOG_ENTRIES` constant duplicated (200) in pipelineApply.ts.
- `transferOwnership` mechanicsLog `subject = target.name` but `after` is the new
  owner's combined stock — confusing. Split into two log entries.
- `try/catch` on "request already exists" in `sendHintsForRole` was hardened in
  this PR (logs non-idempotency errors); pattern could be applied elsewhere.
- `advanceRound` on round 4 doesn't materialise round-4 `pendingAcquired`.
  Document the design or materialise on `finishGame`.
- `transferLabOwnershipInternal` doesn't enforce one-lab-per-role — `addLab`
  rejects this case but the structural transfer path doesn't.

**Coverage gaps (A — testing).** Not addressed in this PR.
- No end-to-end compute-conservation test across a full round.
- P9-before-P10 ordering tested in pure function only, not at live-pipeline level.
- Snapshot-restore + re-resolve round-trip — the path the CRIT-1/CRIT-2 fix
  lands on this PR — should grow an integration test in the scenario harness.
- mechanicsLog idempotency guard untested.
- transferOwnership compute-follows-the-lab apply-path test missing.
- Scenario harness wiring to CI is in #6 above.

**Production — nice-to-haves (B-MIN-1..4).**
- Effect-editor popover lacks Tab-cycle trap (has aria-modal + ESC + initial focus).
- Some toggles in `action-input-pickers.tsx` use `min-h-[36px]` vs the 48px target
  — regression-of-policy not regression-of-code (source already had similar).
- `getFacilitatorState` payload roughly doubled with the new action fields —
  bounded at event scale (~50 actions) but worth a note.
- Narrative LLM fallback writes a placeholder summary but `updatePipelineStatus`
  uses `step: "narrating"` with the error in `detail`. Consider a `step:
  "warning"` literal so the facilitator UI distinguishes it from success.

**Day-of-event runbook gaps (B).**
1. Pipeline-stuck recovery — `clearResolution` exists; needs labelled "force
   unstick" button and bookmark `npx convex logs --prod --history 50`.
2. LLM 5xx storm fallback — document the manual `overrideProbability` +
   `overrideStructuredEffect` flow with screenshots.
3. Snapshot-restore walkthrough on prod-deployed code, before the event.
4. Cost ceiling — facilitator should know NPC kill switch if AI-mode round costs
   spike.
5. Projector test — confirm the three-section facilitator dashboard renders at
   1920×1080 on the **physical venue projector**, not just Claude Preview MCP.
6. Browser-refresh during effect-review — confirm the new `effect-review` phase
   re-hydrates correctly mid-round if the laptop sleeps and reawakens.

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
