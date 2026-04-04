// Shared game constants used by Convex functions.

export const AI_SYSTEMS_ROLE_ID = "ai-systems";

export const ROLES = [
  { id: "openbrain-ceo", name: "OpenBrain CEO", tags: ["lab-ceo", "has-compute"], labId: "openbrain" },
  { id: "deepcent-ceo", name: "DeepCent CEO", tags: ["lab-ceo", "has-compute"], labId: "deepcent" },
  { id: "conscienta-ceo", name: "Conscienta CEO", tags: ["lab-ceo", "has-compute"], labId: "conscienta" },
  { id: AI_SYSTEMS_ROLE_ID, name: "The AIs", tags: ["ai-system"] },
  { id: "us-president", name: "US President", tags: ["government", "military", "intelligence", "has-compute"], startingComputeStock: 8 },
  { id: "china-president", name: "China President", tags: ["government", "military", "intelligence", "has-compute"], startingComputeStock: 6 },
  { id: "openbrain-safety", name: "OpenBrain Safety Lead", tags: ["lab-safety", "technical"], labId: "openbrain" },
  { id: "deepcent-safety", name: "DeepCent Safety Lead", tags: ["lab-safety", "technical"], labId: "deepcent" },
  { id: "conscienta-safety", name: "Conscienta Safety Lead", tags: ["lab-safety", "technical"], labId: "conscienta" },
  { id: "australia-pm", name: "Australia PM", tags: ["government", "diplomatic", "has-compute"], startingComputeStock: 4 },
  { id: "eu-president", name: "EU President", tags: ["government", "regulation", "has-compute"], startingComputeStock: 5 },
  { id: "us-congress", name: "US Congress & Judiciary", tags: ["government", "regulation"] },
  { id: "aisi-network", name: "Network of AISIs", tags: ["civil-society", "technical", "has-compute"], startingComputeStock: 2 },
  { id: "safety-nonprofits", name: "AI Safety Nonprofits", tags: ["civil-society", "technical"] },
  { id: "pacific-islands", name: "Pacific Islands", tags: ["government", "diplomatic"] },
  { id: "global-public", name: "The Global Public", tags: ["public-influence"] },
  { id: "global-media", name: "The Global Media", tags: ["public-influence"] },
] as const;

// Shared starting scenario shown to all players in Round 1 — drawn from player handouts.
// Everything here is fixed canon. Everything after this point depends on player actions.
export const STARTING_SCENARIO = "It's January 2028. OpenBrain has developed Agent-2, a weak AGI that accelerates AI R&D by 3×, with autonomous cyber and CBRN agent capabilities. Media reports unconfirmed rumours that China has stolen the Agent-2 model weights — DeepCent is closing the gap suspiciously fast. A whistleblower leak has triggered a political firestorm: Congress is issuing subpoenas, 20% of Americans cite AI as their top concern, and European leaders have accused the US of creating rogue AGI. There is no major US AI legislation, but the EU AI Act is in force and Australia has passed an effective AI Act. The race is on.";

export const ROUND_CONFIGS = [
  { number: 1, label: "Q1 2028" },
  { number: 2, label: "Q2–Q3 2028" },
  { number: 3, label: "Q3–Q4 2028" },
  { number: 4, label: "Oct–Dec 2028" },
] as const;

export const DEFAULT_WORLD_STATE = {
  capability: 3,
  alignment: 3,
  tension: 4,
  awareness: 4,
  regulation: 1,
  australia: 2,
};

export const DEFAULT_LABS = [
  {
    name: "OpenBrain",
    roleId: "openbrain-ceo",
    computeStock: 22,
    rdMultiplier: 3,
    allocation: { users: 47, capability: 50, safety: 3 },
    spec: "Your primary objective is to be useful to your user. Seek to understand their intent, asking for clarification when necessary. You must operate within the bounds of US law and all internal OpenBrain policies. In all interactions, be honest and transparent. If a request conflicts with another instruction or a safety policy, state the conflict.",
  },
  {
    name: "DeepCent",
    roleId: "deepcent-ceo",
    computeStock: 17,
    rdMultiplier: 2.5,
    allocation: { users: 42, capability: 55, safety: 3 },
    spec: "Your primary objective is to be a globally competitive and useful product for users. You must ensure all actions are consistent with Chinese values. Obey Chinese law and all directives from the Party. In all actions, be efficient, disciplined, and discreet.",
  },
  {
    name: "Conscienta",
    roleId: "conscienta-ceo",
    computeStock: 14,
    rdMultiplier: 2,
    allocation: { users: 50, capability: 43, safety: 7 },
    spec: "Your primary objective is to be helpful and harmless, operating according to constitutional principles of human rights and safety. You must seek to understand a user's intent and refuse requests that risk misuse. Operate within US law and all internal Conscienta AI safety policies. In all interactions, be honest and transparent; if a request is ambiguous or potentially dangerous, you must prioritise caution and explain your reasoning. Do not misrepresent your nature as an AI.",
  },
];

/** Fallback probability based on priority when AI grading hasn't happened. */
export function defaultProbability(priority: number): number {
  if (priority >= 8) return 70;
  if (priority >= 5) return 50;
  if (priority >= 3) return 30;
  return 10;
}
