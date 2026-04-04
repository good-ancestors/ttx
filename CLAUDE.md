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

## Verification (run all before committing)
```bash
npx tsc --noEmit        # Type check (strict: noUnusedLocals, noUnusedParameters)
npm run lint            # ESLint (includes react-compiler plugin)
npm run lint:dead       # knip — dead files, exports, dependencies
npm test                # vitest — 150 unit + component integration tests
```

## Rules for AI agents
- NEVER suppress lint/type errors with `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, or `as any` — fix the root cause
- NEVER skip hooks (`--no-verify`) or bypass signing
- NEVER add dead code "for future use" — delete it, git has history
- NEVER disable tests or write tests that always pass
- Run `npm run lint:dead` (knip) after any refactor that moves/renames/deletes components
- Prefer deleting code over commenting it out
- If a function is unused, delete it — don't prefix with underscore

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
