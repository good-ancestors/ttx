# V1 Planning Summary - Ready to Build

## What We're Building

A single-page facilitator dashboard for running AI 2027 TTX sessions with:
- 3-5 AI company tracking
- Compute allocation interface
- Live calculation of game metrics
- Multi-round progression
- Alignment gap visualization
- Local storage persistence

## Architecture

**Tech Stack:**
- Next.js 14 (App Router, TypeScript, Tailwind)
- Tremor charts for visualization
- SWR for state management
- Local storage for persistence

**Data Flow:**
```
User Input → React State → Calculations → SWR Cache → localStorage → UI Update
```

**No backend, no database, no auth - pure client-side app**

## Key Files to Create

### 1. Core Logic (`/lib`)
- `types.ts` - All TypeScript interfaces
- `calculations.ts` - Game mechanics (R&D multiplier, risk, round results)
- `storage.ts` - localStorage wrapper
- `constants.ts` - Default values, colors

### 2. UI Components (`/components`)

**UI Primitives (`/ui`):**
- button, card, input, badge

**Game Visualization (`/game`):**
- `CompanyCard.tsx` - Company metrics display
- `ComputeChart.tsx` - Tremor line chart for alignment gap
- `MetricsTable.tsx` - Comparison table

**Admin Controls (`/admin`):**
- `CompanySetup.tsx` - Initial game setup
- `ComputeAllocator.tsx` - Distribute compute across companies
- `AllocationSliders.tsx` - Set R&D/Safety percentages
- `RoundControls.tsx` - Round progression buttons
- `NarrativeInput.tsx` - Optional round narrative

### 3. Main Page (`/app`)
- `page.tsx` - Single-page facilitator interface

## Core Calculations

```typescript
// R&D Multiplier (compounds over time)
rdMultiplier = 3.0 + (totalRDPoints × 0.000002)

// Points gained each round
newRDPoints = computeAllocated × rdAllocation × currentMultiplier
newSafetyPoints = computeAllocated × safetyAllocation × 1.0

// Accumulate (never reset)
totalRDPoints += newRDPoints
totalSafetyPoints += newSafetyPoints

// Risk assessment
alignmentGap = totalRDPoints - totalSafetyPoints
if (gap > 10M) riskLevel = 'critical'
else if (gap > 5M) riskLevel = 'high'
else if (gap > 2M) riskLevel = 'elevated'
else riskLevel = 'ok'
```

## User Workflow

### Game Setup
1. Open app
2. Enter company names (default: OpenBrain, Conscienta, DeepCent)
3. Click "Start Game"

### Each Round
1. Set global compute (starts at 10M, grows ~1.5x per round)
2. Allocate compute to each company
3. Set R&D and Safety percentages for each company
4. (Optional) Add narrative text
5. Click "Calculate Round"
6. Review results in chart and table
7. Click "Next Round"

### Game End
1. Review final trajectories
2. Export to PDF via browser print

## Success Criteria

V1 is done when:
- ✅ Can set up game with 3-5 companies
- ✅ Can progress through 4 rounds
- ✅ Calculations match specifications
- ✅ Chart shows alignment gap trends
- ✅ State persists across refreshes
- ✅ Can export to PDF
- ✅ Clean, usable interface
- ✅ Deployed to public URL

## Implementation Timeline

- **Day 1-2**: Setup + Core logic + Basic components (12-16h)
- **Day 3-4**: Main page + Workflow integration (12-16h)
- **Day 5-6**: Testing + Polish + Deploy (8-12h)

**Total: 32-44 hours over 4-6 days**

## What's NOT in V1

- ❌ Database
- ❌ Player interfaces
- ❌ Real-time collaboration
- ❌ Authentication
- ❌ Mobile optimization
- ❌ Action submission workflows
- ❌ Government/Media player views

(These come in V2+)

## Default Values

**Companies:**
- OpenBrain (Blue #3b82f6)
- Conscienta (Purple #a855f7)
- DeepCent (Red #ef4444)

**Starting State:**
- Round 1 global compute: 10,000,000 (10M)
- All companies start at 0 R&D, 0 Safety
- Initial multiplier: 3.0x for all
- Suggested initial allocations: 30% R&D, 15% Safety, 55% Users

**Growth:**
- Global compute grows ~1.5x per round
- Example: 10M → 15M → 22.5M → 33.75M

## Key Design Decisions

**Why local storage?**
- Fastest path to working prototype
- No infrastructure needed
- Sufficient for single-facilitator use case
- Easy to migrate to DB later

**Why SWR?**
- React hooks-based
- Built-in caching
- Optimistic updates
- Works with localStorage as "API"

**Why Tremor?**
- Built for data visualization
- Tailwind-based (consistent styling)
- Simpler than recharts/visx
- Good enough for V1

**Why single-page app?**
- All controls accessible at once
- No navigation needed during live session
- Faster facilitator workflow
- Simpler to build and test

## Next Steps

1. ✅ Documentation complete (README.txt, CLAUDE.md, V1_PLAN.md)
2. 🏗️ Initialize Next.js project
3. 🏗️ Implement core calculations
4. 🏗️ Build UI components
5. 🏗️ Integrate main page
6. 🏗️ Test with full 4-round scenario
7. 🏗️ Deploy to Vercel
8. ✅ Gather facilitator feedback

## Resources

### Project Documentation
- **Full Spec**: `/docs/specs.md`
- **Player Content**: `/docs/player_sheets.md`
- **Scenario**: `/docs/ai_2027.md`
- **Dev Guide**: `CLAUDE.md`
- **Detailed Plan**: `V1_PLAN.md`

### AI 2027 Research (Informs Design)
The following forecasts from AI Futures inform game mechanics:
- `/docs/ai_goals_forecast_ai_2027.md` - AI alignment outcomes
- `/docs/compute_forecast_ai_2027.md` - Compute projections
- `/docs/security_forecast_ai_2027.md` - Security capabilities
- `/docs/timelines_forecast_ai_2027.md` - AGI timelines
- `/docs/takeoff_forecast_ai_2027.md` - Takeoff dynamics

## Ready to Build?

Review this summary, then proceed with:
```bash
npx create-next-app@latest ttx --typescript --tailwind --app --no-src-dir
cd ttx
npm install @tremor/react swr zod date-fns lucide-react
```

Start with `/lib/types.ts` and work through the plan systematically.

---

**Remember: Ship V1 first. Perfect later.**
