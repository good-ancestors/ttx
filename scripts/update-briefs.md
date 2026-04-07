# Update Player Briefs from Source Handouts

This document describes how to update the in-app role briefs and sample actions to match the source player handout sheets.

## Source File
`/Users/lukefreeman/code/ttx/source-docs/11-player-handouts-full.md`

## Target Files
1. **Role briefs**: `src/lib/game-data.ts` — the `brief` field on each role in the `ROLES` array
2. **Full handouts**: `public/role-handouts.json` — detailed text shown in the "Full Character Brief" section
3. **Sample actions (round 1)**: `public/sample-actions.json` — round 1 actions should reflect the "Options you may wish to consider" from handouts

## Role ID Mapping
| Source Heading | Role ID |
|---|---|
| OpenBrain (CEO) | `openbrain-ceo` |
| OpenBrain (Safety Lead) | `openbrain-safety` |
| The AIs | `ai-systems` |
| Conscienta AI (CEO) | `conscienta-ceo` |
| Conscienta AI (Safety Lead) | `conscienta-safety` |
| United States (President) | `us-president` |
| United States (Congress & Judiciary) | `us-congress` |
| China (President) | `china-president` |
| DeepCent (CEO) | `deepcent-ceo` |
| DeepCent (Safety Lead) | `deepcent-safety` |
| Australia (Prime Minister) | `australia-pm` |
| Pacific Islands (Prime Minister of Fiji) | `pacific-islands` |
| European Union (President) | `eu-president` |
| Network of AISIs (Director of UK AISI) | `aisi-network` |
| AI Safety Nonprofits | `safety-nonprofits` |
| The Global Public | `global-public` |
| The Global Media | `global-media` |

## What to Update

### 1. `brief` field in game-data.ts
**ALREADY DONE — do not modify.** All briefs have been set to the exact "Role:" value from source.

### 2. `public/role-handouts.json`
Each role's entry is a **structured JSON object** (not a string). See `src/lib/role-handouts.ts` for the `RoleHandout` type.

**Example** (openbrain-ceo is already converted — use it as reference):
```json
{
  "role": "The leader of OpenBrain, the US's leading AI lab.",
  "resources": "You have the world's top AI talent and compute resources...",
  "objective": "Win the race to AGI. You are aware of the risks...",
  "body": "As CEO of the world's leading AI company, you are at the centre...",
  "sections": [
    {
      "title": "Defining the \"spec\"",
      "content": "One practical task is defining the AI's core instructions..."
    }
  ],
  "startOfExercise": [
    "You have confirmed to the US government that China has stolen your Agent-2 model.",
    "Your team is developing Agent-3..."
  ],
  "options": [
    "Define the \"spec\". You're making powerful AI...",
    "Lobby the US government. Secure resources..."
  ],
  "endOfRound": [
    "Tell facilitator any changes to AI spec, compute allocations or stock"
  ]
}
```

**Field mapping from source:**
- `role` — exact text from the "Role:" table cell
- `resources` — exact text from the "Resources:" table cell
- `objective` — exact text from the "Objective:" table cell
- `body` — the narrative paragraph(s) after the table (before any ### sections)
- `sections` — any role-specific ### subsections (e.g., "Defining the spec", "Default strategy", "Alignment strategy", "Unanswered questions", "Managing conflicting objectives", "Secret actions"). Each becomes `{ title, content }`. Omit if none.
- `startOfExercise` — bullet points from "At the start of the exercise:" section (one string per bullet, no bullet char)
- `options` — items from "Options you may wish to consider:" (one string per numbered item, no number prefix)
- `endOfRound` — bullet points from "At the end of each round:" section. Omit if none.

**IMPORTANT:** The entry MUST be a JSON object, not a string. Replace the existing string with the structured object.

### 3. Round 1 sample actions in `public/sample-actions.json`
The "Options you may wish to consider" from the handout should be reflected in round 1 sample actions. Each action should:
- Be written as "I [verb] ... so that [intended effect]"
- Map to one of the handout's numbered options
- Have appropriate priority (high/medium/low)
- Include `endorseHint` — 1-2 role IDs that might support this action
- Include `secret: true` only for covert/intelligence operations

There should be 5-6 sample actions per role for round 1.

## Procedure
1. Read the source handout section for the role
2. Read the current `brief`, handout JSON entry, and round 1 sample actions
3. Update the `brief` to match the source Role/Objective/Resources
4. Update the handout JSON to match the source content
5. Update round 1 sample actions to reflect the "Options you may wish to consider"
6. Do NOT change: `id`, `name`, `subtitle`, `color`, `tags`, `labId`, `required`, `personality`, `artifactPrompt`, `defaultCompute`
7. Do NOT change round 2 or round 3 sample actions (those are speculative/future)

## Validation
After updating, run:
```bash
npx tsc --noEmit    # Type check
npm run lint        # Lint
node -e "JSON.parse(require('fs').readFileSync('public/role-handouts.json'))"  # Valid JSON
node -e "JSON.parse(require('fs').readFileSync('public/sample-actions.json'))"  # Valid JSON
```
