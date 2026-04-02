# Game Flow Diagram

## Phase Lifecycle

```
LOBBY ──[Start Game]──> DISCUSS ──[Open Submissions]──> SUBMIT ──[Resolve Round]──> ROLLING ──> NARRATE ──[Advance]──> DISCUSS (next round)
                                                                                                           │
                                                                                                    [Round 4] ──> FINISHED
```

## Detailed Flow by Phase

### 1. LOBBY (`game.status = "lobby"`)

```
Facilitator                          Backend                          Players
    │                                   │                                │
    ├─ Set tables: Human/AI/NPC ──────> │                                │
    ├─ Enable/Disable tables ─────────> │                                │
    │                                   │                                │
    │                                   │ <──── Scan QR / enter code ────┤
    │                                   │       table.connected = true   │
    │                                   │                                │
    ├─ [Lock Game] ───────────────────> │                                │
    ├─ [Start Game] ──────────────────> │                                │
    │                                   ├─ phase = "discuss"             │
    │                                   ├─ scheduler.runAfter(0):        │
    │                                   │   generateAll(duration=0) ◄── PRE-GENERATION
    │                                   │                                │
```

### 2. DISCUSS (`game.phase = "discuss"`)

```
Facilitator                          Backend                          Players
    │                                   │                                │
    │                        ┌──────────┤                                │
    │                        │  generateAll(durationSeconds=0)           │
    │                        │          │                                │
    │                        │  NPC tables:                              │
    │                        │   ├─ Pick sample actions                  │
    │                        │   ├─ submitAndPropose(delay=0)            │
    │                        │   │   ├─ submitInternal ──> DB            │
    │                        │   │   ├─ Send endorsement requests        │
    │                        │   │   └─ schedule aiProposals.respond     │
    │                        │   │       (3s delay)                      │
    │                        │          │                                │
    │                        │  AI tables:                               │
    │                        │   ├─ LLM calls (parallel, ~3-10s)        │
    │                        │   ├─ submitAndPropose(delay=0)            │
    │                        │   │   ├─ submitInternal ──> DB            │
    │                        │   │   └─ schedule aiProposals.respond     │
    │                        │   │       (3s delay)                      │
    │                        └──────────┤                                │
    │                                   │                                │
    │  (AI/NPC submissions land in DB   │                    Tables discuss,
    │   during discussion — invisible   │                    read briefings,
    │   to players until submit phase)  │                    plan strategy
    │                                   │                                │
    │  Pick timer: 2/4/6/8/10 min      │                                │
    ├─ [Open Submissions] ────────────> │                                │
    │                                   ├─ phase = "submit"              │
    │                                   ├─ phaseEndsAt = now + duration  │
    │                                   ├─ scheduler.runAfter(0):        │
    │                                   │   generateAll (fallback)       │
    │                                   │   ↳ skips already-submitted    │
    │                                   │     roles (dedup check)        │
    │                                   │                                │
```

### 3. SUBMIT (`game.phase = "submit"`)

```
Facilitator                          Backend                          Players
    │                                   │                                │
    │  Sees submission tracker:         │                                │
    │  ┌────────────────────────┐       │                                │
    │  │ OpenBrain CEO  2 acts ✓│ ◄─────── AI/NPC already submitted     │
    │  │ DeepCent CEO   2 acts ✓│       │                                │
    │  │ US President   Waiting │ ◄──── │ ◄── Human composing actions ──┤
    │  │ China          2 acts ✓│       │                                │
    │  └────────────────────────┘       │                                │
    │                                   │                                │
    │                                   │ <── Human submits actions ─────┤
    │                                   │     (no grading yet)           │
    │                                   │                                │
    │                                   │ <── Proposals between tables ──┤
    │                                   │     (endorsements, requests)   │
    │                                   │                                │
    ├─ [Skip Timer] ──────────────────> │ phaseEndsAt = now              │
    │                                   │                                │
    ├─ [Resolve Round] ───────────────> │                                │
    │                                   ├─ triggerResolvePipeline        │
    │                                   │   └─ acquires resolve lock     │
    │                                   │   └─ schedule gradeAll         │
    │                                   │                                │
```

### 4. RESOLVE PIPELINE (gradeAll → awaitInfluence → rollAndNarrate)

```
Facilitator                          Backend                          Players
    │                                   │                                │
    │  Status: "Generating..."          │                                │
    │  (only if pre-gen missed some)    ├─ gradeAll:                     │
    │                                   │   ├─ Check for missing AI subs │
    │                                   │   │   └─ generateAll(dur=0)    │
    │                                   │   │     if any missing         │
    │                                   │   │                            │
    │  Status: "Evaluating N subs..."   │   ├─ phase ──> "rolling"       │
    │                                   │   ├─ LLM grades each sub       │
    │                                   │   │   (parallel, assigns       │
    │                                   │   │    probability %)          │
    │                                   │   │                            │
    │  ROLLING phase:                   │   ├─ schedule awaitInfluence   │
    │  Actions appear one by one        │   │                            │
    │  (staggered reveal animation)     │                                │
    │                                   ├─ awaitInfluence:               │
    │                                   │   ├─ AI Systems influence      │
    │                                   │   │   panel (30s timeout)      │
    │                                   │   ├─ schedule rollAndNarrate   │
    │                                   │   │                            │
    │                                   ├─ rollAndNarrate:               │
    │                                   │   ├─ Roll dice for each action │
    │                                   │   │   (d100 vs probability)    │
    │                                   │   ├─ Resolve world state       │
    │                                   │   ├─ Compute lab growth        │
    │                                   │   ├─ LLM generates narrative   │
    │                                   │   ├─ phase ──> "narrate"       │
    │                                   │                                │
```

### 5. NARRATE (`game.phase = "narrate"`)

```
Facilitator                          Backend                          Players
    │                                   │                                │
    │  Reads narrative aloud            │                    See results:
    │  ┌─────────────────────────┐      │                    headlines,
    │  │ AI-generated narrative  │      │                    world state
    │  │ Headlines               │      │                    changes
    │  │ World state changes     │      │                                │
    │  │ Facilitator notes       │      │                                │
    │  └─────────────────────────┘      │                                │
    │                                   │                                │
    ├─ [Advance Round] ───────────────> │                                │
    │  (or [End Game] on round 4)       ├─ snapshot round state          │
    │                                   ├─ currentRound++                │
    │                                   ├─ phase = "discuss"             │
    │                                   ├─ scheduler.runAfter(0):        │
    │                                   │   generateAll(duration=0) ◄── PRE-GEN AGAIN
    │                                   │                                │
```

## Pre-generation Safety

```
Double-trigger protection:

  startGame/advanceRound ──> generateAll(dur=0) ──> submits AI/NPC
                                                        │
  openSubmissions ─────────> generateAll(dur=N) ────────┘
                                │                       │
                          checks submittedRoles ──> skips already done
                                                        │
  gradeAll (pipeline) ──────> generateAll(dur=0) ───────┘
                                │                  (only if still missing)
                          checks submittedRoles ──> skips already done
```

## Timing: Before vs After

### BEFORE (all-AI game)
```
[Open Submissions] ──> generateAll starts ──> LLM calls (3-10s) ──> stagger delay (15-30s) ──> first submission appears
                                                                                Total: ~20-40s wait
```

### AFTER (all-AI game)
```
[Start Game / Advance Round] ──> generateAll starts ──> LLM calls (3-10s) ──> immediate submit
      │                                                                              │
      ▼                                                                              ▼
  Discussion time (facilitator picks timer)                              Submissions already in DB
      │
      ▼
[Open Submissions] ──> fallback generateAll ──> all roles already submitted ──> skip
                                                                                  │
                                          Submissions visible INSTANTLY ◄──────────┘
```
