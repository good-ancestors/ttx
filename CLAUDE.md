@AGENTS.md

# TTX Web App

## Stack
- Next.js 16.2 (App Router) — params/searchParams are async Promises, must be awaited
- Convex for real-time state + persistence
- Tailwind CSS with custom brand tokens (see globals.css)
- Framer Motion 12 for transitions only; CSS transitions for input-driven updates
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

## Testing
```bash
npx tsc --noEmit        # Type check
npm run lint            # ESLint
npm run build           # Full build
```

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
