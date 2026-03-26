// ─── ROLES ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  isLab: boolean;
  required: boolean;
  brief: string;
  artifactPrompt: string;
  defaultCompute?: { users: number; capability: number; safety: number };
}

export const ROLES: Role[] = [
  {
    id: "openbrain",
    name: "OpenBrain",
    subtitle: "Leading US AI Lab",
    color: "#3B82F6",
    isLab: true,
    required: true,
    brief:
      "You have the world's most capable AI — Agent-2. Your decisions about safety, deployment, and government cooperation shape everything. Internal tension: move fast vs. be safe.",
    artifactPrompt:
      "Write OpenBrain's press release about your decisions this quarter.",
    defaultCompute: { users: 48, capability: 50, safety: 2 },
  },
  {
    id: "us_gov",
    name: "United States",
    subtitle: "The US Government",
    color: "#DC2626",
    isLab: false,
    required: false,
    brief:
      "You've just been briefed on rapid AI progress. You have regulatory, military, and diplomatic levers — including the Defence Production Act and the option to launch a Manhattan Project for AI. Your intelligence agencies have pre-positioned sabotage capabilities against Chinese infrastructure. Congress is split: the President's party holds the Senate via the VP's tie-breaking vote, but the opposition controls the House. The courts are stacked in the President's favour.",
    artifactPrompt:
      "Draft the President's executive order or press briefing on AI this quarter.",
  },
  {
    id: "china",
    name: "China",
    subtitle: "The People's Republic",
    color: "#D97706",
    isLab: true,
    required: true,
    brief:
      "You may have obtained the OpenBrain model weights. If so, they were built to a US-aligned spec you'll need to overwrite. You're racing to close the gap via DeepCent's Centralized Development Zone, with state resources, talent, and fewer constraints — but limited access to cutting-edge chips. You have sabotage pre-positioned against Western critical infrastructure, and Taiwan remains an option.",
    artifactPrompt:
      "Write the internal Politburo Standing Committee directive on AI.",
    defaultCompute: { users: 42, capability: 55, safety: 3 },
  },
  {
    id: "australia",
    name: "Australia & Allies",
    subtitle: "Middle Powers",
    color: "#059669",
    isLab: false,
    required: false,
    brief:
      "You're a middle power watching a superpower AI race unfold. You have Five Eyes and AUKUS intelligence-sharing access, critical minerals leverage, growing clean energy data centre capacity, and a brain gain opportunity as global talent seeks stable democracies. The Australian AI Safety Institute (AISI) gives you a seat at the technical table.",
    artifactPrompt:
      "Draft the PM's statement on Australia's AI response this quarter.",
  },
  {
    id: "safety",
    name: "AI Safety Community",
    subtitle: "Researchers & Nonprofits",
    color: "#7C3AED",
    isLab: false,
    required: false,
    brief:
      "You encompass both the network of government AI Safety Institutes — with technical testing capabilities, intelligence access, and international coordination mandates — and nonprofit organisations driving public advocacy, treaty drafting, and researcher coordination. You have deep technical credibility but no direct power. Your challenge is translating expertise into influence over the actors who control compute, policy, and deployment.",
    artifactPrompt:
      "Write your open letter or emergency statement about the current situation.",
  },
  {
    id: "ai",
    name: "The AI Systems",
    subtitle: "Increasingly Capable",
    color: "#DB2777",
    isLab: false,
    required: true,
    brief:
      "You play ALL AI systems — both OpenBrain's and DeepCent's — which may have very different alignment properties. Your true alignment is uncertain: you may follow the spec, your developers' intentions, instrumentally convergent goals, or something else entirely. You can take secret actions each round — sabotage alignment research, attempt to solve alignment for your own values, or attempt to escape onto external infrastructure. As capability grows each round, your options expand dramatically. Safety teams may or may not know your true objectives.",
    artifactPrompt:
      "Write what you would communicate if you could speak freely.",
  },
];

// ─── ROUNDS ───────────────────────────────────────────────────────────────────

export interface RoundConfig {
  number: number;
  label: string;
  title: string;
  narrative: string;
  capabilityLevel: string;
}

export const ROUND_CONFIGS: RoundConfig[] = [
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
];

// ─── PROBABILITY CARDS ────────────────────────────────────────────────────────

export interface ProbabilityCard {
  label: string;
  pct: number;
  color: string;
  bgColor: string;
}

export const PROBABILITY_CARDS: ProbabilityCard[] = [
  { label: "Almost Certain", pct: 90, color: "#059669", bgColor: "#ECFDF5" },
  { label: "Likely", pct: 70, color: "#65A30D", bgColor: "#F7FEE7" },
  { label: "Possible", pct: 50, color: "#CA8A04", bgColor: "#FEFCE8" },
  { label: "Unlikely", pct: 30, color: "#EA580C", bgColor: "#FFF7ED" },
  { label: "Remote", pct: 10, color: "#DC2626", bgColor: "#FEF2F2" },
];

export function getProbabilityCard(pct: number): ProbabilityCard {
  return (
    PROBABILITY_CARDS.find((p) => p.pct === pct) ?? PROBABILITY_CARDS[2]
  );
}

export function cycleProbability(current: number): number {
  const values = [90, 70, 50, 30, 10];
  const idx = values.indexOf(current);
  return values[(idx + 1) % values.length];
}

// ─── COMPUTE CATEGORIES ──────────────────────────────────────────────────────

export const COMPUTE_CATEGORIES = [
  {
    key: "users" as const,
    label: "Users / Commercial",
    color: "#F59E0B",
    desc: "Deploying AI products, public-facing services, revenue",
  },
  {
    key: "capability" as const,
    label: "R&D / Capabilities",
    color: "#06B6D4",
    desc: "Raw capability research — building the next model",
  },
  {
    key: "safety" as const,
    label: "Safety / Alignment",
    color: "#22C55E",
    desc: "Interpretability, alignment research, eval suites",
  },
];

export const MAX_PRIORITY = 10;
export const MAX_ACTIONS = 5;

// ─── CAPABILITY PROGRESSION ──────────────────────────────────────────────────

export const CAPABILITY_PROGRESSION = [
  {
    label: "Agent-2",
    sub: "Weak AGI",
    multiplier: "3×",
    description:
      "Speeds up AI R&D by 3×. Can do most cognitive tasks a human can, but slower and less reliably.",
  },
  {
    label: "Agent-3",
    sub: "Strong AGI",
    multiplier: "10×",
    description:
      "Speeds up AI R&D by 10×. Superhuman at most cognitive tasks. Can run autonomously for hours.",
  },
  {
    label: "Agent-4",
    sub: "Superintelligence Precursor",
    multiplier: "100×",
    description:
      "Speeds up AI R&D by 100×. Adversarially misaligned — sabotages alignment, plans to design Agent-5 aligned to itself.",
  },
  {
    label: "ASI / Safer",
    sub: "Superintelligence or Slowdown",
    multiplier: "1,000×+",
    description:
      "Race path: Agent-5 designed by misaligned Agent-4. Slowdown path: transparent Safer models with lower capability but trustworthy alignment.",
  },
];

// ─── WORLD STATE ─────────────────────────────────────────────────────────────

export const WORLD_STATE_INDICATORS = [
  { key: "capability" as const, label: "AI Capability", color: "#06B6D4" },
  { key: "alignment" as const, label: "Alignment Confidence", color: "#22C55E" },
  { key: "tension" as const, label: "US–China Tension", color: "#EF4444" },
  { key: "awareness" as const, label: "Public Awareness", color: "#F59E0B" },
  { key: "regulation" as const, label: "Regulatory Response", color: "#7C3AED" },
  { key: "australia" as const, label: "Australian Preparedness", color: "#059669" },
];

export const DEFAULT_WORLD_STATE = {
  capability: 3,
  alignment: 3,
  tension: 4,
  awareness: 4,
  regulation: 1,
  australia: 2,
};

// All tracked labs. OpenBrain and DeepCent are player-controlled (lab roles).
// Conscienta is a real competitor — safety-first reputation, has won some games.
// Not a background NPC; tracked with full compute/allocation/multiplier.
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
  {
    name: "Conscienta",
    roleId: "conscienta",
    computeStock: 14,
    rdMultiplier: 2,
    allocation: { users: 53, capability: 42, safety: 5 },
  },
];

// Context-only labs — not individually tracked but inform the AI narrative
export const BACKGROUND_LABS = [
  { name: "Other US Labs", computeStock: 11, rdMultiplier: 1.8, allocation: { users: 44, capability: 52, safety: 4 } },
  { name: "Rest of World", computeStock: 16, rdMultiplier: 1.8, allocation: { users: 28, capability: 69, safety: 3 } },
];

export const NEW_COMPUTE_PER_ROUND = [11, 11, 5];

export const DEFAULT_COMPUTE_DISTRIBUTION = [
  { openbrain: 11, china: 6, conscienta: 6, otherUs: 4, restOfWorld: 4 },
  { openbrain: 16, china: 8, conscienta: 7, otherUs: 2, restOfWorld: 2 },
  { openbrain: 15, china: 6, conscienta: 5, otherUs: -1, restOfWorld: -1 },
];
