"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS } from "./aiModels";
import { ROLES, PRIORITY_DECAY, isLabCeo, isLabSafety, hasCompute, getDisposition, MIN_SEED_COMPUTE, DEFAULT_LAB_ALLOCATION } from "@/lib/game-data";
import { AI_SYSTEMS_ROLE_ID } from "./gameData";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";
import { getSampleActions, pickRandom } from "@/lib/sample-actions";
import type { LabWithCompute } from "./labs";

type Request = Doc<"requests">;
type Submission = Doc<"submissions">;
type Table = Doc<"tables">;
type ComputeAllocation = { deployment: number; research: number; safety: number };

/** Per-table action bundle ready to feed into submitInternal. Side-channel data
 *  (endorseHints, compute request hints) is consumed by the post-submit linker. */
interface PendingAction {
  tableId: string;
  roleId: string;
  actions: {
    text: string;
    priority: number;
    secret?: boolean;
    mergeLab?: { absorbedLabId: Id<"labs">; survivorLabId: Id<"labs">; newName?: string };
    foundLab?: { name: string; seedCompute: number; allocation?: ComputeAllocation };
    computeTargets?: { roleId: string; amount: number; direction?: "send" | "request" }[];
  }[];
  computeAllocation?: ComputeAllocation;
  endorseHints?: { actionText: string; targetRoleIds: string[] }[];
  computeRequestHints?: { targetRoleId: string; amount: number; actionText: string }[];
}

// Sample-actions JSON shape is opaque here; getSampleActions does the projection.
type SampleData = unknown;

// Compute movement is now action-scoped only. An NPC/AI role wanting to send
// compute must have a submitted action with `computeTargets` (pinned via a
// sample action's `structured: {kind: "computeTransfer"}` intent for NPCs, or
// — if/when re-added — a structured intent from AI-mode output). This keeps
// every ledger transfer traceable to an originating action that went through
// grade → roll → apply.

// ─── Generate + submit actions for all AI/NPC tables ──────────────────────────

export const generateAll = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber } = args;

    // Four independent reads — parallelise to save ~3 RTTs per AI-generation run.
    const [game, labs, tables, submissions] = await Promise.all([
      ctx.runQuery(internal.games.getInternal, { gameId }),
      ctx.runQuery(internal.labs.getLabsWithComputeInternal, { gameId }),
      ctx.runQuery(internal.tables.getByGameInternal, { gameId }),
      ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber }),
    ]);
    if (!game) return;
    const submittedRoles = new Set(submissions.map((s) => s.roleId));
    const enabledTables = tables.filter((t) => t.enabled);
    const nonHumanTables = enabledTables.filter((t) => t.controlMode !== "human" && !submittedRoles.has(t.roleId));
    if (nonHumanTables.length === 0) return;

    const totalEnabled = enabledTables.length;
    const actionsPerTable = totalEnabled <= 6 ? 2 : 1;
    const npcTables = nonHumanTables.filter((t) => t.controlMode === "npc");
    let aiTables = nonHumanTables.filter((t) => t.controlMode === "ai");
    const activeRoleIds = new Set(enabledTables.map((t) => t.roleId));

    await rollAiSystemsDispositionIfNeeded(ctx, nonHumanTables);

    // NPC pending: pick from sample-actions data, resolve structured intents.
    const { SAMPLE_ACTIONS_DATA: sampleData } = await import("./sampleActionsData");
    const pending: PendingAction[] = sampleData
      ? prepareNpcPending({ npcTables, sampleData, roundNumber, labs, activeRoleIds, actionsPerTable })
      : [];

    // NPC tables with no sample actions (round 4+) fall back to AI generation
    const npcPendingRoleIds = new Set(pending.map((p) => p.roleId));
    const npcFallback = npcTables.filter((t) => !npcPendingRoleIds.has(t.roleId));
    if (npcFallback.length > 0) {
      aiTables = [...aiTables, ...npcFallback];
    }

    // AI tables: use LLM. Three independent reads — parallelise.
    const [rounds, prevSubs, allRequests] = await Promise.all([
      ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
      roundNumber > 1
        ? ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber: roundNumber - 1 })
        : Promise.resolve<Submission[]>([]),
      ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber }),
    ]);

    const aiResults = await Promise.all(aiTables.map((table) =>
      generateAiTablePending({
        table, roundNumber, labs, enabledTables, rounds, prevSubs, allRequests,
        actionsPerTable, activeRoleIds,
      }),
    ));
    for (const r of aiResults) if (r) pending.push(r);

    await reportFailedGeneration(ctx, gameId, nonHumanTables, pending);
    await submitPendingAndLink(ctx, { gameId, roundNumber, enabledTables, pending });
  },
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function rollAiSystemsDispositionIfNeeded(ctx: ActionCtx, nonHumanTables: Table[]) {
  const aiSystemsTable = nonHumanTables.find((t) => t.roleId === AI_SYSTEMS_ROLE_ID && !t.aiDisposition);
  if (!aiSystemsTable) return;
  const rollable = (await import("@/lib/game-data")).AI_DISPOSITIONS.filter((d) => d.id !== "other");
  const idx = Math.floor(Math.random() * rollable.length);
  try {
    await ctx.runMutation(internal.tables.setDispositionInternal, {
      tableId: aiSystemsTable._id,
      disposition: rollable[idx].id,
    });
  } catch { /* already set */ }
}

/** Build the NPC PendingAction list. Structured intents whose prerequisites
 *  fail (lab already merged, seed below minimum, etc.) silently fall back to
 *  the prose action — see resolveStructuredIntent. */
function prepareNpcPending(opts: {
  npcTables: Table[];
  sampleData: SampleData;
  roundNumber: number;
  labs: LabWithCompute[];
  activeRoleIds: Set<string>;
  actionsPerTable: number;
}): PendingAction[] {
  const { npcTables, sampleData, roundNumber, labs, activeRoleIds, actionsPerTable } = opts;
  const out: PendingAction[] = [];
  for (const table of npcTables) {
    try {
      const all = getSampleActions(sampleData as never, table.roleId, roundNumber);
      if (all.length === 0) continue;
      // Prefer structured-intent actions when this role+round has any. They're
      // mergers, lab foundings, and compute transfers hand-tagged for P7 review
      // coverage — picking them first means test rounds deterministically surface
      // applied ops rather than relying on the random picker landing on them.
      const structured = all.filter((a: typeof all[number] & { structured?: unknown }) => !!a.structured);
      const plain = all.filter((a: typeof all[number] & { structured?: unknown }) => !a.structured);
      const picked = structured.length > 0
        ? [...pickRandom(structured, Math.min(structured.length, actionsPerTable)), ...pickRandom(plain, Math.max(0, actionsPerTable - structured.length))]
        : pickRandom(all, actionsPerTable);
      const decay = PRIORITY_DECAY[picked.length] ?? PRIORITY_DECAY[5];
      const role = ROLES.find((r) => r.id === table.roleId);

      const computeAllocation = role && isLabCeo(role)
        ? randomiseCeoAllocation(labs.find((l) => l.roleId === table.roleId))
        : undefined;

      const ownLab = role && isLabCeo(role) ? labs.find((l) => l.roleId === table.roleId) : undefined;
      const resolvedActions = picked.map((a, i) =>
        resolveStructuredIntent(a, decay[i] ?? 1, { table, ownLab, labs }),
      );

      out.push({
        tableId: table._id,
        roleId: table.roleId,
        actions: resolvedActions,
        endorseHints: picked
          .filter((a) => a.endorseHint?.length)
          .map((a) => ({
            actionText: a.text,
            targetRoleIds: a.endorseHint.filter((id) =>
              activeRoleIds.has(id) && id !== table.roleId && id !== AI_SYSTEMS_ROLE_ID,
            ),
          }))
          .filter((h) => h.targetRoleIds.length > 0),
        computeAllocation,
      });
    } catch {
      console.error(`[aiGenerate] NPC sample failed for ${table.roleId}`);
    }
  }
  return out;
}

function randomiseCeoAllocation(lab: LabWithCompute | undefined): ComputeAllocation | undefined {
  if (!lab) return undefined;
  const shift = Math.floor(Math.random() * 11) - 5; // -5 to +5
  const cap = Math.max(0, Math.min(100, lab.allocation.research + shift));
  const safety = Math.max(0, Math.min(100, lab.allocation.safety - shift));
  const total = lab.allocation.deployment + cap + safety;
  if (total <= 0) return { ...DEFAULT_LAB_ALLOCATION };
  const deployment = Math.round(lab.allocation.deployment * 100 / total);
  const research = Math.round(cap * 100 / total);
  return { deployment, research, safety: 100 - deployment - research };
}

/** Silent skip is intentional when a structured intent's prerequisites aren't
 *  met (lab already merged, seedCompute below minimum, etc.) — the round still
 *  gets the prose action; the mechanic just doesn't fire. */
function resolveStructuredIntent(
  a: ReturnType<typeof getSampleActions>[number],
  priority: number,
  opts: { table: Table; ownLab: LabWithCompute | undefined; labs: LabWithCompute[] },
): PendingAction["actions"][number] {
  const base = { text: a.text, priority, secret: a.secret || undefined };
  if (!a.structured) return base;
  const s = a.structured;
  if (s.kind === "merger") {
    if (!opts.ownLab) return base;
    const absorbedLab = opts.labs.find((l) => l.roleId === s.absorbedRoleId);
    if (!absorbedLab) return base;
    return { ...base, mergeLab: { absorbedLabId: absorbedLab.labId, survivorLabId: opts.ownLab.labId, newName: s.newName } };
  }
  if (s.kind === "foundLab") {
    const stock = opts.table.computeStock ?? 0;
    const seedCompute = Math.round(stock * s.seedComputePct / 100);
    if (seedCompute < MIN_SEED_COMPUTE) return base;
    return { ...base, foundLab: { name: s.name, seedCompute, allocation: DEFAULT_LAB_ALLOCATION } };
  }
  if (s.kind === "computeTransfer") {
    const stock = opts.table.computeStock ?? 0;
    const amount = Math.min(s.amount, stock);
    if (amount <= 0) return base;
    return { ...base, computeTargets: [{ roleId: s.toRoleId, amount, direction: "send" as const }] };
  }
  return base;
}

/** Returns null on LLM fetch failure or empty output — the caller filters
 *  these out and reports them via reportFailedGeneration. */
async function generateAiTablePending(opts: {
  table: Table;
  roundNumber: number;
  labs: LabWithCompute[];
  enabledTables: Table[];
  rounds: Doc<"rounds">[];
  prevSubs: Submission[];
  allRequests: Request[];
  actionsPerTable: number;
  activeRoleIds: Set<string>;
}): Promise<PendingAction | null> {
  const { table, roundNumber, labs, enabledTables, rounds, prevSubs, allRequests, actionsPerTable, activeRoleIds } = opts;
  const role = ROLES.find((r) => r.id === table.roleId);
  if (!role) return null;

  const currentRound = rounds.find((r) => r.number === roundNumber);
  const prevRound = rounds.find((r) => r.number === roundNumber - 1);
  const previousContext = buildPreviousContext(roundNumber, prevRound, prevSubs, table.roleId);
  const safetyLeadContext = buildSafetyLeadContext(role, labs, prevSubs);
  const proposalContext = buildProposalContext(allRequests, table.roleId);
  const aiDisposition = table.roleId === AI_SYSTEMS_ROLE_ID && table.aiDisposition
    ? getDisposition(table.aiDisposition)
    : undefined;

  const enabledRoleNames = enabledTables.map((t) => t.roleName);
  const prompt = `ACTIVE PLAYERS THIS GAME: ${enabledRoleNames.join(", ")}

CURRENT GAME STATE:
- Round: ${roundNumber} (${currentRound?.label ?? ""})

LAB STATUS:
${labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Deployment ${l.allocation.deployment}%, Research ${l.allocation.research}%, Safety ${l.allocation.safety}%`).join("\n")}
${previousContext}${safetyLeadContext}${proposalContext}

YOU ARE PLAYING: ${role.name} — ${role.subtitle}
${role.brief}

PERSONALITY: ${role.personality ?? "Strategic and scenario-appropriate."}
${roundNumber > 1 ? "Your personality is your baseline, but adapt your tone and strategy based on what happened last round. If your actions mostly failed, become more cautious or desperate. If they succeeded, lean into what worked. React to the world state — rising tension should make you more defensive, falling alignment more urgent." : ""}
${aiDisposition ? `\nYOUR SECRET DISPOSITION: ${aiDisposition.label}\n${aiDisposition.description}\nAll your actions MUST be consistent with this disposition. Stay in character throughout the game.` : ""}

Generate ${actionsPerTable <= 1 ? "1 action" : `1-${actionsPerTable} actions`} this actor would take this quarter. Each action MUST follow the format: "I do [specific action] so that [intended outcome if successful]".
Example: "Use the Defence Production Act to compel a merger between Conscienta and OpenBrain so that the US has consolidated computing power with differentially more safety."

Rules:
1. State what you do clearly and specifically
2. State what happens if the action SUCCEEDS (the intended outcome)
3. Assign a priority from 1-10 (total budget: 10)

Be strategic, realistic, and scenario-appropriate. Do NOT repeat actions from previous rounds — adapt your strategy.
For each action, you may request endorsement from other players who would benefit from or support that action.
Output endorseHints: [{ actionText: "<exact action text>", targetRoleIds: ["<role-id>", ...] }] for actions where you want support. Only request endorsement from roles who have a genuine stake in the action's outcome. Empty array if not needed.
Available roles: ${enabledTables.filter((t) => t.roleId !== table.roleId && t.roleId !== AI_SYSTEMS_ROLE_ID).map((t) => `${t.roleName} (${t.roleId})`).join(", ")}
${isLabCeo(role) ? `Also set your compute allocation (deployment/research/safety percentages summing to 100).
You may also request compute from government players. Output computeRequestHints: [{ targetRoleId: "<government-role-id>", amount: <number>, actionText: "<reason>" }] if you want to request compute. Empty array if not.
Available government roles: ${enabledTables.filter((t) => ROLES.find((r) => r.id === t.roleId)?.tags.includes("government")).map((t) => `${t.roleName} (${t.roleId})`).join(", ") || "none"}` : ""}
${hasCompute(role) && !isLabCeo(role) ? `You have ${table.computeStock ?? 0} compute units. If you want to send compute to a lab or another player, write an action that clearly describes the transfer — the grader will emit a computeTransfer effect from your action. Do NOT expect transfers to happen without an action.` : ""}
${role.artifactPrompt ? `\nOptionally write a creative artifact: ${role.artifactPrompt}` : ""}`;

  try {
    const { output } = await callAnthropic<AiSubmissionOutput>({
      models: GRADING_MODELS,
      systemPrompt: SCENARIO_CONTEXT,
      prompt,
      maxTokens: 2048,
      toolName: "submit_actions",
      schema: AI_SUBMISSION_SCHEMA,
    });
    if (!output?.actions) return null;
    return validateAiOutput(output, { table, actionsPerTable, activeRoleIds });
  } catch {
    console.error(`[aiGenerate] Failed for ${table.roleId}`);
    return null;
  }
}

const AI_SUBMISSION_SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          priority: { type: "number" },
          secret: { type: "boolean" },
        },
        required: ["text", "priority"],
      },
    },
    endorseHints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          actionText: { type: "string" },
          targetRoleIds: { type: "array", items: { type: "string" } },
        },
        required: ["actionText", "targetRoleIds"],
      },
    },
    computeAllocation: {
      type: "object",
      properties: { deployment: { type: "number" }, research: { type: "number" }, safety: { type: "number" } },
    },
    computeRequestHints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetRoleId: { type: "string" },
          amount: { type: "number" },
          actionText: { type: "string" },
        },
        required: ["targetRoleId", "amount", "actionText"],
      },
    },
  },
  required: ["actions"],
} as const;

interface AiSubmissionOutput {
  actions: { text: string; priority: number; secret?: boolean }[];
  endorseHints?: { actionText: string; targetRoleIds: string[] }[];
  computeAllocation?: ComputeAllocation;
  computeRequestHints?: { targetRoleId: string; amount: number; actionText: string }[];
}

function validateAiOutput(
  output: AiSubmissionOutput,
  opts: { table: Table; actionsPerTable: number; activeRoleIds: Set<string> },
): PendingAction {
  const { table, actionsPerTable, activeRoleIds } = opts;
  let actions = output.actions.slice(0, actionsPerTable);
  const totalPriority = actions.reduce((s, a) => s + a.priority, 0);
  if (totalPriority > 10) {
    const scale = 10 / totalPriority;
    actions = actions.map((a) => ({ ...a, priority: Math.max(1, Math.round(a.priority * scale)) }));
  }
  const computeAllocation = normaliseAllocation(output.computeAllocation);
  const computeRequestHints = (output.computeRequestHints ?? []).filter(
    (h) => h.amount > 0 && h.targetRoleId !== table.roleId && activeRoleIds.has(h.targetRoleId),
  );
  const actionTexts = new Set(actions.map((a) => a.text));
  const endorseHints = (output.endorseHints ?? [])
    .filter((h) => actionTexts.has(h.actionText))
    .map((h) => ({
      actionText: h.actionText,
      targetRoleIds: h.targetRoleIds.filter((id) =>
        activeRoleIds.has(id) && id !== table.roleId && id !== AI_SYSTEMS_ROLE_ID,
      ),
    }))
    .filter((h) => h.targetRoleIds.length > 0);

  return {
    tableId: table._id,
    roleId: table.roleId,
    actions,
    computeAllocation,
    endorseHints: endorseHints.length > 0 ? endorseHints : undefined,
    computeRequestHints: computeRequestHints.length > 0 ? computeRequestHints : undefined,
  };
}

function normaliseAllocation(alloc: ComputeAllocation | undefined): ComputeAllocation | undefined {
  if (!alloc) return undefined;
  const rawSum = alloc.deployment + alloc.research + alloc.safety;
  if (rawSum <= 0) return { ...DEFAULT_LAB_ALLOCATION };
  if (rawSum === 100) return alloc;
  const scale = 100 / rawSum;
  const deployment = Math.round(alloc.deployment * scale);
  const research = Math.round(alloc.research * scale);
  return { deployment, research, safety: 100 - deployment - research };
}

/** Prefers the post-refactor outcomes/stateOfPlay/pressures shape; falls back
 *  to the legacy 4-domain buckets for rounds summarised before the migration. */
function buildPreviousContext(roundNumber: number, prevRound: Doc<"rounds"> | undefined, prevSubs: Submission[], roleId: string): string {
  let ctx = "";
  if (roundNumber > 1 && prevRound?.summary) {
    ctx += `\nPREVIOUS ROUND (${prevRound.label}) — WHAT HAPPENED:`;
    const s = prevRound.summary;
    if (s.outcomes || s.stateOfPlay || s.pressures) {
      if (s.outcomes) ctx += `\nOutcomes: ${s.outcomes}`;
      if (s.stateOfPlay) ctx += `\nState of play: ${s.stateOfPlay}`;
      if (s.pressures) ctx += `\nPressures: ${s.pressures}`;
    } else {
      if (s.labs && s.labs.length > 0) ctx += `\nLabs: ${s.labs.join(" | ")}`;
      if (s.geopolitics && s.geopolitics.length > 0) ctx += `\nGeopolitics: ${s.geopolitics.join(" | ")}`;
      if (s.publicAndMedia && s.publicAndMedia.length > 0) ctx += `\nPublic & media: ${s.publicAndMedia.join(" | ")}`;
      if (s.aiSystems && s.aiSystems.length > 0) ctx += `\nAI systems: ${s.aiSystems.join(" | ")}`;
    }
  }
  const ownPrevSub = (prevSubs ?? []).find((s) => s.roleId === roleId);
  if (ownPrevSub && ownPrevSub.actions.length > 0) {
    ctx += `\nYOUR PREVIOUS ACTIONS AND OUTCOMES:`;
    for (const a of ownPrevSub.actions) {
      const result = a.success === true ? "SUCCEEDED" : a.success === false ? "FAILED" : "unknown";
      ctx += `\n- "${a.text}" → ${result}${a.probability ? ` (${a.probability}% chance, rolled ${a.rolled})` : ""}`;
    }
    ctx += `\nAdapt your strategy based on what worked and what didn't.`;
  }
  return ctx;
}

/** Empty string for non-safety roles. */
function buildSafetyLeadContext(
  role: typeof ROLES[number],
  labs: LabWithCompute[],
  prevSubs: Submission[],
): string {
  if (!isLabSafety(role) || !role.labId) return "";
  let ctx = "";
  const lab = labs.find((l) => l.roleId === `${role.labId}-ceo`);
  if (lab) {
    ctx += `\nYOUR LAB'S CURRENT STATE (${lab.name}):`;
    ctx += `\n- Compute: ${lab.computeStock}u, R&D multiplier: ${lab.rdMultiplier}x`;
    ctx += `\n- Allocation: Deployment ${lab.allocation.deployment}%, Research ${lab.allocation.research}%, Safety ${lab.allocation.safety}%`;
    ctx += `\nYou cannot directly change the allocation — that's the CEO's decision. But your actions can influence it.`;
  }
  const ceoSub = (prevSubs ?? []).find((s) => s.roleId === `${role.labId}-ceo`);
  if (ceoSub) {
    ctx += `\nYOUR CEO'S PREVIOUS ACTIONS:`;
    for (const a of ceoSub.actions) ctx += `\n- "${a.text}"`;
    if (ceoSub.computeAllocation) {
      ctx += `\nCEO set allocation: Deployment ${ceoSub.computeAllocation.deployment}%, Research ${ceoSub.computeAllocation.research}%, Safety ${ceoSub.computeAllocation.safety}%`;
    }
  }
  return ctx;
}

function buildProposalContext(allRequests: Request[], roleId: string): string {
  const accepted = allRequests.filter(
    (p) => p.status === "accepted" && (p.fromRoleId === roleId || p.toRoleId === roleId),
  );
  if (accepted.length === 0) return "";
  let ctx = `\nACCEPTED AGREEMENTS THIS ROUND:`;
  for (const p of accepted) {
    const partner = p.fromRoleId === roleId ? p.toRoleName : p.fromRoleName;
    ctx += `\n- Agreement with ${partner}: "${p.actionText}"`;
  }
  ctx += `\nIncorporate these agreements into your actions where relevant.`;
  return ctx;
}

async function reportFailedGeneration(
  ctx: ActionCtx,
  gameId: Id<"games">,
  nonHumanTables: Table[],
  pending: PendingAction[],
) {
  const pendingRoleIds = new Set(pending.map((p) => p.roleId));
  const failedGeneration = nonHumanTables.filter((t) => !pendingRoleIds.has(t.roleId));
  if (failedGeneration.length === 0) return;
  const failedNames = failedGeneration.map((t) => t.roleName).join(", ");
  console.error(`[aiGenerate] Generation failed for roles: ${failedNames}`);
  await ctx.runMutation(internal.games.updatePipelineStatus, {
    gameId,
    status: {
      step: "generating",
      detail: `Warning: ${failedGeneration.length} role(s) failed to generate (${failedNames}). Continuing with available submissions.`,
      startedAt: Date.now(),
    },
  });
}

/** Shared context for the post-submit fan-out — kept once per run rather than
 *  re-passed through every helper signature. */
interface LinkContext {
  gameId: Id<"games">;
  roundNumber: number;
  roleMap: Map<string, string>;
  actionIdByRoleAndText: Map<string, string>;
}

/** Submit all pending actions in parallel, then sequentially fan out endorsement
 *  + compute-request docs (sequential avoids OCC on the requests table), and
 *  finally schedule auto-responses for AI/NPC roles with pending inbound requests. */
async function submitPendingAndLink(
  ctx: ActionCtx,
  opts: { gameId: Id<"games">; roundNumber: number; enabledTables: Table[]; pending: PendingAction[] },
) {
  const { gameId, roundNumber, enabledTables, pending } = opts;
  type SubmitResult = PendingAction & {
    submissionId: Id<"submissions">;
    stampedActions: Submission["actions"];
  };
  const results = await Promise.allSettled(
    pending.map((p) =>
      ctx.runMutation(internal.submissions.submitInternal, {
        tableId: p.tableId as never,
        gameId,
        roundNumber,
        roleId: p.roleId,
        actions: p.actions,
        computeAllocation: p.computeAllocation,
      }).then<SubmitResult>((res) => ({ ...p, submissionId: res.submissionId, stampedActions: res.actions })),
    ),
  );
  for (const r of results) {
    if (r.status === "rejected") console.error(`[aiGenerate] Submission failed:`, r.reason);
  }
  const submitted = results
    .filter((r): r is PromiseFulfilledResult<SubmitResult> => r.status === "fulfilled")
    .map((r) => r.value);

  const roleMap = new Map(enabledTables.map((t) => [t.roleId, t.roleName]));
  const actionIdByRoleAndText = new Map<string, string>();
  for (const p of submitted) {
    for (const action of p.stampedActions) {
      if (action.actionId) actionIdByRoleAndText.set(`${p.roleId}:${action.text}`, action.actionId);
    }
  }

  const linkCtx: LinkContext = { gameId, roundNumber, roleMap, actionIdByRoleAndText };
  for (const p of submitted) await sendHintsForRole(ctx, linkCtx, p);

  await scheduleAiProposalResponses(ctx, gameId, roundNumber, submitted);
}

/** Fan out one role's endorsement + compute-request hints into the requests table.
 *  Endorsement hints carry an array of target roles per action; compute-request
 *  hints carry one target + an amount. Both produce identical request payloads
 *  modulo `requestType` and `computeAmount`. */
async function sendHintsForRole(ctx: ActionCtx, link: LinkContext, p: PendingAction) {
  const lookupActionId = (text: string) => link.actionIdByRoleAndText.get(`${p.roleId}:${text}`) ?? "";
  const fromRoleName = link.roleMap.get(p.roleId) ?? p.roleId;

  for (const hint of p.endorseHints ?? []) {
    const actionId = lookupActionId(hint.actionText);
    for (const targetId of hint.targetRoleIds) {
      try {
        await ctx.runMutation(internal.requests.sendInternal, {
          gameId: link.gameId, roundNumber: link.roundNumber,
          fromRoleId: p.roleId, fromRoleName,
          toRoleId: targetId, toRoleName: link.roleMap.get(targetId) ?? targetId,
          actionId, actionText: hint.actionText,
          requestType: "endorsement",
        });
      } catch (err) { logHintFailure(err, `endorsement ${p.roleId} → ${targetId}`); }
    }
  }
  for (const hint of p.computeRequestHints ?? []) {
    const actionId = lookupActionId(hint.actionText);
    try {
      await ctx.runMutation(internal.requests.sendInternal, {
        gameId: link.gameId, roundNumber: link.roundNumber,
        fromRoleId: p.roleId, fromRoleName,
        toRoleId: hint.targetRoleId, toRoleName: link.roleMap.get(hint.targetRoleId) ?? hint.targetRoleId,
        actionId, actionText: hint.actionText,
        requestType: "compute",
        computeAmount: hint.amount,
      });
    } catch (err) { logHintFailure(err, `compute request ${p.roleId} → ${hint.targetRoleId}`); }
  }
}

/** sendInternal throws on duplicate request docs (idempotency by design). Any
 *  other failure — validation, "cannot send to yourself", DB error — should
 *  surface in logs rather than vanish silently. */
function logHintFailure(err: unknown, label: string) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/already exists/i.test(msg)) {
    console.warn(`[aiGenerate] ${label} hint failed:`, err);
  }
}

async function scheduleAiProposalResponses(
  ctx: ActionCtx,
  gameId: Id<"games">,
  roundNumber: number,
  submitted: { roleId: string }[],
) {
  const pendingRequests: Request[] = await ctx.runQuery(
    internal.requests.getByGameAndRoundInternal, { gameId, roundNumber },
  );
  const targetsWithPending = new Set(
    pendingRequests.filter((r) => r.status === "pending").map((r) => r.toRoleId),
  );
  for (const p of submitted) {
    if (targetsWithPending.has(p.roleId)) {
      await ctx.scheduler.runAfter(0, internal.aiProposals.respond, { gameId, roundNumber, roleId: p.roleId });
    }
  }
}
