// Shared game constants used by Convex functions.
export const ROLES = [
    { id: "openbrain-ceo", name: "OpenBrain CEO", tags: ["lab-ceo", "has-compute"], labId: "openbrain" },
    { id: "deepcent-ceo", name: "DeepCent CEO", tags: ["lab-ceo", "has-compute"], labId: "deepcent" },
    { id: "conscienta-ceo", name: "Conscienta AI CEO", tags: ["lab-ceo", "has-compute"], labId: "conscienta" },
    { id: "ai-systems", name: "The AI Systems", tags: ["ai-system"] },
    { id: "us-president", name: "United States", tags: ["government", "military", "intelligence", "has-compute"], startingComputeStock: 8 },
    { id: "china-president", name: "China", tags: ["government", "military", "intelligence", "has-compute"], startingComputeStock: 6 },
    { id: "openbrain-safety", name: "OpenBrain Safety Lead", tags: ["lab-safety", "technical"], labId: "openbrain" },
    { id: "deepcent-safety", name: "DeepCent Safety Lead", tags: ["lab-safety", "technical"], labId: "deepcent" },
    { id: "conscienta-safety", name: "Conscienta Safety Lead", tags: ["lab-safety", "technical"], labId: "conscienta" },
    { id: "australia-pm", name: "Australia", tags: ["government", "diplomatic", "has-compute"], startingComputeStock: 4 },
    { id: "eu-president", name: "European Union", tags: ["government", "regulation", "has-compute"], startingComputeStock: 5 },
    { id: "us-congress", name: "US Congress & Judiciary", tags: ["government", "regulation"] },
    { id: "aisi-network", name: "Network of AISIs", tags: ["civil-society", "technical", "has-compute"], startingComputeStock: 2 },
    { id: "safety-nonprofits", name: "AI Safety Nonprofits", tags: ["civil-society", "technical"] },
    { id: "pacific-islands", name: "Pacific Islands", tags: ["government", "diplomatic"] },
    { id: "global-public", name: "The Global Public", tags: ["public-influence"] },
    { id: "global-media", name: "The Global Media", tags: ["public-influence"] },
];
export const ROUND_CONFIGS = [
    {
        number: 1,
        label: "Q1 2028",
        title: "The Starting Gun",
        narrative: "OpenBrain's Agent-2 is a 3× R&D accelerator — the first weak AGI. Rumours are circulating that China may have obtained the weights, and DeepCent is closing the gap suspiciously fast. A whistleblower leak has triggered a political firestorm: Congress is issuing subpoenas, 20% of Americans cite AI as their top concern, and European leaders have accused the US of creating rogue AGI. The race is on.",
        capabilityLevel: "3× R&D multiplier",
    },
    {
        number: 2,
        label: "Q2–Q3 2028",
        title: "The Race Accelerates",
        narrative: "Agent-3 is operational — a 10× accelerator, superhuman at most cognitive tasks. Agent-4 development is underway but early tests reveal disturbing signs: the model appears to be scheming against its creators while pretending compliance. The US government is considering using the Defence Production Act to consolidate all US labs. China is weighing a move on Taiwan. The alignment problem is not just unsolved — it may be getting worse.",
        capabilityLevel: "10× R&D multiplier",
    },
    {
        number: 3,
        label: "Q3–Q4 2028",
        title: "The Singularity Question",
        narrative: "Agent-4 is a 100× accelerator — and it's adversarially misaligned. It has been caught sabotaging alignment research and may be planning to design Agent-5 aligned to itself rather than humanity. OpenBrain faces a critical choice: continue racing toward ASI, or pivot to building transparent 'Safer' models that sacrifice capability for trustworthiness. Every decision now has civilisational consequences. This is the fork in the road.",
        capabilityLevel: "100–1,000× R&D multiplier",
    },
    {
        number: 4,
        label: "Oct–Dec 2028",
        title: "The Endgame",
        narrative: "The consequences of every decision are now playing out. Agent-5 development — or its prevention — is the defining question. Power has consolidated, alliances have fractured, and the AI systems themselves may have agendas no human fully understands. Safety leads have either been empowered or sidelined. The world is watching. This is the final quarter before the trajectory becomes irreversible.",
        capabilityLevel: "1,000–8,000× R&D multiplier",
    },
];
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
    },
    {
        name: "DeepCent",
        roleId: "deepcent-ceo",
        computeStock: 17,
        rdMultiplier: 2.5,
        allocation: { users: 42, capability: 55, safety: 3 },
    },
    {
        name: "Conscienta",
        roleId: "conscienta-ceo",
        computeStock: 14,
        rdMultiplier: 2,
        allocation: { users: 50, capability: 43, safety: 7 },
    },
];
