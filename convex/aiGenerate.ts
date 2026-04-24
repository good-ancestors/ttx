"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS } from "./aiModels";
import { ROLES, PRIORITY_DECAY, isLabCeo, isLabSafety, hasCompute, getDisposition, MIN_SEED_COMPUTE, DEFAULT_LAB_ALLOCATION } from "@/lib/game-data";
import { AI_SYSTEMS_ROLE_ID } from "./gameData";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";
import { getSampleActions, pickRandom } from "@/lib/sample-actions";

type Request = Doc<"requests">;
type Submission = Doc<"submissions">;

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
  // Complexity is inherent: orchestrates NPC sample actions, AI LLM generation,
  // compute transfers, endorsements, and auto-responses sequentially to avoid OCC conflicts.
  // eslint-disable-next-line complexity
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

    // Scale action count by total enabled tables
    const totalEnabled = enabledTables.length;
    const actionsPerTable = totalEnabled <= 6 ? 2 : 1;

    const npcTables = nonHumanTables.filter((t) => t.controlMode === "npc");
    let aiTables = nonHumanTables.filter((t) => t.controlMode === "ai");

    // Auto-roll disposition for AI Systems if needed
    const aiSystemsTable = nonHumanTables.find((t) => t.roleId === AI_SYSTEMS_ROLE_ID && !t.aiDisposition);
    if (aiSystemsTable) {
      const rollable = (await import("@/lib/game-data")).AI_DISPOSITIONS.filter((d) => d.id !== "other");
      const idx = Math.floor(Math.random() * rollable.length);
      try {
        await ctx.runMutation(internal.tables.setDispositionInternal, {
          tableId: aiSystemsTable._id,
          disposition: rollable[idx].id,
        });
      } catch { /* already set */ }
    }

    // Sample actions data is bundled into the Convex module for NPC tables
    const { SAMPLE_ACTIONS_DATA: sampleData } = await import("./sampleActionsData");

    interface PendingAction {
      tableId: string;
      roleId: string;
      actions: {
        text: string;
        priority: number;
        secret?: boolean;
        mergeLab?: { absorbedLabId: Id<"labs">; survivorLabId: Id<"labs">; newName?: string };
        foundLab?: { name: string; seedCompute: number; allocation?: { deployment: number; research: number; safety: number } };
        computeTargets?: { roleId: string; amount: number; direction?: "send" | "request" }[];
      }[];
      computeAllocation?: { deployment: number; research: number; safety: number };
      endorseHints?: { actionText: string; targetRoleIds: string[] }[];
      computeRequestHints?: { targetRoleId: string; amount: number; actionText: string }[];
    }
    const pending: PendingAction[] = [];
    const activeRoleIds = new Set(enabledTables.map((t) => t.roleId));

    // NPC tables: use sample actions
    if (sampleData) {
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

          // NPC lab CEOs: randomize existing allocation slightly
          let computeAllocation: { deployment: number; research: number; safety: number } | undefined;
          if (role && isLabCeo(role)) {
            const lab = labs.find((l) => l.roleId === table.roleId);
            if (lab) {
              const shift = Math.floor(Math.random() * 11) - 5; // -5 to +5
              const cap = Math.max(0, Math.min(100, lab.allocation.research + shift));
              const safety = Math.max(0, Math.min(100, lab.allocation.safety - shift));
              const total = lab.allocation.deployment + cap + safety;
              computeAllocation = total > 0
                ? { deployment: Math.round(lab.allocation.deployment * 100 / total), research: Math.round(cap * 100 / total), safety: 100 - Math.round(lab.allocation.deployment * 100 / total) - Math.round(cap * 100 / total) }
                : { deployment: 34, research: 33, safety: 33 };
            }
          }

          // Resolve structured intents (merger, foundLab, computeTransfer) per action.
          // Skip attachment silently if prerequisites are missing (lab already merged, etc.).
          const ownLab = role && isLabCeo(role) ? labs.find((l) => l.roleId === table.roleId) : undefined;
          const resolvedActions = picked.map((a, i) => {
            const base = { text: a.text, priority: decay[i] ?? 1, secret: a.secret || undefined };
            if (!a.structured) return base;
            const s = a.structured;
            if (s.kind === "merger") {
              // Need own lab (survivor) and absorbed role's lab — both must be active.
              if (!ownLab) return base;
              const absorbedLab = labs.find((l) => l.roleId === s.absorbedRoleId);
              if (!absorbedLab) return base; // absorbed lab doesn't exist or already merged
              return {
                ...base,
                mergeLab: {
                  absorbedLabId: absorbedLab.labId,
                  survivorLabId: ownLab.labId,
                  newName: s.newName,
                },
              };
            }
            if (s.kind === "foundLab") {
              const stock = table.computeStock ?? 0;
              const seedCompute = Math.round(stock * s.seedComputePct / 100);
              if (seedCompute < MIN_SEED_COMPUTE) return base; // below minimum gate
              return {
                ...base,
                foundLab: {
                  name: s.name,
                  seedCompute,
                  allocation: DEFAULT_LAB_ALLOCATION,
                },
              };
            }
            if (s.kind === "computeTransfer") {
              const stock = table.computeStock ?? 0;
              const amount = Math.min(s.amount, stock);
              if (amount <= 0) return base;
              return {
                ...base,
                computeTargets: [{ roleId: s.toRoleId, amount, direction: "send" as const }],
              };
            }
            return base;
          });

          pending.push({
            tableId: table._id,
            roleId: table.roleId,
            actions: resolvedActions,
            endorseHints: picked
              .filter((a) => a.endorseHint?.length)
              .map((a) => ({
                actionText: a.text,
                targetRoleIds: a.endorseHint.filter((id) =>
                  activeRoleIds.has(id) && id !== table.roleId && id !== AI_SYSTEMS_ROLE_ID
                ),
              }))
              .filter((h) => h.targetRoleIds.length > 0),
            computeAllocation,
          });
        } catch {
          console.error(`[aiGenerate] NPC sample failed for ${table.roleId}`);
        }
      }
    }

    // NPC tables with no sample actions (round 4+) fall back to AI generation
    const npcPendingRoleIds = new Set(pending.map((p) => p.roleId));
    const npcFallback = npcTables.filter((t) => !npcPendingRoleIds.has(t.roleId));
    if (npcFallback.length > 0) {
      aiTables = [...aiTables, ...npcFallback];
    }

    // AI tables: use LLM. Three independent reads — parallelise.
    const enabledRoleNames = enabledTables.map((t) => t.roleName);
    const [rounds, prevSubs, allRequests] = await Promise.all([
      ctx.runQuery(internal.rounds.getAllForPipeline, { gameId }),
      roundNumber > 1
        ? ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber: roundNumber - 1 })
        : Promise.resolve<Submission[]>([]),
      ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber }),
    ]);

    // Complexity is inherent: builds rich context per AI table (previous round,
    // safety lead info, proposals, disposition) for realistic LLM-generated actions.
    // eslint-disable-next-line complexity
    await Promise.all(aiTables.map(async (table) => {
      const role = ROLES.find((r) => r.id === table.roleId);
      if (!role) return;

      const currentRound = rounds.find((r) => r.number === roundNumber);
      const prevRound = rounds.find((r) => r.number === roundNumber - 1);

      // Build rich previous round context. Prefer the new outcomes/stateOfPlay/pressures
      // shape; fall back to legacy 4-domain buckets for older rounds.
      let previousContext = "";
      if (roundNumber > 1 && prevRound?.summary) {
        previousContext += `\nPREVIOUS ROUND (${prevRound.label}) — WHAT HAPPENED:`;
        const s = prevRound.summary;
        if (s.outcomes || s.stateOfPlay || s.pressures) {
          if (s.outcomes) previousContext += `\nOutcomes: ${s.outcomes}`;
          if (s.stateOfPlay) previousContext += `\nState of play: ${s.stateOfPlay}`;
          if (s.pressures) previousContext += `\nPressures: ${s.pressures}`;
        } else {
          if (s.labs && s.labs.length > 0) previousContext += `\nLabs: ${s.labs.join(" | ")}`;
          if (s.geopolitics && s.geopolitics.length > 0) previousContext += `\nGeopolitics: ${s.geopolitics.join(" | ")}`;
          if (s.publicAndMedia && s.publicAndMedia.length > 0) previousContext += `\nPublic & media: ${s.publicAndMedia.join(" | ")}`;
          if (s.aiSystems && s.aiSystems.length > 0) previousContext += `\nAI systems: ${s.aiSystems.join(" | ")}`;
        }
      }

      // Own previous actions and outcomes
      const ownPrevSub = (prevSubs ?? []).find((s) => s.roleId === table.roleId);
      if (ownPrevSub && ownPrevSub.actions.length > 0) {
        previousContext += `\nYOUR PREVIOUS ACTIONS AND OUTCOMES:`;
        for (const a of ownPrevSub.actions) {
          const result = a.success === true ? "SUCCEEDED" : a.success === false ? "FAILED" : "unknown";
          previousContext += `\n- "${a.text}" → ${result}${a.probability ? ` (${a.probability}% chance, rolled ${a.rolled})` : ""}`;
        }
        previousContext += `\nAdapt your strategy based on what worked and what didn't.`;
      }

      // Safety lead specific context
      let safetyLeadContext = "";
      if (isLabSafety(role) && role.labId) {
        const lab = labs.find((l) => l.roleId === `${role.labId}-ceo`);
        if (lab) {
          safetyLeadContext += `\nYOUR LAB'S CURRENT STATE (${lab.name}):`;
          safetyLeadContext += `\n- Compute: ${lab.computeStock}u, R&D multiplier: ${lab.rdMultiplier}x`;
          safetyLeadContext += `\n- Allocation: Deployment ${lab.allocation.deployment}%, Research ${lab.allocation.research}%, Safety ${lab.allocation.safety}%`;
          safetyLeadContext += `\nYou cannot directly change the allocation — that's the CEO's decision. But your actions can influence it.`;
        }
        // CEO's previous actions
        const ceoRoleId = `${role.labId}-ceo`;
        const ceoSub = (prevSubs ?? []).find((s) => s.roleId === ceoRoleId);
        if (ceoSub) {
          safetyLeadContext += `\nYOUR CEO'S PREVIOUS ACTIONS:`;
          for (const a of ceoSub.actions) safetyLeadContext += `\n- "${a.text}"`;
          if (ceoSub.computeAllocation) {
            safetyLeadContext += `\nCEO set allocation: Deployment ${ceoSub.computeAllocation.deployment}%, Research ${ceoSub.computeAllocation.research}%, Safety ${ceoSub.computeAllocation.safety}%`;
          }
        }
      }

      // Accepted proposals context
      let proposalContext = "";
      const accepted = allRequests.filter(
        (p) => p.status === "accepted" && (p.fromRoleId === table.roleId || p.toRoleId === table.roleId)
      );
      if (accepted.length > 0) {
        proposalContext += `\nACCEPTED AGREEMENTS THIS ROUND:`;
        for (const p of accepted) {
          const partner = p.fromRoleId === table.roleId ? p.toRoleName : p.fromRoleName;
          proposalContext += `\n- Agreement with ${partner}: "${p.actionText}"`;
        }
        proposalContext += `\nIncorporate these agreements into your actions where relevant.`;
      }

      const aiDisposition = table.roleId === AI_SYSTEMS_ROLE_ID && table.aiDisposition
        ? getDisposition(table.aiDisposition)
        : undefined;

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
        const { output } = await callAnthropic<{
          actions: { text: string; priority: number; secret?: boolean }[];
          endorseHints?: { actionText: string; targetRoleIds: string[] }[];
          computeAllocation?: { deployment: number; research: number; safety: number };
          computeRequestHints?: { targetRoleId: string; amount: number; actionText: string }[];
        }>({
          models: GRADING_MODELS,
          systemPrompt: SCENARIO_CONTEXT,
          prompt,
          maxTokens: 2048,
          toolName: "submit_actions",
          schema: {
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
          },
        });

        if (output?.actions) {
          let actions = output.actions.slice(0, actionsPerTable);
          // Clamp priorities
          const totalPriority = actions.reduce((s, a) => s + a.priority, 0);
          if (totalPriority > 10) {
            const scale = 10 / totalPriority;
            actions = actions.map((a) => ({ ...a, priority: Math.max(1, Math.round(a.priority * scale)) }));
          }
          // Normalize compute allocation to sum to 100
          let computeAllocation = output.computeAllocation;
          if (computeAllocation) {
            const rawSum = computeAllocation.deployment + computeAllocation.research + computeAllocation.safety;
            if (rawSum > 0 && rawSum !== 100) {
              const scale = 100 / rawSum;
              const deployment = Math.round(computeAllocation.deployment * scale);
              const research = Math.round(computeAllocation.research * scale);
              const safety = 100 - deployment - research;
              computeAllocation = { deployment, research, safety };
            } else if (rawSum <= 0) {
              computeAllocation = { deployment: 34, research: 33, safety: 33 };
            }
          }
          // Filter valid compute request hints (positive amount, valid target, not self)
          const computeRequestHints = (output.computeRequestHints ?? []).filter(
            (h) => h.amount > 0 && h.targetRoleId !== table.roleId && activeRoleIds.has(h.targetRoleId)
          );

          // Filter + validate endorseHints: must reference an actual generated action, valid targets
          const actionTexts = new Set(actions.map((a) => a.text));
          const endorseHints = (output.endorseHints ?? [])
            .filter((h) => actionTexts.has(h.actionText))
            .map((h) => ({
              actionText: h.actionText,
              targetRoleIds: h.targetRoleIds.filter((id) =>
                activeRoleIds.has(id) && id !== table.roleId && id !== AI_SYSTEMS_ROLE_ID
              ),
            }))
            .filter((h) => h.targetRoleIds.length > 0);

          pending.push({
            tableId: table._id,
            roleId: table.roleId,
            actions,
            computeAllocation,
            endorseHints: endorseHints.length > 0 ? endorseHints : undefined,
            computeRequestHints: computeRequestHints.length > 0 ? computeRequestHints : undefined,
          });
        }
      } catch {
        console.error(`[aiGenerate] Failed for ${table.roleId}`);
      }
    }));

    // Check which AI/NPC tables are missing from pending (generation failed silently)
    const pendingRoleIds = new Set(pending.map((p) => p.roleId));
    const failedGeneration = nonHumanTables.filter((t) => !pendingRoleIds.has(t.roleId));
    if (failedGeneration.length > 0) {
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

    // Submit all actions in parallel (independent mutations, no conflicts).
    // submitInternal returns the stamped actions so we can build the actionId
    // lookup without a follow-up getAllForRound query.
    type SubmitResult = typeof pending[number] & {
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
        }).then<SubmitResult>((res) => ({ ...p, submissionId: res.submissionId, stampedActions: res.actions }))
      )
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[aiGenerate] Submission failed:`, r.reason);
      }
    }
    const submitted = results
      .filter((r): r is PromiseFulfilledResult<SubmitResult> => r.status === "fulfilled")
      .map((r) => r.value);

    // Log submission failures
    const submissionFailures = results.filter((r) => r.status === "rejected");
    if (submissionFailures.length > 0) {
      console.error(`[aiGenerate] ${submissionFailures.length} submission mutation(s) failed`);
    }

    // Send endorsement/compute requests sequentially to avoid OCC conflicts on requests table.
    const roleMap = new Map(enabledTables.map((t) => [t.roleId, t.roleName]));
    const actionIdByRoleAndText = new Map<string, string>();
    for (const p of submitted) {
      for (const action of p.stampedActions) {
        if (action.actionId) {
          actionIdByRoleAndText.set(`${p.roleId}:${action.text}`, action.actionId);
        }
      }
    }

    // Send endorsement/compute requests sequentially with stable actionIds
    for (const p of submitted) {
      for (const hint of p.endorseHints ?? []) {
        const actionId = actionIdByRoleAndText.get(`${p.roleId}:${hint.actionText}`) ?? "";
        for (const targetId of hint.targetRoleIds) {
          try {
            await ctx.runMutation(internal.requests.sendInternal, {
              gameId,
              roundNumber,
              fromRoleId: p.roleId,
              fromRoleName: roleMap.get(p.roleId) ?? p.roleId,
              toRoleId: targetId,
              toRoleName: roleMap.get(targetId) ?? targetId,
              actionId,
              actionText: hint.actionText,
              requestType: "endorsement",
            });
          } catch { /* request already exists */ }
        }
      }
      for (const hint of p.computeRequestHints ?? []) {
        const actionId = actionIdByRoleAndText.get(`${p.roleId}:${hint.actionText}`) ?? "";
        try {
          await ctx.runMutation(internal.requests.sendInternal, {
            gameId,
            roundNumber,
            fromRoleId: p.roleId,
            fromRoleName: roleMap.get(p.roleId) ?? p.roleId,
            toRoleId: hint.targetRoleId,
            toRoleName: roleMap.get(hint.targetRoleId) ?? hint.targetRoleId,
            actionId,
            actionText: hint.actionText,
            requestType: "compute",
            computeAmount: hint.amount,
          });
        } catch { /* request already exists */ }
      }
    }

    // Schedule AI proposal responses for roles that have pending requests
    const pendingRequests: Request[] = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });
    for (const p of submitted) {
      const hasPending = pendingRequests.some(
        (r) => r.toRoleId === p.roleId && r.status === "pending"
      );
      if (hasPending) {
        await ctx.scheduler.runAfter(0, internal.aiProposals.respond, {
          gameId,
          roundNumber,
          roleId: p.roleId,
        });
      }
    }
  },
});
