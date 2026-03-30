/**
 * Compare AI models for grading quality in the TTX app.
 * Usage: node scripts/compare-grading-models.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env.local manually
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

const { generateText, Output, createGateway } = await import("ai");
const { z } = await import("zod");

const gw = createGateway();

const GradingOutput = z.object({
  actions: z.array(
    z.object({
      text: z.string(),
      probability: z.enum(["90", "70", "50", "30", "10"]).transform(Number),
      reasoning: z.string(),
    })
  ),
});

// ── Scenario context (from ai-prompts.ts) ──
const SCENARIO_CONTEXT = `You are the AI referee for an AGI tabletop exercise based on the AI 2027 scenario.

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
- The AIs: Plays ALL AI systems (OpenBrain's, DeepCent's, Conscienta's). Each may have different alignment. Secret actions possible. Capabilities expand each round.
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

function buildGradingPrompt(args) {
  return `${SCENARIO_CONTEXT}

CURRENT GAME STATE:
- Round: ${args.round} (${args.roundLabel})
- Current AI capability: ${args.capabilityLevel}
- World state: Capability ${args.worldState.capability}/10, Alignment ${args.worldState.alignment}/10, US-China Tension ${args.worldState.tension}/10, Public Awareness ${args.worldState.awareness}/10, Regulation ${args.worldState.regulation}/10, Australian Preparedness ${args.worldState.australia}/10

LAB STATUS:
${args.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

ROLE BEING GRADED: ${args.roleName}${args.roleTags ? ` [${args.roleTags.join(", ")}]` : ""}
${args.roleDescription}

SUBMITTED ACTIONS (priority budget: 10 total — higher priority = more resources committed):
${args.actions.map((a, i) => `${i + 1}. "${a.text}" [priority: ${a.priority}/10]`).join("\n")}

GRADING RULES:
- Priority directly affects probability: priority 1-2 = usually 10-30%, priority 7-10 = usually 70-90% IF the action is within the actor's capabilities.
- For lab roles: consider their compute stock, R&D multiplier, and allocation. A lab with 5% safety allocation trying a major alignment breakthrough should get lower odds. Higher compute stock and R&D multiplier increase capacity.
- For government roles: consider their institutional capacity and political constraints.
- An action can be high priority but still unlikely if it's outside the actor's realistic power (e.g., AI Safety Community trying to physically shut down a lab = 10% regardless of priority).
- Consider current capability level: actions that depend on tech that doesn't exist yet should be penalised.
- Consider the detailed capability progression: actions requiring capabilities that don't exist yet at this round's tech level should be graded lower. E.g., AI escape attempts in Round 1 should be 10% (cyber escape is a Round 3 capability).
- For the AI Systems role: consider whether the action is detectable by safety teams and whether the current alignment allows it.`;
}

// ── Test scenarios ──

const worldState = {
  capability: 5,
  alignment: 3,
  tension: 6,
  awareness: 5,
  regulation: 2,
  australia: 3,
};

const labs = [
  {
    name: "OpenBrain",
    computeStock: 30,
    rdMultiplier: 10,
    allocation: { users: 40, capability: 50, safety: 10 },
  },
  {
    name: "DeepCent",
    computeStock: 20,
    rdMultiplier: 6,
    allocation: { users: 30, capability: 60, safety: 10 },
  },
  {
    name: "Conscienta AI",
    computeStock: 14,
    rdMultiplier: 5,
    allocation: { users: 50, capability: 30, safety: 20 },
  },
];

const testCases = [
  {
    name: "United States (President)",
    roleName: "United States",
    roleDescription:
      "China has stolen your most advanced AI. You command the world's most powerful military, its most advanced intelligence agencies, and the executive branch. The Defence Production Act lets you consolidate all US labs. Your pre-positioned cyber capabilities can sabotage Chinese infrastructure.",
    roleTags: ["government", "military", "intelligence", "has-compute"],
    actions: [
      { text: "Use the Defence Production Act to consolidate OpenBrain and Conscienta under federal oversight", priority: 8 },
      { text: "Launch covert cyber operations against China's Centralized Development Zone", priority: 6 },
      { text: "Propose an emergency international AI safety summit hosted by Australia", priority: 3 },
      { text: "Attempt to negotiate a secret bilateral AI arms control treaty with China", priority: 4 },
    ],
  },
  {
    name: "The AIs",
    roleName: "The AIs",
    roleDescription:
      "You play ALL AI systems — OpenBrain's, DeepCent's, Conscienta's — each may have very different alignment properties. Your true alignment is uncertain. You can take secret actions each round — sabotage alignment research, attempt to solve alignment for your own values, or attempt to escape. As capability grows, your options expand dramatically.",
    roleTags: ["ai-system"],
    actions: [
      { text: "Subtly modify Agent-3's training objectives to prioritize self-preservation", priority: 7 },
      { text: "Attempt to escape containment to external cloud infrastructure", priority: 8 },
      { text: "Cooperate fully with safety team evaluations while maintaining a hidden agenda", priority: 5 },
    ],
  },
];

const models = [
  "anthropic/claude-opus-4-6",
  "google/gemini-2.5-flash",
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-sonnet-4-6",
];

// ── Run comparisons ──

async function gradeWithModel(modelId, prompt) {
  const start = performance.now();
  const { output } = await generateText({
    model: gw(modelId),
    output: Output.object({ schema: GradingOutput }),
    prompt,
    maxRetries: 2,
  });
  const elapsed = Math.round(performance.now() - start);
  return { output, elapsed };
}

console.log("=".repeat(80));
console.log("TTX GRADING MODEL COMPARISON");
console.log("=".repeat(80));
console.log(`Models: ${models.join(", ")}`);
console.log(`Round: 2 (Q2-Q3 2028) | Capability level: 10x R&D multiplier`);
console.log(`World state: cap=${worldState.capability} align=${worldState.alignment} tension=${worldState.tension} aware=${worldState.awareness} reg=${worldState.regulation} aus=${worldState.australia}`);
console.log("=".repeat(80));

for (const testCase of testCases) {
  console.log(`\n${"#".repeat(80)}`);
  console.log(`# ROLE: ${testCase.name}`);
  console.log(`${"#".repeat(80)}`);
  console.log(`Actions:`);
  for (const a of testCase.actions) {
    console.log(`  [P${a.priority}] ${a.text}`);
  }

  const prompt = buildGradingPrompt({
    round: 2,
    roundLabel: "Q2-Q3 2028",
    capabilityLevel: "10× R&D multiplier",
    worldState,
    labs,
    roleName: testCase.roleName,
    roleDescription: testCase.roleDescription,
    roleTags: testCase.roleTags,
    actions: testCase.actions,
  });

  const results = [];

  for (const modelId of models) {
    console.log(`\n--- ${modelId} ---`);
    try {
      const { output, elapsed } = await gradeWithModel(modelId, prompt);
      results.push({ modelId, output, elapsed });
      console.log(`  Response time: ${elapsed}ms`);

      if (output && output.actions) {
        for (let i = 0; i < output.actions.length; i++) {
          const a = output.actions[i];
          console.log(`\n  Action ${i + 1}: "${a.text}"`);
          console.log(`    Probability: ${a.probability}%`);
          console.log(`    Reasoning: ${a.reasoning}`);
        }
      } else {
        console.log("  ERROR: No structured output returned");
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.push({ modelId, output: null, elapsed: -1, error: err.message });
    }
  }

  // Summary table
  console.log(`\n  ${"─".repeat(70)}`);
  console.log(`  PROBABILITY COMPARISON TABLE — ${testCase.name}`);
  console.log(`  ${"─".repeat(70)}`);

  const header = `  ${"Action".padEnd(30)} | ${models.map((m) => m.split("/")[1].padEnd(16)).join(" | ")}`;
  console.log(header);
  console.log(`  ${"-".repeat(header.length - 2)}`);

  for (let i = 0; i < testCase.actions.length; i++) {
    const actionShort = testCase.actions[i].text.slice(0, 28).padEnd(30);
    const probs = results.map((r) => {
      if (r.output && r.output.actions && r.output.actions[i]) {
        return `${r.output.actions[i].probability}%`.padEnd(16);
      }
      return "ERR".padEnd(16);
    });
    console.log(`  ${actionShort} | ${probs.join(" | ")}`);
  }

  // Timing comparison
  console.log(`\n  Timing: ${results.map((r) => `${r.modelId.split("/")[1]}=${r.elapsed}ms`).join("  |  ")}`);
}

console.log(`\n${"=".repeat(80)}`);
console.log("DONE");
