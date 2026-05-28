# Post-Playtest Plan — Simplify, Simplify, Simplify

Captured 2026-05-28 from facilitator (Nathan) and Emily/Greg co-facilitation feedback.

## Guiding takeaway

The single strongest piece of feedback was that **there is too much text** — both on the projector and in the table app — and not enough time to process it. Participants left feeling overwhelmed.

The *experience* we actually want people to walk away with is **empathy for the role they played**: feeling the constraints, fears, and incentives of (e.g.) the Chinese AI safety lead or Sam Altman. The "AI is moving scarily fast" feeling comes for free from the game mechanics; we don't need to teach it.

Everything below is in service of that: less text, fewer decisions per turn, more legibility, more empathy.

---

## 1. One action per table per turn

**Problem:** Tables learned they could spam multiple actions per turn to get more things to happen. This (a) created a meta-game that distracted from role empathy, (b) made probability-setting impossible for co-facilitators, and (c) flooded the narrative.

**Change:** Hard-cap submissions at **one action per table per turn**. Remove the priority slider and the multi-action draft UI.

**Affected:**
- `convex/submissions.ts` — submit mutation should reject `actions.length > 1`.
- `src/components/table/RespondTab.tsx` and `TableSubmit` — collapse to a single text field.
- `src/components/table/ActionInputPickers` — `computeTargets`, `foundLab`, `mergeLab` still available, but attached to the single action.
- Grading + resolve pipeline (`convex/aiGenerate.ts`, `convex/pipeline.ts`) — already loops per action; behaviour is unchanged when length is 1.

**Open question:** Should we further restrict the *action space* (e.g. a menu of action archetypes) rather than free text? Worth prototyping after the one-action cap is in place — may not be needed if narrowing the slot already calms things down.

---

## 2. Tighter, more legible narrative

**Problem:** LLM mistakes (even minor hallucinations) in the "What happened" section derailed the room. Participants stopped trusting the screen and started asking Greg to reconcile narrative vs. game state.

**Changes:**
- **At most 5 bullet points** in the round narrative. Progressive disclosure — reveal one at a time on the projector.
- **Explicitly tell players up front** that conflicting events get woven together into the narrative — set expectations so a surprising sentence doesn't break immersion.
- Constrain the state space (fewer actions per turn → less for the LLM to weave → fewer hallucination opportunities).

**Affected:**
- `src/lib/ai-prompts.ts` — `buildResolveNarrativePrompt()` output schema: cap `outcomes` array at 5, request short single-sentence bullets.
- `convex/aiGenerate.ts` — validate cap; truncate if exceeded rather than failing.
- `src/components/facilitator/resolve-sections/happened-section.tsx` — progressive reveal UI (one bullet per click/timer tick).

---

## 3. Show the die roll on the main screen

**Problem:** Participants didn't understand *why* their action did or didn't happen. The probability + die roll happen invisibly server-side.

**Change:** After submissions close, walk through each table's action on the projector **one at a time**, showing:
- Who took the action
- The action text
- The probability
- An animated 3D die roll landing on the result (1–100)
- Whether it succeeded or failed

Reference dice animation is in the conversation (CSS 3D cube, ~1.8s settle). Adapt to brand tokens, use as a React component driven by the already-recorded `action.rolled` value.

**Affected:**
- New component, e.g. `src/components/facilitator/dice-reveal.tsx`.
- `src/app/game/[id]/facilitator/page.tsx` — new phase step between submissions close and effect-review, or fold into the existing `rolling` phase with a per-action stepper.
- `convex/pipeline.ts` — already stores roll results; no logic change needed, but we may want to pause between rolls so the projector can step through.

**Show alongside the roll, if not too cluttered:** who supported / opposed the action (we already render this on `AttemptedPanel`).

---

## 4. Key game state visible while players decide

**Problem:** Players wanted to know the game state while choosing their action, but the projector was showing instructions or narrative instead.

**Change:** During the discuss/submit phase, the main screen should show — alongside the countdown and instructions — the **current game state at a glance**:
- **R&D race graph** — who's winning
- **Compute allocation** — current holdings + this round's default new compute allocation
- **AI capabilities** — current frontier level per lab
- **Humanity-in-control indicator** — derived from end-of-round summary

**Affected:**
- `src/app/game/[id]/facilitator/page.tsx` — new "state at a glance" panel for `discuss` and `submit` phases.
- Likely new components in `src/components/facilitator/state-panels/`.
- Data already lives in `labs`, `gameRuntime`, `computeTransactions` — no new schema.

---

## 5. Turn instructions into affordances

**Problem:** Too much groundwork-laying at the start. Pie charts in the intro slides explaining compute distribution; verbal explanation of R&D multipliers, etc.

**Principle:** Don't *explain* a mechanic if the screen can *show* it. The act of watching new compute get allocated between rounds teaches the mechanic better than a slide.

**Examples to convert:**
| Currently explained verbally / on slide | Replace with affordance |
|---|---|
| Compute distribution pie chart | Live compute bar on projector, updated between turns |
| New compute allocation rules | Animated chips flowing into each lab between rounds |
| R&D multipliers | Multiplier shown as a badge on each lab card |
| AI capabilities tiers | Capability ladder on projector, lab tokens climb it |
| Action probabilities | Already shown — keep, but pair with the die roll (see §3) |

**Affected:** Intro slide deck (out of repo) — strip down. In-repo: lab card components, new "between rounds" animation step on the projector.

---

## 6. Re-open submissions for +30s after the timer closes

**Problem:** A few times we got locked out of the submission window because we weren't watching the timer and a table still needed more time. Once the phase advances, the submit UI is closed.

**Change:** Add a facilitator-only "**+30s, re-open submissions**" button visible during the `rolling` phase (and ideally for a short grace window after). Pushes `phaseEndsAt` forward and flips the phase back to `submit` if it has already advanced.

**Affected:**
- `convex/games.ts` — new mutation, e.g. `extendSubmissions({ gameId, seconds })`, which sets phase back to `submit` and bumps `phaseEndsAt`.
- `src/components/facilitator/FacilitatorNav` (or wherever the timer ±30s controls live) — add the re-open button. The existing +/-30s controls only adjust the running timer; this is the case where the timer has already expired.
- Edge case: if grading has already started for the round, we need to cancel/clear it. Worth checking `aiGenerate.ts` to confirm grading is idempotent on re-submit.

---

## 7. Clearer presenter mode

**Problem:** Presenter mode (the projector view used to run the game) needed clearer step-by-step guidance and full-page content per phase.

**Change:**
- One **full-screen panel per phase** — no competing sub-sections.
- Explicit "what to say / what to do next" prompts for the facilitator, in small text at the bottom of each phase.
- Step-by-step advance — large, obvious next-button.

**Affected:**
- `src/app/game/[id]/facilitator/page.tsx` — restructure to one phase = one full-screen layout.
- `src/components/facilitator/FacilitatorNav` — keep the timer + advance controls but get out of the way of content.

---

## Priority order for the next ticket pass

What to show on the main screen and when, in order of importance:

1. **Who's winning the race** — R&D graph (discuss/submit phase)
2. **Who's getting the compute** — allocation + default new-compute (discuss/submit)
3. **What actions people are taking** — end-of-round walkthrough (rolling phase)
4. **What's succeeding and failing** — animated dice rolls (rolling phase)
5. **Whether humanity has control** — end-of-round summary (narrate phase)
6. **Nice-to-have:** who supported / opposed each action (rolling phase, if it fits)

## Suggested implementation order

1. One-action-per-turn cap (smallest change, biggest behavioural impact) — §1
2. Narrative cap to 5 bullets + progressive disclose — §2
3. Dice reveal animation + per-action walkthrough — §3
4. State-at-a-glance panel during discuss/submit — §4
5. Re-open submissions button (+30s) — §6 (small, high-utility quality-of-life)
6. Full-page presenter phases — §7
7. Slide-to-affordance conversions — §5 (iterative; the easy wins first)

## Out of scope for this pass

- Constraining the action menu to archetypes (revisit after §1 lands).
- Re-architecting role handouts.
- Anything in `TODO.md` not directly tied to the simplification themes above.
