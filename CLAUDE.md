@AGENTS.md

# TTX Web App

## Stack
- Next.js 16.2 (App Router) — params/searchParams are async Promises, must be awaited
- Convex for real-time state + persistence
- Tailwind CSS with custom brand tokens (see globals.css)
- Lucide React for icons (never use emoji in UI)
- Vercel AI SDK 6 for AI calls

## Key Patterns
- All game state lives in Convex. No local-only state that would be lost on refresh.
- Convex queries are reactive — `useQuery()` auto-updates when data changes.
- Timer is server-authoritative: store `phaseEndsAt` timestamp in Convex, derive countdown client-side.
- Mobile table view: 18px min font, 48px touch targets, `100dvh` + safe areas.
- Facilitator dashboard: designed for 1920×1080 projection.

## Build & Dev
```bash
npx convex dev          # Start Convex dev server (in one terminal)
npm run dev             # Start Next.js dev server (in another terminal)
```

## Verification
```bash
# Pre-commit hook runs these automatically:
npx tsc --noEmit        # Type check (strict: noUnusedLocals, noUnusedParameters)
npm run lint            # ESLint (includes react-compiler plugin)
npm run lint:dead       # knip — dead files, exports, dependencies
npm test                # Unit + component tests only (free, ~1s)

# Run intentionally (costs Convex bandwidth, needs `npx convex dev`):
npm run test:integration  # Convex integration tests
npm run test:all          # Everything including integration
```

## Rules for AI agents
- NEVER suppress lint/type errors with `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, or `as any` — fix the root cause
- NEVER skip hooks (`--no-verify`) or bypass signing
- NEVER add dead code "for future use" — delete it, git has history
- NEVER disable tests or write tests that always pass
- Run `npm run lint:dead` (knip) after any refactor that moves/renames/deletes components
- Prefer deleting code over commenting it out
- If a function is unused, delete it — don't prefix with underscore
- For local browser-driven smoke tests, prefer the **Claude Preview MCP** (`mcp__Claude_Preview__*`) over `mcp__Control_Chrome__*` — it reuses the dev server via `.claude/launch.json`, returns accessibility-tree snapshots with stable element UIDs, and supports CSS-selector clicks/fills. Fall back to Chrome MCP only when you need independent multi-tab orchestration. See `E2E-TESTING.md` for details.

## Cost-conscious testing
- **Prefer unit tests** (`npm test`) over Convex integration tests — unit tests are free and instant
- **Convex queries/mutations cost money** — each document read/write burns bandwidth. Don't create test games in loops.
- **NPC mode is free** — uses pre-authored sample actions, zero LLM calls. Default for all tables.
- **AI mode costs $0.02-0.05 per table** — only use when specifically testing LLM output quality
- **Grading costs $0.10-0.30 per round** — test once, don't grade repeatedly
- **Narrative costs $0.05-0.15** — test once per prompt change
- See `E2E-TESTING.md` for detailed cost guidance and testing pyramid

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
