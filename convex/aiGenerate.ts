"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS } from "./aiModels";
import { ROLES, PRIORITY_DECAY, isLabCeo, isLabSafety, hasCompute, getDisposition } from "@/lib/game-data";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";
import { getSampleActions, pickRandom } from "@/lib/sample-actions";

type Round = Doc<"rounds">;
type Request = Doc<"requests">;


type Table = Doc<"tables">;
type Submission = Doc<"submissions">;

// ─── Generate + submit actions for all AI/NPC tables ──────────────────────────

export const generateAll = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, durationSeconds } = args;

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
    const actionsPerTable = totalEnabled <= 6 ? 3 : totalEnabled <= 11 ? 2 : 1;

    const npcTables = nonHumanTables.filter((t) => t.controlMode === "npc");
    const aiTables = nonHumanTables.filter((t) => t.controlMode === "ai");

    // Auto-roll disposition for AI Systems if needed
    const aiSystemsTable = nonHumanTables.find((t) => t.roleId === "ai-systems" && !t.aiDisposition);
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

    // Prepare all submissions
    type PendingAction = { tableId: string; roleId: string; actions: { text: string; priority: number; secret?: boolean }[]; endorseHints?: { actionText: string; targetRoleIds: string[] }[] };
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
          pending.push({
            tableId: table._id,
            roleId: table.roleId,
            actions: picked.map((a, i) => ({ text: a.text, priority: decay[i] ?? 1, secret: a.secret || undefined })),
            endorseHints: picked
              .filter((a) => a.endorseHint?.length)
              .map((a) => ({
                actionText: a.text,
                targetRoleIds: a.endorseHint.filter((id) => activeRoleIds.has(id) && id !== table.roleId),
              }))
              .filter((h) => h.targetRoleIds.length > 0),
          });
        } catch {
          console.error(`[aiGenerate] NPC sample failed for ${table.roleId}`);
        }
      }
    }

    // AI tables: use LLM
    const rounds: Round[] = await ctx.runQuery(internal.rounds.getAllForPipeline, { gameId });
    const enabledRoleNames = enabledTables.map((t) => t.roleName);

    // Fetch previous round data for context
    const prevSubs = roundNumber > 1
      ? await ctx.runQuery(internal.submissions.getAllForRound, { gameId, roundNumber: roundNumber - 1 })
      : [];
    const allRequests: Request[] = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });

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

      const aiDisposition = table.roleId === "ai-systems" && table.aiDisposition
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
${isLabCeo(role) ? "Also set your compute allocation (users/capability/safety percentages summing to 100)." : ""}
${hasCompute(role) && !isLabCeo(role) ? `You have ${table.computeStock ?? 0} compute units that other players may request via the support request system.` : ""}
${role.artifactPrompt ? `\nOptionally write a creative artifact: ${role.artifactPrompt}` : ""}`;

      try {
        const { output } = await callAnthropic<{
          actions: { text: string; priority: number; secret?: boolean }[];
          computeAllocation?: { users: number; capability: number; safety: number };
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
          pending.push({ tableId: table._id, roleId: table.roleId, actions });
        }
      } catch {
        console.error(`[aiGenerate] Failed for ${table.roleId}`);
      }
    }));

    const immediate = durationSeconds <= 0;
    const staggerWindow = immediate ? 0 : durationSeconds * 0.6 * 1000;
    const minStagger = immediate ? 0 : Math.min(15_000, staggerWindow * 0.2);

    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];

      let delay = 0;
      if (!immediate) {
        const baseDelay = minStagger + (staggerWindow - minStagger) * (i / Math.max(1, pending.length - 1));
        const jitter = (Math.random() - 0.5) * 10_000;
        delay = Math.max(3000, baseDelay + jitter);
      }

      await ctx.scheduler.runAfter(delay, internal.aiGenerate.submitAndPropose, {
        gameId,
        roundNumber,
        tableId: p.tableId,
        roleId: p.roleId,
        actions: p.actions,
        endorseHints: p.endorseHints,
      });
    }
  },
});

// ─── Submit a single AI/NPC table's actions + trigger proposals ───────────────

export const submitAndPropose = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    tableId: v.string(),
    roleId: v.string(),
    actions: v.array(v.object({ text: v.string(), priority: v.number(), secret: v.optional(v.boolean()) })),
    endorseHints: v.optional(v.array(v.object({ actionText: v.string(), targetRoleIds: v.array(v.string()) }))),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, tableId, roleId, actions, endorseHints } = args;

    // Submit actions
    try {
      await ctx.runMutation(internal.submissions.submitInternal, {
        tableId: tableId as never,
        gameId,
        roundNumber,
        roleId,
        actions,
      });
    } catch {
      console.error(`[aiGenerate] Submit failed for ${roleId}`);
      return;
    }

    // Send endorsement requests from hints (NPC)
    if (endorseHints?.length) {
      const tables: Table[] = await ctx.runQuery(internal.tables.getByGameInternal, { gameId });
      const roleMap = new Map(tables.filter((t) => t.enabled).map((t) => [t.roleId, t.roleName]));
      for (const hint of endorseHints) {
        for (const targetId of hint.targetRoleIds.slice(0, 1)) {
          try {
            await ctx.runMutation(internal.requests.sendInternal, {
              gameId,
              roundNumber,
              fromRoleId: roleId,
              fromRoleName: roleMap.get(roleId) ?? roleId,
              toRoleId: targetId,
              toRoleName: roleMap.get(targetId) ?? targetId,
              actionText: hint.actionText,
              requestType: "endorsement",
            });
          } catch { /* request already exists */ }
        }
      }
    }

    // Proactive outreach: AI may send new proposals to other tables
    await ctx.scheduler.runAfter(0, internal.aiProposals.respond, {
      gameId,
      roundNumber,
      roleId,
    });
  },
});
