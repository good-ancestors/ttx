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

### Authentication

Password managers can interfere with the login form. Use the `?p=` query parameter to bypass:

```
http://localhost:3000/?p=coral-ember-drift-sage
```

This auto-authenticates, stores the session, and strips the passphrase from the URL.

### Tab management
Use **separate browser windows** (or MCP tab groups) for facilitator and player views. Join player tables via:

```
http://localhost:3000/game/join/<JOIN_CODE>
```

Get join codes via CLI:
```bash
npx convex run tables:getByGame '{"gameId": "<GAME_ID>"}' | python3 -c "
import json, sys
for t in json.load(sys.stdin):
    if t['enabled']:
        print(f'{t[\"roleName\"]}: {t[\"joinCode\"]}')
"
```

### Recommended minimal config

| Table | Mode | Why |
|-------|------|-----|
| OpenBrain CEO | Human | Lab spec editor, compute allocation |
| US President | Human | Compute transfers, endorsements |
| All others | NPC (default) | Free, instant |

Only add Human tables for the specific role mechanic you're testing.

### Common mistakes

1. **Test on localhost, not production.** `npx convex deploy` only updates the Convex backend. The Vercel frontend only updates on `git push`. Always test UI changes on `localhost:3000`.
2. **Deploy before creating test games.** Run `npx convex dev --once` before `npx convex run games:create`. Games created with stale code have wrong starting compute.
3. **Don't reuse games across deploys.** Each code change can affect game state. Create a fresh game after every deploy.
4. **Check Convex logs for failures.** Use `npx convex logs --history 50` to see recent errors. For production: `npx convex logs --prod --history 50`.

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
- [ ] **All tabs visible** (Brief, Actions, Respond, Lab) — not disabled
- [ ] Actions/Respond/Lab show placeholder text during discuss

### 3. Submit Phase
- [ ] Timer countdown visible, no ghosting/double-text on mobile
- [ ] Timer hides when expired (no "0:00")
- [ ] Action input works (type, Enter to add)
- [ ] Submit per-action
- [ ] Endorsement request picker
- [ ] Compute request picker (for has-compute roles)
- [ ] Send Compute panel — transfer works, both sender/receiver update in real-time
- [ ] Lab CEO: allocation sliders (sum to 100%)
- [ ] Lab CEO: spec editor + save
- [ ] NPC tables auto-submit (≤2 actions per table)
- [ ] Character counter at 400+ chars
- [ ] **AI Systems support/oppose** stays editable after timer expires (until dice roll)
- [ ] **Regular player endorsements** lock when timer expires
- [ ] Starting compute includes pool shares (US President gets "Other US Labs" pool)

### 4. Resolve Phase
- [ ] Grade Remaining button works, **hides when all graded** (shows Roll Dice only)
- [ ] Roll Dice button works (disabled until graded)
- [ ] Pipeline progress shows
- [ ] Narrative generates (not fallback text — check ANTHROPIC_API_KEY is set)
- [ ] World state updates
- [ ] Lab multipliers update
- [ ] **Compute holders** record populated (all entities, not just labs)
- [ ] Stacked bar chart shows retained/gained/lost per entity
- [ ] Detail table shows produced/transferred/adjustment per entity
- [ ] **Inline compute editor** works (Edit → change values → Save)
- [ ] R&D milestone labels show capability levels (Coder, Researcher, Genius, Singularity)

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
1. `npx convex dev --once` (deploy latest)
2. Open `http://localhost:3000/?p=coral-ember-drift-sage`
3. Create game (6 tables), start, open submissions (4 min)
4. Join as US President in second tab via join code
5. Verify compute shows pool shares (sovereign + pool)
6. Send compute to OpenBrain — verify both views update
7. Grade Remaining → Roll Dice
8. Verify narrative + world state + compute holders record
9. Advance round
10. Verify round 2 starts correctly
