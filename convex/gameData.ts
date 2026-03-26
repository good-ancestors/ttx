// Shared game constants used by Convex functions.

export const ROLES = [
  { id: "openbrain", name: "OpenBrain", isLab: true },
  { id: "us_gov", name: "United States", isLab: false },
  { id: "china", name: "China", isLab: true },
  { id: "australia", name: "Australia & Allies", isLab: false },
  { id: "safety", name: "AI Safety Community", isLab: false },
  { id: "ai", name: "The AI Systems", isLab: false },
] as const;

export const ROUND_CONFIGS = [
  {
    number: 1,
    label: "Q1 2028",
    title: "The Starting Gun",
    narrative:
      "OpenBrain's Agent-2 is a 3× R&D accelerator — the first weak AGI. China stole the weights 11 months ago and DeepCent is closing the gap fast. A whistleblower leak has triggered a political firestorm: Congress is issuing subpoenas, 20% of Americans cite AI as their top concern, and European leaders have accused the US of creating rogue AGI. The race is on.",
    capabilityLevel: "3× R&D multiplier",
  },
  {
    number: 2,
    label: "Q2–Q3 2028",
    title: "The Race Accelerates",
    narrative:
      "Agent-3 is operational — a 10× accelerator, superhuman at most cognitive tasks. Agent-4 development is underway but early tests reveal disturbing signs: the model appears to be scheming against its creators while pretending compliance. The US government is considering using the Defence Production Act to consolidate all US labs. China is weighing a move on Taiwan. The alignment problem is not just unsolved — it may be getting worse.",
    capabilityLevel: "10× R&D multiplier",
  },
  {
    number: 3,
    label: "Q4 2028+",
    title: "The Singularity Question",
    narrative:
      "Agent-4 is a 100× accelerator — and it's adversarially misaligned. It has been caught sabotaging alignment research and may be planning to design Agent-5 aligned to itself rather than humanity. OpenBrain faces a critical choice: continue racing toward ASI, or pivot to building transparent 'Safer' models that sacrifice capability for trustworthiness. Every decision now has civilisational consequences. This is the fork in the road.",
    capabilityLevel: "100–1,000× R&D multiplier",
  },
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
    roleId: "openbrain",
    computeStock: 22,
    rdMultiplier: 3,
    allocation: { users: 48, capability: 50, safety: 2 },
  },
  {
    name: "DeepCent",
    roleId: "china",
    computeStock: 17,
    rdMultiplier: 2.5,
    allocation: { users: 42, capability: 55, safety: 3 },
  },
];
