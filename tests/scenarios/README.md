# Scenario test harness

Reusable harness for driving consequential-event playtests without relying on
LLM randomness or the grader's probability calibration. Scenarios are JSON
fixtures that declare:

- Starting state overrides (optional lab edits, compute overrides)
- Submissions per role per round, with **forced probability + dice rolls**
- Expected outcomes at the ledger / appliedOps level

The harness runs the full pipeline (rollAndApplyEffects → effect-review →
continueFromEffectReview → advanceRound), asserts expected state at each
checkpoint, and records what actually happened for regression diffs.

## Why forced probability + dice?

NPC sample actions pick up a probability from the grader LLM, which is
non-deterministic and costs real money. For pipeline-level tests we don't
care whether the grader would rate action X at 30% or 70% — we care what
the pipeline does when a specific action succeeds or fails. So the harness
calls `api.submissions.overrideProbability` to set it explicitly, then
either lets the roll resolve (for randomness tests) or overrides the dice
result via `api.submissions.rerollAction` in a loop until a specific outcome
lands. For deterministic tests prefer `forceSuccess: true` or `forceFail:
true` on each action.

## Writing a scenario

Each scenario is a `.ts` file in this directory exporting a `Scenario`
object. See `scenarios/example-forced-merger.ts` for the template.

## Running scenarios

```
# Against local dev Convex (requires `npx convex dev` running):
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 npx tsx tests/scenarios/harness.ts example-forced-merger

# Against a deployed cloud environment:
NEXT_PUBLIC_CONVEX_URL=https://oceanic-lapwing-232.convex.cloud npx tsx tests/scenarios/harness.ts example-forced-merger
```

## Scenarios to add

Per NEXT-SESSION.md #7 the priority scenarios to cover:

- **TSMC bombed** — facilitator triggers a large `computeDestroyed` across
  all labs; subsequent round's baseline acquisition drops as pools shrink.
- **Cyber takedown** — attacker role drains compute from target via a
  `computeDestroyed` + `researchDisruption` pair on a succeed/fail roll;
  verify ledger source/sink.
- **Forced merger + orphan guard** — LLM tries to unown a merged lab;
  verify the guard rejects it as `precondition_failure`.
- **Lab split** — `foundLab` action with seed compute; verify new lab
  created + seed debited from founder.
- **Chained round** — cyber attack fails → retaliation decided → merger
  forced → breakthrough; verify `appliedOps` ordering.
- **Destruction non-conservation** — `computeDestroyed: 30` pure loss;
  verify ledger doesn't require a counterparty.
