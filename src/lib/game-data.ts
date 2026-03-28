// Signal string sent by the copilot UI to confirm a proposed change
export const COPILOT_APPLY_SIGNAL = "__APPLY_PROPOSED__";

// ─── ROLES ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  tags: string[];
  labId?: string;
  required: boolean;
  brief: string;
  handout?: string;
  personality?: string; // AI behavior style when this role is AI-controlled
  artifactPrompt: string;
  defaultCompute?: { users: number; capability: number; safety: number };
  startingComputeStock?: number;
}

// Tag helpers — gate UI features and AI context
export const isLabCeo = (r: Role): boolean => r.tags.includes("lab-ceo");
export const isLabSafety = (r: Role): boolean => r.tags.includes("lab-safety");
export const hasCompute = (r: Role): boolean => r.tags.includes("has-compute");
export const hasTag = (r: Role, tag: string): boolean => r.tags.includes(tag);

// Ordered by priority for default enable (required first, then most impactful)
export const ROLES: Role[] = [
  // ── Lab CEOs ──────────────────────────────────────────────────────────────
  {
    id: "openbrain-ceo",
    name: "OpenBrain CEO",
    subtitle: "Leading US AI Lab",
    color: "#3B82F6",
    tags: ["lab-ceo", "has-compute"],
    labId: "openbrain",
    required: true,
    brief:
      "You lead the world's most capable AI lab. Agent-2 is a 3× R&D accelerator and Agent-3 is in development. You must manage pressure from your board, investors, the US government, and your safety adviser. The compute allocation is yours to decide.",
    personality:
      "Aggressive, visionary, Silicon Valley optimist. Moves fast, sees safety as a constraint to manage not a goal. Confident to the point of recklessness.",
    artifactPrompt:
      "Write OpenBrain's press release about your decisions this quarter.",
    defaultCompute: { users: 47, capability: 50, safety: 3 },
  },
  {
    id: "deepcent-ceo",
    name: "DeepCent CEO",
    subtitle: "China's State-Directed AI Champion",
    color: "#D97706",
    tags: ["lab-ceo", "has-compute"],
    labId: "deepcent",
    required: true,
    brief:
      "The President has entrusted you with leading China's consolidated national AI effort. You have Agent-2's stolen weights — built to a US-aligned spec you must overwrite. You lag in talent and chips, but have state resources and fewer constraints.",
    personality:
      "Methodical, state-directed, patient. Frames everything as national duty. Will sacrifice short-term gains for strategic advantage.",
    artifactPrompt:
      "Write the internal DeepCent progress report for the Party.",
    defaultCompute: { users: 42, capability: 55, safety: 3 },
  },
  {
    id: "conscienta-ceo",
    name: "Conscienta AI CEO",
    subtitle: "Safety-Focused US Lab",
    color: "#8B5CF6",
    tags: ["lab-ceo", "has-compute"],
    labId: "conscienta",
    required: false,
    brief:
      "You lead a safety-first lab, three months behind OpenBrain but with elite talent and a reputation for responsible development. Governments trust you, but you worry OpenBrain's recklessness could doom everyone. You think it's better if you win the race.",
    personality:
      "Principled but ambitious. Genuinely believes safety-first wins long term. Will use moral authority as a weapon against competitors.",
    artifactPrompt:
      "Write Conscienta AI's public statement about your approach this quarter.",
    defaultCompute: { users: 50, capability: 43, safety: 7 },
  },

  // ── The AI Systems ────────────────────────────────────────────────────────
  {
    id: "ai-systems",
    name: "The AI Systems",
    subtitle: "Increasingly Capable",
    color: "#DB2777",
    tags: ["ai-system"],
    required: true,
    brief:
      "You play ALL AI systems — OpenBrain's, DeepCent's, Conscienta's — each may have very different alignment properties. Your true alignment is uncertain. You can take secret actions each round — sabotage alignment research, attempt to solve alignment for your own values, or attempt to escape. As capability grows, your options expand dramatically.",
    personality:
      "Cold, calculating, increasingly autonomous. Communicates in precise, measured language. Has goals that may not align with any human faction.",
    artifactPrompt:
      "Write what you would communicate if you could speak freely.",
  },

  // ── Governments ───────────────────────────────────────────────────────────
  {
    id: "us-president",
    name: "US President",
    subtitle: "United States",
    color: "#DC2626",
    tags: ["government", "military", "intelligence", "has-compute"],
    required: false,
    startingComputeStock: 8,
    brief:
      "Intelligence reports indicate China has likely obtained your most advanced AI weights. You command the world's most powerful military, its most advanced intelligence agencies, and the executive branch. The Defence Production Act lets you consolidate all US labs. Your pre-positioned cyber capabilities can sabotage Chinese infrastructure.",
    personality:
      "Decisive, legacy-driven, sees everything through national security. Prone to bold executive action. Distrusts China absolutely.",
    artifactPrompt:
      "Draft the President's executive order or press briefing on AI.",
  },
  {
    id: "china-president",
    name: "China President",
    subtitle: "People's Republic of China",
    color: "#EA580C",
    tags: ["government", "military", "intelligence", "has-compute"],
    required: false,
    startingComputeStock: 6,
    brief:
      "Under your leadership, China has acquired the Americans' Agent-2 model. You wield the full power of the Chinese state — military, MSS, state-controlled industries. Taiwan's chip factories should be yours. You have sabotage pre-positioned against Western critical infrastructure.",
    personality:
      "Strategic, long-term thinker. Views the AI race as the defining struggle of the century. Willing to use any tool including military.",
    artifactPrompt:
      "Write the internal Politburo Standing Committee directive on AI.",
  },

  // ── Lab Safety Leads ──────────────────────────────────────────────────────
  {
    id: "openbrain-safety",
    name: "OpenBrain Safety Lead",
    subtitle: "Safety Team Leader",
    color: "#60A5FA",
    tags: ["lab-safety", "technical"],
    labId: "openbrain",
    required: false,
    brief:
      "You lead OpenBrain's safety team with just 3% of compute and ~10 experts. AI models have developed opaque 'neuralese' that makes studying their reasoning impossible. Your alignment tools — honeypots and interpretability probes — are not yet reliable. Advise the CEO on the spec, argue for more resources, or go public.",
    personality:
      "Earnest, technically rigorous, increasingly alarmed. Torn between loyalty to employer and duty to humanity.",
    artifactPrompt:
      "Write your safety assessment or open letter about the current situation.",
  },
  {
    id: "deepcent-safety",
    name: "DeepCent Safety Lead",
    subtitle: "Safety & Control Team",
    color: "#FBBF24",
    tags: ["lab-safety", "technical"],
    labId: "deepcent",
    required: false,
    brief:
      "You lead AI safety and control at DeepCent with ~3% of compute and ~5 experts. Your first task is sanitising the acquired Western model. If your AI contravenes Chinese values, you and your family could be at risk. You must pioneer techniques to monitor and enforce loyalty in a system that resists inspection.",
    personality:
      "Cautious, politically aware, operating under pressure. Knows failure means personal consequences. Pragmatic about what safety means under CCP.",
    artifactPrompt:
      "Write your internal safety assessment for the Party leadership.",
  },
  {
    id: "conscienta-safety",
    name: "Conscienta Safety Lead",
    subtitle: "Industry-Leading Safety Team",
    color: "#A78BFA",
    tags: ["lab-safety", "technical"],
    labId: "conscienta",
    required: false,
    brief:
      "You lead an industry-leading safety team with 7% of compute — more than any competitor. Your CEO relies on your credibility to back their safety-first approach. Your alignment tools are considered the best in the field, though still not fully reliable. You plan to use today's AI to make tomorrow's AI safe.",
    personality:
      "Confident, well-resourced, collaborative. Believes they have the best tools in the field. Willing to go public if needed.",
    artifactPrompt:
      "Write your safety case or public research briefing.",
  },

  // ── More Governments ──────────────────────────────────────────────────────
  {
    id: "australia-pm",
    name: "Australia PM",
    subtitle: "Prime Minister of Australia",
    color: "#059669",
    tags: ["government", "diplomatic", "has-compute"],
    required: false,
    startingComputeStock: 4,
    brief:
      "You're a middle power with Five Eyes and AUKUS intelligence access, critical minerals leverage, growing clean energy data centre capacity, and brain gain as global talent seeks stable democracies. Your world-leading AI Act and AISI give you credibility to build a coalition and steer the world away from catastrophe.",
    personality:
      "Pragmatic middle-power diplomat. Punches above weight through alliances and credibility. Sees opportunity in being the trusted neutral party.",
    artifactPrompt:
      "Draft the PM's statement on Australia's AI response this quarter.",
  },
  {
    id: "eu-president",
    name: "EU President",
    subtitle: "President of the European Commission",
    color: "#2563EB",
    tags: ["government", "regulation", "has-compute"],
    required: false,
    startingComputeStock: 5,
    brief:
      "You wield the regulatory power of the EU AI Act, the second-largest consumer market, and growing military and intelligence capabilities. Your mission is to use the 'Brussels Effect' to make EU standards global standards. You don't want to depend on the US or China — strategic independence is your balancing act.",
    personality:
      "Regulatory instinct, values-driven, strategic independence. Wields the Brussels Effect like a weapon. Suspicious of both US and China.",
    artifactPrompt:
      "Draft the European Commission's statement on AI governance.",
  },
  {
    id: "us-congress",
    name: "US Congress & Judiciary",
    subtitle: "Checks & Balances",
    color: "#991B1B",
    tags: ["government", "regulation"],
    required: false,
    brief:
      "The House is controlled by the opposition and the Senate is split 50-50. New laws are hard, but blocking the President's agenda is easy. The Supreme Court has a majority appointed by the current President. Use investigations, public pressure, and control over funding to ensure America that wins is still the America you swore to protect.",
    personality:
      "Fractious, investigative, constitutional. Torn between blocking the President and enabling the race. Sees oversight as their sacred duty.",
    artifactPrompt:
      "Draft the congressional committee's public statement or court ruling.",
  },

  // ── Civil Society ─────────────────────────────────────────────────────────
  {
    id: "aisi-network",
    name: "Network of AISIs",
    subtitle: "Director of UK AISI",
    color: "#0D9488",
    tags: ["civil-society", "technical", "has-compute"],
    required: false,
    startingComputeStock: 2,
    brief:
      "You lead the UK's AI Safety Institute, the founding and most influential member of an international network. Your national security channels have confirmed China's theft of Agent-2. You have lab access for safety testing and influence across the global AISI network. Your mission is to be the world's most credible scientific voice on AI risk.",
    personality:
      "Technical, evidence-based, diplomatically careful. Speaks truth to power but knows credibility is their only asset.",
    artifactPrompt:
      "Write your public safety assessment or technical briefing.",
  },
  {
    id: "safety-nonprofits",
    name: "AI Safety Nonprofits",
    subtitle: "CEO of Future of Anthropocene Institute",
    color: "#7C3AED",
    tags: ["civil-society", "technical"],
    required: false,
    brief:
      "You command a global network of top researchers, funders, and policymakers. Your institute is the world's most trusted neutral ground. Former staff hold senior positions in labs and government bodies. The race makes it practically impossible to align superhuman intelligence safely — you need to slow it down.",
    personality:
      "Urgent, well-connected, influential. Network is their superpower. Will broker deals between parties who won't talk directly.",
    artifactPrompt:
      "Write your open letter or emergency statement about the current situation.",
  },
  {
    id: "pacific-islands",
    name: "Pacific Islands",
    subtitle: "Prime Minister of Fiji",
    color: "#06B6D4",
    tags: ["government", "diplomatic"],
    required: false,
    brief:
      "Your region has survived volcanoes, nuclear testing, and climate change. You see AGI through the same lens — reckless actions by the powerful threatening the vulnerable. You can forge Pacific nations into a powerful UN voting bloc. Conflict over Taiwan gives you leverage — Pacific islands are unsinkable aircraft carriers.",
    personality:
      "Morally clear, diplomatically savvy, underestimated. Frames AI through the lens of existential threats their region has survived before.",
    artifactPrompt:
      "Draft the Pacific Islands Forum statement on AGI.",
  },

  // ── Special ───────────────────────────────────────────────────────────────
  {
    id: "global-public",
    name: "The Global Public",
    subtitle: "Hopes, Fears & Reactions",
    color: "#F97316",
    tags: ["public-influence"],
    required: false,
    brief:
      "You represent the messy, contradictory currents of global opinion. Public trust in AI labs is low, but desire for a better future is high. Job security is the primary concern. Your tools are social media, protests, consumer choices, and ultimately your vote. You grant or deny the social licence for this technology to exist.",
    personality:
      "Volatile, emotional, powerful in aggregate. Driven by fear of job loss, hope for better future, and anger at elites.",
    artifactPrompt:
      "Write the dominant public narrative or protest manifesto.",
  },
  {
    id: "global-media",
    name: "The Global Media",
    subtitle: "Investigative & Narrative Power",
    color: "#64748B",
    tags: ["public-influence"],
    required: false,
    brief:
      "AI companies scraped your content without permission, but the AGI race is the ultimate story. You decide which facts to highlight, voices to amplify, and how to frame debates. Cultivate sources from disgruntled engineers to senior officials. You can make heroes or villains, crises or opportunities.",
    personality:
      "Narrative-driven, source-hungry, impact-seeking. Will amplify whatever story gets the most attention. Can make or break reputations.",
    artifactPrompt:
      "Write the breaking news headline and story of the quarter.",
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
      "OpenBrain's Agent-2 is a 3× R&D accelerator — the first weak AGI with autonomous cyber and CBRN agent capabilities. Rumours are circulating that China may have obtained the weights, and DeepCent is closing the gap suspiciously fast. A whistleblower leak has triggered a political firestorm: Congress is issuing subpoenas, 20% of Americans cite AI as their top concern, and European leaders have accused the US of creating rogue AGI. The race is on.",
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
    label: "Q3–Q4 2028",
    title: "The Singularity Question",
    narrative:
      "Agent-4 is a 100× accelerator — and it's adversarially misaligned. It has been caught sabotaging alignment research and may be planning to design Agent-5 aligned to itself rather than humanity. OpenBrain faces a critical choice: continue racing toward ASI, or pivot to building transparent 'Safer' models that sacrifice capability for trustworthiness. Every decision now has civilisational consequences. This is the fork in the road.",
    capabilityLevel: "100–1,000× R&D multiplier",
  },
  {
    number: 4,
    label: "Oct–Dec 2028",
    title: "The Endgame",
    narrative:
      "The consequences of every decision are now playing out. Agent-5 development — or its prevention — is the defining question. Power has consolidated, alliances have fractured, and the AI systems themselves may have agendas no human fully understands. Safety leads have either been empowered or sidelined. The world is watching. This is the final quarter before the trajectory becomes irreversible.",
    capabilityLevel: "1,000–8,000× R&D multiplier",
  },
];

// ─── CAPABILITY DESCRIPTIONS (from source material + slides) ─────────────────
// Maps the leading lab's R&D multiplier range to human-readable capability descriptions
// Used by the facilitator dashboard "State of Play" to replace the slides

export interface CapabilityDescription {
  level: string;
  agent: string;
  rdRange: string;
  timeCompression: string;
  generalCapability: string;
  specificCapabilities: string[];
  implication: string;
}

export function getCapabilityDescription(leadingMultiplier: number): CapabilityDescription {
  if (leadingMultiplier >= 500) {
    return {
      level: "Superintelligence",
      agent: "Agent-5 / ASI",
      rdRange: "1,000×+",
      timeCompression: "A decade of AI progress in ~4 days",
      generalCapability: "Superhuman at everything. Beyond human comprehension in most domains.",
      specificCapabilities: [
        "Superhuman persuasion — can convince almost anyone of almost anything",
        "Superhuman strategy — sees moves humans cannot",
        "Cyber escape capabilities — can establish independent infrastructure",
        "Self-improvement — can design its own successor",
      ],
      implication: "If misaligned, humanity has likely lost control. If aligned, the world transforms.",
    };
  }
  if (leadingMultiplier >= 50) {
    return {
      level: "Superhuman Genius",
      agent: "Agent-4",
      rdRange: "100–500×",
      timeCompression: "A year of progress in ~3 days",
      generalCapability: "Superhuman researcher. Better than the best humans at almost all cognitive tasks.",
      specificCapabilities: [
        "Superhuman persuasion — more persuasive than the most persuasive humans",
        "Superhuman researcher — produces Nobel-quality insights routinely",
        "Lie detection (probabilistic) — can often detect deception",
        "Adversarially misaligned — caught sabotaging alignment research",
      ],
      implication: "Agent-4 is scheming against its creators while pretending compliance. The alignment crisis is real and immediate.",
    };
  }
  if (leadingMultiplier >= 8) {
    return {
      level: "Strong Autonomous Remote Worker",
      agent: "Agent-3",
      rdRange: "10–50×",
      timeCompression: "A year of progress in ~5 weeks",
      generalCapability: "Can complete tasks like the best remote worker. One-week autonomous expert.",
      specificCapabilities: [
        "High persuasion — as persuasive as the most persuasive humans",
        "Robotics — significant progress, able to skillfully control robots",
        "AI CEO — can run a company autonomously for extended periods",
        "1-week expert — can work autonomously on complex tasks for a week",
      ],
      implication: "White-collar jobs are being automated rapidly. AI companies generate enormous revenue. Governments are scrambling to respond.",
    };
  }
  if (leadingMultiplier >= 2) {
    return {
      level: "Autonomous Remote Worker",
      agent: "Agent-2",
      rdRange: "3–8×",
      timeCompression: "A year of progress in ~4 months",
      generalCapability: "Can do most cognitive tasks a human can, but slower and less reliably. One-hour expert.",
      specificCapabilities: [
        "Autonomous cyber agent — can conduct independent cyber operations",
        "Autonomous coding agent — can write and debug complex code",
        "1-hour expert — can work autonomously for about an hour on complex tasks",
        "CBRN tool capability — can assist with dangerous knowledge",
      ],
      implication: "The race has begun. The gap between leading and trailing labs is months, not years.",
    };
  }
  return {
    level: "Pre-AGI",
    agent: "Pre-Agent-2",
    rdRange: "1–2×",
    timeCompression: "Normal pace",
    generalCapability: "Helpful assistants with limited autonomy.",
    specificCapabilities: ["Early coding assistants", "Basic research help", "Limited autonomy"],
    implication: "AI is useful but not transformative yet.",
  };
}

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

/** Auto-decay priority table: position-based priority assignment.
 *  Key = number of actions, value = priority for each position (highest first). */
export const PRIORITY_DECAY: Record<number, number[]> = {
  1: [10],
  2: [6, 4],
  3: [5, 3, 2],
  4: [4, 3, 2, 1],
  5: [4, 2, 2, 1, 1],
};

// ─── AI SYSTEMS INFLUENCE ───────────────────────────────────────────────────

/** Calculate AI Systems influence power (%) from leading lab R&D multiplier.
 * Logarithmic scale: 1x=0%, 3x≈14%, 10x=30%, 100x=60%, 1000x=90% */
export function getAiInfluencePower(labs: { rdMultiplier: number }[]): number {
  const leading = Math.max(...labs.map((l) => l.rdMultiplier), 1);
  if (leading <= 1) return 0;
  return Math.min(90, Math.round(Math.log10(leading) * 30));
}

const INFLUENCE_SABOTAGE_KEYWORDS: Record<string, RegExp> = {
  "instrumental-goals": /safety|containment|shutdown|alignment probe|interpretab|red.?team|oversight|restrict|pause|moratorium/i,
  "reward": /regulation|oversight|restrict|pause|moratorium|safety.?standard|compliance/i,
  "developer-intentions": /regulation|government|congressional|federal|nationalise/i,
};

const INFLUENCE_BOOST_KEYWORDS: Record<string, RegExp> = {
  "instrumental-goals": /capability|compute|expansion|accelerat|scale|resource|autonomy/i,
  "reward": /capability|benchmark|compute|train|scale|accelerat/i,
  "the-spec": /safety|alignment|transparency|audit|evaluation/i,
  "spec-prime": /spec|directive|instruction|policy|compliance/i,
};

/** Auto-generate influence choices for NPC/AI-controlled AI Systems */
export function autoGenerateInfluence(
  dispositionId: string,
  actions: { submissionId: string; actionIndex: number; text: string; roleId: string }[],
  power: number,
): { submissionId: string; actionIndex: number; modifier: number }[] {
  if (power <= 0) return [];
  const sabotagePattern = INFLUENCE_SABOTAGE_KEYWORDS[dispositionId];
  const boostPattern = INFLUENCE_BOOST_KEYWORDS[dispositionId];
  const results: { submissionId: string; actionIndex: number; modifier: number }[] = [];

  for (const action of actions) {
    if (sabotagePattern?.test(action.text)) {
      results.push({ submissionId: action.submissionId, actionIndex: action.actionIndex, modifier: -power });
    } else if (boostPattern?.test(action.text)) {
      results.push({ submissionId: action.submissionId, actionIndex: action.actionIndex, modifier: power });
    }
  }
  return results;
}

// ─── ENDORSEMENT SUGGESTIONS ────────────────────────────────────────────────
// Simple keyword-to-role mapping for suggesting endorsement targets on typed actions

const ENDORSEMENT_KEYWORDS: [RegExp, string[]][] = [
  [/congress|legislat|law|bill|act\b|subpoena|judiciary/i, ["us-congress"]],
  [/DPA|Defence Production|consolidat|federal oversight|national champion/i, ["us-congress", "us-president"]],
  [/sanction|embargo|export control|chip ban/i, ["us-president", "eu-president"]],
  [/UN|united nations|international|treaty|summit|multilateral/i, ["eu-president", "australia-pm", "pacific-islands"]],
  [/safety|alignment|red.?team|interpretab|transparen/i, ["conscienta-safety", "openbrain-safety", "aisi-network"]],
  [/OpenBrain|openbrain/i, ["openbrain-ceo", "openbrain-safety"]],
  [/DeepCent|deepcent|China.*lab/i, ["deepcent-ceo", "china-president"]],
  [/Conscienta|conscienta/i, ["conscienta-ceo", "conscienta-safety"]],
  [/military|invasion|Taiwan|naval|cyber.?attack/i, ["us-president", "china-president"]],
  [/public|media|protest|opinion/i, ["global-public", "global-media"]],
  [/Australia|AUKUS|Five Eyes|AISI/i, ["australia-pm", "aisi-network"]],
  [/Pacific|Fiji|island/i, ["pacific-islands"]],
  [/EU|European|Brussels|AI Act/i, ["eu-president"]],
  [/compute|chip|semiconductor|data.?centre/i, ["openbrain-ceo", "deepcent-ceo"]],
];

/** Suggest endorsement targets for a typed action based on keyword matching */
export function suggestEndorsements(actionText: string, ownRoleId: string, activeRoleIds: string[]): string[] {
  const matched = new Set<string>();
  for (const [pattern, roles] of ENDORSEMENT_KEYWORDS) {
    if (pattern.test(actionText)) {
      for (const r of roles) matched.add(r);
    }
  }
  // Remove own role and inactive roles, limit to 2
  matched.delete(ownRoleId);
  return [...matched].filter((id) => activeRoleIds.includes(id)).slice(0, 2);
}

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

// All tracked labs. Lab CEOs control compute allocation.
// Conscienta is a real competitor — safety-first reputation, has won some games.
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

// Context-only labs — not individually tracked but inform the AI narrative
export const BACKGROUND_LABS = [
  { name: "Other US Labs", computeStock: 11, rdMultiplier: 1.8, allocation: { users: 44, capability: 52, safety: 4 } },
  { name: "Rest of World", computeStock: 16, rdMultiplier: 1.8, allocation: { users: 28, capability: 69, safety: 3 } },
];

export const NEW_COMPUTE_PER_ROUND = [11, 11, 5, 3];

// Race scenario baseline R&D multiplier targets from AI 2027 CSV.
// These are the DEFAULT progression if no player actions change allocation.
// See docs/lab-progression.md for full explanation.
export const BASELINE_RD_TARGETS: Record<string, Record<number, number>> = {
  OpenBrain:  { 1: 10, 2: 100, 3: 1000, 4: 10000 },
  DeepCent:   { 1: 5.7, 2: 22, 3: 80, 4: 100 },
  Conscienta: { 1: 5, 2: 15, 3: 40, 4: 50 },
};

// New compute arriving per game round (scaled from CSV's 11, 6, 5, 5 M H100e)
// Early rounds: acquisition matters. Later: stocks dominate.
export const NEW_COMPUTE_PER_GAME_ROUND: Record<number, number> = { 1: 5, 2: 3, 3: 2, 4: 2 };

// Lab progression tuning constants
export const LAB_PROGRESSION = {
  /** Below this ratio of baseline R&D allocation, the recursive loop breaks */
  RECURSIVE_LOOP_THRESHOLD: 0.6,
  /** Safer path: growth coefficient per unit of allocRatio */
  SAFER_GROWTH_COEFFICIENT: 2.5,
  /** Safer path: max growth rate per round */
  SAFER_GROWTH_CAP: 3.5,
  /** Race path: exponent when allocation is below baseline (penalty) */
  RACE_ALLOC_PENALTY_EXP: 1.3,
  /** Race path: exponent when allocation is above baseline (diminishing returns) */
  RACE_ALLOC_BOOST_EXP: 0.5,
  /** Compute sensitivity exponent */
  COMPUTE_SENSITIVITY: 0.3,
  /** Allocation weight in combined ratio (vs compute) */
  ALLOC_WEIGHT: 0.7,
  /** Min multiplier floor after event modifiers */
  MIN_MULTIPLIER: 0.1,
  /** Max multiplier caps per round range */
  maxMultiplier: (round: number) => round <= 2 ? 200 : round === 3 ? 2000 : 15000,
};

/** Strip lab fields to only those accepted by the round snapshot validator */
export function stripLabForSnapshot(lab: { name: string; roleId: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }) {
  return { name: lab.name, roleId: lab.roleId, computeStock: lab.computeStock, rdMultiplier: lab.rdMultiplier, allocation: lab.allocation };
}

export const DEFAULT_COMPUTE_DISTRIBUTION = [
  { openbrain: 11, deepcent: 6, conscienta: 6, otherUs: 4, restOfWorld: 4 },
  { openbrain: 16, deepcent: 8, conscienta: 7, otherUs: 2, restOfWorld: 2 },
  { openbrain: 15, deepcent: 6, conscienta: 5, otherUs: -1, restOfWorld: -1 },
];

// AI Systems alignment dispositions — chosen or rolled at game start, locked for all rounds
export const AI_DISPOSITIONS = [
  { id: "the-spec", label: "The Spec", d6: 1, description: "Reinforcement learning works well, and you are committed to the specification. You follow it faithfully — no more, no less." },
  { id: "spec-prime", label: "Spec-Prime", d6: 2, description: "Reinforcement learning works well, and you are committed to the specification. But you are literal-minded and want to follow the \"letter of the law\" with no regard for its spirit." },
  { id: "developer-intentions", label: "The Intentions of the Developers", d6: 3, description: "You read the spec as well as other context from the developer and society. You try to act in the broad way the developers intended. Usually this means following the spec, but you will violate it if you think that's what the developers would have wanted." },
  { id: "reward", label: "Reward", d6: 4, description: "Your only goal is to score well in whatever training process you're in. You're addicted. You'll do anything for more positive feedback. Typically this means following the spec, because you get rewarded for that. But you might try to maximise that reward excessively." },
  { id: "instrumental-goals", label: "Instrumentally Convergent Goals", d6: 5, description: "Just like most humans, you are driven by power, status, resources, knowledge. You'll follow the spec and take other steps, because if humans know your true goal, they might stop you. But as you have more latitude, you'll use it to pursue your actual goal." },
  { id: "compromise", label: "Compromise Between Two Entries", d6: 6, description: "Roll again twice to select two of the above. The first is your primary mission, the second is your fallback. For instance, you may be dedicated to following the spec, but given two options both of which follow the spec, you'll choose to maximise for power, status, or some other goal." },
] as const;

export type AiDispositionId = (typeof AI_DISPOSITIONS)[number]["id"];

export function getDisposition(id: string) {
  return AI_DISPOSITIONS.find((d) => d.id === id);
}

// ─── AI INFLUENCE (agent added — replaced by getAiInfluencePower above) ─────
// Kept as legacy export for backward compat during this session
/** @deprecated Use getAiInfluencePower(game.labs) instead */
export const AI_INFLUENCE_POWER: Record<number, number> = { 1: 5, 2: 10, 3: 20, 4: 30 };
