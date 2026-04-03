# PR #5 Test Checklist — Refactor Facilitator UI

Test plan for the unified round phase, per-action submission model, and new UI features.

## Setup

| Table | Mode | Purpose |
|-------|------|---------|
| The AI Systems | Human (R1) | Disposition, influence panel, per-action submit |
| OpenBrain CEO | Human (R2) | Compute allocation, lab spec, endorsements |
| DeepCent CEO | NPC | Lab presence |
| Conscienta CEO | NPC | Lab presence |
| US President | AI | Government actions, endorsement target |
| China President | NPC | Geopolitical counterweight |

---

## 1. Unified Round Phase (Facilitator)

### Narrative section
- [ ] "Where Things Start" section renders previous round narrative (or R1 intro)
- [ ] Section is expandable/collapsible, open by default
- [ ] Collapse persists across phase transitions

### Players panel
- [ ] Shows all enabled tables with role color dots
- [ ] Shows submission count per role ("3 actions", "Waiting...")
- [ ] Shows grading status ("grading..." vs checkmark)
- [ ] Control mode dropdown (Human/AI/NPC) works from Players panel
- [ ] Kick to AI works for connected human players

### What Was Attempted panel
- [ ] Collapsed by default
- [ ] Populates as submissions arrive (count shown)
- [ ] Expands to show actions sorted by priority
- [ ] Endorsement chips shown inline on endorsed actions
- [ ] AI influence indicators shown (facilitator only, not projector)
- [ ] Secret actions redacted with lock icon
- [ ] "Reveal secrets" button reveals all
- [ ] Probability badges clickable to cycle (10→30→50→70→90)
- [ ] Roll results show with reroll button (facilitator only)

### Discuss phase controls
- [ ] Timer duration selector (2/4/6/8/10 min)
- [ ] "Open Submissions" button starts submit phase
- [ ] Skip timer button available

### Submit phase controls
- [ ] "Close Submissions" (skip timer) button shown
- [ ] "Grade Remaining (N)" button grades only ungraded actions
- [ ] "Roll Dice" button disabled until all graded
- [ ] "Roll Dice" enabled and triggers roll + narrate pipeline
- [ ] Grading shows progress in button text

### Narrate phase
- [ ] "What Happened" narrative panel renders
- [ ] "Where We Are Now" shows lab cards with compute changes
- [ ] Capability description renders based on leading lab multiplier
- [ ] Trajectory badge (RACE/SLOWDOWN/UNCERTAIN) shown
- [ ] "Edit narrative" and "Edit compute" buttons open modals
- [ ] "Advance to Next Round" with confirmation dialog
- [ ] Round 4: "End Scenario" button instead

---

## 2. Per-Action Submission Model (Player)

### Draft → Submit lifecycle
- [ ] Player can type action text in draft input
- [ ] Each action card has a "Submit" button
- [ ] Clicking Submit saves draft to Convex then locks it in
- [ ] Submitted action shows with green checkmark card
- [ ] Submitted action shows "Edit" and "Delete" buttons
- [ ] Editing pulls action back to draft (clears grading)
- [ ] Deleting removes action and cleans up endorsement requests
- [ ] Delete has confirmation step
- [ ] Max 5 total actions (drafts + submitted) enforced
- [ ] Priority budget enforced across submitted actions

### Timer expiry behavior
- [ ] Timer expiry discards remaining drafts (only submitted count)
- [ ] Shows "Time's up — only submitted actions will count"
- [ ] Phase change (submit → rolling) also discards remaining drafts

### Endorsement flow with per-action model
- [ ] Endorsement requests sent on submit (not on draft)
- [ ] Editing a submitted action cancels its endorsements
- [ ] Deleting an action cancels its endorsements

---

## 3. AI Systems Role (Player)

### Disposition
- [ ] Disposition chooser shown in lobby if not yet chosen
- [ ] Badge shown once disposition is locked

### Lab Directives
- [ ] All 3 lab specs visible during submit phase

### AI Influence Panel
- [ ] Panel visible during submit and rolling phases
- [ ] Shows all submitted actions from all players
- [ ] Own actions labeled "(you)"
- [ ] Thumbs up (Boost) button toggles influence
- [ ] Thumbs down (Sabotage) button available for other players' actions
- [ ] Clear button removes influence
- [ ] Power percentage shown (scales with lab R&D multiplier)
- [ ] Influence locked after dice are rolled
- [ ] Influence is secret (not shown to other players)

---

## 4. Lab CEO Role (Player)

### Compute Allocation
- [ ] 3-way slider visible during submit
- [ ] Sliders sum to 100%
- [ ] Allocation persists through submit

### Lab Spec Editor
- [ ] "Your Lab's AI Directive" textarea visible
- [ ] "Save Directive" button persists to Convex

### Endorsements
- [ ] Support button on action cards shows endorsement targets
- [ ] AI Systems excluded from endorsement targets
- [ ] Send endorsement: appears on recipient's table
- [ ] Accept endorsement: status updates both sides
- [ ] Decline endorsement: status updates

---

## 5. Timer Display

- [ ] Timer in nav bar shows countdown with clock icon
- [ ] Clicking timer opens full-screen overlay
- [ ] Full-screen shows large countdown
- [ ] +30s and -30s buttons adjust timer (Convex mutation)
- [ ] "End Timer" button skips timer
- [ ] Close button exits full-screen
- [ ] Timer pulses red when < 60s
- [ ] Timer shows "expired" state correctly

---

## 6. Full-Screen Panels

- [ ] R&D Progress chart: expand button → full-screen with large chart
- [ ] World State: expand button → full-screen with indicators
- [ ] Lab State: expand button → full-screen with lab grid
- [ ] All full-screen panels have close (X) button
- [ ] Full-screen uses createPortal (renders above all other content)

---

## 7. Add Lab (Shared Component)

- [ ] Sidebar "+" button opens Add Lab modal (page.tsx)
- [ ] Edit modal "addlab" case renders same form (round-phase.tsx)
- [ ] Both use shared AddLabForm component
- [ ] Form validates: name and role required
- [ ] Add button disabled until both filled
- [ ] Adding lab creates new lab entity in Convex

---

## 8. Backend Pipeline Changes

### Split grading/rolling
- [ ] `triggerGrading` grades only ungraded submitted actions
- [ ] `triggerRoll` verifies all graded before rolling
- [ ] `triggerRoll` throws if ungraded actions remain
- [ ] Auto-generates NPC influence in rollAndNarrate

### gradeSubmissionBatch
- [ ] Properly typed with ActionCtx (no `any`)
- [ ] Progress counter tracks fulfilled results only (not rejected)
- [ ] onlyUngraded flag grades only actions without probability

### assertNotResolving
- [ ] Shared helper used in setResolving, triggerResolvePipeline, triggerGrading, triggerRoll
- [ ] Lock TTL of 3 minutes prevents concurrent resolution
