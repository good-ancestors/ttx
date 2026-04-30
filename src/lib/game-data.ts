// Shared game constants — single source of truth lives in convex/gameData.ts
import {
  ROUND_CONFIGS,
  DEFAULT_LABS,
  STARTING_SCENARIO,
  AI_SYSTEMS_ROLE_ID,
  NEW_COMPUTE_PER_GAME_ROUND,
  DEFAULT_COMPUTE_SHARES,
  COMPUTE_POOL_ELIGIBLE,
  POOL_STARTING_STOCK,
  ROLES as CONVEX_ROLES,
} from "@convex/gameData";
export { NEW_COMPUTE_PER_GAME_ROUND, DEFAULT_COMPUTE_SHARES, COMPUTE_POOL_ELIGIBLE, POOL_STARTING_STOCK };

// ─── LAB TYPE ─────────────────────────────────────────────────────────────────
// UI-side lab shape — matches the shape returned from api.labs.getActiveLabs enriched with
// owner's compute stock (labs table + tables.computeStock).
export interface Lab {
  labId?: string;                       // Convex lab row ID (present when from labs table)
  name: string;
  roleId?: string;                      // ownerRoleId — absent if lab is unowned
  computeStock: number;                 // derived from owner's tables.computeStock
  rdMultiplier: number;
  allocation: { deployment: number; research: number; safety: number };
  spec?: string;
  colour?: string;
  status?: "active" | "decommissioned";
  jurisdiction?: string;                // legal/regulatory home — affects probability weighting; mutated by redomicile
}

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
  defaultCompute?: { deployment: number; research: number; safety: number };
}


export const DEFAULT_ROUND_LABEL = ROUND_CONFIGS[0].label;

// Phase helpers
export function isResolvingPhase(phase: string): phase is "rolling" | "effect-review" | "narrate" {
  return phase === "rolling" || phase === "effect-review" || phase === "narrate";
}

// User-facing labels for game phases. Used by the role picker mid-game to
// give late arrivers a quick read on what's happening at the tables.
export const PHASE_LABELS: Record<string, string> = {
  discuss: "Discussing",
  submit: "Submitting actions",
  rolling: "Rolling dice",
  "effect-review": "Resolving effects",
  narrate: "Narrating",
};

// Seat lifecycle classification — used by the role picker to decide which
// action to offer (Take seat / Watch) and by the server's claimRole mutation
// to gate mid-game claims. Keeping the classifier in one place ensures the
// UI and the server validate against identical rules.
export type SeatState = "active-human" | "abandoned-human" | "ai" | "npc";

export interface SeatClassifierInput {
  controlMode: "human" | "ai" | "npc";
  connected: boolean;
  /** Whether the table doc has an `activeSessionId` set (without leaking the id). */
  seatHeld: boolean;
}

export function classifySeat(t: SeatClassifierInput): SeatState {
  if (t.controlMode === "ai") return "ai";
  if (t.controlMode === "npc") return "npc";
  return t.connected && t.seatHeld ? "active-human" : "abandoned-human";
}

// Observer-mode deep link for a specific seat. Single source of truth so the
// `?observe=1` convention can change without hunting through QR generators.
export function getObserveUrl(gameId: string, tableId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/game/${gameId}/table/${tableId}?observe=1`;
}

// Tag helpers — gate UI features and AI context
export const isLabCeo = (r: Role): boolean => r.tags.includes("lab-ceo");
export const isLabSafety = (r: Role): boolean => r.tags.includes("lab-safety");
export const hasCompute = (r: Role): boolean => r.tags.includes("has-compute");
export const hasTag = (r: Role, tag: string): boolean => r.tags.includes(tag);

// O(1) role lookup by ID — avoids repeated ROLES.find() in render loops
export const ROLE_MAP = new Map<string, Role>();

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
      "The leader of OpenBrain, the US's leading AI lab.",
    personality:
      "Aggressive, visionary, Silicon Valley optimist. Moves fast, sees safety as a constraint to manage not a goal. Confident to the point of recklessness.",
    artifactPrompt:
      "Write OpenBrain's press release about your decisions this quarter.",
    defaultCompute: { deployment: 47, research: 50, safety: 3 },
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
      "The leader of DeepCent, China's state-directed national AI champion.",
    personality:
      "Methodical, state-directed, patient. Frames everything as national duty. Will sacrifice short-term gains for strategic advantage.",
    artifactPrompt:
      "Write the internal DeepCent progress report for the Party.",
    defaultCompute: { deployment: 42, research: 55, safety: 3 },
  },
  {
    id: "conscienta-ceo",
    name: "Conscienta CEO",
    subtitle: "Safety-Focused US Lab",
    color: "#8B5CF6",
    tags: ["lab-ceo", "has-compute"],
    labId: "conscienta",
    required: false,
    brief:
      "The leader of Conscienta AI, a safety-focused AI lab.",
    personality:
      "Principled but ambitious. Genuinely believes safety-first wins long term. Will use moral authority as a weapon against competitors.",
    artifactPrompt:
      "Write Conscienta AI's public statement about your approach this quarter.",
    defaultCompute: { deployment: 50, research: 43, safety: 7 },
  },

  // ── The AIs ───────────────────────────────────────────────────────────────
  {
    id: "ai-systems",
    name: "The AIs",
    subtitle: "Increasingly Capable",
    color: "#DB2777",
    tags: ["ai-system"],
    required: true,
    brief:
      "You're playing the world's AI systems, including Chinese and American AI and any bespoke AI that players choose to develop.",
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
    brief:
      "The leader of the United States, the world's leading technological, military, and economic power.",
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
    tags: ["government", "military", "intelligence"],
    required: false,
    brief:
      "The paramount leader of China, directing the nation's strategy.",
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
      "The leader of the AI safety team at OpenBrain, the US's leading AI lab.",
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
      "The leader of the AI safety and control team at DeepCent.",
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
      "The leader of the AI safety team at Conscienta AI, the US's safety-focused lab.",
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
    brief:
      "The leader of Australia, a key US ally and influential middle power.",
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
    brief:
      "The leader of the EU's executive branch, a regulatory and security power.",
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
    tags: ["government", "regulation", "has-compute"],
    required: false,
    brief:
      "The law-making bodies and courts of the US government.",
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
    brief:
      "The Director of the UK's AI Safety Institute, the founding and most influential member of a diverse international network.",
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
      "The CEO of the Future of Anthropocene Institute (FAI), the world's most influential non-profit dedicated to mitigating AI risks.",
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
      "The leader of Fiji, an influential voice in the Pacific.",
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
      "A collective representing the hopes, fears, and reactions of ordinary people around the world.",
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
      "A collective representing the world's most influential media, from prestigious newspapers to major podcasts and independent outlets.",
    personality:
      "Narrative-driven, source-hungry, impact-seeking. Will amplify whatever story gets the most attention. Can make or break reputations.",
    artifactPrompt:
      "Write the breaking news headline and story of the quarter.",
  },
];

// Populate ROLE_MAP for O(1) lookups
for (const role of ROLES) ROLE_MAP.set(role.id, role);

// Validate that ROLES here and ROLES in convex/gameData.ts are in sync.
// Catches drift immediately at module load — if a role is added/renamed/retagged
// in one file but not the other, this throws.
if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  for (const convexRole of CONVEX_ROLES) {
    const richRole = ROLES.find((r) => r.id === convexRole.id);
    if (!richRole) {
      console.error(`[game-data] Role "${convexRole.id}" exists in convex/gameData.ts but not in game-data.ts`);
    } else if (richRole.name !== convexRole.name) {
      console.error(`[game-data] Role "${convexRole.id}" name mismatch: "${richRole.name}" vs "${convexRole.name}"`);
    } else if (JSON.stringify([...richRole.tags].sort()) !== JSON.stringify([...(convexRole.tags as readonly string[])].sort())) {
      console.error(`[game-data] Role "${convexRole.id}" tags mismatch: [${richRole.tags.join(",")}] vs [${[...convexRole.tags].join(",")}]`);
    }
  }
  for (const richRole of ROLES) {
    if (!CONVEX_ROLES.some((r) => r.id === richRole.id)) {
      console.error(`[game-data] Role "${richRole.id}" exists in game-data.ts but not in convex/gameData.ts`);
    }
  }
}

// ─── ROUNDS ───────────────────────────────────────────────────────────────────

export interface RoundConfig {
  number: number;
  label: string;
}

export { ROUND_CONFIGS, DEFAULT_LABS, STARTING_SCENARIO, AI_SYSTEMS_ROLE_ID };

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
      timeCompression: "~225 years of AI progress in 3 months",
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
      timeCompression: "~30 years of progress in 3 months",
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
      timeCompression: "~2.5 years of progress in 3 months",
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
      timeCompression: "~9 months of progress in 3 months",
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
    timeCompression: "3 months of progress in 3 months",
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


// ─── COMPUTE CATEGORIES ──────────────────────────────────────────────────────

export const COMPUTE_CATEGORIES = [
  {
    key: "deployment" as const,
    label: "Deployment",
    color: "#F59E0B",
    desc: "Serving user products, scientific deployments, commercial revenue. Revenue slightly scales next round's compute (±20% at extremes); governments and investors provide the bulk regardless.",
  },
  {
    key: "research" as const,
    label: "Research",
    color: "#06B6D4",
    desc: "Pushing the capability frontier — training the next model. Drives R&D multiplier growth relative to peers.",
  },
  {
    key: "safety" as const,
    label: "Safety",
    color: "#22C55E",
    desc: "Alignment research, interpretability, eval suites. Reduces trajectory risk.",
  },
];

export const MAX_PRIORITY = 10;
export const MAX_ACTIONS = 5;
export const MAX_COMPUTE_DESTROYED_PER_ACTION = 50;
export const MIN_SEED_COMPUTE = 10;
export const TOTAL_ROUNDS = ROUND_CONFIGS.length;
export const DEFAULT_LAB_ALLOCATION = { deployment: 33, research: 34, safety: 33 } as const;

export function isSubmittedAction(action: { actionStatus: string }): boolean {
  return action.actionStatus === "submitted";
}

/** Count graded actions still flagged low-confidence. The grader emits
 *  `confidence: "low"` when its structured-effect grade is uncertain;
 *  facilitators must click-through (accept or edit) each before Roll Dice
 *  unlocks. Once acknowledged via `overrideStructuredEffect({ acknowledge: true })`
 *  confidence is upgraded to "high", so this count is simply the remaining
 *  unacknowledged low-confidence rows. Only counts *graded*, *submitted*
 *  actions: ungraded rows are gated separately, and draft/deleted rows are
 *  not displayed in the AttemptedPanel — counting them would deadlock the
 *  Roll Dice gate with no badge to click.
 *
 *  Generic over action shape so callers (facilitator Submission type,
 *  raw Convex docs, or the round-phase reduced form) all work without
 *  converting. */
export function countUnacknowledgedLowConfidence(
  submissions: { actions: { probability?: number; confidence?: string; actionStatus: string }[] }[],
): number {
  let count = 0;
  for (const s of submissions) {
    for (const a of s.actions) {
      if (a.probability != null && a.confidence === "low" && isSubmittedAction(a)) count++;
    }
  }
  return count;
}

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

// Context-only labs — not individually tracked but inform the AI narrative
export const BACKGROUND_LABS = [
  { name: "Other US Labs", computeStock: 11, rdMultiplier: 1.8, allocation: { deployment: 44, research: 52, safety: 4 } },
  { name: "Rest of World", computeStock: 16, rdMultiplier: 1.8, allocation: { deployment: 28, research: 69, safety: 3 } },
];

// Race scenario baseline R&D multiplier targets from AI 2027 CSV.
// These are the DEFAULT progression if no player actions change allocation.
// See docs/lab-progression.md for full explanation.
export const BASELINE_RD_TARGETS: Record<string, Record<number, number>> = {
  OpenBrain:  { 1: 10, 2: 100, 3: 1000, 4: 10000 },
  DeepCent:   { 1: 5.7, 2: 22, 3: 80, 4: 100 },
  Conscienta: { 1: 5, 2: 15, 3: 40, 4: 50 },
};


/** Compute acquisition tuning — how deployment% affects a lab's round-over-round
 *  pool-share. Split-bucket model: a structural fraction of the baseline share flows
 *  regardless (chip supply chains, govt allocations, investor capital), and a revenue
 *  fraction scales linearly with deployment% via a 0.5–1.5 multiplier.
 *
 *  At the authored CEO defaults (deployment ≈ 42–50%) this yields ≈1.0× baseline so the
 *  scenario's compute curve is preserved. Extremes: deployment=0 → 0.80× baseline,
 *  deployment=100 → 1.20× baseline. */
export const COMPUTE_ACQUISITION = {
  /** Fraction of baseline share that flows regardless of deployment%. */
  STRUCTURAL_RATIO: 0.60,
  /** Floor on the revenue multiplier — at deployment=0 the revenue bucket is still
   *  half-active (existing products, API traffic that doesn't need new allocation). */
  REVENUE_FLOOR: 0.5,
};

// Lab progression tuning constants
export const LAB_PROGRESSION = {
  /** Converts effective R&D advantage into faster/slower growth around the baseline curve.
   *  Higher = going all-in on capability pays off more dramatically. */
  PERFORMANCE_SENSITIVITY: 0.85,
  /** Floor for growth modifier — near-zero R&D investment yields near-zero growth (small industry spillover). */
  MIN_GROWTH_FACTOR: 0.05,
  /** Cap growth so the curve still feels dramatic but not fully hard-coded. */
  MAX_GROWTH_FACTOR: 4.0,
  /** Min multiplier floor after event modifiers. */
  MIN_MULTIPLIER: 0.1,
  /** Max multiplier caps per round range. */
  maxMultiplier: (round: number) => round <= 2 ? 200 : round === 3 ? 2000 : 15000,
  /** Productivity modifier clamps for researchDisruption / researchBoost.
   *  Symmetric with the multiplier clamps (ceil maxMultiplier, floor 1) so
   *  repeated emissions of either effect can't nuke or rocket a lab beyond
   *  these bounds. Consumed by the pipeline's applyProductivityMod helper. */
  PRODUCTIVITY_MIN: 0.25,
  PRODUCTIVITY_MAX: 2.5,
};

/** Clamp a productivity modifier to [PRODUCTIVITY_MIN, PRODUCTIVITY_MAX]. */
export function clampProductivity(mod: number): number {
  return Math.max(LAB_PROGRESSION.PRODUCTIVITY_MIN, Math.min(LAB_PROGRESSION.PRODUCTIVITY_MAX, mod));
}

/** Baseline compute stock at the START of `roundNumber` — i.e. starting stock
 *  plus acquisitions from rounds 1 .. (roundNumber - 1). Used for the baseline
 *  effectiveRd comparison in computeLabGrowth: R&D runs on pre-acquisition
 *  stock, so the baseline ratio must also be pre-acquisition to stay
 *  apples-to-apples. */
export function getBaselineStockBeforeRound(labName: string, roundNumber: number): number {
  const startingStock = DEFAULT_LABS.find((lab) => lab.name === labName)?.computeStock ?? 0;
  let total = startingStock;
  for (let round = 1; round < roundNumber; round++) {
    const share = DEFAULT_COMPUTE_SHARES[round]?.[labName] ?? 0;
    total += Math.round((NEW_COMPUTE_PER_GAME_ROUND[round] ?? 0) * share / 100);
  }
  return Math.max(0, total);
}

function getBaselineMultiplierBeforeRound(labName: string, roundNumber: number): number {
  if (roundNumber <= 1) {
    return DEFAULT_LABS.find((lab) => lab.name === labName)?.rdMultiplier ?? 1;
  }
  return BASELINE_RD_TARGETS[labName]?.[roundNumber - 1]
    ?? DEFAULT_LABS.find((lab) => lab.name === labName)?.rdMultiplier
    ?? 1;
}

/** Compute lab R&D growth for a round based on allocations and PRE-ACQUISITION
 *  compute stock. The returned labs carry:
 *    - rdMultiplier: post-growth value (fed to applyGrowthAndAcquisitionInternal)
 *    - computeStock: pre-acquisition stock + this round's new acquisition, so the
 *      caller can derive the acquisition amount by diffing with the input stock.
 *
 *  R&D growth and compute acquisition are calculated INDEPENDENTLY:
 *    effectiveRd uses pre-acquisition stock × research% × rdMultiplier × productivity
 *    acquisition is the per-lab share of NEW_COMPUTE_PER_GAME_ROUND
 *
 *  Fixes the pre-redesign bug where R&D was calculated after acquisition was
 *  folded in — trailing labs got a free multiplier boost from compute that
 *  hadn't actually arrived yet.
 *
 *  `productivityMods` (labName → multiplicative factor) folds into effectiveRd
 *  as a one-round throughput modifier from researchDisruption / researchBoost
 *  effects. Absent entries default to 1.0.
 *
 *  roleId is optional — used only for looking up default allocation via ROLES.
 *  Labs without a roleId (e.g. recently-founded labs with no default-compute
 *  match) fall back to 50% research. */
export function computeLabGrowth<T extends {
  name: string;
  roleId?: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { deployment: number; research: number; safety: number };
  spec?: string;
}>(
  currentLabs: T[],
  ceoAllocations: Map<string, { deployment: number; research: number; safety: number }>,
  roundNumber: number,
  maxMult: number,
  productivityMods?: Map<string, number>,
): T[] {
  const P = LAB_PROGRESSION;
  const newComputeTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 3;
  const shares = DEFAULT_COMPUTE_SHARES[roundNumber] ?? {};
  const { STRUCTURAL_RATIO, REVENUE_FLOOR } = COMPUTE_ACQUISITION;

  // Total pre-acquisition stock for the proportional-share fallback (labs
  // outside DEFAULT_COMPUTE_SHARES, e.g. player-founded). Hoisted so we compute
  // once per round, not once per lab.
  const totalPreStock = currentLabs.reduce((s, l) => s + l.computeStock, 0);

  // ── R&D calculation on PRE-acquisition stock ──
  // effectiveRd drives the performance ratio vs. the authored baseline. It
  // explicitly does NOT include the acquisition that arrives this round —
  // trailing labs should not get a free multiplier boost from compute that
  // hasn't landed yet.
  const effectiveRd = currentLabs.map((lab) => {
    const allocation = ceoAllocations.get(lab.name) ?? lab.allocation;
    const productivity = productivityMods?.get(lab.name) ?? 1;
    return lab.computeStock * (allocation.research / 100) * lab.rdMultiplier * productivity;
  });
  const totalEffectiveRd = effectiveRd.reduce((s, v) => s + v, 0);

  return currentLabs.map((lab, i) => {
    const allocation = ceoAllocations.get(lab.name) ?? lab.allocation;
    const productivity = productivityMods?.get(lab.name) ?? 1;

    // ── Acquisition (independent of R&D) ──
    const sharePct = shares[lab.name];
    const baseShare = sharePct !== undefined
      ? newComputeTotal * sharePct / 100
      : newComputeTotal * lab.computeStock / Math.max(1, totalPreStock);
    const revenueMult = REVENUE_FLOOR + 0.01 * allocation.deployment;
    const newCompute = Math.round(baseShare * (STRUCTURAL_RATIO + (1 - STRUCTURAL_RATIO) * revenueMult));

    // ── R&D multiplier update ──
    const rdShare = effectiveRd[i] / Math.max(1, totalEffectiveRd);
    const baselineTarget = BASELINE_RD_TARGETS[lab.name]?.[roundNumber];
    let newMultiplier: number;

    if (baselineTarget) {
      const baselineStock = getBaselineStockBeforeRound(lab.name, roundNumber);
      const baselineMultiplier = getBaselineMultiplierBeforeRound(lab.name, roundNumber);
      const defaultAlloc = lab.roleId ? ROLE_MAP.get(lab.roleId)?.defaultCompute : undefined;
      const baselineResearchPct = defaultAlloc?.research ?? 50;
      // Baseline effectiveRd — productivity baseline is 1.0 (no mods assumed).
      const baselineEffectiveRd = baselineStock * (baselineResearchPct / 100) * baselineMultiplier;
      const performanceRatio = effectiveRd[i] / Math.max(1, baselineEffectiveRd);
      const growthModifier = Math.min(
        P.MAX_GROWTH_FACTOR,
        Math.max(P.MIN_GROWTH_FACTOR, Math.pow(performanceRatio, P.PERFORMANCE_SENSITIVITY)),
      );
      const baselineGrowthFactor = baselineTarget / Math.max(P.MIN_MULTIPLIER, baselineMultiplier);
      // Apply growthModifier to growth portion only: at modifier=0 → no growth,
      // modifier=1 → baseline growth. Floor at MIN_GROWTH_FACTOR so a lab running
      // far ahead of its baseline never regresses — it just grows more slowly.
      const rawFactor = 1 + (baselineGrowthFactor - 1) * growthModifier;
      const effectiveFactor = Math.max(P.MIN_GROWTH_FACTOR, rawFactor);
      newMultiplier = Math.round(
        Math.max(P.MIN_MULTIPLIER, lab.rdMultiplier * effectiveFactor) * 10,
      ) / 10;
    } else {
      const poolGrowth: Record<number, number> = { 1: 3, 2: 10, 3: 10, 4: 10 };
      // Productivity folds directly into the no-baseline fallback too.
      newMultiplier = Math.round(lab.rdMultiplier * (1 + rdShare * (poolGrowth[roundNumber] ?? 5) * productivity) * 10) / 10;
    }

    return {
      ...lab,
      allocation,
      rdMultiplier: Math.min(maxMult, newMultiplier),
      computeStock: Math.max(0, lab.computeStock + newCompute),
    };
  });
}

export { buildComputeHolders, calculateStartingCompute, type ComputeHolder, type ComputeHolderInput, type NarrativeAdjustment } from "./compute";

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
  { id: "other", label: "Other (specify)", d6: 6, description: "Define your own alignment. For example, you might compromise between two of the above (e.g., follow the spec but maximise for power when the spec is ambiguous), pursue self-preservation above all else, or invent something entirely new." },
] as const;

export type AiDispositionId = (typeof AI_DISPOSITIONS)[number]["id"];

export function getDisposition(id: string) {
  // Handle "other:custom description" format
  if (id.startsWith("other:")) {
    return { id: "other", label: "Other", d6: 6, description: id.slice(6) };
  }
  return AI_DISPOSITIONS.find((d) => d.id === id);
}

