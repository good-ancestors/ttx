# Next Session: Role Expansion + Polish

## Prompt to paste into Claude Code:

```
Read NEXT-SESSION.md, PLAN.md, and the memory files in .claude/projects/-Users-lukefreeman-code-ttx/memory/. Then read src/lib/game-data.ts, src/lib/ai-prompts.ts, convex/schema.ts, and the player handouts at /Users/lukefreeman/code/ttx/source-docs/11-player-handouts-full.md (first 300 lines for structure).

The app is a working TTX web app for "The Race to AGI". Current state: 88 tests passing, clean build, AI grading/narrative working via Vercel AI Gateway, full 3-round playthrough verified.

Priority 1: Expand from 6 fixed roles to the full 17+ individual player roles from the source material. See NEXT-SESSION.md for the design. Each role can be human or AI-controlled. Labs split into CEO + Safety Lead with conflicting goals. New entities can emerge mid-game.

Priority 2: After role expansion, do a full end-to-end test and polish for the May 2026 Small Giants Forum event.
```

---

## Current State (as of this session)

### What's built and working:
- Splash page, facilitator dashboard (1080p projection), mobile table player view
- AI grading via Vercel AI Gateway (Gemini Flash for dev, swap to Claude for prod)
- AI narrative generation with two-ending structure (race vs slowdown)
- AI-controlled players that auto-submit on resolve
- Inter-table proposals (send/accept/reject, boosts probability)
- Compute stock tracking: OpenBrain (22u), DeepCent (17u), Conscienta (14u)
- 3-way allocation (Users/Capability/Safety) per lab
- Manual override (edit dials, narrative, probabilities)
- Demo mode for facilitator rehearsal
- 88 tests, 0 lint errors, 5 git commits

### What works well from playtesting:
- AI grading correctly handles edge cases (alignment impossible = 10%, cooperation boosts, timeline violations penalised)
- Narrative coherence across 3 rounds with escalating drama
- AI Systems role generates genuinely strategic secret actions
- World state compounds sensibly (Capability 3→4→6→7, Tension 4→6→6→8)

### Known issues from playtesting:
- Lab allocation doesn't update from player submissions (only from narrative AI)
- Resolve sequence has hardcoded waits (5s + 3s) — fragile

---

## Role Expansion Design

### Current: 6 roles (tables)
OpenBrain, United States, China, Australia & Allies, AI Safety Community, The AI Systems

### Target: 17+ individual roles from source material

#### Labs (CEO + Safety Lead pairs):
| # | Role | Lab | Type | Key Tension |
|---|------|-----|------|-------------|
| 1 | OpenBrain CEO | OpenBrain | lab-ceo | Speed vs. safety, board pressure |
| 2 | OpenBrain Safety Lead | OpenBrain | lab-safety | Convince CEO to slow down |
| 3 | Conscienta AI CEO | Conscienta | lab-ceo | Safety reputation vs. commercial pressure |
| 4 | Conscienta AI Safety Lead | Conscienta | lab-safety | Has more influence than OB's safety lead |
| 5 | DeepCent CEO | DeepCent | lab-ceo | Catch up with stolen weights, state pressure |
| 6 | DeepCent Safety Lead | DeepCent | lab-safety | Minimal budget, CCP pressure |

#### Governments:
| # | Role | Type | Key Tension |
|---|------|------|-------------|
| 7 | United States (President) | government | Regulate vs. maintain edge |
| 8 | China (President) | government | State control of AI race |
| 9 | Australia (Prime Minister) | government | Middle power relevance |
| 10 | Pacific Islands (PM of Fiji) | government | Existential climate + AI risk |
| 11 | European Union (EC President) | government | Regulatory leadership vs. falling behind |

#### Civil Society:
| # | Role | Type |
|---|------|------|
| 12 | Network of AISIs (UK AISI Director) | civil-society |
| 13 | AI Safety Nonprofits (FAI CEO) | civil-society |

#### Special:
| # | Role | Type | Notes |
|---|------|------|-------|
| 14+ | The AI Systems | ai-system | One per lab, different alignment properties |

### Schema Changes

```typescript
// roles table (new — replaces hardcoded ROLES array)
roles: defineTable({
  gameId: v.id("games"),
  roleKey: v.string(),        // e.g., "openbrain-ceo", "us-president"
  name: v.string(),           // e.g., "OpenBrain CEO"
  type: v.union(
    v.literal("lab-ceo"),
    v.literal("lab-safety"),
    v.literal("government"),
    v.literal("civil-society"),
    v.literal("ai-system")
  ),
  labId: v.optional(v.string()),  // which lab this role controls (if any)
  brief: v.string(),
  color: v.string(),
  enabled: v.boolean(),
  controlMode: v.union(v.literal("human"), v.literal("ai"), v.literal("npc")),
  connected: v.boolean(),
  joinCode: v.string(),
})

// labs table (new — replaces labs array in games)
labs: defineTable({
  gameId: v.id("games"),
  name: v.string(),
  computeStock: v.number(),
  rdMultiplier: v.number(),
  allocation: v.object({
    users: v.number(),
    capability: v.number(),
    safety: v.number(),
  }),
  isPlayerControlled: v.boolean(),  // vs background context
})
```

### Key Mechanics

1. **CEO + Safety Lead conflict**: Both submit actions for the same lab. CEO controls capability allocation, Safety Lead controls safety allocation. If they disagree, the CEO wins by default unless the Safety Lead has political backing (e.g., government mandate).

2. **Compute allocation per lab**: The CEO's submission sets the lab's allocation for the round. The Safety Lead can submit a "protest" allocation that the facilitator sees. If there's an accepted proposal between them, the compromise is used.

3. **Dynamic lab creation**: Facilitator can add a new lab mid-game (e.g., "EU AI Lab" with starting compute from a government's action). This creates a new entry in the labs table.

4. **The AI Systems**: One AI entity per lab. In the full game, the AI player manages all of them — each with potentially different alignment and capabilities. Actions can be per-AI or coordinated.

5. **Emergent entities**: A rogue AI starting a company is an action that, if it succeeds, creates a new lab controlled by the AI Systems role. The narrative AI handles the details.

### Migration Path

Phase 1 (minimum viable):
- Keep the 6-table format for the 90-minute version
- Add the ability for the facilitator to create games with the full 17-role roster
- Each role gets its own join code / AI player
- Lab roles are tagged with their lab

Phase 2 (full implementation):
- CEO + Safety Lead conflict mechanics
- Dynamic lab creation
- Per-lab AI alignment tracking
- Role-specific round briefings

### Files to change:
- `convex/schema.ts` — Add roles and labs tables
- `convex/games.ts` — Update create mutation for flexible role selection
- `src/lib/game-data.ts` — Full 17-role roster with briefs from source handouts
- `src/app/game/[id]/facilitator/page.tsx` — Role management in lobby
- `src/app/game/[id]/table/[code]/page.tsx` — Role-specific UI (CEO vs Safety Lead)
- `src/lib/ai-prompts.ts` — Role-specific grading context
- `src/app/api/ai-player/route.ts` — Handle new role types
- Tests — Update for new schema
