# TTX — Outstanding Issues

From 4-reviewer code review (2026-03-26). None are event-blocking but should be addressed.

## Security

- [ ] **Secret actions returned to all clients via Convex queries** — `getByGameAndRound` sends full secret action text to every connected client. Redaction is client-side only. Fix: server-side query that strips `text` from `secret: true` actions, or separate facilitator-only query.
- [ ] **API routes unauthenticated** — `/api/grade`, `/api/narrate`, `/api/ai-player`, `/api/ai-proposals` have no auth. Anyone with a gameId can call them. Low risk for a closed event network, but add at least a shared secret header for production.
- [ ] **Convex mutations are all public** — `advancePhase`, `rollAllActions`, `finishGame` etc. are facilitator-only operations callable by any client. Add role-based guards.

## Stability

- [ ] **Resolve sequence uses hardcoded setTimeout** — `handleResolveRound` waits 4s/4s/8s/5s with fire-and-forget fetch. If AI is slow, grading runs on incomplete data. Refactor to poll for completion via reactive queries or a status flag.
- [ ] **No disconnect tracking** — `setConnected(true)` on mount but never `setConnected(false)` on unmount/sleep. Facilitator sees stale "Human" status. Add `beforeunload`/`visibilitychange` cleanup.
- [ ] **ConnectionIndicator is cosmetic** — Shows green after 2s regardless of actual Convex WebSocket state. Replace with real connection health check.

## Architecture

- [ ] **Game data duplicated** — `src/lib/game-data.ts` and `convex/gameData.ts` define the same roles/rounds/labs. Create a shared module to prevent drift.
- [ ] **Lab status formatting duplicated** — Same `game.labs.map(...)` string appears in all 4 API routes. Extract to `ai-prompts.ts` helper.
- [ ] **ConvexHttpClient duplicated** — Each API route instantiates its own client. Extract to `src/lib/convex-client.ts`.
- [ ] **Component size** — Facilitator page (~700 lines) and table page (~700 lines) should be split into sub-components.
- [ ] **"proposals" vs "requests" naming** — Schema table is `proposals`, events use `request_*`, UI says "Request Support". Pick one term.

## UX

- [ ] **Facilitator projection leaks secrets** — Projected screen shows all secret action text. Add a "projection mode" toggle that redacts secrets on the facilitator view.
- [ ] **Font sizes below 18px on mobile** — Pervasive 11-13px text. Review during browser testing. CLAUDE.md says 18px minimum.
- [ ] **Touch targets below 48px** — Action card remove/secret buttons, proposal accept/decline buttons. Increase padding.
- [ ] **No facilitator timer configuration** — Discuss phase has no timer, submit phase is hardcoded 4 min. Make configurable.
- [ ] **Action feed animation too long with 17 roles** — Staggered delay of 0.08s * 60 actions = 4.8s. Cap the delay or batch.

## Game Design

- [ ] **Safety leads have no mechanical lever** — Their actions are graded but can't directly change lab allocation. Consider linking successful safety lead actions to forced allocation adjustments.
- [ ] **No cost to secrecy** — Marking actions secret has no downside. Consider: secret actions get a probability penalty, or cost +1 priority.
- [ ] **AI player personality** — All AI roles use the same instruction style. Add personality seeds per role for more varied AI behavior.
- [ ] **AI priority budget ignored** — LLMs often output priorities summing > 10. Now validated server-side (throws), but the AI player route should retry or adjust.
