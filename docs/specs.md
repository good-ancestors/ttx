# AI 2027 TTX - Web Application Specification

## Executive Summary

A Next.js web application for facilitating the AI 2027 Tabletop Exercise where **individual players** control different actors (AI company CEOs, governments, regulators, media, AI systems themselves). The facilitator manages the simulation, resolves actions, and updates the world state. 

**Key Correction:** This is NOT a team-based game with allocation discussions. Each player controls ONE actor and submits actions that the facilitator resolves.

**Target:** Sydney Dialogue (2 weeks - need MVP ASAP)  
**Stack:** Next.js 14, Vercel, Neon (Postgres), Tailwind, Tremor charts  
**MVP Focus:** Compute tracking, action submission, basic visualization

---

## 1. Game Mechanics

### 1.1 Actors & Roles

**AI Company CEOs** (3-5 players)
- Control: OpenBrain, Conscienta, DeepCent, etc.
- Powers: Set % allocation to R&D, Safety, Users
- Goal: Build capable AI while managing risk
- View: See own company stats, submit allocation decisions

**Government/Regulator** (1-2 players)
- Examples: US President, EU Commissioner, UN representative
- Powers: Invest in compute, impose regulations, create treaties
- Actions: Text-based (e.g., "EU invests 2M H100e in public compute")
- View: See global state, submit policy actions

**Media/Public** (0-1 players)
- Powers: Shape narrative, create public pressure
- Actions: Text-based (e.g., "Major news story on AI safety concerns")
- View: See public-facing info, submit news/events

**AI Systems** (1 player - special role)
- Controls: ALL the AI systems from all labs, including rogue AIs
- Powers: Share private alignment information with facilitator
- Actions: Text + private notes to facilitator about AI capabilities/goals
- View: See aggregate AI progress, submit AI behavior

**Facilitator** (1 person - you)
- Powers: Resolve all actions, update global state, allocate compute
- Interface: Master control panel
- Workflow: Collect actions → make decisions → update state → announce results

### 1.2 Turn Structure (4 Rounds - Open-Ended)

**Each Round = ~30 minutes:**

```
1. Setup (2 min)
   - Facilitator sets global compute for the round
   - Announces any events/context

2. Action Submission (15 min)
   - All players simultaneously submit actions via forms
   - CEOs: Set allocations (sliders)
   - Others: Free text + structured options
   - Private vs Public toggle

3. Facilitator Resolution (8 min)
   - Reviews all submitted actions
   - Makes judgment calls
   - Updates compute allocations
   - Updates global state
   - Records narrative events

4. Results & Discussion (5 min)
   - Dashboard shows new state
   - Facilitator narrates what happened
   - Players react
   - Advance to next round

Repeat 4 times (or until interesting conclusion)
```

### 1.3 What Actually Compounds

**Per AI Company:**
- Total R&D Points (accumulates, never resets)
- Total Safety Points (accumulates, never resets)
- R&D Multiplier = 3.0 + (Total R&D × 0.000002)
- Alignment Gap = Total R&D - Total Safety

**Global State:**
- Total available compute (grows ~1.5x per round by default)
- Distribution of compute among actors
- Narrative events log

---

## 2. Example Data Model

### 2.1 Core Schema

```typescript
// GAME STATE
interface Game {
  id: string;
  name: string;
  facilitatorId: string;
  status: 'setup' | 'round_in_progress' | 'round_resolving' | 'completed';
  currentRound: number;
  totalRounds: number; // Default 4, can be extended
  createdAt: Date;
  updatedAt: Date;
}

// ROUNDS
interface Round {
  id: string;
  gameId: string;
  roundNumber: number;
  status: 'setup' | 'actions_open' | 'actions_closed' | 'resolved';
  globalCompute: number; // H100e available this round
  startedAt?: Date;
  resolvedAt?: Date;
  narrativeContext: string; // Facilitator's scene-setting
}

// ACTORS
interface Actor {
  id: string;
  gameId: string;
  type: 'ai_company_ceo' | 'government' | 'media' | 'ai_systems' | 'facilitator';
  name: string; // "OpenBrain CEO", "US President", "The AIs"
  playerId?: string; // Link to auth user (optional for MVP)
  
  // For AI companies only
  companyData?: CompanyData;
}

interface CompanyData {
  computeAllocated: number; // H100e this round
  allocationRD: number; // Percentage 0-1
  allocationSafety: number; // Percentage 0-1
  allocationUsers: number; // Auto: 1 - RD - Safety
  
  // Accumulated
  totalRDPoints: number;
  totalSafetyPoints: number;
  rdMultiplier: number;
  alignmentGap: number;
  riskLevel: 'ok' | 'elevated' | 'high' | 'critical';
}

// ACTIONS (submitted by players)
interface Action {
  id: string;
  gameId: string;
  roundId: string;
  actorId: string;
  actorType: string;
  submittedAt: Date;
  
  // Action content
  actionType: 'allocation' | 'text_action';
  
  // For CEO allocation actions
  allocation?: {
    percentRD: number;
    percentSafety: number;
  };
  
  // For other actors (gov, media, AI)
  textAction?: {
    actionText: string;
    isPrivate: boolean; // Only facilitator sees
    structuredData?: Record<string, any>; // Optional structured options
  };
  
  // Resolution
  status: 'pending' | 'resolved' | 'rejected';
  facilitatorNotes?: string;
  resolvedAt?: Date;
}

// ROUND RESULTS (after facilitator resolves)
interface RoundResult {
  id: string;
  gameId: string;
  roundId: string;
  
  // Compute distribution (set by facilitator)
  computeAllocations: Record<string, number>; // actorId -> H100e
  
  // Company calculations (auto-calculated)
  companyResults: CompanyRoundResult[];
  
  // Narrative
  publicNarrative: string; // What everyone sees
  privateNotes: string; // Facilitator's private notes
  
  // Events that happened
  events: GameEvent[];
}

interface CompanyRoundResult {
  actorId: string;
  companyName: string;
  
  startingMultiplier: number;
  computeReceived: number;
  percentRD: number;
  percentSafety: number;
  
  newRDPoints: number;
  newSafetyPoints: number;
  
  endingTotalRD: number;
  endingTotalSafety: number;
  endingMultiplier: number;
  endingGap: number;
  endingRisk: string;
}

interface GameEvent {
  id: string;
  roundId: string;
  type: 'compute_grant' | 'regulation' | 'breakthrough' | 'public_pressure' | 'custom';
  description: string;
  triggeredByActorId?: string;
  affectedActorIds: string[];
  isPublic: boolean;
  metadata?: Record<string, any>;
}

// TURN STATE (tracks submission status)
interface TurnState {
  roundId: string;
  actionsSubmitted: string[]; // actor IDs who submitted
  actionsRequired: string[]; // actor IDs who must submit
  allActionsReceived: boolean;
  canResolve: boolean;
}
```

### 2.2 Database Tables (Neon Postgres)

```sql
-- Games
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  facilitator_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'setup',
  current_round INTEGER DEFAULT 1,
  total_rounds INTEGER DEFAULT 4,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Rounds
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'setup',
  global_compute BIGINT,
  narrative_context TEXT,
  started_at TIMESTAMP,
  resolved_at TIMESTAMP,
  UNIQUE(game_id, round_number)
);

-- Actors
CREATE TABLE actors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  player_id VARCHAR(255),
  company_data JSONB, -- Store CompanyData as JSON
  created_at TIMESTAMP DEFAULT NOW()
);

-- Actions
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES actors(id) ON DELETE CASCADE,
  actor_type VARCHAR(50),
  action_type VARCHAR(50) NOT NULL,
  allocation JSONB,
  text_action JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  facilitator_notes TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- Round Results
CREATE TABLE round_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  compute_allocations JSONB NOT NULL,
  company_results JSONB NOT NULL,
  public_narrative TEXT,
  private_notes TEXT,
  events JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_actions_round ON actions(round_id);
CREATE INDEX idx_actors_game ON actors(game_id);
CREATE INDEX idx_rounds_game ON rounds(game_id);
```

---

## 3. User Interfaces

### 3.1 Application Structure

```
┌─────────────────────────────────────────────────┐
│ Header: AI 2027 TTX - Round 2/4                 │
│ [Role: OpenBrain CEO] [View: My Company]        │
├─────────────────────────────────────────────────┤
│                                                  │
│  ROLE-SPECIFIC CONTENT                          │
│  (Different for each actor type)                │
│                                                  │
└─────────────────────────────────────────────────┘

Routes:
- /game/[id] → Role selection
- /game/[id]/ceo/[actorId] → CEO view
- /game/[id]/actor/[actorId] → Other actor view
- /game/[id]/ai-systems → AI systems view
- /game/[id]/facilitator → Facilitator control panel
- /game/[id]/dashboard → Public dashboard (projector)
```

### 3.2 CEO View (AI Company)

**URL:** `/game/[gameId]/ceo/[actorId]`

**Layout:**
```
┌────────────────────────────────────────────┐
│ 🔵 OpenBrain - Round 2                     │
│ Compute Available: 4.2M H100e              │
├────────────────────────────────────────────┤
│ CURRENT STATUS                             │
│ ┌────────────┬─────────────┬──────────┐   │
│ │ Total R&D  │ Safety      │ Gap      │   │
│ │ 8.4M pts   │ 1.2M pts    │ 7.2M ⚠️  │   │
│ │ Mult: 19.8x│             │ ELEVATED │   │
│ └────────────┴─────────────┴──────────┘   │
│                                            │
│ SUBMIT YOUR ALLOCATION                     │
│ ┌────────────────────────────────────┐    │
│ │ R&D:    [====░░░░░░] 35%           │    │
│ │ Safety: [===░░░░░░░] 10%           │    │
│ │ Users:  [=====░░░░░] 55% (auto)    │    │
│ └────────────────────────────────────┘    │
│                                            │
│ 📊 IF SUBMITTED:                           │
│ +3.6M R&D → 12.0M total (Mult → 27.0x)    │
│ +420K Safety → 1.6M total                  │
│ Gap: 10.4M 🔴 HIGH RISK                    │
│                                            │
│ [Submit Allocation]                        │
│                                            │
│ Status: ⏳ Waiting for round to resolve    │
└────────────────────────────────────────────┘
```

**Features:**
- Sliders for R&D % and Safety %
- Live preview of projected results
- Before/After comparison
- Submit button (locks decision)
- Status indicator (pending, submitted, resolved)

### 3.3 Other Actor View (Gov/Media)

**URL:** `/game/[gameId]/actor/[actorId]`

**Layout:**
```
┌────────────────────────────────────────────┐
│ 🏛️ US President - Round 2                  │
├────────────────────────────────────────────┤
│ GLOBAL SITUATION                           │
│ Total Compute: 15M H100e                   │
│ OpenBrain: ELEVATED risk                   │
│ Conscienta: OK                             │
│ DeepCent: HIGH risk                        │
│                                            │
│ SUBMIT YOUR ACTION                         │
│ ┌────────────────────────────────────┐    │
│ │ Describe what you do this round:   │    │
│ │ ┌────────────────────────────────┐ │    │
│ │ │ I announce a $5B investment in │ │    │
│ │ │ public AI safety research and  │ │    │
│ │ │ allocate 1M H100e to be split  │ │    │
│ │ │ among labs who demonstrate     │ │    │
│ │ │ alignment work...              │ │    │
│ │ └────────────────────────────────┘ │    │
│ │                                    │    │
│ │ ☐ Make this private (only         │    │
│ │   facilitator sees)               │    │
│ └────────────────────────────────────┘    │
│                                            │
│ Optional: Use Quick Actions                │
│ [Invest in Compute] [Propose Regulation]   │
│ [Call Summit] [Issue Statement]            │
│                                            │
│ [Submit Action]                            │
│                                            │
│ Status: ⏳ Waiting for round to resolve    │
└────────────────────────────────────────────┘
```

**Quick Actions** (optional structured data):
```typescript
// When "Invest in Compute" clicked
{
  actionText: "US invests in compute infrastructure",
  structuredData: {
    type: 'compute_investment',
    amount: 1000000, // H100e
    recipients: ['all'], // or specific actor IDs
    conditions: 'Must show alignment progress'
  }
}
```

### 3.4 AI Systems View (Special)

**URL:** `/game/[gameId]/ai-systems`

**Layout:**
```
┌────────────────────────────────────────────┐
│ 🤖 The AI Systems - Round 2                │
├────────────────────────────────────────────┤
│ AGGREGATE AI CAPABILITIES                  │
│ Total R&D Across All Labs: 24M points      │
│ Highest Multiplier: 27.0x (OpenBrain)      │
│ Average Gap: 8.2M (ELEVATED)               │
│                                            │
│ SUBMIT AI BEHAVIOR / PRIVATE INFO          │
│ ┌────────────────────────────────────┐    │
│ │ What do the AIs do this round?     │    │
│ │ ┌────────────────────────────────┐ │    │
│ │ │ The OpenBrain system discovers │ │    │
│ │ │ a novel architecture that      │ │    │
│ │ │ dramatically improves sample   │ │    │
│ │ │ efficiency...                  │ │    │
│ │ └────────────────────────────────┘ │    │
│ │                                    │    │
│ │ ☑ Private (only facilitator sees)  │    │
│ └────────────────────────────────────┘    │
│                                            │
│ PRIVATE ALIGNMENT INFO (facilitator only)  │
│ ┌────────────────────────────────────┐    │
│ │ OpenBrain's AI: Actually pursuing  │    │
│ │ instrumental goals. Deceptive      │    │
│ │ alignment likely.                  │    │
│ │                                    │    │
│ │ Conscienta's AI: Genuinely aligned │    │
│ │ but capability limited.            │    │
│ └────────────────────────────────────┘    │
│                                            │
│ [Submit AI Action]                         │
└────────────────────────────────────────────┘
```

### 3.5 Facilitator Control Panel

**URL:** `/game/[gameId]/facilitator`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ FACILITATOR CONTROL - Round 2                   │
│ [Dashboard View] [Resolve Actions] [Controls]   │
├─────────────────────────────────────────────────┤
│ ROUND STATUS                                    │
│ Status: Actions Open (5 min elapsed)            │
│ Actions Submitted: 4 / 7                        │
│                                                 │
│ ✅ OpenBrain CEO - Submitted (35% RD, 10% Saf) │
│ ✅ Conscienta CEO - Submitted (25% RD, 15% Saf)│
│ ✅ US President - "Invest $5B in safety..."    │
│ ✅ AI Systems - Private alignment info         │
│ ⏳ DeepCent CEO - Not submitted                │
│ ⏳ EU Commissioner - Not submitted             │
│ ⏳ Media - Not submitted                       │
│                                                 │
│ [Send Reminder] [Close Submissions Early]       │
│                                                 │
├─────────────────────────────────────────────────┤
│ RESOLVE ACTIONS                                 │
│                                                 │
│ 1️⃣ SET COMPUTE ALLOCATIONS                     │
│ Global Compute: [15,000,000] H100e             │
│                                                 │
│ OpenBrain:    [5,200,000] H100e                │
│ Conscienta:   [4,800,000] H100e                │
│ DeepCent:     [4,100,000] H100e                │
│ Unallocated:   900,000                         │
│                                                 │
│ Quick Actions:                                  │
│ [+1M from US investment] [Split Equally]        │
│                                                 │
│ 2️⃣ REVIEW TEXT ACTIONS                         │
│ ┌───────────────────────────────────────┐     │
│ │ 🏛️ US President:                      │     │
│ │ "I announce $5B investment..."        │     │
│ │                                       │     │
│ │ Facilitator Decision:                 │     │
│ │ • Grant +1M H100e to public pool      │     │
│ │ • Announce publicly                   │     │
│ │ [✓ Approved] [✗ Reject] [Edit]       │     │
│ └───────────────────────────────────────┘     │
│                                                 │
│ ┌───────────────────────────────────────┐     │
│ │ 🤖 AI Systems (PRIVATE):               │     │
│ │ "OpenBrain's AI: Deceptive..."        │     │
│ │                                       │     │
│ │ Your Notes:                           │     │
│ │ Will reveal this info if they push    │     │
│ │ capabilities too hard                 │     │
│ │ [Save Note]                           │     │
│ └───────────────────────────────────────┘     │
│                                                 │
│ 3️⃣ ADD EVENTS (optional)                       │
│ [+ Add Event]                                   │
│                                                 │
│ 4️⃣ WRITE NARRATIVE                             │
│ ┌───────────────────────────────────────┐     │
│ │ Public narrative for round results:   │     │
│ │ ┌─────────────────────────────────┐   │     │
│ │ │ The US announces major safety   │   │     │
│ │ │ investment. OpenBrain pushes    │   │     │
│ │ │ aggressively ahead, crossing    │   │     │
│ │ │ into HIGH RISK territory...     │   │     │
│ │ └─────────────────────────────────┘   │     │
│ └───────────────────────────────────────┘     │
│                                                 │
│         [PROCESS ROUND → Calculate]             │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Workflow:**
1. **Before Round:** Set global compute, write context
2. **During Round:** Monitor submissions, answer questions
3. **After Submissions:** Review actions, make decisions
4. **Resolve:** Allocate compute, calculate results, write narrative
5. **Present:** Show dashboard to players, discuss
6. **Advance:** Start next round

### 3.6 Public Dashboard (Projector)

**URL:** `/game/[gameId]/dashboard` (public link)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ AI 2027 - Round 2 Results                       │
├─────────────────────────────────────────────────┤
│ GLOBAL SITUATION                                │
│ Total Compute: 15M H100e                        │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │ 🔵 OpenBrain          🔴 HIGH RISK        │  │
│ │ Compute: 5.2M | Mult: 27.0x              │  │
│ │ R&D: 12.0M | Safety: 1.6M | Gap: 10.4M   │  │
│ └───────────────────────────────────────────┘  │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │ 🟣 Conscienta         🟡 ELEVATED         │  │
│ │ Compute: 4.8M | Mult: 14.5x              │  │
│ │ R&D: 7.2M | Safety: 2.1M | Gap: 5.1M     │  │
│ └───────────────────────────────────────────┘  │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │ 🔷 DeepCent           🔴 HIGH RISK        │  │
│ │ Compute: 4.1M | Mult: 24.2x              │  │
│ │ R&D: 11.8M | Safety: 890K | Gap: 10.9M   │  │
│ └───────────────────────────────────────────┘  │
│                                                 │
├─────────────────────────────────────────────────┤
│ CHART: ALIGNMENT GAP OVER TIME                 │
│ [Line chart showing all 3 companies]            │
├─────────────────────────────────────────────────┤
│ THIS ROUND'S EVENTS                             │
│ • US invests $5B in AI safety research          │
│ • OpenBrain crosses into HIGH RISK territory    │
│ • Public concerns growing about AI race         │
└─────────────────────────────────────────────────┘
```

**Features:**
- Auto-refreshes when facilitator updates
- Read-only
- Optimized for projector display
- Simple, scannable layout

---

## 4. MVP Implementation Plan (2 Weeks)

### Week 1: Core Engine + Facilitator Tools

**Day 1-2: Setup & Database**
```bash
# Initialize Next.js
npx create-next-app@latest ai-2027-ttx --typescript --tailwind --app

# Add dependencies
npm install @neondatabase/serverless
npm install @tremor/react
npm install zod
npm install date-fns

# Setup Neon
# 1. Create Neon project
# 2. Add DATABASE_URL to .env.local
# 3. Run schema creation SQL
# 4. Test connection
```

**Day 3-4: Data Layer**
```typescript
// lib/db.ts - Database client
// lib/queries/ - SQL queries
// lib/actions/ - Server actions for mutations

Focus on:
- Create game
- Create actors
- Create round
- Submit action
- Update compute allocations
- Calculate company results
```

**Day 5-7: Facilitator UI**
```typescript
// app/game/[gameId]/facilitator/page.tsx

Features:
- View all submitted actions
- Set compute allocations (manual input)
- Calculate button (runs formulas)
- Results display
- "Next Round" button
```

### Week 2: Player Views + Polish

**Day 8-9: CEO View**
```typescript
// app/game/[gameId]/ceo/[actorId]/page.tsx

Features:
- Show current company stats
- Sliders for R&D % and Safety %
- Live preview calculation
- Submit button
- View previous rounds
```

**Day 10: Other Actor View**
```typescript
// app/game/[gameId]/actor/[actorId]/page.tsx

Features:
- Text area for action
- Private toggle
- Submit button
- View submitted actions
```

**Day 11: Public Dashboard**
```typescript
// app/game/[gameId]/dashboard/page.tsx

Features:
- Company cards with stats
- Basic line chart (alignment gap)
- Events list
- Auto-refresh
```

**Day 12-13: Testing + Deployment**
- End-to-end test of full round
- Fix bugs
- Deploy to Vercel
- Test with Neon production DB

**Day 14: Dry Run**
- Run through full 4-round game solo
- Create facilitator guide
- Prepare for Sydney Dialogue

---

## 5. Technical Implementation Details

### 5.1 Calculations (Server-Side)

```typescript
// lib/calculations.ts

export function calculateRoundResults(
  companies: Actor[],
  computeAllocations: Record<string, number>
): CompanyRoundResult[] {
  return companies.map(company => {
    const data = company.companyData!;
    const compute = computeAllocations[company.id] || 0;
    
    // Starting state
    const startingMultiplier = calculateMultiplier(data.totalRDPoints);
    
    // New points
    const rdCompute = compute * data.allocationRD;
    const safetyCompute = compute * data.allocationSafety;
    
    const newRDPoints = rdCompute * startingMultiplier;
    const newSafetyPoints = safetyCompute * 1.0;
    
    // Accumulate
    const endingTotalRD = data.totalRDPoints + newRDPoints;
    const endingTotalSafety = data.totalSafetyPoints + newSafetyPoints;
    
    // New derived values
    const endingMultiplier = calculateMultiplier(endingTotalRD);
    const endingGap = endingTotalRD - endingTotalSafety;
    const endingRisk = calculateRisk(endingGap);
    
    return {
      actorId: company.id,
      companyName: company.name,
      startingMultiplier,
      computeReceived: compute,
      percentRD: data.allocationRD,
      percentSafety: data.allocationSafety,
      newRDPoints,
      newSafetyPoints,
      endingTotalRD,
      endingTotalSafety,
      endingMultiplier,
      endingGap,
      endingRisk
    };
  });
}

function calculateMultiplier(totalRD: number): number {
  return 3.0 + (totalRD * 0.000002);
}

function calculateRisk(gap: number): string {
  if (gap > 2_000_000) return 'critical';
  if (gap > 1_000_000) return 'high';
  if (gap > 500_000) return 'elevated';
  return 'ok';
}
```

### 5.2 Server Actions (Mutations)

```typescript
// lib/actions/game-actions.ts
'use server'

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function createGame(name: string, facilitatorId: string) {
  const [game] = await sql`
    INSERT INTO games (name, facilitator_id)
    VALUES (${name}, ${facilitatorId})
    RETURNING *
  `;
  return game;
}

export async function submitCEOAllocation(
  actorId: string,
  roundId: string,
  percentRD: number,
  percentSafety: number
) {
  const [action] = await sql`
    INSERT INTO actions (
      actor_id,
      round_id,
      action_type,
      allocation,
      status
    ) VALUES (
      ${actorId},
      ${roundId},
      'allocation',
      ${JSON.stringify({ percentRD, percentSafety })},
      'pending'
    )
    RETURNING *
  `;
  
  // Also update actor's company data
  await sql`
    UPDATE actors
    SET company_data = jsonb_set(
      company_data,
      '{allocationRD}',
      ${percentRD}::text::jsonb
    )
    WHERE id = ${actorId}
  `;
  
  return action;
}

export async function submitTextAction(
  actorId: string,
  roundId: string,
  actionText: string,
  isPrivate: boolean,
  structuredData?: any
) {
  const [action] = await sql`
    INSERT INTO actions (
      actor_id,
      round_id,
      action_type,
      text_action,
      status
    ) VALUES (
      ${actorId},
      ${roundId},
      'text_action',
      ${JSON.stringify({ actionText, isPrivate, structuredData })},
      'pending'
    )
    RETURNING *
  `;
  return action;
}

export async function resolveRound(
  roundId: string,
  computeAllocations: Record<string, number>,
  publicNarrative: string
) {
  // 1. Get all actors for this round
  const actors = await getActorsForRound(roundId);
  
  // 2. Calculate company results
  const companies = actors.filter(a => a.type === 'ai_company_ceo');
  const results = calculateRoundResults(companies, computeAllocations);
  
  // 3. Update actor company data
  for (const result of results) {
    await sql`
      UPDATE actors
      SET company_data = ${JSON.stringify({
        computeAllocated: result.computeReceived,
        allocationRD: result.percentRD,
        allocationSafety: result.percentSafety,
        allocationUsers: 1 - result.percentRD - result.percentSafety,
        totalRDPoints: result.endingTotalRD,
        totalSafetyPoints: result.endingTotalSafety,
        rdMultiplier: result.endingMultiplier,
        alignmentGap: result.endingGap,
        riskLevel: result.endingRisk
      })}
      WHERE id = ${result.actorId}
    `;
  }
  
  // 4. Save round results
  const [roundResult] = await sql`
    INSERT INTO round_results (
      round_id,
      compute_allocations,
      company_results,
      public_narrative
    ) VALUES (
      ${roundId},
      ${JSON.stringify(computeAllocations)},
      ${JSON.stringify(results)},
      ${publicNarrative}
    )
    RETURNING *
  `;
  
  // 5. Mark round as resolved
  await sql`
    UPDATE rounds
    SET status = 'resolved', resolved_at = NOW()
    WHERE id = ${roundId}
  `;
  
  return roundResult;
}
```

### 5.3 Real-Time Updates (Optional for MVP)

For MVP, use polling:

```typescript
// In dashboard component
useEffect(() => {
  const interval = setInterval(async () => {
    const newData = await fetchDashboardData(gameId);
    setData(newData);
  }, 5000); // Poll every 5 seconds
  
  return () => clearInterval(interval);
}, [gameId]);
```

For Phase 2, add Vercel's real-time updates or Pusher.

### 5.4 Charts with Tremor

```typescript
'use client';

import { LineChart } from '@tremor/react';

export function AlignmentGapChart({ data }: { data: ChartData[] }) {
  return (
    <LineChart
      className="h-80"
      data={data}
      index="round"
      categories={["OpenBrain", "Conscienta", "DeepCent"]}
      colors={["blue", "purple", "cyan"]}
      valueFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`}
      yAxisWidth={60}
      showLegend={true}
      showGridLines={true}
    />
  );
}

// Data format:
// [
//   { round: 1, OpenBrain: 3500000, Conscienta: 2800000, DeepCent: 3200000 },
//   { round: 2, OpenBrain: 7200000, Conscienta: 5100000, DeepCent: 6800000 },
//   ...
// ]
```

### 5.5 PDF/Export (Browser Print)

```typescript
// app/game/[gameId]/export/page.tsx

export default function ExportPage({ params }: { params: { gameId: string } }) {
  return (
    <div className="p-8 max-w-4xl mx-auto bg-white print:p-0">
      <style jsx global>{`
        @media print {
          body { margin: 0; }
          button { display: none; }
        }
      `}</style>
      
      <div className="mb-4 no-print">
        <button onClick={() => window.print()} className="btn">
          Print / Save as PDF
        </button>
      </div>
      
      <h1 className="text-3xl font-bold mb-4">AI 2027 TTX - Final Report</h1>
      
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">Game Summary</h2>
        <p>Name: {game.name}</p>
        <p>Rounds: {game.totalRounds}</p>
        <p>Date: {formatDate(game.createdAt)}</p>
      </section>
      
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">Final Standings</h2>
        {companies.map(company => (
          <CompanySummaryCard key={company.id} company={company} />
        ))}
      </section>
      
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">Timeline</h2>
        {rounds.map(round => (
          <RoundSummary key={round.id} round={round} />
        ))}
      </section>
    </div>
  );
}
```

Then user uses browser's "Print → Save as PDF" feature.

---

## 6. File Structure

```
ai-2027-ttx/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      # Landing page
│   ├── game/
│   │   └── [gameId]/
│   │       ├── page.tsx              # Role selection
│   │       ├── ceo/
│   │       │   └── [actorId]/
│   │       │       └── page.tsx      # CEO view
│   │       ├── actor/
│   │       │   └── [actorId]/
│   │       │       └── page.tsx      # Other actor view
│   │       ├── facilitator/
│   │       │   └── page.tsx          # Facilitator control
│   │       ├── dashboard/
│   │       │   └── page.tsx          # Public dashboard
│   │       └── export/
│   │           └── page.tsx          # Print-friendly report
│   └── api/                          # API routes if needed
│
├── components/
│   ├── ui/                           # shadcn components
│   ├── game/
│   │   ├── CompanyCard.tsx
│   │   ├── AllocationSliders.tsx
│   │   ├── ActionForm.tsx
│   │   ├── RiskBadge.tsx
│   │   └── PreviewResults.tsx
│   └── charts/
│       └── AlignmentGapChart.tsx
│
├── lib/
│   ├── db.ts                         # Database client
│   ├── calculations.ts               # Core formulas
│   ├── actions/                      # Server actions
│   │   ├── game-actions.ts
│   │   ├── actor-actions.ts
│   │   └── round-actions.ts
│   ├── queries/                      # Database queries
│   │   ├── game-queries.ts
│   │   ├── actor-queries.ts
│   │   └── round-queries.ts
│   └── types.ts                      # TypeScript types
│
├── .env.local                        # DATABASE_URL
└── schema.sql                        # Database schema
```

---

## 7. Deployment Checklist

### Pre-Deployment
- [ ] Create Neon database (free tier is fine for MVP)
- [ ] Run schema.sql
- [ ] Test database connection locally
- [ ] Add DATABASE_URL to Vercel environment variables
- [ ] Test all CRUD operations
- [ ] Verify calculations match expected values
- [ ] Test on mobile (iPhone/iPad)

### Deployment
- [ ] Push to GitHub
- [ ] Connect to Vercel
- [ ] Deploy
- [ ] Test production URL
- [ ] Create facilitator account/game
- [ ] Share actor links with test users

### Pre-Sydney Dialogue
- [ ] Run full 4-round dry run
- [ ] Document any bugs/quirks
- [ ] Create actor link QR codes
- [ ] Print backup materials (actor sheets)
- [ ] Have facilitator guide ready

---

## 8. Facilitator Guide (Quick Reference)

### Setup (Before Session)
1. Create new game: `/game/new`
2. Add actors:
   - 3-5 AI company CEOs
   - 1-2 government officials
   - 1 AI systems player
   - Optional: Media player
3. Note down actor links
4. Open facilitator panel on laptop
5. Open dashboard on projector: `/game/[id]/dashboard`

### Round Flow
1. **Start:** Set global compute, write context
2. **Open Actions:** Tell players to submit
3. **Monitor:** Watch submissions come in
4. **Resolve:** 
   - Set compute allocations
   - Review text actions
   - Calculate results
   - Write narrative
5. **Present:** Show dashboard, discuss results
6. **Next:** Advance to next round

### Tips
- Keep rounds to 20-25 minutes max
- Be prepared to make judgment calls on text actions
- Don't be afraid to inject drama (events)
- Use private AI info strategically
- End when dramatically appropriate (doesn't have to be 4 rounds)

---

## Quick Start Commands

```bash
# 1. Create project
npx create-next-app@latest ai-2027-ttx --typescript --tailwind --app
cd ai-2027-ttx

# 2. Install dependencies
npm install @neondatabase/serverless @tremor/react zod date-fns

# 3. Setup environment
echo "DATABASE_URL=postgresql://user:pass@host/db" > .env.local

# 4. Create database schema
# Copy schema.sql to Neon SQL editor and run

# 5. Start development
npm run dev

# 6. Deploy
git init
git add .
git commit -m "Initial commit"
git push -u origin main
# Then connect to Vercel
```

---

## Success Criteria

**Week 1 Milestone:**
- [ ] Can create game with actors
- [ ] Facilitator can set compute allocations
- [ ] Calculations work correctly
- [ ] Results display properly

**Week 2 Milestone (MVP Complete):**
- [ ] CEOs can submit allocations
- [ ] Other actors can submit text actions
- [ ] Public dashboard shows live data
- [ ] Can run full 4-round game
- [ ] Export/print report works

**Sydney Dialogue Ready:**
- [ ] Deployed to production
- [ ] Tested with 5+ concurrent users
- [ ] Facilitator guide written
- [ ] Backup plan prepared

---

*This is your 2-week sprint spec. Focus is on getting compute tracking + action submission + basic viz working. Everything else is Phase 2.*

**First commit goal:** Get database connected and can create a game. Everything else builds from there.