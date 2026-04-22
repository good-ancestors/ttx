# Resolve Pipeline

Canonical reference for round resolution — phase order, who owns each step, schemas for action submission, effect types, and narrative output. Supersedes the design sketches in `resolve-flow-review.md`.

## Legend

- **[AUTO]** deterministic code
- **[LLM]** model call
- **[FAC]** facilitator-driven
- **[CHAIN]** runs without pause unless a flag is hit

## Phase order

1. **Close round** **[FAC]** — facilitator locks submissions.
2. **Grading** **[LLM + FAC review]** — LLM emits `{probability, structuredEffect, confidence}` per action. Facilitator can override. Low confidence or missing probability → flag.
3. **AI influence resolution** **[AUTO + CHAIN]** — auto-boost AI Systems own actions; keyword influence on others.
4. **Dice roll** **[AUTO + CHAIN]** — ungraded actions fail silently → narrative-only, no mechanical effect.
5. **Effect application (ordered)** **[AUTO + CHAIN]**
   1. Inter-role compute transfers
   2. Lab foundings
   3. Lab splits
   4. Ownership transfers
   5. Mergers
   6. Decommissions
   7. Lab-internal changes (redomicile, allocation, spec)
   - Preconditions checked between steps; failures marked with a reason, not silently dropped.
6. **Flag collection** **[AUTO + CHAIN]** — conflicts, blocked preconditions, low-confidence extractions, over-commits.
7. **Facilitator review** **[FAC]** ← mandatory pause
   - Applied effects (collapsed) + flags (expanded) + manual tools.
   - Most rounds: zero flags, one-click continue.
8. **Share % changes recorded** **[AUTO + CHAIN]** — derived from effects + facilitator overrides; affects step 10.
9. **R&D posts** **[AUTO + CHAIN]** — for each active lab in final state: `compute × allocation × multiplier → progress`.
10. **New compute acquired** **[AUTO + CHAIN]** — per updated shares, distributed to role pools. Tail of this round, becomes start state for next round.
11. **Narrative + trajectories** **[LLM]** — reads frozen `(startState, actionLog, transactionLog, endState)`. Emits summary + facilitatorNotes + labTrajectories. Cannot contradict state because state is input.
12. **Facilitator narrative review** **[FAC]** ← optional — edit prose, regenerate (free).
13. **Publish + snapshot** **[AUTO]** — round marked complete, snapshot written.

Two mandatory pauses (P2 grading review, P7 effect review) and one optional (P12 narrative review). Everything else auto-chains.

## Merger semantics

When a player picks `merger` as action type, they choose:

- **Survivor** (dropdown) — keeps base R&D multiplier, controller, name, and spec unless overridden.
- **Absorbed** (dropdown) — compute and progress fold into survivor; lab decommissioned.
- Optional overrides: new name, new controller, new spec.
- Flavor text.

UI help text spells out these invariants so players know what merger does.

## Effect types

| Effect | Phase | Mutates |
|---|---|---|
| Inter-role compute transfer | 5.1 | role compute pools |
| Lab founding | 5.2 | new lab; role pool → lab |
| Lab split | 5.3 | parent + new lab; progress and compute distributed |
| Ownership transfer (nationalise, seize, cede) | 5.4 | `lab.controller` |
| Merger | 5.5 | absorbed folds into survivor |
| Decommission | 5.6 | lab removed |
| Redomicile | 5.7 | `lab.jurisdiction` — **attribute change, not ownership** |
| Allocation reallocation | 5.7 | `lab.allocation` (research / deployment / safety) |
| Spec change | 5.7 | `lab.spec` |
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
