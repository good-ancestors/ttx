"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS } from "./aiModels";
import { type Role, ROLES, PRIORITY_DECAY, isLabCeo, isLabSafety, hasCompute, getDisposition } from "@/lib/game-data";
import { AI_SYSTEMS_ROLE_ID } from "./gameData";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";
import { getSampleActions, pickRandom } from "@/lib/sample-actions";

type Round = Doc<"rounds">;
type Request = Doc<"requests">;


type Table = Doc<"tables">;
type Submission = Doc<"submissions">;

/** Pick a lab for an NPC with compute to loan 30-50% of stock to.
 *  Prefers labs whose CEOs are endorsed by the NPC's picked actions. */
function npcComputeTransfer(
  role: Role | undefined,
  table: Table,
  game: { labs: { roleId: string }[] },
  activeRoleIds: Set<string>,
  endorsedRoleIds?: string[],
): { toRoleId: string; amount: number }[] | undefined {
  if (!role || !hasCompute(role) || isLabCeo(role)) return undefined;
  const stock = table.computeStock ?? 0;
  if (stock <= 0 || game.labs.length === 0) return undefined;
  const enabledLabRoleIds = game.labs.map((l) => l.roleId).filter((id) => activeRoleIds.has(id));
  if (enabledLabRoleIds.length === 0) return undefined;
  const pct = 0.3 + Math.random() * 0.2; // 30-50%
  const amount = Math.max(1, Math.floor(stock * pct));

  // Prefer the most-endorsed lab CEO from the NPC's sample actions
  let targetLabRoleId: string | undefined;
  if (endorsedRoleIds && endorsedRoleIds.length > 0) {
    const labCeoRoleIdSet = new Set(enabledLabRoleIds);
    const counts = new Map<string, number>();
    for (const id of endorsedRoleIds) {
      if (labCeoRoleIdSet.has(id)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    if (counts.size > 0) {
      let best = "";
      let bestCount = 0;
      for (const [id, count] of counts) {
        if (count > bestCount) { best = id; bestCount = count; }
      }
      targetLabRoleId = best;
    }
  }

  // Fall back to random lab
  if (!targetLabRoleId) {
    targetLabRoleId = enabledLabRoleIds[Math.floor(Math.random() * enabledLabRoleIds.length)];
  }
  return [{ toRoleId: targetLabRoleId, amount }];
}

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

    const game = await ctx.runQuery(internal.games.getInternal, { gameId });
    if (!game) return;

    const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
    const submissions: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
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
      actions: { text: string; priority: number; secret?: boolean }[];
      computeAllocation?: { users: number; capability: number; safety: number };
      endorseHints?: { actionText: string; targetRoleIds: string[] }[];
      computeTransfers?: { toRoleId: string; amount: number }[];
      computeRequestHints?: { targetRoleId: string; amount: number; actionText: string }[];
    }
    const pending: PendingAction[] = [];

    // NPC tables: use sample actions
    if (sampleData) {
      const activeRoleIds = new Set(enabledTables.map((t) => t.roleId));
      for (const table of npcTables) {
        try {
          const all = getSampleActions(sampleData as never, table.roleId, roundNumber);
          if (all.length === 0) continue;
          const picked = pickRandom(all, actionsPerTable);
          const decay = PRIORITY_DECAY[picked.length] ?? PRIORITY_DECAY[5];

          const role = ROLES.find((r) => r.id === table.roleId);

          // NPC lab CEOs: randomize existing allocation slightly
          let computeAllocation: { users: number; capability: number; safety: number } | undefined;
          if (role && isLabCeo(role)) {
            const lab = game.labs.find((l) => l.roleId === table.roleId);
            if (lab) {
              const shift = Math.floor(Math.random() * 11) - 5; // -5 to +5
              const cap = Math.max(0, Math.min(100, lab.allocation.capability + shift));
              const safety = Math.max(0, Math.min(100, lab.allocation.safety - shift));
              const total = lab.allocation.users + cap + safety;
              computeAllocation = total > 0
                ? { users: Math.round(lab.allocation.users * 100 / total), capability: Math.round(cap * 100 / total), safety: 100 - Math.round(lab.allocation.users * 100 / total) - Math.round(cap * 100 / total) }
                : { users: 34, capability: 33, safety: 33 };
            }
          }

          // NPC non-lab has-compute roles: loan to an endorsed or random enabled lab
          const endorsedRoleIds = picked.flatMap((a) => a.endorseHint ?? []);
          const computeTransfers = npcComputeTransfer(role, table, game, activeRoleIds, endorsedRoleIds);

          pending.push({
            tableId: table._id,
            roleId: table.roleId,
            actions: picked.map((a, i) => ({ text: a.text, priority: decay[i] ?? 1, secret: a.secret || undefined })),
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
            computeTransfers,
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

    // AI tables: use LLM
    const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
    const enabledRoleNames = enabledTables.map((t) => t.roleName);

    // Fetch previous round data for context
    const prevSubs = roundNumber > 1
      ? await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber: roundNumber - 1 })
      : [];
    const allRequests: Request[] = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });

    // Complexity is inherent: builds rich context per AI table (previous round,
    // safety lead info, proposals, disposition) for realistic LLM-generated actions.
    // eslint-disable-next-line complexity
    await Promise.all(aiTables.map(async (table) => {
      const role = ROLES.find((r) => r.id === table.roleId);
      if (!role) return;

      const currentRound = rounds.find((r) => r.number === roundNumber);
      const prevRound = rounds.find((r) => r.number === roundNumber - 1);

      // Build rich previous round context
      let previousContext = "";
      if (roundNumber > 1 && prevRound?.summary) {
        previousContext += `\nPREVIOUS ROUND (${prevRound.label}) — WHAT HAPPENED:`;
        previousContext += `\nHeadlines: ${prevRound.summary.headlines.join(" | ")}`;
        if (prevRound.summary.geopoliticalEvents.length > 0) {
          previousContext += `\nKey events: ${prevRound.summary.geopoliticalEvents.slice(0, 3).join("; ")}`;
        }
        if (prevRound.worldStateAfter) {
          const ws = prevRound.worldStateAfter;
          previousContext += `\nWorld state after last round: Cap ${ws.capability}/10, Align ${ws.alignment}/10, Tension ${ws.tension}/10`;
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
        const lab = game.labs.find((l) => l.roleId === `${role.labId}-ceo`);
        if (lab) {
          safetyLeadContext += `\nYOUR LAB'S CURRENT STATE (${lab.name}):`;
          safetyLeadContext += `\n- Compute: ${lab.computeStock}u, R&D multiplier: ${lab.rdMultiplier}x`;
          safetyLeadContext += `\n- Allocation: Users ${lab.allocation.users}%, Capability ${lab.allocation.capability}%, Safety ${lab.allocation.safety}%`;
          safetyLeadContext += `\nYou cannot directly change the allocation — that's the CEO's decision. But your actions can influence it.`;
        }
        // CEO's previous actions
        const ceoRoleId = `${role.labId}-ceo`;
        const ceoSub = (prevSubs ?? []).find((s) => s.roleId === ceoRoleId);
        if (ceoSub) {
          safetyLeadContext += `\nYOUR CEO'S PREVIOUS ACTIONS:`;
          for (const a of ceoSub.actions) safetyLeadContext += `\n- "${a.text}"`;
          if (ceoSub.computeAllocation) {
            safetyLeadContext += `\nCEO set allocation: Users ${ceoSub.computeAllocation.users}%, Capability ${ceoSub.computeAllocation.capability}%, Safety ${ceoSub.computeAllocation.safety}%`;
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
- World state: Capability ${game.worldState.capability}/10, Alignment ${game.worldState.alignment}/10, US-China Tension ${game.worldState.tension}/10, Public Awareness ${game.worldState.awareness}/10, Regulation ${game.worldState.regulation}/10, Australian Preparedness ${game.worldState.australia}/10

LAB STATUS:
${game.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}
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
${isLabCeo(role) ? `Also set your compute allocation (users/capability/safety percentages summing to 100).
You may also request compute from government players. Output computeRequestHints: [{ targetRoleId: "<government-role-id>", amount: <number>, actionText: "<reason>" }] if you want to request compute. Empty array if not.
Available government roles: ${enabledTables.filter((t) => ROLES.find((r) => r.id === t.roleId)?.tags.includes("government")).map((t) => `${t.roleName} (${t.roleId})`).join(", ") || "none"}` : ""}
${hasCompute(role) && !isLabCeo(role) ? `You have ${table.computeStock ?? 0} compute units. You may choose to loan some to a lab or another player.
Output computeTransfers: [{ toRoleId: "<role-id>", amount: <number> }] if you want to send compute. Empty array if not.
Available labs: ${game.labs.map((l) => `${l.name} (${l.roleId})`).join(", ")}` : ""}
${role.artifactPrompt ? `\nOptionally write a creative artifact: ${role.artifactPrompt}` : ""}`;

      try {
        const { output } = await callAnthropic<{
          actions: { text: string; priority: number; secret?: boolean }[];
          computeAllocation?: { users: number; capability: number; safety: number };
          computeTransfers?: { toRoleId: string; amount: number }[];
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
              computeAllocation: {
                type: "object",
                properties: { users: { type: "number" }, capability: { type: "number" }, safety: { type: "number" } },
              },
              computeTransfers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    toRoleId: { type: "string" },
                    amount: { type: "number" },
                  },
                  required: ["toRoleId", "amount"],
                },
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
            const rawSum = computeAllocation.users + computeAllocation.capability + computeAllocation.safety;
            if (rawSum > 0 && rawSum !== 100) {
              const scale = 100 / rawSum;
              const users = Math.round(computeAllocation.users * scale);
              const capability = Math.round(computeAllocation.capability * scale);
              const safety = 100 - users - capability;
              computeAllocation = { users, capability, safety };
            } else if (rawSum <= 0) {
              computeAllocation = { users: 34, capability: 33, safety: 33 };
            }
          }
          // Filter valid compute transfers (positive amount, valid target, not self)
          const computeTransfers = (output.computeTransfers ?? []).filter(
            (t) => t.amount > 0 && t.toRoleId !== table.roleId && enabledTables.some((et) => et.roleId === t.toRoleId)
          );

          // Filter valid compute request hints (positive amount, valid target, not self)
          const computeRequestHints = (output.computeRequestHints ?? []).filter(
            (h) => h.amount > 0 && h.targetRoleId !== table.roleId && enabledTables.some((et) => et.roleId === h.targetRoleId)
          );

          pending.push({
            tableId: table._id,
            roleId: table.roleId,
            actions,
            computeAllocation,
            computeTransfers: computeTransfers.length > 0 ? computeTransfers : undefined,
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

    // Submit all actions in parallel (independent mutations, no conflicts)
    const results = await Promise.allSettled(
      pending.map((p) =>
        ctx.runMutation(internal.submissions.submitInternal, {
          tableId: p.tableId as never,
          gameId,
          roundNumber,
          roleId: p.roleId,
          actions: p.actions,
          computeAllocation: p.computeAllocation,
        }).then((subId) => ({ ...p, submissionId: subId }))
      )
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[aiGenerate] Submission failed:`, r.reason);
      }
    }
    const submitted = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<typeof pending[number] & { submissionId: string }>).value);

    // Log submission failures
    const submissionFailures = results.filter((r) => r.status === "rejected");
    if (submissionFailures.length > 0) {
      console.error(`[aiGenerate] ${submissionFailures.length} submission mutation(s) failed`);
    }

    // Execute compute transfers sequentially to avoid OCC conflicts on tables/games docs
    for (const p of submitted) {
      for (const transfer of p.computeTransfers ?? []) {
        try {
          await ctx.runMutation(internal.requests.directTransferInternal, {
            gameId,
            fromRoleId: p.roleId,
            toRoleId: transfer.toRoleId,
            amount: transfer.amount,
          });
        } catch {
          console.error(`[aiGenerate] Compute transfer failed: ${p.roleId} -> ${transfer.toRoleId}`);
        }
      }
    }

    // Send endorsement/compute requests sequentially to avoid OCC conflicts on requests table.
    // Read back submissions to get stable actionIds for endorsement linking
    const roleMap = new Map(enabledTables.map((t) => [t.roleId, t.roleName]));
    const allSubs: Submission[] = await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber });
    const actionIdByRoleAndText = new Map<string, string>();
    for (const sub of allSubs) {
      for (const action of sub.actions) {
        if (action.actionId) {
          actionIdByRoleAndText.set(`${sub.roleId}:${action.text}`, action.actionId);
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
