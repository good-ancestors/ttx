# TTX — Outstanding Issues

From 4-reviewer code review (2026-03-26). Updated 2026-03-27.

## Security

- [ ] **Secret actions returned to all clients via Convex queries** — `getByGameAndRound` sends full secret action text to every connected client. Redaction is client-side only. Fix: server-side query that strips `text` from `secret: true` actions, or separate facilitator-only query.
- [ ] **API routes unauthenticated** — Low risk for closed event network, add shared secret header for production.
- [ ] **Convex mutations are all public** — Facilitator-only operations callable by any client. Add role-based guards.

## Stability

- [x] ~~No disconnect tracking~~ — Added beforeunload + visibilitychange handlers
- [ ] **Resolve sequence uses hardcoded setTimeout** — Refactor to poll for completion.
- [ ] **ConnectionIndicator is cosmetic** — Replace with real Convex connection health check.

## Architecture

- [ ] **Game data duplicated** — `src/lib/game-data.ts` and `convex/gameData.ts`. Create shared module.
- [x] ~~Lab status formatting duplicated~~ — Extracted `formatLabStatus()` helper
- [x] ~~ConvexHttpClient duplicated~~ — Extracted to `src/lib/convex-client.ts`
- [ ] **Component size** — Facilitator page (~700 lines) and table page (~700 lines) should be split.
- [ ] **"proposals" vs "requests" naming** — Pick one term.
- [ ] **Frontier model tracking** — Store `frontierModel: "Agent-2" | "Agent-3" | "Agent-4" | "Safer"` per lab.

## UX

- [x] ~~Facilitator projection leaks secrets~~ — Click-to-reveal on facilitator feed
- [x] ~~Font sizes below minimum on mobile~~ — Bumped to text-sm (14px) minimum
- [x] ~~Touch targets below 48px~~ — Action card buttons and proposal buttons enlarged
- [x] ~~No facilitator timer configuration~~ — Duration picker (2/4/6/8/10 min)
- [x] ~~Action feed animation too long~~ — Capped delay at 2s max

## Game Design

- [ ] **Safety leads have no mechanical lever** — Consider linking successful actions to allocation adjustments.
- [ ] **No cost to secrecy** — Consider: secret actions cost +1 priority.
- [x] ~~AI player personality~~ — Personality seeds per role added
- [ ] **AI priority budget ignored by LLMs** — Server validates, but AI player route should retry/adjust.
- [ ] **AI players don't see other players' actions** — Only see narrative summary + own outcomes. Could add key actions from other roles for context.
