# TTX — Outstanding Issues

Updated 2026-03-27 pre-launch.

## Security

- [x] ~~Secret actions returned to all clients~~ — Added `getByGameAndRoundRedacted` query
- [x] ~~API routes unauthenticated~~ — Added shared secret auth via `TTX_API_SECRET` env var
- [ ] **Convex mutations are all public** — Facilitator-only operations callable by any client. Low risk for event.

## Stability

- [x] ~~No disconnect tracking~~ — beforeunload + visibilitychange handlers
- [ ] **Resolve sequence uses hardcoded setTimeout** — Refactor to poll for completion.
- [x] ~~ConnectionIndicator is cosmetic~~ — Now uses real online/offline detection

## Architecture

- [ ] **Game data duplicated** — `src/lib/game-data.ts` and `convex/gameData.ts`. Create shared module.
- [x] ~~Lab status formatting duplicated~~ — Extracted `formatLabStatus()` helper
- [x] ~~ConvexHttpClient duplicated~~ — Extracted to `src/lib/convex-client.ts`
- [ ] **Component size** — Facilitator page (~750 lines) and table page (~700 lines) should be split.
- [x] ~~"proposals" vs "requests" naming~~ — Renamed table + all references
- [ ] **Frontier model tracking** — Store active model name per lab.

## Game Design

- [ ] **Safety leads have no mechanical lever** — Design decision for facilitator to manage.
- [ ] **No cost to secrecy** — Design decision.
- [x] ~~AI player personality~~ — 17 distinct personalities
- [x] ~~AI priority budget~~ — Server validates + AI player route clamps instead of throwing
