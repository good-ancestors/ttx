# Testing Guide

## Testing Pyramid

### 1. Unit tests (`npm test`) — always free, always fast
**This is the default.** Run constantly. Covers game-data logic, component rendering, type safety.

```bash
npm test                              # All 150 tests (~25s)
npx vitest run tests/game-logic.test.ts tests/component-integration.test.tsx  # Fast subset (~1s)
```

**What to test here:**
- Pure functions: `computeLabGrowth`, `isSubmittedAction`, `isResolvingPhase`, `buildPlayerTabs`
- Component rendering with mocked Convex: endorsement display, tab visibility, compute overview
- Data invariants: role configs, round configs, sample actions structure

### 2. Convex integration tests — use sparingly, costs document reads
**Run only when testing Convex-specific behaviour** (mutations, queries, schema validation).

Each test creates/deletes game documents = Convex bandwidth cost. Don't run in loops.

```bash
npx vitest run tests/convex-integration.test.ts  # Needs `npx convex dev` running
```

### 3. Browser testing — for visual/UX verification only
**Never test game mechanics in the browser.** Use it for:
- Layout and responsive design
- Touch target sizes
- Phase transition animations
- Mobile keyboard behaviour
- Projector view readability

## Cost Reference

| Operation | Cost | When to use |
|-----------|------|-------------|
| Unit test | Free | Always |
| Convex query/mutation | ~$0.00001/doc read | Sparingly for integration tests |
| NPC submission | Free (sample data) | Default for all non-tested tables |
| AI submission | ~$0.02-0.05/table | Only when testing LLM action quality |
| Grading round | ~$0.10-0.30 | Only when testing probability calibration |
| Narrative generation | ~$0.05-0.15 | Only when testing story output |
| Copilot query | ~$0.03-0.05 | Only when testing copilot |

**Rule of thumb:** If you can test it without hitting an LLM or Convex, do that instead.

## Writing New Tests

### Prefer unit tests over integration tests

**Instead of this** (hits Convex server):
```javascript
const gameId = await convex.mutation(api.games.create, { ... });
const game = await convex.query(api.games.get, { gameId });
expect(game.labs[0].computeStock).toBe(22);
```

**Do this** (free, instant):
```typescript
import { DEFAULT_LABS } from "@convex/gameData";
expect(DEFAULT_LABS[0].computeStock).toBe(22);
```

**Instead of this** (hits Convex):
```javascript
await convex.mutation(api.submissions.submit, { ..., computeAllocation: { users: 200, capability: -50, safety: -50 } });
// expect error
```

**Do this** (free):
```typescript
import { validateComputeAllocation } from "convex/submissions"; // if exported
expect(() => validateComputeAllocation({ users: 200, capability: -50, safety: -50 })).toThrow();
```

### When you must hit Convex

Use all-NPC configs. Never set tables to AI mode unless specifically testing LLM output.

```javascript
// Set ALL enabled tables to NPC before testing
for (const t of enabledTables) {
  await convex.mutation(api.tables.setControlMode, { tableId: t._id, controlMode: 'npc', facilitatorToken: TOKEN });
}
```

### When you must test LLM output

Test ONE role, ONE round. Don't run full 4-round games with AI tables.

## Browser Setup

### Tab management
Use **separate browser windows** for facilitator and player views. In production, Convex subscriptions pause on inactive tabs (`usePageVisibility`). In dev mode this is disabled, but separate windows are still clearer.

### Recommended minimal config

| Table | Mode | Why |
|-------|------|-----|
| OpenBrain CEO | Human | Lab spec editor, compute allocation |
| All others | NPC (default) | Free, instant |

Only add Human tables for the specific role mechanic you're testing.

---

## Phase-by-Phase Checklist

### 1. Lobby
- [ ] Create game from splash page
- [ ] Wrong password shows error
- [ ] Set control modes: Human / AI / NPC
- [ ] Join as player via QR code or join code
- [ ] Connection counter updates
- [ ] AI Systems: choose disposition
- [ ] Start Game has confirmation dialog

### 2. Discuss Phase
- [ ] Starting Scenario card shows (Q1 label)
- [ ] Compute Resources panel shows labs + non-lab holders
- [ ] Header shows ⚡ Xu for compute roles
- [ ] Full Brief expandable
- [ ] Timer duration selector on facilitator

### 3. Submit Phase
- [ ] Timer countdown visible
- [ ] Action input works (type, Enter to add)
- [ ] Submit per-action
- [ ] Endorsement request picker
- [ ] Compute request picker (for has-compute roles)
- [ ] Send Compute panel (proactive transfers)
- [ ] Lab CEO: allocation sliders (sum to 100%)
- [ ] Lab CEO: spec editor + save
- [ ] NPC tables auto-submit (free, instant)
- [ ] Character counter at 400+ chars

### 4. Resolve Phase
- [ ] Grade Remaining button works
- [ ] Roll Dice button works (disabled until graded)
- [ ] Pipeline progress shows
- [ ] Narrative generates
- [ ] World state updates
- [ ] Lab multipliers update
- [ ] Compute distribution visible

### 5. Round Transitions
- [ ] Advance round increments counter
- [ ] Previous narrative carries to Brief tab
- [ ] Labs persist across rounds
- [ ] Round 4 NPC tables submit (from sample data, not LLM)

### 6. End Game
- [ ] End Scenario has confirmation dialog
- [ ] Game status = finished

---

## Adversarial Edge Cases

### Player misbehaviour (test via unit tests or API)
- [ ] Empty action text → blocked
- [ ] 6+ actions → max 5 enforced
- [ ] Priority > 12 → rejected
- [ ] Allocation != 100% → rejected
- [ ] Spoofed roleId → table ownership check fails
- [ ] Self-endorsement → rejected
- [ ] Self-compute-transfer → rejected

### Auth (test via unit tests or API)
- [ ] Admin mutation without token → rejected
- [ ] Admin mutation with wrong token → rejected
- [ ] Player can't see aiDisposition in table queries
- [ ] Player can't see facilitatorNotes in round queries
- [ ] Full submissions query requires facilitator token

### Facilitator edge cases (test in browser)
- [ ] Start Game on already-playing game → rejected
- [ ] Double-click Advance → confirmation prevents
- [ ] Force unlock clears resolving lock

---

## Quick Smoke Test

**API version (free, 10 seconds):**
```bash
node scripts/smoke-test.js  # TODO: create this
```

**Browser version (costs 1 grading + 1 narrative ≈ $0.20):**
1. Create game, all NPC, start
2. Open submissions (2 min)
3. Submit 1 action as human
4. Grade Remaining → Roll Dice
5. Verify narrative + world state
6. Advance round
7. Verify round 2 starts correctly
