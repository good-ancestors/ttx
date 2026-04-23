# Next Session — R&D + compute mechanic redesign

## State at handoff (2026-04-23 evening)

**Open PR:** [#21 — Resolve pipeline refactor + three-section UI + structured-effect grader](https://github.com/good-ancestors/ttx/pull/21)
**Branch:** `t3code/clarify-attempted-versus-happened`
**HEAD:** `f7707aa` (docs + narrative 4-domain, UX fixes, R&D chart fixes)

Prod Convex backend: `compassionate-hyena-205` — needs redeploy after this PR merges.
Dev Convex backend: `oceanic-lapwing-232`.
Passphrase: `coral-ember-drift-sage`.

## Why this redesign

A local playtest uncovered a trajectory bug: DeepCent at R3 sat at 5× when baseline should've been 80×. Root cause: grader emitted `multiplierOverride` for an R1 cyber-attack action, pipeline re-applied that override *after* R&D growth, permanently suppressing the growth curve. Every subsequent round started from the suppressed base.

Digging into it surfaced deeper conceptual problems with the current R&D + compute model:

1. **`rdMultiplier` is the capability of the deployed base model** — a property of the *trained model*, not of progress. Cyber attacks, sabotage, and seizures can't change it. Only swapping to a different base model can (safer pivot / breakthrough / merger).
2. **Compute is a conserved commodity.** Total system compute = starting + per-round acquisition pool. The LLM shouldn't invent compute via positive `computeChange` deltas. It can destroy compute (cyber attack physically frying hardware) or redistribute it (`computeTransfer`).
3. **There's a real velocity-layer gap.** Events like "facility offline for 1/3 of the quarter", "researcher exodus", "algorithmic insight" affect the lab's ability to turn compute into R&D progress *without* destroying compute or changing the deployed model. No current mechanism expresses this.
4. **R&D calculation currently uses post-acquisition stock.** The new compute that's supposed to arrive at end-of-round-for-next-round is being folded into this round's R&D. Phase 9 should run before phase 10.

The redesign below fixes all four cleanly.

## Four-layer mechanic model

| Layer | What it is | Changed by |
|---|---|---|
| **Position** — `rdMultiplier` | Capability of the lab's deployed base model | `breakthrough` (swap to new gen), `modelRollback` (swap to prior gen), `merge` (inherit absorbed lab's model if higher) |
| **Stock** — `computeStock` | Physical compute the lab can run on | Starting allocation; per-round acquisition pool; `computeTransfer` (redistribute); `computeDestroyed` (physical destruction); merger (combine) |
| **Velocity** — growth factor per round | Rate at which capability improves | Derived from stock × research% × multiplier × productivity, vs baseline performance ratio |
| **Productivity** — operational throughput | This round's effectiveness at turning compute into R&D | `researchDisruption` (facility downtime, talent exodus, cyber disruption without destruction), `researchBoost` (algorithmic insight, talent influx, tooling upgrade). One-round scope, defaults to 1.0. |

Growth formula (phase 9):
```
effectiveRd = stock × research% × rdMultiplier × productivity
           ↑ pre-acquisition stock
           ↑ productivity default = 1.0
```

Acquisition (phase 10) is a separate output — feeds next round's starting stock, doesn't affect this round's R&D.

## Taxonomy — final

Grader-emitted structured effects. LLM picks numerical magnitudes in **exactly one place**: `computeTransfer.amount`. Everything else is either semantic (code picks magnitude) or player-pinned.

| Effect | Layer | Mechanical application |
|---|---|---|
| `breakthrough { labName }` | position ↑ | `× random(1.4, 1.6)`, clamped to `maxMultiplier(round)` |
| `modelRollback { labName }` | position ↓ | `× random(0.4, 0.6)`, floored at 1 |
| `merge { survivor, absorbed, newName?, newSpec? }` | position + stock | Survivor inherits `max(mult)` + absorbed compute |
| `decommission { labName }` | structure | Removes lab |
| `transferOwnership { labName, controllerRoleId }` | control | Owner change; no R&D impact |
| **`computeDestroyed { labName, amount }`** *(renamed from `computeChange`)* | stock ↓ | `amount > 0`, clamped `(0, 50]`; emits negative ledger adjustment |
| `computeTransfer { fromRoleId, toRoleId, amount }` | stock ↔ | LLM picks amount; bounded by sender balance |
| **`researchDisruption { labName }`** *(new)* | productivity ↓ | `× random(0.5, 0.8)` one round only |
| **`researchBoost { labName }`** *(new)* | productivity ↑ | `× random(1.2, 1.5)` one round only |
| `foundLab { ... }` | new entity | Player-pinned; grader echoes shape |
| `narrativeOnly` | — | No mechanical effect |

### Grader prompt — conservation rules

- **Compute is conserved.** `computeDestroyed` is the only way compute leaves the system; `computeTransfer` redistributes existing compute. Never emit a positive `computeDestroyed` or invent compute via any other path.
- **Multiplier is model capability.** Only `breakthrough` / `modelRollback` / `merge` change it. Cyber attacks, sabotage, bombing, nationalisation DO NOT change multiplier — they route through `computeDestroyed` (hardware destroyed), `researchDisruption` (hardware offline without destruction), or `transferOwnership` (control changes, capability unchanged).
- **Productivity is one-round.** If the narrative still applies next round (e.g. the cyber disruption extends), grader re-emits next round.

### Validator — drastically simplified

- Delete `NARRATIVE_TRIGGER_RE`
- Delete ±2× band check
- Delete post-growth override re-apply block (`pipeline.ts:995-1008`)
- Add `computeDestroyed` positive-amount guard
- All magnitude rules now enforced deterministically in the apply path — no regex keyword matching

## New: audit log on round doc

Every write to `lab.rdMultiplier` or compute stock or productivity during phase 5 + 9 + 10 emits a structured log entry. Stored on `round.mechanicsLog[]`. Rendered in the P7 applied-ops section so the facilitator can inspect the full chronological chain before clicking Finalise.

```typescript
round.mechanicsLog?: {
  sequence: number;         // monotonic within round
  phase: 5 | 9 | 10;
  source: "player-pinned" | "grader-effect" | "natural-growth" | "acquisition" | "facilitator-edit";
  subject: string;          // lab name or role id
  field: "rdMultiplier" | "computeStock" | "productivity";
  before: number;
  after: number;
  reason: string;           // e.g. "cyber attack — researchDisruption ×0.65", "R1 natural growth"
}[]
```

Rendered under Applied Effects as a collapsible "Mechanics log ({N} entries)". Order: phase 5 effects in dispatch order, then phase 9 growth row per lab, then phase 10 acquisition row per role.

This closes the debuggability gap we hit on DeepCent — "why did this number come out this way" becomes a scannable 10–15 line list.

## Flow corrections

1. `computeLabGrowth` rewritten to use **pre-acquisition stock** for the `effectiveRd` calculation. Acquisition is a separate output.
2. `getBaselineStockBeforeRound` helper — baseline comparison uses start-of-round stock, matching the new formula semantics.
3. Delete `pendingMultiplierOverrides` field on rounds (no longer needed with override model gone).
4. Add `round.pendingProductivityMods` — labId → modifier for this round, consumed + cleared by growth phase.
5. Delete override re-apply block at `pipeline.ts:995-1008`.

## Ship plan — in order, one commit per slice

1. **Taxonomy + schema foundation**
   - `src/lib/ai-prompts.ts`: rewrite `StructuredEffect` union. Remove `multiplierOverride` + `computeChange`. Add `breakthrough`, `modelRollback`, `researchDisruption`, `researchBoost`, `computeDestroyed`.
   - `convex/schema.ts`: update `structuredEffect` validator; add `mechanicsLog` to round; add `pendingProductivityMods` to round; remove `pendingMultiplierOverrides` (or leave as optional unused).
   - `convex/submissions.ts`: extend `structuredEffectValidator` accordingly.

2. **Grader prompt rewrite**
   - `src/lib/ai-prompts.ts:buildBatchedGradingPrompt`: new effect taxonomy section with the four layers framing and the conservation principle.
   - Remove references to `multiplierOverride`, narrative-trigger keywords, ±2× band.

3. **Apply path rewrite**
   - `convex/pipeline.ts`: swap dispatch cases. `breakthrough` / `modelRollback` apply random factors with floor/ceiling. `researchDisruption` / `researchBoost` populate `productivityMods`. `computeDestroyed` enforces positive amount, emits negative adjusted ledger entry.
   - Delete `NARRATIVE_TRIGGER_RE` and the ±2× check.
   - Delete override re-apply block at lines 995-1008.
   - Stash productivity mods on round for continueFromEffectReview.
   - Emit `mechanicsLog` entries at each write.

4. **Growth formula fix**
   - `src/lib/game-data.ts:computeLabGrowth`: split into "R&D calculation" (uses pre-acquisition stock + productivity) and "acquisition calculation" (separate output). Accept productivity map as parameter.
   - Add `getBaselineStockBeforeRound` helper.

5. **UI updates**
   - `src/components/facilitator/effect-editor.tsx`: remove numerical multiplier input. New semantic-preview UI for `breakthrough`, `modelRollback`, `researchDisruption`, `researchBoost`. `computeDestroyed` accepts positive magnitude only.
   - `src/components/facilitator/resolve-sections/happened-section.tsx`: render `mechanicsLog` under Applied Effects as a collapsible section. Each entry: phase badge · subject · field · before → after · reason.

6. **Tests**
   - `tests/r-and-d-growth.test.ts` (new): baseline trajectory pinned — 1 round of growth lands OpenBrain / DeepCent / Conscienta within ±10% of R1 baseline targets.
   - Bidirectional model swap: `modelRollback` halves (floor 1), `breakthrough` ×1.5 (ceil maxMult).
   - Productivity layer: disruption + boost applied correctly, don't persist across rounds.
   - Conservation: positive `computeDestroyed` rejected.
   - R&D uses pre-acquisition stock (regression pin).

7. **Docs**
   - `docs/resolve-pipeline.md`: four-layer mechanic model, corrected phase 9/10 ordering, new effect taxonomy table, conservation principle.
   - Update `tests/ai-prompts.test.ts` assertions for prompt content changes.

## Open follow-ups (carried from previous session)

These are playtest-driven polish and are not blocked on the redesign:

- **Player-side structured-effect detection** — nudge players toward the structured UI when freeform text smells mechanical.
- **Pre-fill structured effects in NPC sample data** (`sampleActionsData.ts`). Makes NPC rounds deterministic + LLM-free.
- **Click-through gate for low-confidence effects** — disable Roll Dice until all low-confidence rows acknowledged.
- **Effect-path scenario harness fixtures** — TSMC bombed, cyber takedown, hostile merger, etc. Each burns real-LLM budget but pins end-to-end behaviour.
- **Lab split effect type** — `splitLab` or `foundLab`+`computeTransfer` pair. Narrative for a safety team spinning off.
- **Section-header visual hierarchy polish** (low priority).

## How to resume

```
Read NEXT-SESSION.md, docs/resolve-pipeline.md,
  src/lib/game-data.ts (computeLabGrowth), convex/pipeline.ts
  (rollAndApplyEffects + continueFromEffectReview dispatch).

The redesign has been reasoned through end-to-end — ship in order of
the 7 slices above, running the full verification pipeline (tsc ·
lint · knip · tests) between slices. Each slice should keep the tree
green.

The four-layer mental model — position / stock / velocity / productivity
— is the north star. Every effect type must map to exactly one layer.
If a new narrative case comes up that doesn't fit, resist adding an
eighth effect type; first try to express it through existing layers.

After slices 1-7 land, rerun the local smoke test (npx convex dev +
npm run dev) with the existing game or a fresh one. Verify: the
mechanics log displays correctly at P7; breakthrough + rollback land
semantic values; productivity mods show in the log and affect growth
but not next round; computeDestroyed is positive in UI and negative in
ledger.
```
