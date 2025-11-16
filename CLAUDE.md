# CLAUDE.md - AI 2027 TTX Development Guide

## Project Overview

This is the AI 2027 Tabletop Exercise web application - a facilitation tool for exploring AGI development scenarios and their geopolitical implications.

**Attribution**: Developed by Good Ancestors. Inspired by and built upon the AI 2027 scenario created by AI Futures (https://ai-2027.com). Built with support and permission from AI Futures.

**Primary Goal**: Create a simple, reliable tool for facilitators to run compelling TTX sessions that illuminate the dynamics of the AGI race.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **Charts**: Tremor (Tailwind-based data viz)
- **State**: SWR for data fetching
- **Database**: Local storage (V1), Neon Postgres (V2+)
- **Deployment**: Vercel

## Key Documentation

- README.txt - Project overview and getting started
- V1_PLAN.md - Detailed V1 implementation plan
- V1_SUMMARY.md - Quick V1 reference
- docs/specs.md - Full technical specification
- docs/player_sheets.md - Player roles and game content

### AI 2027 Research & Forecasts

These forecasts from AI Futures inform the game mechanics and scenario design:
- docs/ai_goals_forecast_ai_2027.md - AI alignment outcomes
- docs/compute_forecast_ai_2027.md - Compute availability projections
- docs/security_forecast_ai_2027.md - Security levels and capabilities
- docs/timelines_forecast_ai_2027.md - AGI development timelines
- docs/takeoff_forecast_ai_2027.md - Intelligence explosion dynamics

## Common Commands

```bash
# Development
npm run dev              # Start dev server (localhost:3000)
npm run build           # Production build
npm run lint            # ESLint check

# Testing (V2+)
npm test                # Run tests
npm run test:watch      # Watch mode

# Deployment
vercel                  # Deploy to Vercel
vercel --prod          # Deploy to production
```

## Project Structure

```
/app                    # Next.js App Router pages
  /page.tsx            # Main facilitator interface (V1)
  /game/[id]           # Game routes (V2+)

/components
  /ui                  # Reusable primitives (button, card, etc.)
  /game                # Game-specific (CompanyCard, ComputeChart)
  /admin               # Facilitator controls (ComputeAllocator, etc.)

/lib
  /types.ts           # TypeScript interfaces
  /calculations.ts    # Core game formulas (PURE FUNCTIONS)
  /storage.ts         # Local storage wrapper (V1)
  /constants.ts       # Default values, colors
```

## Core Game Calculations

**IMPORTANT**: All calculations MUST be pure functions in `/lib/calculations.ts`

```typescript
// R&D Multiplier (compounds over time)
rdMultiplier = 3.0 + (totalRDPoints × 0.000002)

// Round calculations
newRDPoints = computeAllocated × rdAllocation × currentMultiplier
newSafetyPoints = computeAllocated × safetyAllocation × 1.0

// Risk assessment
alignmentGap = totalRDPoints - totalSafetyPoints
if (gap > 10M) → 'critical'
else if (gap > 5M) → 'high'
else if (gap > 2M) → 'elevated'
else → 'ok'
```

## Code Style Guidelines

**TypeScript**
- Strict mode enabled
- Use interfaces over types for object shapes
- Explicit return types for public functions
- Use `satisfies` for type narrowing

**React**
- Server Components by default
- Client Components only when needed ('use client')
- Functional components with hooks
- Props interfaces named `[Component]Props`

**Imports**
- Use `@/` alias for root imports
- Group: external → internal → types
- Alphabetize within groups

**Naming**
- Components: PascalCase
- Functions/variables: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Files: kebab-case or PascalCase (match export)

## V1 Architecture (CURRENT PHASE)

**IMPORTANT**: V1 uses LOCAL STORAGE ONLY. No database, no API routes, no authentication.

```typescript
// State management pattern
import useSWR from 'swr';
import { loadGameState, saveGameState } from '@/lib/storage';

const { data: gameState, mutate } = useSWR('ttx-game-state', loadGameState);

function updateState(newState: GameState) {
  mutate(newState, false); // Optimistic update
  saveGameState(newState);  // Persist to localStorage
}
```

## V1 Rules

**YOU MUST**:
- Keep all state in localStorage
- Make calculations pure functions
- Use SWR for state management
- Build single-page facilitator interface
- Focus on desktop/tablet experience

**YOU MUST NOT**:
- Add database integration
- Create player interfaces
- Add authentication
- Build real-time sync
- Create mobile-first UI

## Component Patterns

```tsx
// Admin control component pattern
interface ComputeAllocatorProps {
  companies: Company[];
  totalCompute: number;
  onAllocate: (allocations: Record<string, number>) => void;
}

export function ComputeAllocator({
  companies,
  totalCompute,
  onAllocate
}: ComputeAllocatorProps) {
  // Controlled inputs with validation
  // Clear error messages
  // Optimistic updates
}
```

## Default Values

```typescript
// Company colors
const COMPANY_COLORS = {
  OpenBrain: '#3b82f6',   // Blue
  Conscienta: '#a855f7',  // Purple
  DeepCent: '#ef4444',    // Red
} as const;

// Starting state
const INITIAL_COMPUTE = 10_000_000; // 10M H100e
const COMPUTE_GROWTH = 1.5;         // per round
const INITIAL_MULTIPLIER = 3.0;
```

## Testing Strategy

**V1 Manual Testing**:
- Run full 4-round game scenario
- Test edge cases (0% allocations, >100%, etc.)
- Verify calculations match specs
- Test in Chrome, Safari, Firefox
- Verify localStorage persistence

**V2+ Testing**:
- Unit tests for calculations
- Integration tests for API routes
- E2E tests with Playwright

## Common Pitfalls

**❌ DON'T**:
- Build V2 features in V1
- Over-engineer state management
- Add unnecessary animations
- Create documentation files unprompted
- Use bash tools for file operations (use Read/Edit/Write)

**✅ DO**:
- Keep components simple
- Make facilitator workflow fast
- Provide clear error messages
- Handle edge cases gracefully
- Test with realistic data

## Security Notes

**V1**: No security concerns (all data is local)

**V2+**:
- Validate all user input server-side
- Use prepared statements
- Implement facilitator auth
- Sanitize user narrative text
- Consider rate limiting

## Performance Targets

- Charts render smoothly with 6 companies × 4 rounds
- Page load < 2s
- State updates feel instant (< 100ms)
- No unnecessary re-renders

## Git Workflow

```bash
# Commits
git commit -m "feat: add compute allocation slider"
git commit -m "fix: calculation overflow for large values"
git commit -m "docs: update CLAUDE.md with examples"

# Branches (V2+)
feature/compute-chart
fix/calculation-bug
refactor/split-components
```

## Deployment

**V1**: Static site, no env vars needed

**V2+**:
```bash
# Add to Vercel environment
DATABASE_URL=postgresql://...
```

## AI-Assisted Development

When using Claude or AI tools:
- Reference this file for patterns
- Check V1_PLAN.md for implementation steps
- Verify calculations against docs/specs.md
- Remember: V1 is local storage only
- Ask for pure function implementations

## Key Architectural Decisions

**Q: Why local storage?**
A: Fastest path to working prototype. No infrastructure. Sufficient for single-facilitator use.

**Q: Why SWR?**
A: React hooks-based, built-in caching, optimistic updates, works with localStorage.

**Q: Why Tremor?**
A: Built for data viz, Tailwind-based, simpler than alternatives, good enough for V1.

**Q: Why single-page?**
A: All controls accessible at once. No navigation during live session. Faster workflow.

## Iteration Guidelines

This file should be updated as you code:
1. Add new patterns you discover
2. Document tricky edge cases
3. Update default values if changed
4. Add common bugs and solutions
5. Keep it concise - move details to separate docs

## Getting Started

1. Read README.txt for project context
2. Review V1_SUMMARY.md for quick overview
3. Check V1_PLAN.md for step-by-step guide
4. Start with `/lib/types.ts` and `/lib/calculations.ts`
5. Build components following patterns above
6. Test with full 4-round scenario

---

**Remember**: Ship V1 first. Perfect later. Focus on making the facilitator's job easy.
