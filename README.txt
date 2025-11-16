AI 2027 TABLETOP EXERCISE (TTX) - WEB APPLICATION
================================================

PROJECT OVERVIEW
----------------
A web-based facilitation tool for the AI 2027 Tabletop Exercise, an interactive
simulation exploring plausible AGI development scenarios and their geopolitical
implications. Players assume roles as AI company CEOs, government officials,
regulators, media, and AI systems themselves.

Developed by Good Ancestors for the Sydney Dialogue and broader AI safety community.


KEY FEATURES
------------
1. Facilitator Dashboard
   - Real-time compute allocation tracking
   - Action resolution interface
   - Round management and progression
   - Narrative event logging

2. Player Views
   - AI Company CEOs: Allocation sliders for R&D, Safety, Users
   - Government/Regulators: Text-based action submission
   - AI Systems: Alignment information & private notes
   - Media/Public: Narrative shaping actions

3. Public Dashboard
   - Live visualization of company metrics
   - Alignment gap tracking over time
   - Risk level indicators
   - Round results and events feed


TECHNICAL STACK
---------------
Backend:
  - Next.js 14 (App Router)
  - Neon (Serverless Postgres)
  - Server Actions for mutations

Frontend:
  - React 18+ with TypeScript
  - Tailwind CSS for styling
  - Tremor for charts/visualizations
  - SWR for data fetching

Deployment:
  - Vercel (hosting)
  - Neon (database)


PROJECT STRUCTURE
-----------------
/docs                    - Project documentation
  specs.md              - Full technical specification
  player_sheets.md      - Player roles and instructions
  ai_2027.md           - Scenario narrative and timeline

  AI 2027 Research & Forecasts (from AI Futures):
  ai_goals_forecast_ai_2027.md      - AI alignment outcomes
  compute_forecast_ai_2027.md       - Compute availability projections
  security_forecast_ai_2027.md      - Security levels and capabilities
  timelines_forecast_ai_2027.md     - AGI development timelines
  takeoff_forecast_ai_2027.md       - Intelligence explosion dynamics

/app                    - Next.js app directory (to be created)
/components             - React components (to be created)
/lib                    - Utilities, calculations, DB queries (to be created)


GAME MECHANICS SUMMARY
----------------------
- 4 rounds (adjustable), each representing ~3 months
- Turn structure: Setup → Action Submission → Facilitator Resolution → Results
- Companies accumulate R&D and Safety points
- R&D multiplier compounds: 3.0 + (Total R&D × 0.000002)
- Alignment Gap = Total R&D - Total Safety
- Risk levels: OK → ELEVATED → HIGH → CRITICAL


CORE CALCULATIONS
-----------------
New R&D Points = (Compute Allocated × % to R&D) × Current R&D Multiplier
New Safety Points = (Compute Allocated × % to Safety) × 1.0
Total R&D accumulates (never resets)
Total Safety accumulates (never resets)
Multiplier increases with total R&D investment


DATA MODEL OVERVIEW
-------------------
Games → Rounds → Actions + Results
Actors (CEOs, Governments, etc.)
Company Data (stored as JSONB on actors)
Round Results (compute allocations, company calculations, narrative)


VERSION 1 (MVP) SCOPE
---------------------
Phase 1: Core visualization and admin tools
- Simple compute graph visualization (Tremor charts)
- Admin interface to update compute allocations
- Local storage for state management
- Basic round progression

Future Phases:
- Database integration (Neon Postgres)
- Player action submission forms
- Real-time updates
- Full facilitator control panel


GETTING STARTED
---------------
1. Review /docs/specs.md for full technical specification
2. Review /docs/player_sheets.md to understand game roles
3. Check CLAUDE.md for development guidelines
4. Follow setup instructions in docs/specs.md


TARGET TIMELINE
---------------
Initial MVP: 2 weeks for Sydney Dialogue
- Week 1: Core engine + facilitator tools
- Week 2: Player views + polish


CONTACT & ATTRIBUTION
---------------------
Developed by Good Ancestors for the Australian AI safety community.

This project is inspired by and built upon the AI 2027 scenario and tabletop
exercise, created by AI Futures (https://ai-2027.com). The scenario and research
were developed through running this exercise with experts in AI, geopolitics,
and national security. This implementation is built with the support and
permission of AI Futures.


NOTES
-----
This is a serious tool for exploring AI risk scenarios. The game mechanics
are designed to illustrate the dynamics of the AGI race, including:
- Compounding advantages of R&D investment
- Difficult tradeoffs between speed and safety
- Coordination challenges among multiple actors
- Information asymmetries and private alignment states

The exercise is not meant to be "won" - it's a vehicle for understanding
plausible futures and the decisions that shape them.
