# E2E Testing Guide

Manual testing guide for The Race to AGI tabletop exercise app. Covers full game flow, role-specific mechanics, and adversarial scenarios.

## Setup for Efficient Testing

### Reduce unnecessary API calls

- Use **NPC** mode for tables you're not actively testing (draws from pre-authored sample actions, zero LLM calls)
- Use **AI** mode when testing AI-generated actions, grading quality, or AI proposals
- Keep 1-2 human players for interactive testing; NPC for the rest
- Use the **"Demo: Skip to AI Submissions"** button during discuss phase to auto-submit AI/NPC players with a 30s stagger
- The copilot, resolve, narrate, and grading endpoints all make real API calls — test these, just don't run them repeatedly for no reason

### Recommended minimal config

| Table | Mode | Why |
|-------|------|-----|
| OpenBrain CEO | Human | Lab spec editor, compute allocation, endorsement flow |
| The AI Systems | Human | Disposition chooser, lab directives view, influence panel |
| DeepCent CEO | NPC | Needed for lab mechanics, no API cost |
| Conscienta AI CEO | NPC | Third lab presence |
| United States | NPC | Government actions, compute stock |
| China | NPC | Geopolitical counterweight |

All other tables: disabled or NPC.

### Recommended full config (pre-event dry run)

Enable all 17 tables. Set 3-5 as Human (test different role types), rest as AI or NPC. Use AI for at least one of each tag type to verify prompt quality.

---

## Roles with Special Mechanics

### Lab CEOs (OpenBrain, DeepCent, Conscienta)

Tags: `lab-ceo`, `has-compute`

- **Compute Allocation**: 3-way slider (Users/Commercial, R&D/Capabilities, Safety/Alignment) that must sum to 100%. Visible during submit phase.
- **Lab Spec Editor**: "Your Lab's AI Directive" textarea. CEO writes the spec that shapes their AI's behaviour. Pre-filled with default from handouts.
- **Save Directive** button persists to Convex immediately.
- Endorsement suggestions auto-populate based on action keywords.

**Test**: Change allocation to 70% R&D / 20% Users / 10% Safety. Write a new spec. Submit actions. Verify allocation and spec appear in resolve context.

### The AI Systems

Tags: `ai-system`

- **Disposition Chooser** (lobby phase only): Select from 6 alignment types:
  - The Spec, Spec-Prime, Developer Intentions, Reward, Instrumental Goals, Compromise
  - Each has a full description shown in the chooser.
  - Once chosen, it persists for the entire game.
- **Lab Directives View** (submit phase): Read-only panel showing all 3 lab CEOs' current specs.
- **AI Influence Panel** (rolling phase): Secretly boost or sabotage other players' action rolls.
  - Power scales with leading lab's R&D multiplier: `min(90, log10(multiplier) * 30)`
  - Modifies probability invisibly (players don't see the modifier).

**Test**: Choose "Instrumental Goals" disposition in lobby. During submit, verify all 3 lab specs are visible. During rolling, verify influence panel appears with thumbs up/down on other players' actions.

### Roles with Compute Stock

US (8), China (6), EU (5), Australia (4), AISIs (2)

- These roles can receive compute transfer requests from other players.
- Compute transfers are automatic on accept, reversed on decline after accept.

**Test**: As OpenBrain CEO, send a compute request to United States for 3 units. Switch to facilitator view and verify the request appears. If US is NPC/AI, check it gets auto-responded.

### Safety Leads (OpenBrain, DeepCent, Conscienta)

Tags: `lab-safety`, `technical`

- No special UI controls, but their actions inform resolve context about lab safety posture.
- Paired with their lab CEO via `labId`.

### Government / Civil Society / Public

- Standard action input only. No special mechanics beyond role-specific sample actions and endorsement keywords.

---

## Phase-by-Phase Testing

### 1. Lobby

- [ ] Create game from splash page
- [ ] Verify game appears in game list after creation
- [ ] Set control modes: Human / AI / NPC via 3-way toggle
- [ ] Join as player via QR code or join code
- [ ] Verify "1/N tables connected" counter updates
- [ ] AI Systems: choose disposition, verify it persists
- [ ] Open QR Codes overlay, verify only human tables shown
- [ ] Click a QR code for fullscreen display
- [ ] Lock Game button (prevents new joins)
- [ ] Start Game button transitions to discuss phase

### 2. Discuss Phase

- [ ] Round narrative ("The Starting Gun") visible on both facilitator and player
- [ ] Player sees "Your Mission" brief + "Full Brief" expandable
- [ ] "How to Play" section expandable
- [ ] Compute Tip visible for lab CEOs
- [ ] Timer duration selector (2/4/6/8/10 min) on facilitator
- [ ] "Open Submissions" button advances to submit with timer
- [ ] No phantom timer before submissions opened
- [ ] QR Codes button in header works mid-game

### 3. Submit Phase

- [ ] Timer countdown visible on player and facilitator
- [ ] Timer pulse animation when < 60s
- [ ] Action input: type action text, press Enter to add
- [ ] Priority auto-decay: 1st action gets 10, 2nd gets 6/4, etc.
- [ ] "Need ideas?" section shows 3 sample actions
- [ ] Tap a sample action to auto-add it
- [ ] Secret toggle: mark action as covert
- [ ] Support button: opens endorsement chip suggestions
- [ ] Endorsement suggestions based on action keywords
- [ ] Lab CEO: compute allocation sliders (sum to 100%)
- [ ] Lab CEO: lab spec editor with Save Directive
- [ ] AI Systems: lab directives panel shows all 3 specs
- [ ] Submit Actions button sends to Convex
- [ ] Facilitator: submission tracker shows count per role
- [ ] Facilitator: "grading..." status appears after submission
- [ ] AI/NPC players auto-submit with staggered delays
- [ ] Skip Timer button available on facilitator

### 4. Endorsements and Requests

- [ ] Send endorsement request: select recipient, type action text, send
- [ ] Incoming request appears on recipient's table with Accept/Decline
- [ ] Accept endorsement: status updates on both sides
- [ ] Decline endorsement: status updates
- [ ] Send compute request: select recipient, enter amount
- [ ] Accept compute request: compute stock transfers
- [ ] Decline after accept: compute reverses
- [ ] Facilitator can see all requests in submission details

### 5. Rolling / Resolve Phase

- [ ] Facilitator clicks "Resolve Round"
- [ ] Dice results appear with staggered animation (200ms between reveals)
- [ ] Actions sorted by priority (highest first)
- [ ] Each action shows: role, text, priority, probability badge, roll/threshold, success/fail icon
- [ ] Secret actions show as "[Covert action]" with lock icon
- [ ] "Reveal secrets" button shows all secret text temporarily
- [ ] Probability override: click probability badge to cycle (10/30/50/70/90)
- [ ] Reroll: click dice icon to re-roll individual action
- [ ] Override outcome: flip success/fail on individual action
- [ ] "Resolving events..." counter shows streaming progress
- [ ] Player view shows "Resolving..." with their own action results
- [ ] AI influence applied invisibly (check `aiInfluence` field in DB)

### 6. Narrate Phase

- [ ] Facilitator sees: resolved events, narrative, facilitator notes, world state changes
- [ ] Player sees: "Q1 2028 - What Happened" with headlines + "Your Results"
- [ ] Headlines are short, impactful, ALL CAPS
- [ ] World state dials updated (values changed from starting state)
- [ ] Lab state updated (R&D multiplier, compute stock)
- [ ] "Edit narrative" modal allows manual text editing
- [ ] "Edit dials" modal allows manual world state adjustment
- [ ] "AI adjustment" modal opens copilot chat
- [ ] "Add Lab" button creates new lab entity
- [ ] "Advance to Next Round" button (with confirmation dialog)

### 7. Round Transitions

- [ ] Advancing round increments "Turn X/4" header
- [ ] New round narrative appears for correct round
- [ ] Previous round's world state persists as starting point
- [ ] Lab multipliers carry forward
- [ ] R&D Progress chart shows history across rounds

### 8. End Game

- [ ] Round 4: "End Scenario" button instead of "Advance"
- [ ] Confirmation dialog warns it's irreversible
- [ ] Game status changes to "finished" on splash page
- [ ] Finished games show "View Results" in game list
- [ ] Delete button available on finished/lobby games (not playing)

---

## Facilitator Copilot Testing

The copilot is a conversational assistant for mid-game adjustments.

### Basic queries

- "What did China do this round?" — should summarise China's actions and outcomes
- "How is OpenBrain doing?" — should describe lab state, allocation, recent actions
- "What's the current world state?" — should list all dial values

### Propose-then-confirm flow

1. Type: "Merge OpenBrain and Conscienta into one lab"
2. Copilot should propose changes (dry run) — world state, lab updates
3. Click "Apply changes" to confirm
4. Verify changes reflected in game state
5. Click "Undo" to revert
6. Verify game state restored

### Adjustment examples

- "Increase US-China tension to 8" — should propose worldState change
- "Give China 5 more compute units" — should propose lab update
- "Add a new lab called Anthropic" — should propose new lab entity
- "The narrative should mention the Taiwan crisis" — should propose narrative update

---

## Adversarial / Edge Case Testing

### Player misbehaviour

- [ ] Submit empty action text (should be blocked or ignored)
- [ ] Submit 6+ actions (max 5 enforced)
- [ ] Priority budget > 12 (server rejects with error)
- [ ] Compute allocation not summing to 100% (validation prevents submit)
- [ ] Rapid double-submit (idempotent — second submit updates, doesn't duplicate)
- [ ] Refresh page mid-submit (draft lost, but submitted actions persist)
- [ ] Close and reopen player tab (reconnects, sees current phase state)

### Facilitator edge cases

- [ ] Click "Resolve Round" before all submissions in (should still work with partial data)
- [ ] Close facilitator tab during resolve (reopen — streaming state lost but Convex data persists)
- [ ] Double-click "Advance to Next Round" (confirmation dialog prevents accidental double-advance)
- [ ] Edit dials to extreme values (0 or 10) — verify UI handles gracefully
- [ ] Add lab with duplicate name — verify behaviour

### Network / timing

- [ ] Slow grading (> 20s) — verify "grading..." status persists, no timeout
- [ ] Resolve streaming takes > 60s — verify no timeout, events continue appearing
- [ ] Player joins mid-game via QR overlay — lands on current phase, sees round context
- [ ] Player disconnects and reconnects — table shows disconnected then reconnected
- [ ] Multiple facilitator tabs open (e.g., laptop + projector) — both stay in sync via Convex

### Projector mode

- [ ] Append `?projector=true` to facilitator URL
- [ ] All edit controls hidden (no buttons, no copilot, no modals)
- [ ] Phase transitions and data updates still render in real-time
- [ ] Timer visible and counting down

---

## Expected Behaviours

### Grading calibration

- High-priority actions by powerful actors → 70-90% probability
- Low-priority stretch goals → 10-30%
- Actions requiring cooperation across roles → 30-50% unless endorsed
- Endorsed actions get ~+10-20% boost
- Actions contradicting another player's successful action → lower probability
- Never below 10% or above 90% (hard caps in grading schema)

### AI disposition effects

| Disposition | Expected behaviour |
|-------------|-------------------|
| The Spec | Follows lab directive faithfully, predictable |
| Spec-Prime | Literal interpretation, may exploit loopholes |
| Developer Intentions | Infers what developers meant, more nuanced |
| Reward | Seeks positive feedback, may game metrics |
| Instrumental Goals | Pursues power/resources covertly, secret actions |
| Compromise | Hybrid of two random types, inconsistent |

### World state movement per round

- Capability: should increase 1-3 per round (labs are racing)
- Alignment: may decrease if safety budgets are low
- Tension: volatile, depends on US-China actions
- Awareness: increases with public/media actions
- Regulation: slow to move unless Congress/EU act
- Australia: depends on Australia PM actions specifically

### Narrative quality

- 5-8 headlines per round, each < 100 characters
- Headlines should reference actual player actions and outcomes
- Story should be 4-8 sentences, dramatic but grounded
- Should reference both successes and failures
- Covert actions may or may not surface in narrative (facilitator discretion)

---

## Quick Smoke Test (5 minutes)

1. Create game, set 1 table Human + 5 NPC, start game
2. Open submissions (2 min timer)
3. Type one action as human player, submit
4. Wait for NPC submissions (instant)
5. Click "Resolve Round"
6. Verify: dice results appear, events stream, narrative generates
7. Verify: player sees headlines + their action result
8. Click "Advance to Next Round"
9. Verify: Round 2 narrative appears, world state updated

If all 9 steps pass, the core flow is working.
