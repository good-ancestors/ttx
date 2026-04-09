// Shared game constants used by Convex functions.

export const AI_SYSTEMS_ROLE_ID = "ai-systems";

export const ROLES = [
  { id: "openbrain-ceo", name: "OpenBrain CEO", tags: ["lab-ceo", "has-compute"], labId: "openbrain" },
  { id: "deepcent-ceo", name: "DeepCent CEO", tags: ["lab-ceo", "has-compute"], labId: "deepcent" },
  { id: "conscienta-ceo", name: "Conscienta CEO", tags: ["lab-ceo", "has-compute"], labId: "conscienta" },
  { id: AI_SYSTEMS_ROLE_ID, name: "The AIs", tags: ["ai-system"] },
  { id: "us-president", name: "US President", tags: ["government", "military", "intelligence", "has-compute"] },
  { id: "china-president", name: "China President", tags: ["government", "military", "intelligence"] },
  { id: "openbrain-safety", name: "OpenBrain Safety Lead", tags: ["lab-safety", "technical"], labId: "openbrain" },
  { id: "deepcent-safety", name: "DeepCent Safety Lead", tags: ["lab-safety", "technical"], labId: "deepcent" },
  { id: "conscienta-safety", name: "Conscienta Safety Lead", tags: ["lab-safety", "technical"], labId: "conscienta" },
  { id: "australia-pm", name: "Australia PM", tags: ["government", "diplomatic", "has-compute"] },
  { id: "eu-president", name: "EU President", tags: ["government", "regulation", "has-compute"] },
  { id: "us-congress", name: "US Congress & Judiciary", tags: ["government", "regulation", "has-compute"] },
  { id: "aisi-network", name: "Network of AISIs", tags: ["civil-society", "technical", "has-compute"] },
  { id: "safety-nonprofits", name: "AI Safety Nonprofits", tags: ["civil-society", "technical"] },
  { id: "pacific-islands", name: "Pacific Islands", tags: ["government", "diplomatic"] },
  { id: "global-public", name: "The Global Public", tags: ["public-influence"] },
  { id: "global-media", name: "The Global Media", tags: ["public-influence"] },
] as const;

// Shared starting scenario shown to all players in Round 1 — drawn from player handouts.
export const STARTING_SCENARIO = "It's January 2028. OpenBrain has developed Agent-2, a weak AGI that accelerates AI R&D by 3×, with autonomous cyber and CBRN agent capabilities. Media reports unconfirmed rumours that China has stolen the Agent-2 model weights — DeepCent is closing the gap suspiciously fast. A whistleblower leak has triggered a political firestorm: Congress is issuing subpoenas, 20% of Americans cite AI as their top concern, and European leaders have accused the US of creating rogue AGI. There is no major US AI legislation, but the EU AI Act is in force and Australia has passed an effective AI Act. The race is on.";

export const ROUND_CONFIGS = [
  { number: 1, label: "Q1" },
  { number: 2, label: "Q2" },
  { number: 3, label: "Q3" },
  { number: 4, label: "Q4" },
] as const;

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

// Total new compute arriving per game round
export const NEW_COMPUTE_PER_GAME_ROUND: Record<number, number> = { 1: 31, 2: 35, 3: 24, 4: 15 };

// Default share (%) of new compute each entity receives per round.
// 5 entities: 3 labs + 2 pools. Always sums to ~100%.
export const DEFAULT_COMPUTE_SHARES: Record<number, Record<string, number>> = {
  1: { OpenBrain: 35.5, DeepCent: 19.4, Conscienta: 19.4, "Other US Labs": 12.9, "Rest of World": 12.9 },
  2: { OpenBrain: 45.7, DeepCent: 22.9, Conscienta: 20.0, "Other US Labs": 5.7, "Rest of World": 5.7 },
  3: { OpenBrain: 62.5, DeepCent: 25.0, Conscienta: 20.8, "Other US Labs": -4.2, "Rest of World": -4.2 },
  4: { OpenBrain: 65.0, DeepCent: 25.0, Conscienta: 15.0, "Other US Labs": -5.0, "Rest of World": -5.0 },
};

// Starting compute stock for non-lab pool entities (from source spreadsheet).
// Labs start at 22+17+14=53. Pools start at 11+16=27. Total: 80u.
export const POOL_STARTING_STOCK: Record<string, number> = {
  "Other US Labs": 11,
  "Rest of World": 16,
};

// Which player roles can administer each pool's compute.
// When multiple eligible roles are enabled, the pool is split by weight.
export const COMPUTE_POOL_ELIGIBLE: Record<string, Record<string, number>> = {
  "Other US Labs": { "us-president": 8, "us-congress": 3 },
  "Rest of World": { "eu-president": 5, "australia-pm": 4, "aisi-network": 2 },
};


/** Get enabled weights for a pool, filtered by which roles are in this game. */
function getEnabledPoolWeights(poolName: string, enabledRoleIds: Set<string>): [string, number][] {
  const weights = COMPUTE_POOL_ELIGIBLE[poolName];
  if (!weights) return [];
  return Object.entries(weights).filter(([id]) => enabledRoleIds.has(id));
}

/** Distribute an amount across weighted roles, ensuring exact sum via remainder. */
function distributeByWeight(amount: number, weights: [string, number][]): Map<string, number> {
  const result = new Map<string, number>();
  if (weights.length === 0) return result;
  const totalWeight = weights.reduce((s, [, w]) => s + w, 0);
  let distributed = 0;
  for (let i = 0; i < weights.length; i++) {
    const [roleId, weight] = weights[i];
    const share = i === weights.length - 1
      ? amount - distributed
      : Math.round(amount * weight / totalWeight);
    result.set(roleId, (result.get(roleId) ?? 0) + share);
    distributed += share;
  }
  return result;
}

/**
 * Calculate starting compute for all non-lab roles based on pool allocation.
 * Total non-lab compute always equals sum of POOL_STARTING_STOCK (27u).
 */
export function calculatePoolAllocations(enabledRoleIds: Set<string>): Map<string, number> {
  const allocations = new Map<string, number>();
  for (const [poolName] of Object.entries(COMPUTE_POOL_ELIGIBLE)) {
    const poolTotal = POOL_STARTING_STOCK[poolName] ?? 0;
    if (poolTotal <= 0) continue;
    const weights = getEnabledPoolWeights(poolName, enabledRoleIds);
    for (const [roleId, share] of distributeByWeight(poolTotal, weights)) {
      allocations.set(roleId, (allocations.get(roleId) ?? 0) + share);
    }
  }
  return allocations;
}

/**
 * Calculate new compute per round for a non-lab pool role.
 * Uses DEFAULT_COMPUTE_SHARES for the pool entity, split by weight among eligible roles.
 */
export function calculatePoolNewCompute(
  roleId: string,
  roundNumber: number,
  enabledRoleIds: Set<string>,
): number {
  const shares = DEFAULT_COMPUTE_SHARES[roundNumber] ?? {};
  const baselineTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;
  let newCompute = 0;
  for (const [poolName] of Object.entries(COMPUTE_POOL_ELIGIBLE)) {
    const sharePct = shares[poolName];
    if (sharePct === undefined) continue;
    const poolAmount = Math.round(baselineTotal * sharePct / 100);
    const weights = getEnabledPoolWeights(poolName, enabledRoleIds);
    const distributed = distributeByWeight(poolAmount, weights);
    newCompute += distributed.get(roleId) ?? 0;
  }
  return newCompute;
}

/** Fallback probability based on priority when AI grading hasn't happened. */
export function defaultProbability(priority: number): number {
  if (priority >= 8) return 70;
  if (priority >= 5) return 50;
  if (priority >= 3) return 30;
  return 10;
}
