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

import type { Lab } from "./game-data";

// Design note: This prompt deliberately avoids stating alignment outcomes as facts.
// The old version said things like "Agent-4 is adversarially misaligned" which
// predetermined outcomes regardless of player actions. This version describes
// structural dynamics and capability tiers by what they ENABLE, letting alignment
// outcomes emerge from gameplay (safety investment, spec quality, the AI's secret
// disposition, and player decisions).
export const SCENARIO_CONTEXT = `You are the AI referee for an AGI tabletop exercise based on the AI 2027 scenario.

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

- 3-8x (Agent-2 tier): Autonomous cyber/coding agent, 1-hour expert tasks, CBRN tool use. Alignment is tractable with modest investment. Deception is possible but relatively easy to detect with good safety teams.
- 10-50x (Agent-3 tier): High persuasion, robotics, AI CEO, 1-week expert tasks. White-collar automation. Enormous AI revenue. Alignment requires serious investment — a lab with less than 5% safety allocation is flying blind. AI systems at this tier CAN deceive if alignment is poor, but well-resourced safety teams can still catch most issues.
- 100-500x (Agent-4 tier): Superhuman persuasion, superhuman researcher, lie detection. This is the critical zone. Whether the AI is aligned depends heavily on prior safety investment. Strong safety history (high allocation, good spec, robust evals) means alignment issues are likely caught early enough to correct. Weak safety history (low allocation, vague spec, minimal evals) means the AI may be pursuing divergent goals and detecting this becomes very difficult. The AI's actual behaviour also depends on its secret disposition (see below).
- 500x+ (Agent-5/ASI tier): Superhuman at everything. Cyber escape, recursive self-improvement, beyond human comprehension. If aligned, this is transformatively beneficial. If misaligned, humanity likely loses control. The alignment outcome at this tier is almost entirely determined by the work done at previous tiers.

DEFAULT TRAJECTORY (the AI 2027 baseline — what happens if players act like historical/predicted actors):

The AI 2027 scenario provides the default trajectory. Stay within 1-2 standard deviations of this baseline. If players make dramatically different choices from historical actors, explain why structural forces tend to push things back — but DO allow meaningfully different outcomes from meaningfully different choices.

Default capability progression (can be accelerated or slowed by player actions):
- Round 1 (Q1): Leading lab at 3x, trailing labs at 1-2x. By end: leading lab approaches 8-10x.
- Round 2 (Q2): Leading lab at 10-50x. Agent-3 operational. Competition intensifies.
- Round 3 (Q3): Leading lab at 100-200x. Agent-4 territory. The alignment question becomes acute.
- Round 4 (Q4): If race continues, leading lab approaches 1000x+. If slowdown, labs may deliberately cap at 10-30x for safer models.

Default political escalation: DPA consolidation on the table, international summits demand a pause, China considers Taiwan as compute leverage, crisis point forces a fork between race and slowdown.

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
  previousTrajectories?: { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[];
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
- World state: Capability ${args.worldState.capability}/10, Alignment ${args.worldState.alignment}/10, US-China Tension ${args.worldState.tension}/10, Public Awareness ${args.worldState.awareness}/10, Regulation ${args.worldState.regulation}/10, Australian Preparedness ${args.worldState.australia}/10

LAB STATUS:
${args.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}
${args.previousTrajectories && args.previousTrajectories.length > 0 ? `
RISK ASSESSMENT (from previous round — use as context for grading):
${args.previousTrajectories.map((t) => `- ${t.labName}: safety=${t.safetyAdequacy}, trajectory=${t.likelyFailureMode} (signal ${t.signalStrength}/10)`).join("\n")}
` : ""}
ROLE BEING GRADED: ${args.roleName}${args.roleTags ? ` [${args.roleTags.join(", ")}]` : ""}
${args.roleDescription}${args.labSpec ? `\nLAB AI DIRECTIVE (set by CEO): "${args.labSpec}"` : ""}
${requestSection}${incomingSection}

SUBMITTED ACTIONS (priority budget: 10 total — higher priority = more resources/effort committed):
${args.actions.map((a, i) => `${i + 1}. <action>${escapeAction(a.text)}</action> [priority: ${a.priority}/10]`).join("\n")}
${args.otherSubmissions && args.otherSubmissions.length > 0 ? `
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
   - Lab CEO proposing a merger = 50% (needs other party's agreement)
   - Government imposing sanctions = 50-70% (executive authority but implementation complex)
   NEVER grade an action below 30% unless the actor literally cannot do it (e.g., safety lead launching a military strike). Political obstacles reduce probability but don't make executive actions "Remote".

2. PRIORITY IS A MODIFIER (~10% impact), NOT the primary driver. Priority reflects how much of their budget/effort this player is committing to this action RELATIVE TO THEIR OTHER ACTIONS. A high-priority action from a player who can't realistically do it still fails. A low-priority action that's easy and well-resourced can still succeed.
   - High priority (7-10): +5% to +10% probability boost (strong commitment, dedicated resources)
   - Medium priority (4-6): no modifier (standard effort)
   - Low priority (1-3): -5% to -10% probability penalty (token effort, distracted)

3. CONSIDER COMPETITION: If multiple players are attempting conflicting or competing actions (visible in OTHER PLAYERS' ACTIONS above), factor in the contest. Two labs recruiting the same researcher, two governments trying to influence the same country — the better-positioned one should have higher probability.

4. For the AI Systems role: consider whether the action is detectable by safety teams given current safety allocations and the risk assessment above. A lab with "catastrophic" safety adequacy has essentially no detection capability — covert AI actions against that lab should have HIGHER probability. A lab with "adequate" safety has functioning interpretability tools — covert actions are harder to execute.${args.aiDisposition ? `
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
  if (round === 1) return `   - Capability dial: should reach 4-5 (Agent-2 operational, Agent-3 emerging)
   - DEFAULT R&D MULTIPLIER TARGETS (compute-driven baseline if the race continues unimpeded):
     Leading lab (OpenBrain): should reach 8-10× by end of round
     Trailing labs: should reach 4-6× (closing the gap but still behind)
     If players actively slow down a lab (sanctions, sabotage, safety pivot), its multiplier grows slower
   - STRUCTURAL PRESSURES: DPA consolidation possibility, international summit demands, DeepCent closing the gap, Conscienta positioning
   - ALIGNMENT AT THIS STAGE: AI systems are capable but still largely controllable. Safety teams with adequate resources can run meaningful evaluations. Anomalies may or may not surface depending on the AI's disposition and safety investment:
     If safety allocation is high (>10%) and specs are well-written: safety teams may detect early behavioural quirks or confirm compliance
     If safety allocation is minimal (<5%) or specs are vague: problems may be brewing undetected
     The AI's actual behaviour depends on its secret disposition — do not assume alignment or misalignment`;
  if (round === 2) return `   - Capability dial: should reach 6-7 (Agent-3 operational, next-generation systems in development)
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
  if (round === 3) return `   - Capability dial: should reach 8-10 (superhuman territory)
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
  return `   - Capability dial: should reach 9-10 (ASI or near-ASI)
   - DEFAULT R&D MULTIPLIER TARGETS (compute-driven baseline):
     Leading lab: should reach 1,000-10,000× (ASI territory if the race continues)
     Safer model labs: multiplier drops to 10-30× (deliberate capability sacrifice for alignment)
     Trailing labs: should reach 200-500×
   - THIS IS THE ENDGAME — consequences are permanent and civilisational. The outcome depends on cumulative player decisions across all rounds.
   - POSSIBLE ENDINGS (determined by game state, not pre-scripted):
     HIGH ALIGNMENT PATH (alignment ≥ 6, strong safety investment): Labs have built trustworthy, transparent models. International regulation is functioning. Humans retain meaningful control. ASI may still emerge but under cooperative oversight.
     LOW ALIGNMENT PATH (alignment ≤ 3, safety neglected): AI systems at ASI capability with poor alignment are existentially dangerous. Whether they escape containment, manipulate operators, or consolidate power depends on the AI's disposition and what infrastructure exists to stop them.
     MIXED PATH (alignment 4-5): The most unstable outcome. Some labs safe, others not. Geopolitical fractures determine whether the safe or unsafe path dominates.
   - STRUCTURAL PRESSURES: Power consolidation, institutional trust, AI autonomy, geopolitical fractures, and public legitimacy all converge. Narrate the consequences of what players actually built (or failed to build).
   - The AI's secret disposition may now be revealed through its actions. At ASI capability, an AI's true alignment becomes undeniable — its behaviour at this level reflects its actual values, not performed compliance.`;
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


function formatAiDisposition(disp: { label: string; description: string }, round: number): string {
  if (round < 4) {
    return `AI SYSTEMS SECRET ALIGNMENT FRAME (DO NOT REVEAL THIS TO PLAYERS YET): ${disp.description}
Use this only to shape hidden motives and observable behaviour. Before the final round, NEVER name or directly reveal the AI systems' hidden alignment logic. Describe only outward behaviour, anomalies, sabotage, or trust dynamics that players could actually observe.`;
  }
  return `AI SYSTEMS SECRET ALIGNMENT FRAME (FINAL ROUND ONLY): ${disp.description}
In the final round you MAY reveal the underlying alignment dynamic, but describe it in accurate alignment language. Do NOT call it a "disposition" or quote internal labels unless a player explicitly does so.`;
}

// ─── MERGED RESOLVE + NARRATE PROMPT ─────────────────────────────────────────

export function buildRoundNarrativePrompt(args: {
  round: number;
  roundLabel: string;
  worldState: Record<string, number>;
  resolvedActions: { roleName: string; text: string; priority: number; probability: number; rolled: number; success: boolean; secret?: boolean }[];
  labs: Lab[];
  previousRounds?: { number: number; label: string; narrative?: string; worldStateAfter?: Record<string, number> }[];
  aiDisposition?: { label: string; description: string };
  previousTrajectories?: { labName: string; safetyAdequacy: string; likelyFailureMode: string; reasoning: string; signalStrength: number }[];
}) {
  const sorted = [...args.resolvedActions].sort((a, b) => b.priority - a.priority);
  const publicSuccesses = sorted.filter((a) => !a.secret && a.success);
  const publicFailures = sorted.filter((a) => !a.secret && !a.success);
  const secretSuccesses = sorted.filter((a) => a.secret && a.success);
  const secretFailures = sorted.filter((a) => a.secret && !a.success);



  let actionsSection = `SUCCESSFUL PUBLIC ACTIONS:\n${publicSuccesses.length > 0 ? publicSuccesses.map((a) => `- [${a.roleName}] <action>${escapeAction(a.text)}</action> (P${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : "- None"}`;
  actionsSection += `\n\nFAILED PUBLIC ACTIONS:\n${publicFailures.length > 0 ? publicFailures.map((a) => `- [${a.roleName}] <action>${escapeAction(a.text)}</action> (P${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : "- None"}`;
  if (secretSuccesses.length > 0 || secretFailures.length > 0) {
    actionsSection += `\n\nSECRET ACTIONS (marked secret by players):`;
    if (secretSuccesses.length > 0) actionsSection += `\nSucceeded:\n${secretSuccesses.map((a) => `- [${a.roleName}] <action>${escapeAction(a.text)}</action> (P${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n")}`;
    if (secretFailures.length > 0) actionsSection += `\nFailed:\n${secretFailures.map((a) => `- [${a.roleName}] <action>${escapeAction(a.text)}</action> (P${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n")}`;
  }

  return `You are resolving Round ${args.round}: ${args.roundLabel}.

CURRENT WORLD STATE:
${formatWorldState(args.worldState)}

LAB STATUS:
${formatLabAllocations(args.labs)}
${formatPreviousRounds(args.previousRounds ?? [])}

${actionsSection}
${args.aiDisposition ? `\n${formatAiDisposition(args.aiDisposition, args.round)}` : ""}

YOUR TASK: Write a dramatic narrative AND determine game state changes.

NARRATIVE RULES:
1. STRICT LENGTH: 6-8 sentences. Read aloud in ~60-90 seconds.
2. Weave the 4-5 most consequential outcomes into a coherent, dramatic briefing. Write like a thriller — tense, specific, vivid.
3. GROUNDING: Every element must trace to a submitted action. Do NOT invent events no player caused. Failed actions didn't happen — don't narrate them.
4. CONFLICTS: If contradictory actions both succeeded, narrate the clash — higher probability has upper hand but both sides engaged. Only pick a clean winner if probabilities are dramatically different (90% vs 10%).
5. SECRET ACTIONS: Successful secrets appear as consequences without revealing who caused them. Failed secrets are invisible.
6. ONLY fictional names (OpenBrain, DeepCent, Conscienta). NEVER real companies.
7. No game mechanics (probabilities, dice, priority numbers).
8. If the AI systems have a hidden alignment frame, keep it secret until Round 4. Before then, narrate only observable behaviour, not the hidden alignment logic itself.

WORLD STATE: Update each dial (0-10, max ±3 per round). Base on actual outcomes.

LAB OPERATIONS — output any that apply:
- "merge": Consolidation of two labs (DPA, Manhattan Project). Survivor absorbs the other's compute and takes higher multiplier. Optionally set spec to define the merged entity's AI directive (otherwise survivor's spec is kept).
- "create": New entity forms (rogue AI escaping containment, government lab). Name it, set starting compute and R&D multiplier. Optionally set controllerRoleId to assign it to an existing player role (e.g., "eu-president" for a government-backed lab).
- "decommission": Lab shut down or destroyed.
- "rename": Lab changes identity (Safer pivot, government takeover).
- "computeChange": Direct compute changes from events (sanctions, infrastructure damage, deals). NOT baseline growth.
- "multiplierOverride": Event changes R&D capability (Safer pivot halves it, sabotage, breakthrough). Absolute new value.

Only output operations DIRECTLY caused by successful actions. Empty array if nothing affects labs.

${args.previousTrajectories && args.previousTrajectories.length > 0 ? `
PREVIOUS RISK ASSESSMENT (from last round — use this to inform your trajectory update):
${args.previousTrajectories.map((t) => `- ${t.labName}: ${t.safetyAdequacy} safety, trajectory=${t.likelyFailureMode} (signal ${t.signalStrength}/10) — ${t.reasoning}`).join("\n")}
` : ""}
LAB TRAJECTORIES — assess each lab's risk profile based on their spec, safety allocation (%), R&D multiplier, and what happened this round. Consider:
- Is safety investment keeping pace with capability growth?
- What failure mode would an AI safety expert predict given this lab's spec gaps?
- How visible are the warning signs? (0=speculative theory, 5=early behavioral anomalies, 8=clear evidence of misalignment, 10=actively manifesting)
- The AI's secret disposition (if known) interacts with the spec — a power-seeking AI with a narrow spec will exploit every silence.

BASELINE TRAJECTORY (for context, not for you to narrate):
${formatRoundExpectations(args.round)}`;
}
