# V1 Implementation Plan - Simple Chart with Admin Panel

**Project Context**: This project is developed by Good Ancestors and is inspired by and built upon the AI 2027 scenario and tabletop exercise created by AI Futures (https://ai-2027.com). The scenario and research were developed through running this exercise with experts in AI, geopolitics, and national security. This implementation is built with the support and permission of AI Futures.

## V1 Goal

Create a minimal viable tool for facilitators to:
1. Track compute allocation across multiple AI companies
2. Visualize company progress over multiple rounds
3. Calculate and display R&D points, Safety points, and Alignment Gap
4. Progress through game rounds with manual input

**No database, no player interfaces, no authentication - just facilitator tools.**

## V1 Feature Set

### What's IN for V1
- ✅ Single-page admin interface
- ✅ Company setup (3-5 AI companies)
- ✅ Compute allocation controls
- ✅ Round progression
- ✅ Live calculation of game metrics
- ✅ Multi-company comparison chart
- ✅ Local storage persistence
- ✅ Basic export (browser print/PDF)

### What's OUT for V1
- ❌ Database integration
- ❌ Player action submission
- ❌ Separate player views
- ❌ Real-time collaboration
- ❌ Authentication/authorization
- ❌ Mobile optimization
- ❌ Advanced export features

## Technical Architecture (V1)

```
┌─────────────────────────────────────────────────┐
│                  Browser                         │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │         Next.js Application              │  │
│  │                                          │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │  Facilitator Interface         │    │  │
│  │  │  (Single Page)                 │    │  │
│  │  │                                │    │  │
│  │  │  - Company Setup               │    │  │
│  │  │  - Compute Allocator           │    │  │
│  │  │  - Round Controls              │    │  │
│  │  │  - Charts & Metrics            │    │  │
│  │  └────────────────────────────────┘    │  │
│  │                                          │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │  SWR + Local Storage           │    │  │
│  │  │  (State Management)            │    │  │
│  │  └────────────────────────────────┘    │  │
│  │                                          │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │  Calculations Library          │    │  │
│  │  │  (Pure Functions)              │    │  │
│  │  └────────────────────────────────┘    │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  localStorage: 'ttx-game-state'                 │
└─────────────────────────────────────────────────┘
```

## Data Model (V1 - Local Storage)

```typescript
interface GameState {
  id: string;
  name: string;
  currentRound: number;
  totalRounds: number;
  globalCompute: number;
  companies: Company[];
  roundHistory: RoundResult[];
  createdAt: string;
  updatedAt: string;
}

interface Company {
  id: string;
  name: string;
  color: string; // For chart visualization

  // Current round allocations
  computeAllocated: number;
  allocationRD: number;     // 0-1 (percentage as decimal)
  allocationSafety: number; // 0-1

  // Accumulated totals
  totalRDPoints: number;
  totalSafetyPoints: number;

  // Derived metrics
  rdMultiplier: number;
  alignmentGap: number;
  riskLevel: 'ok' | 'elevated' | 'high' | 'critical';
}

interface RoundResult {
  roundNumber: number;
  globalCompute: number;
  narrative: string;
  companies: CompanySnapshot[];
  timestamp: string;
}

interface CompanySnapshot {
  companyId: string;
  companyName: string;
  computeReceived: number;
  newRDPoints: number;
  newSafetyPoints: number;
  totalRDPoints: number;
  totalSafetyPoints: number;
  rdMultiplier: number;
  alignmentGap: number;
  riskLevel: string;
}
```

## Implementation Steps

### Phase 1: Project Setup (Day 1)

```bash
# Initialize Next.js project
npx create-next-app@latest ttx --typescript --tailwind --app --no-src-dir
cd ttx

# Install dependencies
npm install @tremor/react swr zod date-fns lucide-react

# Initialize git
git init
git add .
git commit -m "Initial Next.js setup"
```

**Files to create:**
- ✅ `/lib/types.ts` - All TypeScript interfaces
- ✅ `/lib/calculations.ts` - Game mechanics formulas
- ✅ `/lib/storage.ts` - Local storage utilities
- ✅ `/lib/constants.ts` - Default values, colors, etc.

### Phase 2: Core Logic Layer (Day 1-2)

**`/lib/calculations.ts`** - Implement these pure functions:
```typescript
export function calculateMultiplier(totalRD: number): number;
export function calculateRisk(gap: number): RiskLevel;
export function calculateRoundResults(
  companies: Company[],
  computeAllocations: Record<string, number>
): RoundResult;
export function initializeCompany(name: string, color: string): Company;
export function initializeGame(
  name: string,
  companyNames: string[]
): GameState;
```

**`/lib/storage.ts`** - Implement local storage wrapper:
```typescript
export function saveGameState(state: GameState): void;
export function loadGameState(): GameState | null;
export function clearGameState(): void;
export function exportGameState(): string; // JSON export
```

**Testing**: Write simple tests or manual verification for calculations.

### Phase 3: UI Components (Day 2-3)

Build components in this order:

**1. Basic UI primitives**
```
/components/ui/
  button.tsx
  card.tsx
  input.tsx
  badge.tsx
```

**2. Game-specific components**

**`/components/game/CompanyCard.tsx`**
- Display company name, color badge
- Show current metrics: total R&D, Safety, Gap, Risk
- Show current multiplier
- Compact, scannable layout

**`/components/game/ComputeChart.tsx`**
- Use Tremor LineChart
- Show alignment gap over time for all companies
- X-axis: Round number
- Y-axis: Alignment gap (in millions)
- Legend with company colors

**`/components/game/MetricsTable.tsx`**
- Table showing all companies side-by-side
- Columns: Company, Compute, R&D %, Safety %, Total R&D, Total Safety, Gap, Risk
- Color-coded risk badges

**3. Admin/facilitator components**

**`/components/admin/CompanySetup.tsx`**
- Form to add/remove companies
- Name input + color picker
- Preset company names: OpenBrain, Conscienta, DeepCent

**`/components/admin/ComputeAllocator.tsx`**
- Input for global compute
- Inputs for each company's allocation
- Show remaining unallocated compute
- Validation: sum ≤ global compute

**`/components/admin/AllocationSliders.tsx`**
- For each company: sliders for R&D % and Safety %
- Users % auto-calculated (1 - R&D - Safety)
- Live preview of projected round results
- Validation: R&D + Safety ≤ 100%

**`/components/admin/RoundControls.tsx`**
- Current round indicator
- "Calculate Round" button
- "Next Round" button
- "Reset Game" button (with confirmation)

**`/components/admin/NarrativeInput.tsx`**
- Text area for facilitator to add round narrative
- Optional, not required for calculations

### Phase 4: Main Page (Day 3-4)

**`/app/page.tsx`** - Single-page admin interface

Layout structure:
```tsx
<div className="min-h-screen bg-gray-50 p-8">
  <header>
    <h1>AI 2027 TTX - Facilitator Dashboard</h1>
    <GameControls />
  </header>

  {!gameState ? (
    <CompanySetup onStart={handleGameStart} />
  ) : (
    <div className="grid grid-cols-12 gap-6">
      {/* Left Column - Controls */}
      <div className="col-span-4">
        <RoundControls />
        <ComputeAllocator />
        <AllocationSliders />
        <NarrativeInput />
      </div>

      {/* Right Column - Visualization */}
      <div className="col-span-8">
        <ComputeChart />
        <CompanyCards />
        <MetricsTable />
        <RoundHistory />
      </div>
    </div>
  )}
</div>
```

**State management with SWR:**
```tsx
'use client';

import useSWR from 'swr';
import { loadGameState, saveGameState } from '@/lib/storage';

export default function FacilitatorDashboard() {
  const { data: gameState, mutate } = useSWR(
    'ttx-game-state',
    loadGameState,
    {
      fallbackData: null,
      revalidateOnFocus: false,
    }
  );

  function updateGameState(newState: GameState) {
    mutate(newState, false); // Optimistic update
    saveGameState(newState);
  }

  // ... rest of component
}
```

### Phase 5: Workflow Implementation (Day 4-5)

Implement these user flows:

**1. Game Setup Flow**
```
User opens app → No game found → Show CompanySetup
User enters company names → Click "Start Game"
→ Initialize game state → Save to localStorage → Show dashboard
```

**2. Round Progression Flow**
```
Facilitator sets global compute
→ Allocates compute to each company
→ Sets R&D and Safety percentages for each
→ (Optional) Adds narrative text
→ Clicks "Calculate Round"
→ Run calculations → Update company totals → Generate snapshot
→ Save to roundHistory → Update localStorage → Show results
→ Click "Next Round" → Increment round counter → Reset inputs
```

**3. Data Persistence Flow**
```
Every state change:
→ Update SWR cache (instant UI update)
→ Save to localStorage (persist across refreshes)
```

**4. Export Flow**
```
Click "Export" button → Open print dialog
→ Use browser's "Save as PDF" functionality
```

### Phase 6: Testing & Polish (Day 5-6)

**Manual Testing Checklist:**
- [ ] Start new game with 3 companies
- [ ] Run through 4 complete rounds
- [ ] Verify all calculations match specs.md formulas
- [ ] Test with edge cases:
  - [ ] 0% to R&D, 100% to Safety
  - [ ] 100% to R&D, 0% to Safety
  - [ ] Large compute allocations (100M+)
  - [ ] Very small allocations (<100K)
- [ ] Refresh page - state should persist
- [ ] Export to PDF - should be readable
- [ ] Test in Chrome, Safari, Firefox

**Polish checklist:**
- [ ] Loading states for calculations
- [ ] Error boundaries for component failures
- [ ] Helpful error messages for invalid inputs
- [ ] Smooth transitions between rounds
- [ ] Responsive layout (desktop/tablet)
- [ ] Print-friendly CSS
- [ ] Clear visual hierarchy
- [ ] Consistent spacing and typography

### Phase 7: Deployment (Day 6)

```bash
# Push to GitHub
git add .
git commit -m "V1 complete: Facilitator dashboard with local storage"
git branch -M main
git remote add origin <your-repo>
git push -u origin main

# Deploy to Vercel
# 1. Go to vercel.com
# 2. Import repository
# 3. Accept defaults (Next.js is auto-detected)
# 4. Deploy
```

**Post-deployment:**
- [ ] Test live URL
- [ ] Run through full 4-round game on production
- [ ] Share with test facilitator for feedback

## Example Usage Scenario

**Setting up a game:**
1. Facilitator opens app
2. Clicks "New Game"
3. Enters company names: OpenBrain, Conscienta, DeepCent
4. Clicks "Start Game"

**Round 1:**
1. Sets global compute: 10,000,000 (10M)
2. Allocates:
   - OpenBrain: 5M
   - Conscienta: 3M
   - DeepCent: 2M
3. Sets allocations:
   - OpenBrain: 40% R&D, 10% Safety
   - Conscienta: 30% R&D, 15% Safety
   - DeepCent: 45% R&D, 5% Safety
4. Clicks "Calculate Round"
5. Reviews results in chart and table
6. Adds narrative: "OpenBrain surges ahead with aggressive R&D investment..."
7. Clicks "Next Round"

**Round 2-4:** Repeat with increasing global compute and evolving strategies

**End of game:**
1. Reviews final chart showing trajectories
2. Discusses outcomes with players
3. Clicks "Export" → Saves PDF for records

## Success Criteria for V1

V1 is complete when:
- [ ] Facilitator can set up a game with 3-5 companies
- [ ] Can progress through 4 rounds
- [ ] All calculations match specification
- [ ] Chart clearly shows alignment gap trends
- [ ] State persists across page refreshes
- [ ] Can export results to PDF
- [ ] Interface is clean and usable
- [ ] Deployed to public URL

## Non-Goals for V1

These are explicitly NOT in scope:
- Multi-user support
- Database persistence
- Player action submission
- Real-time updates
- Authentication
- Mobile optimization
- Advanced export formats
- Undo/redo functionality
- Game templates
- Historical game library

## Estimated Timeline

- **Day 1**: Setup + Core logic (6-8 hours)
- **Day 2**: UI components part 1 (6-8 hours)
- **Day 3**: UI components part 2 (6-8 hours)
- **Day 4**: Main page integration (6-8 hours)
- **Day 5**: Workflow implementation (4-6 hours)
- **Day 6**: Testing, polish, deployment (4-6 hours)

**Total: 32-44 hours = 4-6 days of full-time work**

## Key Files Summary

After V1, project should have:
```
ttx/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Main facilitator interface
│   └── globals.css
├── components/
│   ├── ui/                   # Basic primitives
│   ├── game/                 # Game visualization
│   │   ├── CompanyCard.tsx
│   │   ├── ComputeChart.tsx
│   │   └── MetricsTable.tsx
│   └── admin/                # Facilitator controls
│       ├── CompanySetup.tsx
│       ├── ComputeAllocator.tsx
│       ├── AllocationSliders.tsx
│       ├── RoundControls.tsx
│       └── NarrativeInput.tsx
├── lib/
│   ├── types.ts              # All interfaces
│   ├── calculations.ts       # Pure functions
│   ├── storage.ts            # Local storage utils
│   └── constants.ts          # Defaults and configs
├── docs/
│   ├── specs.md              # Full specification
│   ├── player_sheets.md      # Player roles
│   └── ai_2027.md           # Scenario narrative
├── README.txt
├── CLAUDE.md
├── V1_PLAN.md               # This file
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## Next Steps After V1

Once V1 is complete and validated:
1. Gather facilitator feedback
2. Plan V2 features (database integration)
3. Design player interfaces
4. Consider real-time updates architecture

But don't think about V2 while building V1. Ship V1 first.

## Questions to Resolve Before Starting

- [ ] Default company names and colors?
  - Suggested: OpenBrain (blue), Conscienta (purple), DeepCent (red)
- [ ] Default starting compute?
  - Suggested: 10M in Round 1, 1.5x growth per round
- [ ] Default round allocations?
  - Suggested: Start neutral (30% R&D, 15% Safety for all)
- [ ] Should round history be expandable/collapsible?
  - Suggested: Yes, to save screen space

## Resources

### Technical Documentation
- Design inspiration: [Tremor Showcase](https://www.tremor.so/)
- Next.js docs: [nextjs.org/docs](https://nextjs.org/docs)
- Tailwind docs: [tailwindcss.com/docs](https://tailwindcss.com/docs)
- SWR docs: [swr.vercel.app](https://swr.vercel.app/)

### AI 2027 Research (Informs Game Mechanics)
These forecasts from AI Futures inform the scenario design and game balance:
- **AI Goals Forecast**: `/docs/ai_goals_forecast_ai_2027.md` - Understanding AI alignment outcomes
- **Compute Forecast**: `/docs/compute_forecast_ai_2027.md` - Growth projections (10x by Dec 2027)
- **Security Forecast**: `/docs/security_forecast_ai_2027.md` - Security levels and capabilities
- **Timelines Forecast**: `/docs/timelines_forecast_ai_2027.md` - AGI development timelines
- **Takeoff Forecast**: `/docs/takeoff_forecast_ai_2027.md` - Intelligence explosion dynamics

These forecasts help justify:
- The compounding R&D multiplier formula
- Default compute growth rates (1.5x per round)
- Risk thresholds for alignment gaps
- The 3-month round duration in the scenario

---

**Remember: V1 is about validation, not perfection. Build the simplest thing that works, deploy it, test it with a real facilitator, then iterate.**
