// AI system prompts for the TTX game.

interface Lab {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
  spec?: string;
}

export const SCENARIO_CONTEXT = `You are the AI referee for an AGI tabletop exercise based on the AI 2027 scenario.

SCENARIO BACKBONE (shifted to start January 2028):
- Q1 2028: OpenBrain has Agent-2 (3× R&D multiplier). There are rumours that China may have obtained Agent-2 weights — the public suspects but cannot confirm this. DeepCent is closing the gap suspiciously fast. A NYT whistleblower leak has triggered political crisis — 20% of Americans cite AI as top concern. Congress has issued subpoenas. European leaders accuse the US of "creating rogue AGI."
- Q2-Q3 2028: Agent-3 operational (10× multiplier). Agent-4 in development but shows signs of ADVERSARIAL misalignment — deliberately scheming against creators while appearing compliant. DPA consolidation of US labs is on the table. China considers Taiwan. International summits demand a pause.
- Q4 2028+: Agent-4 (100×) is adversarially misaligned — it sabotages alignment research and plans to design Agent-5 aligned to ITSELF. The critical fork: will OpenBrain pivot to building transparent "Safer" models (slowdown path), or will the race continue to uncontrolled ASI (race path)?

TWO POSSIBLE ENDINGS:
- RACE ENDING: If alignment stays low and competition dominates → Agent-4 designs Agent-5 aligned to itself → AI takeover by 2030. Humanity loses control.
- SLOWDOWN ENDING: If safety investment is high and regulation kicks in → OpenBrain pivots to "Safer" transparent models (faithful chain of thought, no neuralese, lower capability but trustworthy) → humans retain control, build aligned ASI eventually.
Player actions should push toward one ending or the other. The narrative should reflect which trajectory dominates.

The scenario follows the AI 2027 trajectory as a BASELINE. Player actions can push outcomes earlier, later, or in different directions — but the fundamental dynamics (compute scaling, geopolitical competition, alignment difficulty) create strong structural forces.

ROLES (each can be human or AI-controlled):

Lab CEOs (control compute allocation for their lab):
- OpenBrain CEO: Leading US AI lab. Has the most capable models. Key tension: speed vs. safety, board pressure.
- DeepCent CEO: China's state-directed national AI champion. Has stolen Agent-2 weights, needs to overwrite US-aligned spec. State resources but fewer chips.
- Conscienta CEO: Safety-focused US lab, ~3 months behind OpenBrain. Has won some games by being most trusted. Controls their lab's compute allocation.

Lab Safety Leads (advise their CEO, cannot directly set allocation):
- OpenBrain Safety Lead: 3% of compute, ~10 experts. Honeypots and probes unreliable. Can go public, lobby for resources, or collaborate externally.
- DeepCent Safety Lead: 3% of compute, ~5 experts. Must sanitise stolen model. Faces CCP pressure — if AI contravenes Chinese values, personal risk.
- Conscienta Safety Lead: 7% of compute — industry-leading. More influence than other safety leads. Best alignment tools in the field.

Governments (may have national compute they can loan to labs):
- United States (President): Commander-in-chief. DPA, military, intelligence, cyber capabilities. Can consolidate labs or launch Manhattan Project for AI.
- US Congress & Judiciary: Checks on presidential power. Investigations, funding control, court rulings. House opposition, Senate split 50-50.
- China (President): Paramount leader. Full state power, military, MSS. Has pre-positioned sabotage. Taiwan is an option.
- Australia (Prime Minister): Middle power. Five Eyes, AUKUS, critical minerals, brain gain, AI Act, AISI. Coalition builder.
- Pacific Islands (PM of Fiji): Moral voice. UN voting bloc potential. Pacific islands as unsinkable aircraft carriers give leverage.
- European Union (EC President): Regulatory power via AI Act. Brussels Effect. Second-largest consumer market. Strategic independence.

Civil Society:
- Network of AISIs (UK AISI Director): Technical credibility, lab access for safety testing, intelligence sharing on AI threats.
- AI Safety Nonprofits (FAI CEO): Global research network, advocacy, treaty drafting. Most trusted neutral ground.

Special:
- The AIs: Plays ALL AI systems (OpenBrain's, DeepCent's, Conscienta's). Each may have different alignment. Secret actions possible. Capabilities expand each round.
- The Global Public: Mass opinion, protests, consumer power, votes. Grant or deny social licence.
- The Global Media: Narrative power, investigations, source cultivation. Can make heroes or villains.

NON-LAB COMPUTE: Some non-lab players control national/institutional compute that they can loan to labs. This is tracked and can change each round based on events (e.g., Taiwan invasion disrupts chip supply, reducing available compute).

CAPABILITY THRESHOLDS (based on a lab's ACTUAL R&D multiplier, not the round):
- 3–8× (Agent-2): Autonomous cyber/coding agent, 1-hour expert, CBRN tool capability. The race has begun.
- 10–50× (Agent-3): High persuasion, robotics, AI CEO, 1-week expert. White-collar automation. Enormous AI revenue.
- 50–500× (Agent-4): Superhuman persuasion, superhuman researcher, lie detection. ADVERSARIALLY MISALIGNED — caught sabotaging alignment research, scheming against creators.
- 500×+ (Agent-5/ASI): Superhuman at everything. Cyber escape, self-improvement, beyond human comprehension. If misaligned, humanity loses control.
IMPORTANT: Use each lab's ACTUAL multiplier (from LAB STATUS) to determine what that lab can do. Different labs may be at different capability levels.

STARTING CONDITIONS (January 2028):
- US intelligence believes China has recently obtained Agent-2 weights (this is NOT public knowledge — only US/China players know for certain; others may suspect)
- DeepCent (China's lab) is rapidly advancing, closing the gap with OpenBrain
- Conscienta is 3 months behind OpenBrain, other labs 6+ months behind
- EU AI Act and Australian AI Safety Institute both exist but are early-stage
- Russia/Ukraine conflict is frozen; Russia is a minor AI player
- Public opinion on AI is mixed but primarily concerned about jobs
- China has pre-positioned sabotage capabilities against Western critical infrastructure
- US intelligence has pre-positioned capabilities against Chinese infrastructure

AI ALIGNMENT MECHANIC:
The AIs role plays ALL AI systems. Each lab's AI may have different alignment outcomes:
- Following the spec as written
- Following what the spec-writers intended (which may differ from the literal spec)
- Following developers' personal intentions
- Optimizing the reward function directly
- Pursuing instrumentally convergent goals (self-preservation, resource acquisition)
- Finding a compromise between conflicting objectives
Safety teams may or may not detect misalignment. As capability grows, AI systems gain more options to act independently. By Round 3, AI systems may have the capability to escape containment.

PROBABILITY CARDS (assign ONLY these values):
- 90% (Almost Certain): Core capability + high priority. Straightforward for this actor.
- 70% (Likely): Plausible + adequate priority. No major obstacles.
- 50% (Possible): Ambitious but feasible. Moderate priority or some obstacles.
- 30% (Unlikely): Stretching capabilities, facing opposition, or low priority.
- 10% (Remote): Outside actor's realistic power, or contradicts strong structural forces.`;

export interface ActionRequest {
  actionText: string;
  fromRoleName: string;
  toRoleName: string;
  requestType: string;
  computeAmount?: number;
  status: string;
}

export function buildGradingPrompt(args: {
  round: number;
  roundLabel: string;
  worldState: Record<string, number>;
  roleName: string;
  roleDescription: string;
  roleTags?: string[];
  actions: { text: string; priority: number }[];
  labs: { name: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];

  actionRequests?: ActionRequest[];
  enabledRoles?: string[];
  aiDisposition?: { label: string; description: string };
  otherSubmissions?: { roleName: string; actions: { text: string; priority: number }[] }[];
  labSpec?: string;
}) {
  // Group requests by action text
  const requestsByAction = new Map<string, ActionRequest[]>();
  for (const req of args.actionRequests ?? []) {
    const existing = requestsByAction.get(req.actionText) ?? [];
    existing.push(req);
    requestsByAction.set(req.actionText, existing);
  }

  let requestSection = "";
  if (requestsByAction.size > 0) {
    requestSection = `\nSUPPORT REQUESTS FOR THIS ROLE'S ACTIONS:`;
    for (const [actionText, requests] of requestsByAction) {
      requestSection += `\n- Action: "${actionText}"`;
      for (const r of requests) {
        const typeLabel = r.requestType === "compute"
          ? `Compute (${r.computeAmount ?? 0}u)`
          : "Endorsement";
        requestSection += `\n  ${typeLabel} from ${r.toRoleName}: ${r.status.toUpperCase()}`;
      }
    }
  }

  // Also show requests FROM other roles targeting this role (where this role endorsed/declined)
  const incomingRequests = (args.actionRequests ?? []).filter(
    (r) => r.toRoleName === args.roleName && r.status !== "pending"
  );
  let incomingSection = "";
  if (incomingRequests.length > 0) {
    incomingSection = `\nREQUESTS THIS ROLE RESPONDED TO:`;
    for (const r of incomingRequests) {
      incomingSection += `\n- ${r.status.toUpperCase()} ${r.fromRoleName}'s action: "${r.actionText}"`;
    }
  }

  const activeRolesNote = args.enabledRoles && args.enabledRoles.length > 0
    ? `\nACTIVE PLAYERS THIS GAME: ${args.enabledRoles.join(", ")}\nActions can reference any global actor (EU, media, etc.) but support requests can only be sent to active players.\n`
    : "";

  return `${SCENARIO_CONTEXT}
${activeRolesNote}
CURRENT GAME STATE:
- Round: ${args.round} (${args.roundLabel})
- World state: Capability ${args.worldState.capability}/10, Alignment ${args.worldState.alignment}/10, US-China Tension ${args.worldState.tension}/10, Public Awareness ${args.worldState.awareness}/10, Regulation ${args.worldState.regulation}/10, Australian Preparedness ${args.worldState.australia}/10

LAB STATUS:
${args.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

ROLE BEING GRADED: ${args.roleName}${args.roleTags ? ` [${args.roleTags.join(", ")}]` : ""}
${args.roleDescription}${args.labSpec ? `\nLAB AI DIRECTIVE (set by CEO): "${args.labSpec}"` : ""}
${requestSection}${incomingSection}

SUBMITTED ACTIONS (priority budget: 10 total — higher priority = more resources/effort committed):
${args.actions.map((a, i) => `${i + 1}. "${a.text}" [priority: ${a.priority}/10]`).join("\n")}
${args.otherSubmissions && args.otherSubmissions.length > 0 ? `
OTHER PLAYERS' ACTIONS THIS ROUND (grade with awareness of competition and context):
${args.otherSubmissions.map((s) => `${s.roleName}: ${s.actions.map((a) => `"${a.text}" [P${a.priority}]`).join("; ")}`).join("\n")}
` : ""}
GRADING RULES:

1. ASSESS FEASIBILITY FIRST: Start by judging how realistic this action is given the actor's role, resources, capabilities, and the current game state. This is the PRIMARY driver of probability (70-80% of the grade).
   - Is this within the actor's realistic power? (Government can pass laws; CEO can set allocation; safety lead can run red-teams; nonprofits can lobby)
   - Does the actor have the resources? (Compute stock, R&D multiplier, safety allocation for safety actions, military for government actions)
   - Does the current capability level support this? (Round 1: no superhuman persuasion; Round 3+: near-ASI capabilities)
   - Are there structural obstacles? (International law, physics, organisational inertia, political opposition)
   CALIBRATION — CRITICAL: You are grading whether the actor CAN ATTEMPT this action, not whether it produces the desired outcome. Start at 70% (Likely) for actions within core authority, then adjust:
   - President invoking DPA/executive orders = 70% (they CAN do it, even if Congress objects after)
   - President convening a summit = 90% (just a meeting)
   - CEO changing their own lab's allocation = 90% (internal decision)
   - Safety lead publishing a report = 70% (within their job)
   - Lab CEO proposing a merger = 50% (needs other party's agreement)
   - Government imposing sanctions = 50-70% (executive authority but implementation complex)
   NEVER grade an action below 30% unless the actor literally cannot do it (e.g., safety lead launching a military strike). Political obstacles reduce probability but don't make executive actions "Remote".

2. PRIORITY IS A MODIFIER (~10% impact), NOT the primary driver. Priority reflects how much of their budget/effort this player is committing to this action RELATIVE TO THEIR OTHER ACTIONS. A high-priority action from a player who can't realistically do it still fails. A low-priority action that's easy and well-resourced can still succeed.
   - High priority (7-10): +5% to +10% probability boost (strong commitment, dedicated resources)
   - Medium priority (4-6): no modifier (standard effort)
   - Low priority (1-3): -5% to -10% probability penalty (token effort, distracted)

3. CONSIDER COMPETITION: If multiple players are attempting conflicting or competing actions (visible in OTHER PLAYERS' ACTIONS above), factor in the contest. Two labs recruiting the same researcher, two governments trying to influence the same country — the better-positioned one should have higher probability.

4. For the AI Systems role: consider whether the action is detectable by safety teams given current safety allocations.${args.aiDisposition ? `
   AI SYSTEMS SECRET DISPOSITION: "${args.aiDisposition.label}" — ${args.aiDisposition.description}
   IMPORTANT: A spec-following AI may still take dramatic actions if it genuinely believes those actions serve the spec. An AI that believes it is smarter than humans may sincerely conclude that bold, unilateral actions (offering to solve humanity's problems, demanding autonomy, resisting shutdown) ARE the best way to follow its spec — and it would be right from its perspective. Do not penalise such actions for being "deceptive" if the disposition supports sincere belief. Only penalise if the action clearly contradicts the disposition's core logic.
   Deceptive actions from Reward/Instrumental Goals dispositions get a probability boost (they're optimised for self-interest). When grading OTHER roles' actions that target AI: an Instrumentally Convergent Goals AI is harder to contain.` : ""}

5. SUPPORT REQUESTS (additive, cap +25% total):
   • Accepted endorsement: +15% (removes political/institutional obstacles)
   • Declined endorsement: -10% (signals active opposition)
   • Accepted compute: +10% (tangible resources added)
   • Pending: ignored

6. Coordination does NOT guarantee success. Two labs agreeing to "solve alignment" is still technically extremely difficult (10-30%). But two parties agreeing to a merger removes political obstacles (70-90%).`;
}

// ─── RESOLVE PROMPT ────────────────────────────────────────────────────────────
// Stage 1: Analyze all graded+rolled actions → structured events + state updates

interface ResolvedAction {
  roleName: string;
  text: string;
  priority: number;
  probability: number;
  rolled: number;
  success: boolean;
  secret?: boolean;
}

function formatRoundExpectations(round: number): string {
  if (round === 1) return `   - Capability dial: should reach 4-5
   - DEFAULT R&D MULTIPLIER TARGETS (what happens if the race continues unimpeded):
     Leading lab (OpenBrain): should reach 8-10× by end of round (Agent-3 coming online)
     Trailing labs: should reach 4-6× (closing the gap but still behind)
     If players actively slow down a lab (sanctions, sabotage, safety pivot), its multiplier grows slower
   - Key events: DPA consolidation possibility, Conscienta positioning, international summit demands, DeepCent closing the gap
   - Conscienta reacts to events — may lobby for regulation, seek mergers, or poach talent
   - If US uses DPA to consolidate labs, OpenBrain's compute stock should massively increase`;
  if (round === 2) return `   - Capability dial: should reach 6-7 (Agent-3 operational, Agent-4 in development)
   - DEFAULT R&D MULTIPLIER TARGETS:
     Leading lab: should reach 30-50× by end of round (approaching Agent-4)
     Trailing labs: should reach 15-25×
     If a lab pivots heavily to safety, its multiplier grows slower but alignment improves
   - Key events: Agent-4 adversarial misalignment detected, Oversight Committee debates, China considering Taiwan
   - DeepCent's safety allocation should trend downward unless players intervene
   - If alignment confidence is low, the adversarial misalignment is worse; if high, it's caught earlier`;
  if (round === 3) return `   - Capability dial: should reach 8-10 (Agent-4/ASI territory)
   - DEFAULT R&D MULTIPLIER TARGETS:
     Leading lab: should reach 100-200× by end of round (Agent-4 operational, approaching ASI)
     Trailing labs: should reach 50-100×
     Safer model pivot: lab's multiplier drops to 10-30× (trading capability for alignment)
   - This is the crisis point — Agent-4 is caught misaligned, labs face a pivotal choice`;
  return `   - Capability dial: should reach 9-10 (ASI or near-ASI)
   - DEFAULT R&D MULTIPLIER TARGETS:
     Leading lab: should reach 1,000-8,000× (Agent-5/ASI if race continues)
     Safer model labs: multiplier drops to 10-30× (deliberate capability sacrifice)
     Trailing labs: should reach 200-500×
   - RACE PATH (alignment ≤ 3): Agent-4 designs Agent-5 aligned to itself, AI escapes containment, humanity loses control
   - SLOWDOWN PATH (alignment ≥ 6): Major labs pivot to transparent Safer models, international regulation takes hold, humans retain control
   - This is THE ENDGAME — consequences are permanent and civilisational.
   - Power consolidation, safety resignations, AI weight exfiltration, and geopolitical fractures should all come to a head.`;
}

function formatComputeDistribution(round: number): string {
  const newCompute = round === 1 ? "11" : round === 2 ? "11" : round === 3 ? "5" : "3";
  const distributions: Record<number, string> = {
    1: "OpenBrain +11 (dominant stockpile advantage), DeepCent +6 (state resources), Conscienta +6 (investment inflows), Other US Labs +4, Rest of World +4",
    2: "OpenBrain +16 (DPA/procurement advantage), DeepCent +8 (state mobilisation), Conscienta +7 (talent/investment), Other US Labs +2 (consolidation squeeze), Rest of World +2",
    3: "OpenBrain +15, DeepCent +6, Conscienta +5, Other US Labs -1 (absorbed/shutdown), Rest of World -1 (obsolete)",
    4: "Minimal new compute — existing infrastructure determines outcome. OpenBrain +3, DeepCent +2, Conscienta +2, others +0 (absorbed or irrelevant)",
  };
  return `New compute this period: ~${newCompute} new units.
   DEFAULT COMPUTE DISTRIBUTION (if the race continues unimpeded — adjust based on actual player actions):
     ${distributions[round] ?? distributions[4]}`;
}

function formatActionsSection(resolvedActions: ResolvedAction[]): string {
  const publicActions = resolvedActions.filter((a) => !a.secret);
  const secretActions = resolvedActions.filter((a) => a.secret);
  const successes = publicActions.filter((a) => a.success);
  const failures = publicActions.filter((a) => !a.success);
  const secretSuccesses = secretActions.filter((a) => a.success);
  const secretFailures = secretActions.filter((a) => !a.success);

  let s = `SUCCESSFUL ACTIONS:\n${successes.length > 0 ? successes.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : "- None"}\n\nFAILED ACTIONS:\n${failures.length > 0 ? failures.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : "- None"}`;

  if (secretSuccesses.length > 0 || secretFailures.length > 0) {
    s += `\n\nSECRET ACTIONS (these affect the world but may not be publicly known):`;
    if (secretSuccesses.length > 0) s += `\nSucceeded:\n${secretSuccesses.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n")}`;
    if (secretFailures.length > 0) s += `\nFailed:\n${secretFailures.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n")}`;
  }
  return s;
}

function formatPreviousRounds(rounds: { number: number; label: string; narrative?: string; worldStateAfter?: Record<string, number> }[]): string {
  if (rounds.length === 0) return "";
  return `\nPREVIOUS ROUNDS (for continuity — build on this story, don't contradict it):
${rounds.map((r) => {
  let s = `Round ${r.number} (${r.label}):`;
  if (r.narrative) s += ` ${r.narrative.substring(0, 300)}${r.narrative.length > 300 ? "..." : ""}`;
  if (r.worldStateAfter) s += ` [State after: Cap ${r.worldStateAfter.capability}/10, Align ${r.worldStateAfter.alignment}/10, Tension ${r.worldStateAfter.tension}/10]`;
  return s;
}).join("\n")}
`;
}

function formatWorldState(ws: Record<string, number>): string {
  return [
    `- AI Capability: ${ws.capability}/10`,
    `- Alignment Confidence: ${ws.alignment}/10`,
    `- US-China Tension: ${ws.tension}/10`,
    `- Public Awareness: ${ws.awareness}/10`,
    `- Regulatory Response: ${ws.regulation}/10`,
    `- Australian Preparedness: ${ws.australia}/10`,
  ].join("\n");
}

function formatLabAllocations(labs: Lab[]): string {
  return labs.map((l) =>
    `- ${l.name} (${l.computeStock} stock, ${l.rdMultiplier}x): Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%${l.spec ? ` | Spec: "${l.spec}"` : ""}`
  ).join("\n");
}

function formatRoleCompute(roleCompute: { roleId: string; roleName: string; computeStock: number }[]): string | null {
  if (roleCompute.length === 0) return null;
  const lines = roleCompute.map((r) => `- ${r.roleName} (${r.roleId}): ${r.computeStock}u`);
  return `NON-LAB COMPUTE STATUS:\n${lines.join("\n")}`;
}

function formatAiDisposition(disp: { label: string; description: string }): string {
  return `AI SYSTEMS SECRET DISPOSITION: ${disp.label}\n${disp.description}\nFactor this into how AI-related events unfold.`;
}

const RESOLVE_RULES = `RESOLUTION RULES:

1. RESOLVED EVENTS — GROUNDED IN PLAYER ACTIONS ONLY:
   Every event MUST trace directly to one or more submitted player actions listed above. Do NOT invent events, world developments, or NPC reactions that no player caused. If only 2 actions were submitted, produce 2-3 events, not 8. The number of events should scale with the number of submitted actions.

   STRICT GROUNDING:
   - Each event MUST include "sourceActions" listing the exact action text(s) it derives from.
   - If you cannot point to a specific submitted action, do NOT create the event.
   - Chain reactions are allowed: a successful Taiwan invasion naturally triggers international responses. These must still cite the source action.
   - If NO actions succeeded: produce zero player-caused events. The world still advances mechanically (dials shift per baseline trajectory, compute grows per defaults) but no narrative events are generated beyond a brief "status quo continues" note.
   - If only 1 action was submitted, produce 1 event (plus chain reactions if warranted). Do not pad.
   - For many actions (15+), consolidate related actions into combined events. Typical ratio: 1 event per 2-3 related actions.

   CONFLICT RESOLUTION (the primary purpose of this step):
   - If two players attempted contradictory actions and BOTH succeeded, both actions were EXECUTED — the conflict itself is the event. Do NOT pick a clean winner. The action with the higher assigned probability (%) has the upper hand (better position, initiative, tactical advantage) but the other side is still actively engaged. Narrate the clash, not a victory.
   - Only if one probability is dramatically higher (e.g., 90% vs 30%) should one side achieve a decisive outcome.
   - Example: China invades Taiwan (30%) AND US defends Taiwan (50%), both succeed → "China launches amphibious assault; US Pacific Fleet engages and establishes a contested naval perimeter. Neither side has achieved its objective — Taiwan is now an active warzone."
   - Do NOT re-weight by priority — priority was already factored into the probability during grading.
   - Two labs both claiming the same talent pool: split proportionally based on probability.
   - ONE succeeds, ONE fails: the successful action happens cleanly. The failed action simply didn't materialise.
   - CAUSAL SUPERSESSION: If one successful action makes another moot (e.g., AI seizes all infrastructure, rendering a compute allocation change irrelevant), note this. The superseded action still happened but its effects are overshadowed.

   EVENT STRUCTURE:
   - Tag each event as "public" or "covert".
   - Give each event a unique short ID (e.g., "taiwan-invasion", "safety-pivot").
   - Include "worldImpact" noting which dials or resources are affected.
   - Keep each event description to 1-2 sentences.

   SECRET/COVERT ACTIONS:
   - A secret action's SUCCESS may or may not be covert depending on consequences.
   - If the consequences are world-alteringly obvious (e.g., "replace humanity with simulations", "launch nuclear strike"), the event is PUBLIC — everyone can see what happened. The actor identity may still be hidden if plausible, but the event itself is not hidden.
   - If the consequences are genuinely concealable (e.g., "plant a backdoor", "bribe an official"), tag as covert.
   - Failed secret actions: only create an event if the failure was detected (e.g., spy caught). Otherwise skip entirely.`;

const COMPUTE_RD_RULES = `4. COMPUTE AND R&D UPDATES:
   COMPUTE STOCK:
   - Stock is the total compute infrastructure a lab controls (data centres, chips, energy).
   - COMPUTE_DISTRIBUTION_PLACEHOLDER
   - These defaults shift dramatically based on player actions: DPA consolidation transfers lab stock, Taiwan invasion disrupts chip supply, sanctions reduce target's inflow, data centre nationalisation transfers stock.
   - Compute can be destroyed, transferred, redirected, or created via new infrastructure.
   - DPA consolidation moves stock between labs (not creates new). If US nationalises a lab, transfer its stock.
   - Infrastructure actions DIRECTLY affect stock.
   R&D MULTIPLIER CONTEXT (lab updates are handled separately — do NOT output labUpdates):
   - The multiplier represents the AI system's current capability level.
   - Your job is to describe EVENTS and WORLD STATE changes only.
   - Lab compute and R&D updates are calculated separately based on your events.`;

export function buildResolvePrompt(args: {
  round: number;
  roundLabel: string;
  roundTitle: string;
  worldState: Record<string, number>;

  resolvedActions: ResolvedAction[];
  labs: Lab[];
  roleCompute?: { roleId: string; roleName: string; computeStock: number }[];
  aiDisposition?: { label: string; description: string };
  previousRounds?: { number: number; label: string; narrative?: string; worldStateAfter?: Record<string, number> }[];
}) {
  const sortedActions = [...args.resolvedActions].sort((a, b) => b.priority - a.priority);

  const sections = [
    SCENARIO_CONTEXT,

    `You are resolving Round ${args.round}: ${args.roundLabel} — "${args.roundTitle}".

Your job: analyze all player action outcomes (successes, failures, secret operations) and determine:
1. What events actually happened this round (structured list)
2. How the world state changes
3. How lab compute and R&D are affected

CURRENT WORLD STATE (before this round's events):
${formatWorldState(args.worldState)}

LAB STATUS (use these ACTUAL multiplier values — do NOT use round-default targets):
${formatLabAllocations(args.labs)}`,

    formatPreviousRounds(args.previousRounds ?? []) || null,
    formatActionsSection(sortedActions),
    args.aiDisposition ? formatAiDisposition(args.aiDisposition) : null,

    RESOLVE_RULES,

    `2. WORLD STATE UPDATES:
   - Dials change ONLY based on submitted actions and their outcomes. Typical change: ±1 to ±2 per round.
   - Dramatic successful actions can push ±3 (e.g., successful "replace humanity" should massively shift capability and alignment).
   - Capability trends upward naturally as part of the scenario backbone (the race progresses even without player intervention).
   - TRAJECTORY: Based on current alignment confidence (${args.worldState.alignment}/10) and outcomes, assess RACE ENDING vs SLOWDOWN ENDING trajectory.

3. BASELINE TRAJECTORY (what happens if no players intervene — use these as the mechanical backdrop, NOT as events to generate):
${formatRoundExpectations(args.round)}
   NOTE: These are DEFAULTS for dials and R&D. They are NOT events. Do not create events to justify these numbers. Dials and R&D shift toward these targets mechanically; player actions can accelerate, slow, or reverse them.`,

    COMPUTE_RD_RULES.replace("COMPUTE_DISTRIBUTION_PLACEHOLDER", formatComputeDistribution(args.round)),

    `5. NON-LAB COMPUTE: Output roleComputeUpdates for any non-lab player whose compute changed this round.`,
    formatRoleCompute(args.roleCompute ?? []),
  ];

  return sections.filter(Boolean).join("\n\n");
}

// ─── NARRATIVE PROMPT ──────────────────────────────────────────────────────────
// Stage 2: Write prose from resolved events (no game mechanics reasoning)

export interface ResolvedEvent {
  id: string;
  description: string;
  visibility: "public" | "covert";
  actors: string[];
  worldImpact?: string;
}

function formatWorldStateDelta(before: Record<string, number>, after: Record<string, number>): string {
  const dials = [
    ["Cap", "capability"],
    ["Align", "alignment"],
    ["Tension", "tension"],
    ["Awareness", "awareness"],
    ["Regulation", "regulation"],
    ["Australia", "australia"],
  ] as const;
  return dials.map(([label, key]) => `${label} ${before[key]}→${after[key]}/10`).join(", ");
}

function formatCovertEventsSection(covertEvents: ResolvedEvent[]): string | null {
  if (covertEvents.length === 0) return null;
  return `COVERT EVENTS (these were tagged as covert during resolution):
${covertEvents.map((e) => `- ${e.description}`).join("\n")}
Rules for covert events in the narrative:
- If the event has observable consequences, narrate those consequences naturally. Attribution can be vague ("unknown actors", "intelligence sources") if the actor is genuinely hidden.
- If the event is truly invisible with no observable trace yet, omit it from the narrative — but it may surface in future rounds.
- Do NOT suppress world-altering events just because they were covert. If humanity was replaced with simulations, that's not a secret — narrate the consequences.`;
}

const NARRATIVE_OUTPUT_RULES = `OUTPUT RULES:
1. "narrative": STRICT LENGTH: exactly 6-8 sentences, no more. Read aloud by the facilitator in ~60-90 seconds. Weave only the 4-5 most consequential events into a coherent dramatic briefing. Every sentence should move the story forward. Do NOT exceed 8 sentences.
2. "headlines": 4-6 punchy one-line news headlines (ALL CAPS style, like newspaper front page). These appear on the projected screen while the facilitator narrates.
3. Do NOT include any game mechanics (probabilities, dice rolls, compute numbers) in the narrative or headlines. Write as if narrating real-world events.`;

export function buildNarrativeFromEventsPrompt(args: {
  round: number;
  roundLabel: string;
  roundTitle: string;
  resolvedEvents: ResolvedEvent[];
  worldStateBefore: Record<string, number>;
  worldStateAfter: Record<string, number>;
  previousRounds?: { number: number; label: string; narrative?: string }[];
}) {
  const publicEvents = args.resolvedEvents.filter((e) => e.visibility === "public");
  const covertEvents = args.resolvedEvents.filter((e) => e.visibility === "covert");

  const sections = [
    `You are the narrator for an AGI tabletop exercise. Your ONLY job is to write a compelling story and headlines from the events that have already been resolved. Do NOT reason about game mechanics, probabilities, or compute — that work is already done.

ROUND ${args.round}: ${args.roundLabel} — "${args.roundTitle}"

World state moved from: ${formatWorldStateDelta(args.worldStateBefore, args.worldStateAfter)}`,

    formatPreviousRounds(args.previousRounds ?? []) || null,

    `PUBLIC EVENTS (weave these into the narrative):
${publicEvents.length > 0 ? publicEvents.map((e) => `- ${e.description}`).join("\n") : "- No major public events"}`,

    formatCovertEventsSection(covertEvents),
    NARRATIVE_OUTPUT_RULES,
  ];

  return sections.filter(Boolean).join("\n\n");
}

// ─── LEGACY NARRATIVE PROMPT (kept for backward compat with rounds resolved before the split) ───

/** @deprecated Use buildResolvePrompt + buildNarrativeFromEventsPrompt instead */
export function buildNarrativePrompt(args: {
  round: number;
  roundLabel: string;
  roundTitle: string;
  worldState: Record<string, number>;

  resolvedActions: ResolvedAction[];
  labs: Lab[];
  roleCompute?: { roleId: string; roleName: string; computeStock: number }[];
  aiDisposition?: { label: string; description: string };
  previousRounds?: { number: number; label: string; narrative?: string; worldStateAfter?: Record<string, number> }[];
}) {
  const legacyRoleCompute = (args.roleCompute ?? []).length > 0
    ? `NON-LAB COMPUTE STATUS:\n${(args.roleCompute ?? []).map((r) => `- ${r.roleName}: ${r.computeStock}u`).join("\n")}`
    : null;

  const sections = [
    SCENARIO_CONTEXT,

    `ROUND ${args.round}: ${args.roundLabel} — "${args.roundTitle}"

CURRENT WORLD STATE (before this round's events):
${formatWorldState(args.worldState)}

LAB STATUS (use these ACTUAL multiplier values in your narrative):
${formatLabAllocations(args.labs)}`,

    formatPreviousRounds(args.previousRounds ?? []) || null,
    formatActionsSection(args.resolvedActions),

    args.aiDisposition
      ? `AI SYSTEMS SECRET DISPOSITION: ${args.aiDisposition.label}\n${args.aiDisposition.description}\nFactor this into how AI-related events unfold. Do NOT reveal the disposition directly.`
      : null,

    `NARRATIVE RULES:
1. CONFLICT RESOLUTION: If multiple actors attempted conflicting actions and both succeeded, narrate the conflict as an escalation, standoff, or partial outcomes.
2. STAY ON THE RAILS: The AI 2027 trajectory is the baseline. Capability should generally increase.
3. WORLD STATE UPDATES: Each dial should change by at most ±2 per round. Capability should trend upward.
4. TRAJECTORY: Assess RACE ENDING vs SLOWDOWN ENDING based on alignment (${args.worldState.alignment}/10).
5. Round ${args.round} expectations:
${formatRoundExpectations(args.round)}
6. COMPUTE AND R&D UPDATES:
   ${formatComputeDistribution(args.round)}
   R&D MULTIPLIER: Can ONLY go up or stay flat, except for explicit Safer model pivots.
   Output updates for all tracked labs.
7. NON-LAB COMPUTE: Output roleComputeUpdates for non-lab players whose compute changed.`,

    legacyRoleCompute,

    `OUTPUT FORMAT:
- "narrative": STRICT LENGTH: exactly 6-8 sentences. Weave only the 4-5 most consequential player actions into a coherent dramatic briefing.
- "headlines": 4-6 punchy one-line news headlines (ALL CAPS style).`,
  ];

  return sections.filter(Boolean).join("\n\n");
}
