# AI Prompts — Review Guide

> **Status:** Needs CEO review before launch
>
> All AI-generated text in the game flows through prompts defined in code. Before launch, a non-technical stakeholder should review the scenario framing, tone, and role descriptions to ensure they match the intended experience. This document explains where prompts live and how to produce a reviewable version.

## Why this matters

The AI prompts define:
- How the scenario world is described to the model (geopolitics, lab dynamics, timeline)
- How player actions are evaluated (grading criteria, probability assignments)
- How round narratives are written (tone, structure, what gets emphasized)
- How AI/NPC-controlled roles behave (personality, decision-making style)
- How the facilitator copilot responds to adjustment requests

If the scenario framing is wrong or the tone is off, the entire game experience suffers — and these are things a CEO/scenario designer can catch that engineers might miss.

## Where prompts live

| File | What it contains |
|------|-----------------|
| `src/lib/ai-prompts.ts` | **Core prompt library.** Contains `SCENARIO_CONTEXT` (the master system prompt describing the game world, rules, roles, and mechanics — ~3,800 words) plus builder functions for grading and narrative prompts. This is the most important file to review. |
| `convex/aiGenerate.ts` | Prompt for AI/NPC-controlled tables generating their own actions each round. References role personality and game state. |
| `convex/aiProposals.ts` | Prompt for AI-controlled roles responding to endorsement/compute requests (accept/reject with reasoning). |
| `src/app/api/facilitator-adjust/route.ts` | Facilitator copilot prompt — the AI assistant that helps facilitators make mid-game adjustments. |
| `src/lib/game-data.ts` | Each of the 16 roles has an `artifactPrompt` — a one-line creative writing instruction (e.g., "Write OpenBrain's press release about your decisions this quarter."). |

## How to produce a review document

The prompts in code contain template variables (`${round}`, `${worldState}`, etc.) that make them hard to read raw. To create a CEO-readable version:

1. **For `SCENARIO_CONTEXT`:** This is mostly static prose — copy it directly from `ai-prompts.ts` and strip the JS string syntax. It reads like a scenario briefing document.

2. **For builder functions (`buildGradingPrompt`, `buildRoundNarrativePrompt`):** Run a real game through Round 1, then extract the fully-assembled prompts from the Convex logs (`npx convex logs --prod`). This shows exactly what the AI sees with real game data filled in.

3. **For role-specific prompts:** The `artifactPrompt` strings in `game-data.ts` and the role descriptions (`brief`, `personality`, `subtitle`) are already plain English — extract them into a table.

## What to review

- **Scenario accuracy:** Does the world description match the intended 2027-2028 timeline? Are lab names, government roles, and power dynamics correct?
- **Tone:** Is the narrative voice appropriate for the audience (Small Giants Forum, business leaders)?
- **Role balance:** Do role descriptions give each player meaningful agency? Are any roles too powerful or too passive?
- **Grading fairness:** Are the probability criteria reasonable? Do they reward creative play?
- **Artifact prompts:** Do the one-line creative prompts produce the right kind of output for each role?

## Architecture notes

- All game-logic LLM calls share `SCENARIO_CONTEXT` as their system prompt (cached for cost efficiency)
- Player-submitted text is sanitized via `escapeAction()` before embedding in prompts (injection prevention)
- All LLM outputs use structured schemas (JSON via tool_use) — the AI cannot produce arbitrary freeform text for game mechanics
- Fallback chains ensure the game continues even if the AI fails (factual summaries replace narrative, default probabilities replace grading)
