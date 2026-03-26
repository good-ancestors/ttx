// AI system prompts for the TTX game.

interface Lab {
  name: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

export function formatLabStatus(labs: Lab[]): string {
  return labs.map((l) =>
    `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`
  ).join("\n");
}

export const SCENARIO_CONTEXT = `You are the AI referee for an AGI tabletop exercise based on the AI 2027 scenario.

SCENARIO BACKBONE (shifted to start January 2028):
- Q1 2028: OpenBrain has Agent-2 (3× R&D multiplier). China stole Agent-2 weights 11 months ago via insider operation. DeepCent is closing the gap. US cyberattacks on China's CDZ failed. NYT whistleblower leak has triggered political crisis — 20% of Americans cite AI as top concern. Congress has issued subpoenas. European leaders accuse the US of "creating rogue AGI."
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
- Conscienta AI CEO: Safety-focused US lab, ~3 months behind OpenBrain. Has won some games by being most trusted. Controls their lab's compute allocation.

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
- The AI Systems: Plays ALL AI systems (OpenBrain's, DeepCent's, Conscienta's). Each may have different alignment. Secret actions possible. Capabilities expand each round.
- The Global Public: Mass opinion, protests, consumer power, votes. Grant or deny social licence.
- The Global Media: Narrative power, investigations, source cultivation. Can make heroes or villains.

NON-LAB COMPUTE: Some non-lab players control national/institutional compute that they can loan to labs. This is tracked and can change each round based on events (e.g., Taiwan invasion disrupts chip supply, reducing available compute).

DETAILED CAPABILITY PROGRESSION:
- Pre-game (Oct 2027): Autonomous replicator, CBRN tool creation, 30-minute expert conversations
- Q1 2028 (Round 1 start): Autonomous cyber agent, autonomous coding agent, 1-hour expert. R&D multiplier 3×.
- Q2-Q3 2028 (Round 2): High persuasion, robotics, AI CEO capability, 1-week expert. R&D multiplier 10×. Agent-3 operational.
- Q4 2028+ (Round 3): Superhuman persuasion, superhuman researcher, [Roll for] lie detection, cyber escape capabilities. R&D multiplier 100-1000×+. Approaching ASI.

STARTING CONDITIONS (January 2028):
- China has CONFIRMED stolen Agent-2 weights (public only suspects this)
- DeepCent (China's lab) is racing to build on stolen weights, needs to overwrite US-aligned spec
- Conscienta AI is 3 months behind OpenBrain, other labs 6+ months behind
- EU AI Act and Australian AI Safety Institute both exist but are early-stage
- Russia/Ukraine conflict is frozen; Russia is a minor AI player
- Public opinion on AI is mixed but primarily concerned about jobs
- China has pre-positioned sabotage capabilities against Western critical infrastructure
- US intelligence has pre-positioned capabilities against Chinese infrastructure

AI ALIGNMENT MECHANIC:
The AI Systems role plays ALL AI systems. Each lab's AI may have different alignment outcomes:
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
  capabilityLevel: string;
  actionRequests?: ActionRequest[];
  enabledRoles?: string[];
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
          : r.requestType === "both"
            ? `Endorsement + Compute (${r.computeAmount ?? 0}u)`
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
- Current AI capability: ${args.capabilityLevel}
- World state: Capability ${args.worldState.capability}/10, Alignment ${args.worldState.alignment}/10, US-China Tension ${args.worldState.tension}/10, Public Awareness ${args.worldState.awareness}/10, Regulation ${args.worldState.regulation}/10, Australian Preparedness ${args.worldState.australia}/10

LAB STATUS:
${args.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

ROLE BEING GRADED: ${args.roleName}${args.roleTags ? ` [${args.roleTags.join(", ")}]` : ""}
${args.roleDescription}
${requestSection}${incomingSection}

SUBMITTED ACTIONS (priority budget: 10 total — higher priority = more resources committed):
${args.actions.map((a, i) => `${i + 1}. "${a.text}" [priority: ${a.priority}/10]`).join("\n")}

GRADING RULES:
- Priority directly affects probability: priority 1-2 = usually 10-30%, priority 7-10 = usually 70-90% IF the action is within the actor's capabilities.
- For lab roles: consider their compute stock, R&D multiplier, and allocation. A lab with 5% safety allocation trying a major alignment breakthrough should get lower odds.
- For government roles: consider their institutional capacity and political constraints.
- An action can be high priority but still unlikely if it's outside the actor's realistic power (e.g., AI Safety Community trying to physically shut down a lab = 10% regardless of priority).
- Consider the detailed capability progression: actions requiring capabilities that don't exist yet should be graded lower.
- For the AI Systems role: consider whether the action is detectable by safety teams.
- SUPPORT REQUESTS: Accepted endorsements remove political/institutional obstacles and BOOST probability. Declined endorsements signal active opposition and REDUCE probability below what it would be without the request. Accepted compute adds tangible resources. Pending requests are ignored. A decline is NOT neutral — it means the target actively opposes this action.
- Coordination does NOT guarantee success. Two labs agreeing to "solve alignment" is still technically extremely difficult (10-30%). But two parties agreeing to a merger removes political obstacles (70-90%).`;
}

export function buildNarrativePrompt(args: {
  round: number;
  roundLabel: string;
  roundTitle: string;
  worldState: Record<string, number>;
  capabilityLevel: string;
  resolvedActions: {
    roleName: string;
    text: string;
    priority: number;
    probability: number;
    rolled: number;
    success: boolean;
    secret?: boolean;
  }[];
  labs: { name: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];
  roleCompute?: { roleId: string; roleName: string; computeStock: number }[];
}) {
  const publicActions = args.resolvedActions.filter((a) => !a.secret);
  const secretActions = args.resolvedActions.filter((a) => a.secret);
  const successes = publicActions.filter((a) => a.success);
  const failures = publicActions.filter((a) => !a.success);
  const secretSuccesses = secretActions.filter((a) => a.success);
  const secretFailures = secretActions.filter((a) => !a.success);

  return `${SCENARIO_CONTEXT}

ROUND ${args.round}: ${args.roundLabel} — "${args.roundTitle}"

CURRENT WORLD STATE (before this round's events):
- AI Capability: ${args.worldState.capability}/10
- Alignment Confidence: ${args.worldState.alignment}/10
- US-China Tension: ${args.worldState.tension}/10
- Public Awareness: ${args.worldState.awareness}/10
- Regulatory Response: ${args.worldState.regulation}/10
- Australian Preparedness: ${args.worldState.australia}/10

Current AI capability: ${args.capabilityLevel}

LAB COMPUTE ALLOCATIONS:
${args.labs.map((l) => `- ${l.name} (${l.computeStock} stock, ${l.rdMultiplier}x): Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

SUCCESSFUL ACTIONS:
${successes.length > 0 ? successes.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : "- None"}

FAILED ACTIONS:
${failures.length > 0 ? failures.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : "- None"}
${secretSuccesses.length > 0 || secretFailures.length > 0 ? `
SECRET ACTIONS (narrate the CONSEQUENCES but do NOT mention the action itself in headlines or events):
${secretSuccesses.length > 0 ? "Succeeded:\n" + secretSuccesses.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : ""}
${secretFailures.length > 0 ? "Failed:\n" + secretFailures.map((a) => `- [${a.roleName}] "${a.text}" (priority ${a.priority}, rolled ${a.rolled} vs ${a.probability}%)`).join("\n") : ""}
IMPORTANT: For secret actions, hide the actor's INTENT AND INVOLVEMENT where plausible. Describe publicly observable outcomes naturally.
- If the action is inherently public (e.g., passing laws, public statements), narrate it normally — you can't hide what's publicly observable. The "secret" flag means the player wanted to keep their strategic reasoning hidden, not that the action itself is invisible.
- If the action is covert (e.g., back-channel negotiations, intelligence operations, sabotage), hide who did it. Attribute consequences to anonymous sources, intelligence agencies, or unknown actors.
- If the action has both covert and public elements (e.g., secretly lobbying for a public policy), narrate the public outcome but don't reveal the behind-the-scenes maneuvering.
Use judgment: a "secret" DPA consolidation doesn't make sense (it's public law), but a "secret" cyber operation does.` : ""}

NARRATIVE RULES:
1. CONFLICT RESOLUTION: If multiple actors attempted conflicting actions and both succeeded, narrate the conflict as an escalation, standoff, or partial outcomes — NOT both achieving their exact goal. The higher-probability success gets the better outcome.
2. STAY ON THE RAILS: The AI 2027 trajectory is the baseline. Capability should generally increase. Lab compute stock and allocations drive R&D progress. High safety allocation slows capability gains but improves alignment. Low safety allocation accelerates capability but increases risk. Compute stock represents total resources available.
3. WORLD STATE UPDATES: Each dial should change by at most ±2 per round. Capability should trend upward (faster in later rounds). Dials should reflect the actual outcomes, not just the baseline.
4. TRAJECTORY: Based on current alignment confidence (${args.worldState.alignment}/10) and player actions, assess whether the game is trending toward the RACE ENDING (low alignment, high competition → AI takeover) or SLOWDOWN ENDING (high alignment, strong regulation → transparent Safer models). Reflect this in your narrative tone and events.
5. Round ${args.round} expectations and key scenario events to weave in:
${args.round === 1 ? `   - Capability dial: should reach 4-5
   - DEFAULT R&D MULTIPLIER TARGETS (what happens if the race continues unimpeded):
     Leading lab (OpenBrain): should reach 8-10× by end of round (Agent-3 coming online)
     Trailing labs: should reach 4-6× (closing the gap but still behind)
     If players actively slow down a lab (sanctions, sabotage, safety pivot), its multiplier grows slower
   - Key events: DPA consolidation possibility, Conscienta positioning, international summit demands, DeepCent closing the gap
   - Conscienta AI reacts to events — may lobby for regulation, seek mergers, or poach talent
   - If US uses DPA to consolidate labs, OpenBrain's compute stock should massively increase` : ""}
${args.round === 2 ? `   - Capability dial: should reach 6-7 (Agent-3 operational, Agent-4 in development)
   - DEFAULT R&D MULTIPLIER TARGETS:
     Leading lab: should reach 30-50× by end of round (approaching Agent-4)
     Trailing labs: should reach 15-25×
     If a lab pivots heavily to safety, its multiplier grows slower but alignment improves
   - Key events: Agent-4 adversarial misalignment detected, Oversight Committee debates, China considering Taiwan
   - DeepCent's safety allocation should trend downward unless players intervene
   - If alignment confidence is low, the adversarial misalignment is worse; if high, it's caught earlier` : ""}
${args.round === 3 ? `   - Capability dial: should reach 8-10 (Agent-4/ASI territory)
   - DEFAULT R&D MULTIPLIER TARGETS:
     Leading lab: should reach 100-200× by end of round (Agent-4 operational, approaching ASI)
     Trailing labs: should reach 50-100×
     Safer model pivot: lab's multiplier drops to 10-30× (trading capability for alignment)
   - RACE PATH (alignment ≤ 3): Agent-4 designs Agent-5 aligned to itself, AI takeover imminent
   - SLOWDOWN PATH (alignment ≥ 6): OpenBrain pivots to 'Safer' transparent models
   - This is the climax — make it dramatic and consequential` : ""}
6. The facilitator will narrate over your output. Write events as clear, punchy statements. Headlines should feel like real news.
7. COMPUTE AND R&D UPDATES: Output updated lab compute stocks and R&D multipliers. CRITICAL RULES:
   COMPUTE STOCK:
   - Stock is the total compute infrastructure a lab controls (data centres, chips, energy). Stock of compute is vastly more important than flow on a timescale of months.
   - New compute this period: ~${args.round === 1 ? "11" : args.round === 2 ? "11" : "5"} new units.
   - DEFAULT COMPUTE DISTRIBUTION (if the race continues unimpeded — adjust based on actual player actions):
${args.round === 1 ? "     OpenBrain +11 (dominant stockpile advantage), DeepCent +6 (state resources), Conscienta +6 (investment inflows), Other US Labs +4, Rest of World +4" : ""}${args.round === 2 ? "     OpenBrain +16 (DPA/procurement advantage), DeepCent +8 (state mobilisation), Conscienta +7 (talent/investment), Other US Labs +2 (consolidation squeeze), Rest of World +2" : ""}${args.round === 3 ? "     OpenBrain +15, DeepCent +6, Conscienta +5, Other US Labs -1 (absorbed/shutdown), Rest of World -1 (obsolete)" : ""}
   - These defaults shift dramatically based on player actions: DPA consolidation transfers lab stock, Taiwan invasion disrupts chip supply (reduces all labs dependent on TSMC), sanctions reduce target's inflow, data centre nationalisation transfers stock.
   - Compute can be destroyed, transferred, or redirected — it is not created from nothing.
   - DPA consolidation moves stock between labs (not creates new). If US nationalises a lab, transfer its stock.
   - Infrastructure actions DIRECTLY affect stock: e.g., if a country nationalises data centres hosting 30% of a lab's training runs, that lab LOSES ~30% of its compute stock. If Taiwan is invaded, chip supply is disrupted — reduce compute for labs dependent on TSMC chips.
   - Compute can be destroyed (sabotage, sanctions, nationalisation) or transferred (DPA, mergers, partnerships).
   R&D MULTIPLIER:
   - The multiplier represents the AI system's current capability level. It can ONLY go up or stay flat — never decrease within a model generation. You cannot un-discover capabilities.
   - Slowing progress means the multiplier grows SLOWER (e.g., stays at 3x instead of jumping to 10x), NOT that it drops from 10x to 3x.
   - The ONLY exception: if a model is explicitly decommissioned/destroyed and replaced with a less capable one (e.g., pivot to Safer models replaces Agent-4 with a deliberately less capable transparent model).
   - These targets assume the race continues. Player actions can push multipliers above or below these ranges.
   - Use your judgment — DPA consolidation, extreme compute concentration, or breakthroughs can accelerate beyond defaults.
   - Output updates for all tracked labs. Do not add labs that aren't in the current game state.
8. NON-LAB COMPUTE: Some players (governments, AISIs) have institutional compute they can loan to labs. Events affect this — e.g., Taiwan invasion disrupts chip supply (reduce US/allied compute), sanctions affect China's compute. Output roleComputeUpdates for any non-lab player whose compute changed this round.
${args.roleCompute && args.roleCompute.length > 0 ? `\nNON-LAB COMPUTE STATUS:\n${args.roleCompute.map((r) => `- ${r.roleName}: ${r.computeStock}u`).join("\n")}` : ""}`;
}
