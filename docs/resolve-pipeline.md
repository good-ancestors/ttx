# Resolve Pipeline

Canonical reference for round resolution — phase order, who owns each step, schemas for action submission, effect types, and narrative output. Supersedes the design sketches in `resolve-flow-review.md`.

## Legend

- **[AUTO]** deterministic code
- **[LLM]** model call
- **[FAC]** facilitator-driven
- **[CHAIN]** runs without pause unless a flag is hit

## Four-layer mechanic model

Every mechanical effect maps to exactly one of four layers. If a new narrative case seems to need a new effect type, first try to express it through an existing layer.

| Layer | What it is | Changed by |
|---|---|---|
| **Position** — `rdMultiplier` | Capability of the lab's deployed base model. A property of the model on disk, not of progress this round. | `breakthrough` (ship new model, ×1.4–1.6 clamped to maxMult); `modelRollback` (ship prior / safer model, ×0.4–0.6 floored at 1); `merge` (inherit higher of survivor / absorbed). |
| **Stock** — `computeStock` | Physical compute the lab can run on. **Conserved.** | Starting allocation (game-creation only); per-round acquisition pool (phase 10, feeds next round); `computeTransfer` (redistribute between two active role pools); `computeDestroyed` (destruction; positive amount; emits negative ledger adjustment); `merge` (combine). |
| **Velocity** — growth factor per round | Rate at which capability improves. Derived each round: `stock × research% × rdMultiplier × productivity`, compared to authored baseline to produce a performance-ratio multiplier update. | Not directly emitted. |
| **Productivity** — operational throughput | One-round effectiveness at turning compute into R&D. Defaults to 1.0. | `researchDisruption` (×0.5–0.8 — facility offline, researcher exodus, cyber disruption short of destruction); `researchBoost` (×1.2–1.5 — algorithmic insight, talent hire, tooling upgrade). One-round scope. |

**Conservation principle (compute).** Compute only enters the system via starting allocation and the per-round acquisition pool. The LLM never creates compute. It can destroy (computeDestroyed — ledger-logged) or redistribute (computeTransfer — between active role pools). Cyber attacks, sabotage, bombing, nationalisation route through `computeDestroyed` (hardware destroyed), `researchDisruption` (hardware offline without destruction), or `transferOwnership` (control changed, capability unchanged).

**Multiplier is model capability.** Only `breakthrough` / `modelRollback` / `merge` change `rdMultiplier`. Cyber attacks can't change which model is deployed — the model on disk is unchanged.

**LLM-picked magnitudes in exactly one place.** The grader only picks a number for `computeTransfer.amount`. Every other mechanical effect is semantic; the code picks the factor at apply time. This kills an entire class of grader misjudgement (the pre-redesign `multiplierOverride` free-for-all that produced the DeepCent trajectory bug).

## Phase order

1. **Close round** **[FAC]** — facilitator locks submissions.
2. **Batched grading** **[LLM + FAC review]** — ONE LLM call across all roles' submissions emits `{probability, reasoning, confidence, structuredEffect}` per action, matched back by stable `actionId`. Facilitator reviews in the attempted-panel: probability chip + effect badge per action. Low confidence auto-expands the effect editor for click-through acknowledgement. Player-pinned effects (`mergeLab` / `foundLab` / `computeTargets` on the submission) bind the effect shape; grader only assigns probability for those.
3. **AI influence resolution** **[AUTO + CHAIN]** — auto-boost AI Systems own actions; keyword influence on others.
4. **Dice roll** **[AUTO + CHAIN]** — ungraded actions fail silently → narrative-only, no mechanical effect.
5. **Effect application (ordered, deterministic — no LLM)** **[AUTO + CHAIN]**
   1. Player-pinned settlements (foundLab, mergeLab, computeTargets) — already materialised in rollAllImpl before this phase runs.
   2. Grader-emitted structured effects for successful actions, grouped by layer:
      - **Stock (conserved):** `computeTransfer` (role → role), `computeDestroyed` (positive amount, clamped to 50u and available stock; emits negative adjusted ledger row), `merge` (combines absorbed stock into survivor).
      - **Position:** `breakthrough` (× random(1.4, 1.6) clamped to `maxMultiplier(round)`), `modelRollback` (× random(0.4, 0.6) floored at 1), `merge` inherits `max(survivor, absorbed)`.
      - **Productivity:** `researchDisruption` (× random(0.5, 0.8)), `researchBoost` (× random(1.2, 1.5)). Stashed on `round.pendingProductivityMods` for phase 9 to consume. One-round scope.
      - **Structural / control:** `decommission`, `transferOwnership`.
   - Preconditions checked between steps; failures collected as `rejectedOps` with a category + message, not silently dropped.
   - Every write to `rdMultiplier` / `computeStock` / `productivity` appends to `round.mechanicsLog[]` (see audit log below).
6. **Flag collection** **[AUTO + CHAIN]** — rejected effects surface in the P7 panel alongside applied ones. Categories: `invalid_reference` (lab / role doesn't exist), `precondition_failure` (rule violation, e.g. self-merge, last-active-lab guard, non-positive `computeDestroyed`, sender stock < transfer amount).
7. **Facilitator review** **[FAC]** ← mandatory pause
   - Applied effects + rejections + collapsible mechanics log + manual tools.
   - Most rounds: zero rejections, one-click continue.
8. **Share % changes recorded** **[AUTO + CHAIN]** — derived from effects + facilitator overrides; affects step 10.
9. **R&D growth** **[AUTO + CHAIN]** — for each active lab: `effectiveRd = preAcquisitionStock × research% × rdMultiplier × productivity`, compared against authored baseline (same formula with the authored baseline stock + baseline multiplier) to produce a performance-ratio growth factor. **Uses pre-acquisition stock**: the new compute arriving at end-of-round does NOT feed this round's R&D. Consumes `round.pendingProductivityMods` then clears it (one-round scope).
10. **New compute acquired** **[AUTO + CHAIN]** — per updated shares, distributed to role pools. Computed INDEPENDENTLY of phase 9. Tail of this round, materialises at Advance (stashed in `round.pendingAcquired` until then).
11. **Narrative + trajectories** **[LLM]** — reads frozen `(startState, actionLog, transactionLog, endState)`. Emits summary + facilitatorNotes + labTrajectories. Cannot contradict state because state is input.
12. **Facilitator narrative review** **[FAC]** ← optional — edit prose, regenerate (free).
13. **Publish + snapshot** **[AUTO]** — round marked complete, snapshot written.

Two mandatory pauses (P2 grading review, P7 effect review) and one optional (P12 narrative review). Everything else auto-chains. **One LLM call for grading, one for narrative** — no decide pass.

## Structured effect taxonomy

Emitted by the grader at P2, applied deterministically at P5. Discriminated by `type`. Each effect maps to exactly one layer; the grader picks a numerical magnitude in exactly one place (`computeTransfer.amount`).

| Type | Layer | Fields | When to emit |
|---|---|---|---|
| `merge` | position + stock + structure | `survivor`, `absorbed`, `newName?`, `newSpec?` | DPA / Manhattan Project / forced consolidation; or player `mergeLab` (pinned) |
| `decommission` | structure | `labName` | Explicit destruction, nationalise-to-dissolve |
| `breakthrough` | position ↑ | `labName` | Lab ships a materially more capable next-gen model. Code picks ×1.4–1.6, clamped to `maxMultiplier(round)`. |
| `modelRollback` | position ↓ | `labName` | Lab reverts to / ships a less capable model (Safer pivot, forced downgrade). Code picks ×0.4–0.6, floored at 1. **Never emit for cyber / destruction** — the deployed model is unchanged. |
| `computeDestroyed` | stock ↓ | `labName`, `amount` (positive) | Hardware physically destroyed. `amount` clamped to (0, 50] and to available stock. Emits negative adjusted ledger row. Conservation violation if negative. |
| `researchDisruption` | productivity ↓ | `labName` | Facility offline, researcher exodus, cyber disruption without destruction. Code picks ×0.5–0.8 applied to this round's R&D growth only. Re-emit if narrative continues next round. |
| `researchBoost` | productivity ↑ | `labName` | Algorithmic insight, key talent hire, tooling upgrade. Code picks ×1.2–1.5 applied to this round's R&D growth only. |
| `transferOwnership` | control | `labName`, `controllerRoleId` | Nationalisation, forced acquisition. Empty controllerRoleId rejected — use decommission. Capability (`rdMultiplier`) is unchanged. |
| `computeTransfer` | stock ↔ | `fromRoleId`, `toRoleId`, `amount` | Narrative compute move between two active role pools. **The ONLY effect where the LLM picks a magnitude.** Bounded by sender's balance. |
| `foundLab` | new entity | `name`, `seedCompute`, `spec?` | Only pinned from player `foundLab` submission — grader doesn't invent these |
| `narrativeOnly` | — | — | Default. Action rolls + logs to narrative, no mechanical op |

Legacy `computeChange` and `multiplierOverride` are preserved in the Convex validator for back-compat on rounds persisted before the four-layer redesign. The grader no longer emits them and the apply path is a no-op; facilitator UI tags them `(legacy)` and prompts for a replacement.

## Mechanics audit log

Every write to `rdMultiplier`, `computeStock`, or `productivity` during phases 5, 9, and 10 appends a structured entry to `round.mechanicsLog[]`:

```ts
{
  sequence: number;          // monotonic within round
  phase: 5 | 9 | 10;
  source: "player-pinned" | "grader-effect" | "natural-growth" | "acquisition" | "facilitator-edit";
  subject: string;           // lab name or role id
  field: "rdMultiplier" | "computeStock" | "productivity";
  before: number;
  after: number;
  reason: string;            // e.g. "breakthrough ×1.52 (ceil maxMult 200)", "R2 natural growth"
}
```

Rendered in the P7 Applied Effects panel as a collapsible "Mechanics log ({N} entries)" section. Order: phase 5 effects in dispatch order, then phase 9 growth per lab, then phase 10 acquisition per role. Closes the debuggability gap that surfaced in the DeepCent trajectory bug — when a number moves unexpectedly, the full chain is scannable in 10–15 lines.

## Merger semantics

When a player picks `merger` as action type, they choose:

- **Survivor** (dropdown) — keeps base R&D multiplier, controller, name, and spec unless overridden.
- **Absorbed** (dropdown) — compute and progress fold into survivor; lab decommissioned.
- Optional overrides: new name, new controller, new spec.
- Flavor text.

UI help text spells out these invariants so players know what merger does.

## Effect application order (phase 5)

| Effect | Sub-phase | Mutates |
|---|---|---|
| Inter-role compute transfer (`computeTransfer`) | 5.1 | role compute pools |
| Lab founding (`foundLab`, player-pinned only) | 5.2 | new lab; role pool → lab |
| Ownership transfer (`transferOwnership`) | 5.4 | `lab.ownerRoleId` |
| Merger (`merge`) | 5.5 | absorbed folds into survivor (compute + max multiplier) |
| Decommission (`decommission`) | 5.6 | lab removed |
| Breakthrough / modelRollback | 5.5/5.6 | `lab.rdMultiplier` to final value (growth in phase 9 grows from there — no post-growth re-apply) |
| Compute destroyed (`computeDestroyed`) | 5.5 | negative `adjusted` ledger row on the owner's compute pool |
| Research disruption / boost | 5.7 | `round.pendingProductivityMods` — consumed by phase 9, cleared in phase 10 |
| Allocation reallocation | 5.7 | `lab.allocation` (research / deployment / safety) |
| Spec change | 5.7 | `lab.spec` |
| Redomicile | 5.7 | `lab.jurisdiction` — **attribute change, not ownership** |
| Share % change | 8 | next round's compute acquisition |

Redomicile is a jurisdiction attribute — changes which governments have leverage (affects future probability weighting) but does not transfer ownership.

## Action submission

Every action has:

- **Structured fields** — action type + type-specific fields (target, magnitude, etc.). Populated by the structured UI OR extracted by the grader from freeform text.
- **Flavor text** — optional narrative color. Fed to the narrative LLM; does not affect mechanics.

Rules:

- If flavor contradicts structured fields, structured fields win mechanically. UI should flag the mismatch pre-submit.
- Ungraded actions fail silently at P4 → narrative-only. Facilitator can hand-apply state changes via manual tools.

## Narrative schema

Replaces the 4-domain shape (labs / geopolitics / public / AI) which forced bucket-filling and generated non-event filler.

```
summary: {
  outcomes: string     // 2-3 sentences: what successful actions produced, meaning-level
  stateOfPlay: string  // 1-2 sentences: where key players sit now
  pressures: string    // 1-2 sentences: what's set up for next round
}
facilitatorNotes: string  // gods-eye, hidden dynamics
labTrajectories: [...]    // unchanged
```

### Narrative rules

- Describe outcomes and meaning, not attempts. The action log already shows what was tried.
- If a successful action produced no visible change in the world, don't narrate it.
- State numbers appear on UI cards — don't restate. Describe relative position.
- Write toward the next round: what's contested, what's set up, what's at stake.
- "Reasonably informed observer" visibility rule — don't reference non-public actions just to negate them.

`shareChanges` and `labOperations` are **not** in the narrative prompt. They are mechanical outputs produced earlier; the narrative LLM reads the final state and describes it.

## Facilitator checkpoints

| Checkpoint | Common | Weird |
|---|---|---|
| P2 grading review | ~10s scan + continue | 30s override |
| P7 effect review | 5s "no flags, continue" | 60–90s resolve flags |
| P12 narrative review | 30s read + publish | 60s edit or regenerate |

Per-round: 45s clean / 2–3 min weird. 8 rounds: 6–24 min total on resolve.

## Ledger invariant

Every compute-affecting state change (phases 5, 9, 10) emits a named transaction to the ledger. UI reads compute state **only** from the ledger — no computed-field drift.
