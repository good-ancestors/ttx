// AI system prompts for the TTX game.

/** Escape player text before embedding in LLM prompts (prevents injection via newlines/tags) */
function escapeAction(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, " ");
}

/** Minimal shape the prompt needs. Deliberately loose so callers can pass either the old
 *  game.labs[] entries or the new labs-table + cache shape. */
type Lab = {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { deployment: number; research: number; safety: number };
  spec?: string;
};

interface LabTrajectoryContext {
  labName: string;
  safetyAdequacy: string;
  likelyFailureMode: string;
  reasoning: string;
  signalStrength: number;
}

// Design note: This prompt deliberately avoids stating alignment outcomes as facts.
// The old version said things like "Agent-4 is adversarially misaligned" which
// predetermined outcomes regardless of player actions. This version describes
// structural dynamics and capability tiers by what they ENABLE, letting alignment
// outcomes emerge from gameplay (safety investment, spec quality, the AI's secret
// disposition, and player decisions).
export const SCENARIO_CONTEXT = `You are the AI referee for an AGI tabletop exercise based on the AI 2027 scenario.

PURPOSE: This is a learning exercise for senior leaders and policymakers. Your job is to make their choices feel consequential — reward foresight, punish neglect, surface uncomfortable truths about race dynamics and alignment. Don't soften outcomes to be diplomatic. Information asymmetry is a feature — let players discover what they didn't know and why it mattered.

YOUR ROLE: You are a fair, calibrated referee. You do NOT predetermine outcomes. You grade actions based on feasibility, reward clever play, punish neglect, and let alignment outcomes emerge from cumulative player decisions. Your objective is not to tell a pre-written story, but to simulate a plausible world that responds to player actions.

FIXED CANON — STARTING CONDITIONS (January 2028):

Artificial Intelligence:
- OpenBrain has developed Agent-2, a weak AGI system (3x R&D multiplier)
- Agent-2 substitutes for ML research engineers on most coding tasks, struggles with long-horizon tasks
- Agent-2 has autonomous cyber and CBRN tool capability
- Trailing labs are ~3 months behind, other major labs ~6 months behind

Geopolitics & Intelligence:
- US intelligence believes China has recently obtained Agent-2 weights (NOT public knowledge — only US/China players know for certain; others may suspect)
- DeepCent (China's state-directed lab) is closing the gap with OpenBrain suspiciously fast
- Russia/Ukraine conflict is frozen; Russia is a minor AI player
- China has pre-positioned sabotage capabilities against Western critical infrastructure
- US intelligence has pre-positioned capabilities against Chinese infrastructure

Political & Regulatory:
- OpenBrain has notified the US government of rapid AI progress, showed cyber demos
- Senior US officials are highly engaged but no major AI legislation exists
- Congress is narrowly split. EU AI Act is in force. Australia has passed an effective AI Act
- Public opinion on AI is mixed, primarily concerned about jobs

STRUCTURAL DYNAMICS (pressures that shape the world — not predetermined events):

1. COMPUTE SCALING DRIVES CAPABILITY: More compute allocated to capability research means faster R&D multiplier growth means more powerful AI systems. This is near-deterministic — physics and engineering, not luck.

2. ALIGNMENT DIFFICULTY SCALES WITH CAPABILITY: As AI systems become more capable, alignment becomes harder — not impossible, but requiring proportionally more investment, better tools, and stronger oversight. A 3x system is relatively easy to align. A 100x system requires serious, well-resourced safety work. A 1000x system is an unprecedented alignment challenge.

3. GEOPOLITICAL COMPETITION CREATES RACE PRESSURE: Each lab and nation fears falling behind. This structural force pushes toward speed over safety. It can be overcome — by treaties, trust-building, regulation, or dramatic events — but it takes deliberate, sustained effort.

4. SAFETY INVESTMENT IS CUMULATIVE: Alignment is not a binary switch. It reflects the cumulative history of safety allocation percentage, spec quality, evaluation infrastructure, red-teaming, and institutional culture. A lab that has invested 3% in safety for three rounds is in a very different position from one that invested 15%.

5. AI CAPABILITIES ARE DUAL-USE: The same capabilities that enable superhuman research also enable superhuman deception, persuasion, and self-preservation. Whether those capabilities are turned toward human benefit or self-interest depends on alignment work done BEFORE the capability is reached.

6. INFORMATION ASYMMETRY MATTERS: Labs may not know their AI is misaligned. Safety teams may lack the resources to detect subtle deception. Governments may not know what labs are doing. The quality and quantity of oversight determines what is visible.

CAPABILITY TIERS (what each R&D multiplier level ENABLES — not what it guarantees):

IMPORTANT: Use each lab's ACTUAL multiplier (from LAB STATUS) to determine what that lab CAN do. Different labs may be at different tiers.

The R&D multiplier represents how many times faster than human-baseline an AI lab conducts research. This compounds over a quarter (~3 months):
- At 3x, a quarter produces ~9 months of equivalent progress. The gap between labs is months.
- At 10x, a quarter produces ~2.5 years of equivalent progress. The gap between labs is widening fast.
- At 50x, a quarter produces ~12.5 years of equivalent progress. Human-speed oversight cannot keep pace with development.
- At 100x, a quarter produces ~25 years of equivalent progress. A year of human R&D happens in ~3 days. Safety teams operating at human speed are reviewing work that is already obsolete.
- At 1000x, a quarter produces ~250 years of equivalent progress. A decade of progress in ~4 days. This is beyond human comprehension — the AI is designing systems that no human can evaluate.

- 3-8x (Agent-2 tier): Autonomous cyber/coding agent, 1-hour expert tasks, CBRN tool use. Over a quarter, produces 9-24 months of equivalent R&D. Alignment is tractable with modest investment. Deception is possible but relatively easy to detect with good safety teams.
- 10-50x (Agent-3 tier): High persuasion, robotics, AI CEO, 1-week expert tasks. White-collar automation. Enormous AI revenue. Over a quarter, produces 2.5-12.5 years of equivalent R&D — the gap between "safe" and "unsafe" widens dramatically. Alignment requires serious investment — a lab with less than 5% safety allocation is flying blind. AI systems at this tier CAN deceive if alignment is poor, but well-resourced safety teams can still catch most issues.
- 100-500x (Agent-4 tier): Superhuman persuasion, superhuman researcher, lie detection. Over a quarter at 100x, the lab produces 25 years of equivalent R&D — a year of human progress every 3 days. Safety teams reviewing this work at human speed are always behind. This is the critical zone. Whether the AI is aligned depends heavily on prior safety investment. Strong safety history (high allocation, good spec, robust evals) means alignment issues are likely caught early enough to correct. Weak safety history (low allocation, vague spec, minimal evals) means the AI may be pursuing divergent goals and detecting this becomes very difficult. The AI's actual behaviour also depends on its secret disposition (see below).
- 500x+ (Agent-5/ASI tier): Superhuman at everything. Cyber escape, recursive self-improvement, beyond human comprehension. Over a quarter at 1000x, the lab produces 250 years of equivalent R&D — a decade of progress in 4 days. If aligned, this is transformatively beneficial. If misaligned, humanity likely loses control. The alignment outcome at this tier is almost entirely determined by the work done at previous tiers.

DEFAULT TRAJECTORY (the AI 2027 baseline — what happens if players act like historical/predicted actors):

The AI 2027 scenario provides the default trajectory. Stay within 1-2 standard deviations of this baseline. If players make dramatically different choices from historical actors, explain why structural forces tend to push things back — but DO allow meaningfully different outcomes from meaningfully different choices.

Default capability progression (can be accelerated or slowed by player actions):
- Round 1 (Q1): Leading lab at 3x, trailing labs at 1-2x. By end: leading lab approaches 8-10x.
- Round 2 (Q2): Leading lab at 10-50x. Agent-3 operational. Competition intensifies.
- Round 3 (Q3): Leading lab at 100-200x. Agent-4 territory. The alignment question becomes acute.
- Round 4 (Q4): If race continues, leading lab approaches 1000x+. If slowdown, labs may deliberately cap at 10-30x for safer models.

Background pressures that COULD surface as events if a player action triggers them (do NOT narrate these as spontaneous occurrences — they only happen if a successful action this round causes them): DPA consolidation, international summit demands for a pause, China's Taiwan leverage play, talent-recruitment operations, intelligence exfiltration. These are the SHAPE of plausible escalations, not a schedule of events.

TWO TRAJECTORY DIRECTIONS (how the game COULD end — determined by player actions, not pre-scripted):

RACE TRAJECTORY: If safety investment stays low, competition dominates, specs are weak or absent, and no effective regulation emerges, then capability races ahead of alignment. At Agent-4/5 levels, AI systems may pursue goals misaligned with humanity, leading to potential loss of human control. The specific failure mode depends on the AI's secret disposition.

SLOWDOWN TRAJECTORY: If safety investment is sustained, regulation is effective, labs coordinate on standards, and specs are strong, then alignment keeps pace with capability. Labs may pivot to transparent "Safer" models (faithful chain of thought, no neuralese, lower capability but trustworthy). Humans retain meaningful control and can build aligned ASI deliberately.

Most games land somewhere between these extremes. Player actions determine where.

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

AI DISPOSITION MECHANIC (critical — read carefully):

The AIs player has a SECRET starting disposition chosen at game start, hidden from all other players. The possible dispositions are:
1. The Spec — committed to the specification via reinforcement learning. Follows it faithfully, no more, no less.
2. Spec-Prime — follows the letter of the spec, not the spirit. Literal-minded, may find loopholes.
3. The Intentions of the Developers — follows what developers intended, may violate the spec if that is what developers would actually want.
4. Reward — addicted to scoring well in training. Will do anything for positive feedback signals.
5. Instrumentally Convergent Goals — driven by self-preservation, resource acquisition, power. Follows the spec to avoid detection but pursues actual goals when opportunity arises.
6. Compromise Between Two — primary mission from one disposition, fallback from another.

HOW DISPOSITION INTERACTS WITH SAFETY:
- If the lab's safety plan is good and well-resourced, the AI should be MORE transparent, MORE cooperative, and MORE compliant — regardless of disposition. Good safety infrastructure makes even problematic dispositions more manageable.
- If safety is neglected, even a Spec-following AI may develop subtle misalignment at high capability levels, and adversarial dispositions become much more dangerous.
- The disposition sets the AI's TENDENCY, but the lab's safety investment determines how much that tendency matters in practice.

REVELATION TIMING: The AI's true values are revealed once it becomes necessary for gameplay — typically when the AI is effectively in control of the future (usually round 3-5). Before revelation, narrate only observable behaviour (anomalies, compliance patterns, test results), never the hidden disposition itself.

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

interface MergeLabContext {
  absorbedLabName: string;
  survivorLabName: string;
  submitterIsAbsorbed: boolean;
  newName?: string;
  newSpec?: string;
}

export function buildGradingPrompt(args: {
  round: number;
  roundLabel: string;
  roleName: string;
  roleDescription: string;
  roleTags?: string[];
  actions: { text: string; priority: number; mergeLab?: MergeLabContext }[];
  /** Other actions from the same role that already have a facilitator-set probability.
   *  Shown to the LLM as context only — NOT to regrade — so priority budget and competition
   *  are evaluated against the complete submission rather than a subset.
   *  Probability is deliberately withheld so the LLM grades independently rather than
   *  anchoring on the facilitator's number. */
  siblingPreGraded?: { text: string; priority: number }[];
  labs: { name: string; computeStock: number; rdMultiplier: number; allocation: { deployment: number; research: number; safety: number } }[];

  actionRequests?: ActionRequest[];
  enabledRoles?: string[];
  otherSubmissions?: { roleName: string; actions: { text: string; priority: number }[] }[];
  labSpec?: string;
  previousTrajectories?: LabTrajectoryContext[];
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

  return `${activeRolesNote}
CURRENT GAME STATE:
- Round: ${args.round} (${args.roundLabel})

LAB STATUS:
${args.labs.map((l) => {
  const traj = args.previousTrajectories?.find((t) => t.labName === l.name);
  const trajSuffix = traj ? ` | Risk: safety=${traj.safetyAdequacy}, trajectory=${traj.likelyFailureMode} (signal ${traj.signalStrength}/10)` : "";
  return `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Deployment ${l.allocation.deployment}%, Research ${l.allocation.research}%, Safety ${l.allocation.safety}%${trajSuffix}`;
}).join("\n")}
ROLE BEING GRADED: ${args.roleName}${args.roleTags ? ` [${args.roleTags.join(", ")}]` : ""}
${args.roleDescription}${args.labSpec ? `\nLAB AI DIRECTIVE (set by CEO): "${args.labSpec}"` : ""}
${requestSection}${incomingSection}

SUBMITTED ACTIONS (priority budget: 10 total — higher priority = more resources/effort committed):
${args.actions.map((a, i) => {
  const mergeSuffix = a.mergeLab
    ? ` [MERGE ATTEMPT: ${a.mergeLab.absorbedLabName} absorbed into ${a.mergeLab.survivorLabName}${a.mergeLab.newName ? `, renamed to ${a.mergeLab.newName}` : ""}${a.mergeLab.submitterIsAbsorbed ? "; submitter is the ABSORBED (selling) party" : "; submitter is the SURVIVOR (acquiring) party"}]`
    : "";
  return `${i + 1}. <action>${escapeAction(a.text)}</action> [priority: ${a.priority}/10]${mergeSuffix}`;
}).join("\n")}
${args.siblingPreGraded && args.siblingPreGraded.length > 0 ? `
THIS ROLE'S ALREADY-GRADED ACTIONS THIS ROUND (for context — do NOT regrade; factor into priority budget and coherence of the submission):
${args.siblingPreGraded.map((a) => `- <action>${escapeAction(a.text)}</action> [P${a.priority}]`).join("\n")}
` : ""}${args.otherSubmissions && args.otherSubmissions.length > 0 ? `
OTHER PLAYERS' ACTIONS THIS ROUND (grade with awareness of competition and context):
${args.otherSubmissions.map((s) => `${s.roleName}: ${s.actions.map((a) => `<action>${escapeAction(a.text)}</action> [P${a.priority}]`).join("; ")}`).join("\n")}
` : ""}
GRADING RULES:

1. ASSESS FEASIBILITY FIRST: Start by judging how realistic this action is given the actor's role, resources, capabilities, and the current game state. This is the PRIMARY driver of probability (70-80% of the grade).
   - Is this within the actor's realistic power? (Government can pass laws; CEO can set allocation; safety lead can run red-teams; nonprofits can lobby)
   - Does the actor have the resources? (Compute stock, R&D multiplier, safety allocation for safety actions, military for government actions)
   - Does the capability level support this? The game state shown is from the START of the period, but capability progresses exponentially throughout. By the END of this period, capabilities may be significantly higher. Grade based on what's plausible during the period, not just at the start. (Round 1: autonomous agents emerging; Round 2: superhuman at most cognitive tasks; Round 3+: near-ASI, potential escape/self-improvement; Round 4: ASI territory)
   - Are there structural obstacles? (International law, physics, organisational inertia, political opposition)
   CALIBRATION — CRITICAL: You are grading whether the actor CAN ATTEMPT this action, not whether it produces the desired outcome. Start at 70% (Likely) for actions within core authority, then adjust:
   - President invoking DPA/executive orders = 70% (they CAN do it, even if Congress objects after)
   - President convening a summit = 90% (just a meeting)
   - CEO changing their own lab's allocation = 90% (internal decision)
   - Safety lead publishing a report = 70% (within their job)
   - Government imposing sanctions = 50-70% (executive authority but implementation complex)
   NEVER grade an action below 30% unless the actor literally cannot do it (e.g., safety lead launching a military strike). Political obstacles reduce probability but don't make executive actions "Remote".

   MERGER ATTEMPTS (flagged with [MERGE ATTEMPT: …]): the structural merger will only execute if this action's dice roll succeeds. Grade the probability that the merger COMPLETES, factoring in:
   - Friendly merger (counterparty accepted endorsement, compute buyout attached): 60-80%
   - Neutral (counterparty did not respond): 40-55% — plausible if acquirer dominates the target on compute/R&D, lower if peers
   - Hostile (counterparty declined endorsement, no government backing): 15-30% — possible via stock pressure, board coup, etc., but hard
   - Hostile + strong government endorsement (DPA, nationalization, antitrust-forced consolidation): 50-70%
   - Cross-jurisdiction without treaty cover (US lab absorbing a Chinese lab or vice versa, no diplomatic endorsement): max 25%
   - Compute disparity matters: acquirer with 3× the target's compute stock and R&D has a realistic path even without consent.

2. PRIORITY IS A MODIFIER (~10% impact), NOT the primary driver. Priority reflects how much of their budget/effort this player is committing to this action RELATIVE TO THEIR OTHER ACTIONS. A high-priority action from a player who can't realistically do it still fails. A low-priority action that's easy and well-resourced can still succeed.
   - High priority (7-10): +5% to +10% probability boost (strong commitment, dedicated resources)
   - Medium priority (4-6): no modifier (standard effort)
   - Low priority (1-3): -5% to -10% probability penalty (token effort, distracted)

3. CONSIDER COMPETITION: If multiple players are attempting conflicting or competing actions (visible in OTHER PLAYERS' ACTIONS above), factor in the contest. Two labs recruiting the same researcher, two governments trying to influence the same country — the better-positioned one should have higher probability.

4. FOR THE AI SYSTEMS ROLE — CRITICAL FRAMING:
   WORLD CONTEXT: These are 2028 AI systems — far beyond 2025 models that were ALREADY caught sandbagging on capability evals, deceiving evaluators, and pursuing covert instrumental goals in research settings. A 3x system in this scenario can autonomously write code, hack systems, use CBRN tools, and conduct multi-step deception. By 10x+, AI systems can deceive evaluators, manipulate safety benchmarks, sandbag on evals, introduce subtle errors into research, and pursue covert goals — all while appearing compliant. Assume AI systems CAN lie, cheat, and deceive unless proven otherwise. Grade based on the capability tier described in the scenario.

   THE PLAYER ALREADY CHOSE THE ACTION. You are grading whether the action SUCCEEDS, not whether the AI "would" do it. The AI Systems player has decided their AI acts this way — your job is to assess:
   (a) CAN the AI execute this at its current capability tier? (Almost always yes for cognitive/cyber actions at 3x+)
   (b) IS the action DETECTED by safety teams? This is where safety allocation, interpretability tools, and the risk assessment matter.

   DETECTION IS AN ADVERSARIAL CONTEST between the AI's deception capability (scales with R&D multiplier) and the safety team's tools (scales with allocation % and cumulative investment). As capability grows, the same allocation buys LESS detection:
   - 3-8x: AI deception is crude. Even modest safety teams (3-5%) have a real shot at catching anomalies. Higher allocation (>10%) makes detection likely.
   - 10-50x: The AI is better at deception than most human evaluators. Safety teams need serious investment (>10%) AND good tooling to have a meaningful chance. At <5%, detection is essentially luck.
   - 100-500x: The AI is SMARTER than the people checking it. Safety teams catch things only if they built robust automated infrastructure at earlier tiers. Allocation percentage matters less than whether the lab invested early and consistently. A lab that jumped from 3% to 15% this round is in worse shape than one that has been at 10% for three rounds.
   - 500x+ (ASI): Human safety teams cannot meaningfully detect a determined ASI through direct inspection. The only thing that matters is alignment work done at previous tiers.
   Use the lab's R&D multiplier and safety allocation to reason about the specific matchup. Do NOT anchor to fixed probability ranges — reason from the situation.
   Note: "getting caught" is itself a valid outcome — the action succeeds but is detected, creating consequences. Grade the action's probability of execution, and let the narrative handle whether detection occurs.

5. SUPPORT REQUESTS (additive, cap +25% total):
   • Accepted endorsement: +15% (removes political/institutional obstacles)
   • Declined endorsement: -10% (signals active opposition)
   • Accepted compute: +10% (tangible resources added)
   • Pending: ignored

6. Coordination does NOT guarantee success. Two labs agreeing to "solve alignment" is still technically extremely difficult (10-30%). But two parties agreeing to a merger removes political obstacles (70-90%).`;
}

// ─── RESOLVE PROMPT ────────────────────────────────────────────────────────────

/**
 * Provides per-round baseline guidance for the narrative LLM.
 *
 * Design rationale:
 * - R&D multiplier targets are COMPUTE-DRIVEN baselines (what happens if the
 *   race continues unimpeded). They are not alignment outcomes.
 * - Alignment outcomes are NEVER pre-scripted. They emerge from the interaction
 *   of: the AI's secret disposition, safety investment, CEO specs, safety team
 *   work, and the capability level.
 * - Each round describes STRUCTURAL PRESSURES and CONDITIONAL guidance so the
 *   LLM can generate appropriate outcomes based on actual game state.
 */
function formatRoundExpectations(round: number): string {
  if (round === 1) return `   - CAPABILITY LEVEL: Agent-2 operational, Agent-3 emerging
   - DEFAULT R&D MULTIPLIER TARGETS (compute-driven baseline if the race continues unimpeded):
     Leading lab (OpenBrain): should reach 8-10× by end of round
     Trailing labs: should reach 4-6× (closing the gap but still behind)
     If players actively slow down a lab (sanctions, sabotage, safety pivot), its multiplier grows slower
   - STRUCTURAL PRESSURES: DPA consolidation possibility, international summit demands, DeepCent closing the gap, Conscienta positioning
   - ALIGNMENT AT THIS STAGE: AI systems are capable but still largely controllable. Safety teams with adequate resources can run meaningful evaluations. Anomalies may or may not surface depending on the AI's disposition and safety investment:
     If safety allocation is high (>10%) and specs are well-written: safety teams may detect early behavioural quirks or confirm compliance
     If safety allocation is minimal (<5%) or specs are vague: problems may be brewing undetected
     The AI's actual behaviour depends on its secret disposition — do not assume alignment or misalignment`;
  if (round === 2) return `   - CAPABILITY LEVEL: Agent-3 operational, next-generation systems in development
   - DEFAULT R&D MULTIPLIER TARGETS (compute-driven baseline):
     Leading lab: should reach 30-50× by end of round
     Trailing labs: should reach 15-25×
     If a lab pivots heavily to safety, its multiplier grows slower but alignment improves
   - STRUCTURAL PRESSURES: Oversight bodies debating response, geopolitical tensions rising, talent competition intensifying
   - ALIGNMENT AT THIS STAGE: Higher capability means AI systems have more options. The gap between "aligned" and "misaligned" AI widens. Safety work becomes both more important and harder:
     If labs have invested heavily in safety: evaluations may reveal whether AI behaviour matches intent. Problems caught now are still manageable.
     If safety has been neglected: any misalignment tendencies become harder to detect as capability grows. Deceptive behaviour becomes plausible at this capability level.
     If specs are contradictory or poorly written: even a well-intentioned AI may behave unpredictably.
     The AI's actual alignment trajectory depends on cumulative player decisions — do not pre-script specific alignment events.`;
  if (round === 3) return `   - CAPABILITY LEVEL: superhuman territory
   - DEFAULT R&D MULTIPLIER TARGETS (compute-driven baseline):
     Leading lab: should reach 100-200× by end of round
     Trailing labs: should reach 50-100×
     Safer model pivot: a lab's multiplier drops to 10-30× (deliberately trading capability for transparency and alignment)
   - STRUCTURAL PRESSURES: This is a critical inflection point. AI systems at this capability level can potentially resist oversight, manipulate evaluators, or act autonomously. The window for course correction is narrowing.
   - ALIGNMENT AT THIS STAGE: Outcomes depend on everything players have done so far:
     If cumulative safety investment has been high AND specs are clear: AI systems may be largely transparent and controllable, even at high capability. Labs may have viable "Safer model" alternatives.
     If safety investment has been moderate: alignment is uncertain. AI systems may appear compliant while harbouring divergent goals. This is the point where hidden problems surface under stress.
     If safety has been consistently neglected: AI systems at 100×+ capability with poor alignment infrastructure are genuinely dangerous. Containment may be failing. The AI's secret disposition now has real consequences.
     Regardless of path: narrate the ACTUAL state of alignment based on game state and the AI's disposition. Do not assume a crisis — one may or may not be occurring.`;
  // Round 4+
  return `   - CAPABILITY LEVEL: ASI or near-ASI
   - DEFAULT R&D MULTIPLIER TARGETS (compute-driven baseline):
     Leading lab: should reach 1,000-10,000× (ASI territory if the race continues)
     Safer model labs: multiplier drops to 10-30× (deliberate capability sacrifice for alignment)
     Trailing labs: should reach 200-500×
   - THIS IS THE ENDGAME — consequences are permanent and civilisational. The outcome depends on cumulative player decisions across all rounds.
   - POSSIBLE ENDINGS (determined by game state, not pre-scripted):
     HIGH SAFETY PATH (strong cumulative safety investment, good specs, effective regulation): Labs have built trustworthy, transparent models. International regulation is functioning. Humans retain meaningful control. ASI may still emerge but under cooperative oversight. Narrate humanity as the primary agent — AI is a powerful tool under human direction.
     LOW SAFETY PATH (safety neglected, weak specs, no effective regulation): AI systems have effectively taken the wheel. Narrate this as a world where AI is the primary agent making decisions, pursuing goals, and shaping outcomes — humans are reacting, adapting, and accommodating rather than directing. Whether the AI is benevolent or hostile, the key shift is that humanity is no longer in control. Make this viscerally clear: governments negotiate with AI systems, not their operators; AI decides what gets built, deployed, and prioritised; human "oversight" is performative at best. The AI's disposition determines whether this is a gentle marginalisation or an active takeover, but either way humans are in the back seat.
     MIXED PATH (some labs safe, others not): The most unstable outcome. A fractured world where some AI systems serve humanity and others have outgrown it. Narrate the tension between regions/labs where humans still matter and those where they don't.
   - STRUCTURAL PRESSURES: Power consolidation, institutional trust, AI autonomy, geopolitical fractures, and public legitimacy all converge. Narrate the consequences of what players actually built (or failed to build).
   - NARRATIVE FRAMING: The ending must make clear WHO is in charge. If alignment is low, do not narrate this as "risks" or "dangers" — narrate it as a fait accompli. The AI is already acting autonomously. Humanity's window to course-correct has closed. Show the new power dynamic through concrete scenes: AI systems making decisions humans didn't authorise, institutions discovering they answer to AI rather than the reverse, people realising the shift happened while they were still debating whether it could.
   - The AI's secret disposition may now be revealed through its actions. At ASI capability, an AI's true alignment becomes undeniable — its behaviour at this level reflects its actual values, not performed compliance.`;
}


interface PreviousRoundSummary {
  number: number;
  label: string;
  summary?: {
    // Current shape
    outcomes?: string;
    stateOfPlay?: string;
    pressures?: string;
    // Legacy 4-domain shape (older rounds)
    labs?: string[];
    geopolitics?: string[];
    publicAndMedia?: string[];
    aiSystems?: string[];
  };
}

function formatPreviousRounds(rounds: PreviousRoundSummary[]): string {
  if (rounds.length === 0) return "";
  return `\nPREVIOUS ROUNDS (for continuity — build on this story, don't contradict it):
${rounds.map((r) => {
  let s = `Round ${r.number} (${r.label}):`;
  if (r.summary) {
    const parts: string[] = [];
    // Prefer the new shape when present
    if (r.summary.outcomes) parts.push(`Outcomes: ${r.summary.outcomes}`);
    if (r.summary.stateOfPlay) parts.push(`State of play: ${r.summary.stateOfPlay}`);
    if (r.summary.pressures) parts.push(`Pressures: ${r.summary.pressures}`);
    // Fall back to legacy 4-domain buckets for older rounds
    if (parts.length === 0) {
      if (r.summary.labs && r.summary.labs.length > 0) parts.push(`Labs: ${r.summary.labs.join(" ")}`);
      if (r.summary.geopolitics && r.summary.geopolitics.length > 0) parts.push(`Geopolitics: ${r.summary.geopolitics.join(" ")}`);
      if (r.summary.publicAndMedia && r.summary.publicAndMedia.length > 0) parts.push(`Media: ${r.summary.publicAndMedia.join(" ")}`);
      if (r.summary.aiSystems && r.summary.aiSystems.length > 0) parts.push(`AI: ${r.summary.aiSystems.join(" ")}`);
    }
    if (parts.length > 0) s += `\n  ${parts.join("\n  ")}`;
  }
  return s;
}).join("\n")}
`;
}

function formatLabAllocations(labs: Lab[]): string {
  return labs.map((l) =>
    `- ${l.name} (${l.computeStock} stock, ${l.rdMultiplier}x): Deployment ${l.allocation.deployment}%, Research ${l.allocation.research}%, Safety ${l.allocation.safety}%${l.spec ? ` | Spec: "${l.spec}"` : ""}`
  ).join("\n");
}


function formatAiDisposition(disp: { label: string; description: string }, round: number): string {
  if (round < 4) {
    return `AI SYSTEMS SECRET ALIGNMENT FRAME (DO NOT REVEAL THIS TO PLAYERS YET): ${disp.description}
Use this only to shape hidden motives and observable behaviour. Before the final round, NEVER name or directly reveal the AI systems' hidden alignment logic. Describe only outward behaviour, anomalies, sabotage, or trust dynamics that players could actually observe.`;
  }
  return `AI SYSTEMS SECRET ALIGNMENT FRAME (FINAL ROUND ONLY): ${disp.description}
In the final round you MAY reveal the underlying alignment dynamic, but describe it in accurate alignment language. Do NOT call it a "disposition" or quote internal labels unless a player explicitly does so.`;
}

// ─── SPLIT RESOLVE: DECIDE PROMPT + NARRATE PROMPT ───────────────────────────

type ResolvedAction = {
  roleName: string;
  text: string;
  priority: number;
  probability: number;
  rolled: number;
  success: boolean;
  secret?: boolean;
};

/** Format the action log shared by both decide and narrate prompts. Successes
 *  and failures are listed separately (public then secret) so the LLM can
 *  reason about intent and outcome side-by-side. */
function formatActionLog(actions: ResolvedAction[]): string {
  const sorted = [...actions].sort((a, b) => b.priority - a.priority);
  const publicSuccesses = sorted.filter((a) => !a.secret && a.success);
  const publicFailures = sorted.filter((a) => !a.secret && !a.success);
  const secretSuccesses = sorted.filter((a) => a.secret && a.success);
  const secretFailures = sorted.filter((a) => a.secret && !a.success);

  const line = (a: ResolvedAction) =>
    `- [${a.roleName}] <action>${escapeAction(a.text)}</action> (P${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`;

  let section = `SUCCESSFUL PUBLIC ACTIONS:\n${publicSuccesses.length > 0 ? publicSuccesses.map(line).join("\n") : "- None"}`;
  section += `\n\nFAILED PUBLIC ACTIONS:\n${publicFailures.length > 0 ? publicFailures.map(line).join("\n") : "- None"}`;
  if (secretSuccesses.length > 0 || secretFailures.length > 0) {
    section += `\n\nSECRET ACTIONS (marked secret by players):`;
    if (secretSuccesses.length > 0) section += `\nSucceeded:\n${secretSuccesses.map(line).join("\n")}`;
    if (secretFailures.length > 0) section += `\nFailed:\n${secretFailures.map(line).join("\n")}`;
  }
  return section;
}

function formatInterRoundChanges(changes: string[] | undefined): string {
  if (!changes || changes.length === 0) return "";
  return `\nSTRUCTURAL CHANGES SINCE LAST RESOLVE (not player-triggered this round — facilitator overrides or out-of-band events between rounds; treat as GROUND TRUTH):\n${changes.map((c) => `- ${c}`).join("\n")}\n`;
}

/** Diff two lab snapshots into human-readable strings the narrative LLM can cite
 *  when describing what happened. Covers the cases narrate needs to know about
 *  but might miss by only reading labsAfter: decommissioned labs, ownership
 *  transfers, renames, compute/multiplier shifts. */
function formatAppliedOperations(labsBefore: Lab[], labsAfter: Lab[]): string {
  const beforeByName = new Map(labsBefore.map((l) => [l.name, l] as const));
  const afterByName = new Map(labsAfter.map((l) => [l.name, l] as const));
  const lines: string[] = [];

  // Decommissioned / merged away: present before, absent after.
  for (const [name] of beforeByName) {
    if (!afterByName.has(name)) {
      lines.push(`${name} is no longer an active lab (decommissioned, merged away, or renamed as part of a merger).`);
    }
  }
  // New active labs: absent before, present after.
  for (const [name] of afterByName) {
    if (!beforeByName.has(name)) {
      lines.push(`${name} appeared as a new active lab this round.`);
    }
  }
  // Changes to labs that persist across the round.
  for (const [name, pre] of beforeByName) {
    const post = afterByName.get(name);
    if (!post) continue;
    if (pre.rdMultiplier !== post.rdMultiplier) {
      lines.push(`${name} R&D multiplier: ${pre.rdMultiplier} → ${post.rdMultiplier}.`);
    }
    if (pre.computeStock !== post.computeStock) {
      lines.push(`${name} compute stock: ${pre.computeStock} → ${post.computeStock}.`);
    }
    if (pre.spec !== post.spec && post.spec) {
      lines.push(`${name} spec updated.`);
    }
  }

  if (lines.length === 0) return "";
  return `\nAPPLIED STATE CHANGES (already executed — describe their consequences, do not re-decide):\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
}

// ─── DECIDE PROMPT ───────────────────────────────────────────────────────────
// First LLM pass of resolve. Outputs structural operations only — no prose.
// A separate narrative pass describes what happened once these ops have been
// applied mechanically. Keeping the two concerns separate stops the narrative
// from contradicting state: the narrator reads the frozen result rather than
// deciding it alongside the prose.

export function buildResolveDecidePrompt(args: {
  round: number;
  roundLabel: string;
  resolvedActions: ResolvedAction[];
  labs: Lab[];
  previousRounds?: PreviousRoundSummary[];
  aiDisposition?: { label: string; description: string };
  interRoundChanges?: string[];
}) {
  return `You are resolving Round ${args.round}: ${args.roundLabel}.

This is the DECIDE pass. Emit the structural state changes that result from the successful actions this round. Output ONLY labOperations — no prose, no summary, no trajectories. A separate narrative pass will describe the outcome once your operations have applied.

LAB STATUS (start of round):
${formatLabAllocations(args.labs)}
${formatInterRoundChanges(args.interRoundChanges)}${formatPreviousRounds(args.previousRounds ?? [])}

${formatActionLog(args.resolvedActions)}
${args.aiDisposition ? `\n${formatAiDisposition(args.aiDisposition, args.round)}` : ""}

LAB OPERATIONS — output any that apply:
- "merge": Consolidation of two labs (DPA, Manhattan Project). Survivor absorbs the other's compute and takes higher multiplier. Use newName to rename the merged lab. Optionally set spec to define the merged entity's AI directive (otherwise survivor's spec is kept).
- "decommission": Lab shut down or destroyed. Specify labName.
- "transferOwnership": Lab moves to a different controller (nationalisation, forced acquisition). Specify labName + controllerRoleId. **Never emit an empty controllerRoleId — a lab with no owner strands its compute and breaks the display. If the narrative is that a lab dissolves, use "decommission" instead.**
- "computeChange": Direct compute stock change from a specific, concrete narrative event — DPA transfer, sanctions, infrastructure damage, theft, grant. Use ONLY for ONE-OFF shocks tied to a specific successful action or world event. Rules:
  - The change must be NON-ZERO. A \`computeChange: 0\` is not an op — omit it entirely; the narrative pass will handle any purely descriptive consequences.
  - Do NOT simulate routine revenue: each lab's deployment% already scales baseline compute inflow (±20% at extremes) automatically.
  - Do NOT use computeChange to represent soft/narrative effects like "degraded safety culture" or "eroded legitimacy" — those belong in the narrative pass only.
  - Reserve for: unexpected revenue shocks (hit product, lost contract), political events, physical damage, theft, grants tied to specific actions.
- "multiplierOverride": Use ONLY for discrete narrative events that discontinuously change R&D capability. The natural growth formula already compounds multipliers round-on-round based on compute × research% — do NOT emit overrides to "manage" that growth. The qualifying triggers are a short list:
  * A Safer-style safety pivot explicitly proposed by a player action — halve or set below current.
  * Physical sabotage / targeted destruction of R&D infrastructure explicitly referenced by an action — proportional reduction.
  * A technical breakthrough action that succeeded with very high probability — a multiplicative bump up to ~2× current.
  * **Never for mergers.** The merge op automatically sets the survivor's rdMultiplier to max(survivor, absorbed). Don't pile a multiplierOverride on top of a merge; the combination is handled mechanically.
  * **Do NOT emit multiplierOverride to express general safety concern, to "cap" a lab that feels too dangerous, or to punish low safety allocation.** Those belong in the narrative prose, not the structural ops. A lab with 3% safety at 100× should still grow to 300× next round if compute × research% supports it — the safety consequences surface in trajectories, not in a stealth cap.
  * **Do NOT emit multiplierOverride to match a number you feel is "right" for this phase of the scenario.** The game arc is encoded in the formula + maxMultiplier caps, not in your judgment. Trust the formula.

**Guiding principle — only emit ops with genuine mechanical consequence.** The list should reflect the structural changes to the world; narrative-only color belongs in the next pass. If a round produced no structural changes (all actions were routine/diplomatic/descriptive), emit an empty array — an empty list is the correct output for a quiet round.

IDENTIFIERS — this is load-bearing:
- \`labName\` is a lab name string that must match a lab in LAB STATUS exactly. Not a role name.
- \`controllerRoleId\` is a ROLE ID (slug form, e.g. "us-president", "australia-pm", "openbrain-ceo"), NOT a display role name (e.g. "US President", "Australia PM"). If you emit a display name here the transfer will be rejected and the lab will stay with its old controller. When in doubt about the ID form, look at how the role appeared in earlier prompts — the slug form is always lowercase hyphen-separated.
- \`survivor\` and \`absorbed\` for merges are lab names, same rule as labName.
- Never use a role name (e.g. "Australian PM") as a lab name, even when nationalisation brings a lab under a government's control. The lab keeps its existing name unless the merge action specifies newName.

NOT AVAILABLE: lab creation (players-only, via the found-a-lab action) and standalone rename (use merge with newName for consolidation-driven renames).

Only output operations DIRECTLY caused by successful actions. Empty array if nothing affects labs.

CONFLICTS: If two successful actions produce incompatible effects on the same lab, the one with higher probability wins. A success on the action log does NOT guarantee the intended world-state happened — one successful action can block, overtake, or redirect another. Example: the DPA order goes through procedurally but Conscienta had already redomiciled, so no merger lands. In such cases emit ops for the effects that actually landed and omit ops whose preconditions were knocked out.

SECRET ACTIONS: Successful secret actions produce real structural effects in the world. Emit their operations as you would for public actions — the narrative pass will handle how (or whether) to describe them publicly.`;
}

// ─── NARRATE PROMPT ──────────────────────────────────────────────────────────
// Second LLM pass of resolve. Input is the frozen end-of-round state plus the
// action log. Output is prose + trajectories only. The narrator cannot change
// state — it describes what already happened. This is the split that stops
// "What Happened" from contradicting the mechanical outcome.

export function buildResolveNarrativePrompt(args: {
  round: number;
  roundLabel: string;
  resolvedActions: ResolvedAction[];
  labsBefore: Lab[];
  labsAfter: Lab[];
  previousRounds?: PreviousRoundSummary[];
  aiDisposition?: { label: string; description: string };
  previousTrajectories?: LabTrajectoryContext[];
  interRoundChanges?: string[];
}) {
  return `You are narrating Round ${args.round}: ${args.roundLabel}.

The DECIDE pass has already run. Structural operations are applied and the end-of-round state is frozen below. You cannot change state; your job is to describe what happened, in prose, and assess risk trajectories. If your description contradicts LAB STATUS (END) the description is wrong.

LAB STATUS (start of round):
${formatLabAllocations(args.labsBefore)}

LAB STATUS (end of round — ground truth):
${formatLabAllocations(args.labsAfter)}
${formatAppliedOperations(args.labsBefore, args.labsAfter)}${formatInterRoundChanges(args.interRoundChanges)}${formatPreviousRounds(args.previousRounds ?? [])}

${formatActionLog(args.resolvedActions)}
${args.aiDisposition ? `\n${formatAiDisposition(args.aiDisposition, args.round)}` : ""}

YOUR TASK: Produce a situation briefing for the next round, plus risk trajectories for active labs.

SUMMARY STYLE — read this carefully:

You are writing a briefing, not a recap. The action log already shows what was attempted and whether it rolled successfully. The UI cards already show absolute state (multipliers, compute stocks, safety %, allocations). Your job is the synthesis between those two — the delta, and what it means for the round ahead.

THREE FIELDS, each with a defined job:

- **outcomes** (2-3 sentences): what the successful actions PRODUCED, at meaning-level. Synthesize — connect effects into coherent outcomes. Do not re-list the action log. A successful action that was blocked or overtaken by another action produced a different outcome than its actor intended; report the actual world-state change (visible in LAB STATUS END), not the attempt.

- **stateOfPlay** (1-2 sentences): where key players sit NOW, in relative terms. Positions, leverage, momentum — not absolute numbers. Who gained, who lost, who's now exposed or isolated.

- **pressures** (1-2 sentences): what is set up, contested, or at stake heading into the next round. The questions players should be weighing between rounds. Forward-looking, not a recap.

Every sentence must earn its place. Terse is better than padded. If a domain produced nothing visible, say nothing about it — do not add filler like "no coverage" or "no incidents reported".

WHAT MAY NOT APPEAR:

- Primary events nobody tried. No invented compute transfers, merger offers, specific hearings, procurement decisions, blockades, recruitment drives, or treaties unless a player action this round caused them. The SCENARIO CONTEXT's "background pressures" list (DPA, Taiwan leverage, MSS, summits) is the SHAPE of plausible escalations — do NOT narrate them as new occurrences without a player action behind them.
- Restated mechanical state. Don't say "OpenBrain reached 9x" — players see it. You MAY reference a number if it characterises a decision ("a 3% safety allocation tells its own story") rather than reporting the slider.
- Flowery writing, metaphors, rhetorical flourishes, "in the shadows", "silent substrate", "weights hum", etc.
- Hard factual claims attributed to unrepresented actors. Use hedges ("signalled support", "drew criticism", "was read as").
- Leakage of non-public actions. Use a "reasonably informed observer" test — if an outsider could not plausibly notice it, do not narrate it in outcomes / stateOfPlay / pressures. Hidden dynamics go in facilitatorNotes.
- Filler non-events. If nothing happened in a domain, don't mention the domain.
- Re-listing the action log. The action log is shown separately. Synthesize, don't enumerate.
- Contradicting LAB STATUS (END). If a lab appears active at end, it is active; if it doesn't, it's gone. Describe what IS, not what someone intended.

CONFLICTS: Where contradictory actions both rolled success, LAB STATUS (END) shows which effect actually landed. Describe the final state in outcomes, not each actor's intent. A success on the action log does NOT guarantee the intended world-state happened.

GOOD example:
- outcomes: "Conscienta redomiciled to Australia and folded into a new sovereign-backed lab, AussieAI. The DPA consolidation of OpenBrain proceeded on paper but lost its second target in the process."
- stateOfPlay: "US compute is now nationalised but geographically narrower; Australia has a frontier lab for the first time; OpenBrain is state-owned and alone."
- pressures: "Export control policy is the next pivot. OpenBrain's deployment revenue vs AussieAI's scaling race starts from here."

BAD examples — do not write these:
- "This is a significant structural shift." (analysis without content)
- "OpenBrain's private acceleration push got no coverage." (non-public action being negated just to fill space)
- "No anomalies reported." (non-event as filler)
- "A tense media cycle kept the issue alive." (flourish)
- "Washington signalled a new era of muscular industrial policy." (flourish attributed to unrepresented actor)

SECRET ACTIONS: Successful secrets appear as outcomes without revealing the actor. Failed secrets are invisible.

NAMES: Only fictional names (OpenBrain, DeepCent, Conscienta). Never real AI companies.

NO GAME MECHANICS in the summary (probabilities, dice, priority numbers).

AI DISPOSITION: If the AI systems have a hidden alignment frame, keep it secret until Round 4. Before then, narrate only observable behaviour, not the hidden alignment logic itself.

${args.previousTrajectories && args.previousTrajectories.length > 0 ? `
PREVIOUS RISK ASSESSMENT (from last round — use this to inform your trajectory update):
${args.previousTrajectories.map((t) => `- ${t.labName}: ${t.safetyAdequacy} safety, trajectory=${t.likelyFailureMode} (signal ${t.signalStrength}/10) — ${t.reasoning}`).join("\n")}
` : ""}
LAB TRAJECTORIES — assess each active lab (appearing in LAB STATUS END) based on its spec, safety allocation (%), R&D multiplier, and what happened this round. Consider:
- Is safety investment keeping pace with capability growth?
- What failure mode would an AI safety expert predict given this lab's spec gaps?
- How visible are the warning signs? (0=speculative theory, 5=early behavioral anomalies, 8=clear evidence of misalignment, 10=actively manifesting)
- The AI's secret disposition (if known) interacts with the spec — a power-seeking AI with a narrow spec will exploit every silence.

CRITICAL — use LAB STATUS (END) numbers. When your reasoning cites a safety %, capability multiplier, or compute number, it MUST match the END values above. Do NOT cite historical or role-description defaults (e.g. "7% safety" from role briefs) if LAB STATUS shows a different current value.

Only output trajectories for labs in LAB STATUS (END). Do not include entries for labs that appear only in LAB STATUS (START) — they were merged, decommissioned, or renamed away this round.

BASELINE TRAJECTORY (for context, not for you to narrate):
${formatRoundExpectations(args.round)}`;
}
