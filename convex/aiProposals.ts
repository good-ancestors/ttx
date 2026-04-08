"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { callAnthropic } from "./llm";
import { GRADING_MODELS } from "./aiModels";
import { ROLES } from "@/lib/game-data";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";

type Game = Doc<"games">;

// ─── Respond to endorsement requests + optionally send new ones ───────────────

export const respond = internalAction({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    roleId: v.string(),
  },
  handler: async (ctx, args) => {
    const { gameId, roundNumber, roleId } = args;

    const game: Game | null = await ctx.runQuery(internal.games.getInternal, { gameId });
    if (!game) return;

    const role = ROLES.find((r) => r.id === roleId);
    if (!role) return;

    const allRequests = await ctx.runQuery(internal.requests.getByGameAndRoundInternal, { gameId, roundNumber });
    const pending = (allRequests ?? []).filter((p) => p.toRoleId === roleId && p.status === "pending");

    let pendingSection = "";
    if (pending.length > 0) {
      pendingSection = `\nPENDING PROPOSALS SENT TO YOU (you must accept or reject each):`;
      for (const p of pending) {
        pendingSection += `\n- [id: ${p._id}] From ${p.fromRoleName}: "${p.actionText}"`;
      }
    } else {
      pendingSection = `\nNo pending proposals to respond to.`;
    }

    const prompt = `CURRENT GAME STATE:
- Round: ${roundNumber}
- World state: Capability ${game.worldState.capability}/10, Alignment ${game.worldState.alignment}/10, US-China Tension ${game.worldState.tension}/10, Public Awareness ${game.worldState.awareness}/10, Regulation ${game.worldState.regulation}/10, Australian Preparedness ${game.worldState.australia}/10

LAB STATUS:
${game.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

YOU ARE PLAYING: ${role.name} — ${role.subtitle}
${role.brief}

PERSONALITY: ${role.personality ?? "Strategic and scenario-appropriate."}
${pendingSection}

INSTRUCTIONS:
For each pending request, decide whether to accept or decline. Accept requests that genuinely benefit your strategic position. Decline ones that don't.`;

    try {
      const { output } = await callAnthropic<{
        responses: { proposalId: string; accept: boolean; reasoning: string }[];
      }>({
        models: GRADING_MODELS,
        systemPrompt: SCENARIO_CONTEXT,
        prompt,
        maxTokens: 1024,
        toolName: "respond_to_proposals",
        schema: {
          type: "object",
          properties: {
            responses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  proposalId: { type: "string" },
                  accept: { type: "boolean" },
                  reasoning: { type: "string" },
                },
                required: ["proposalId", "accept", "reasoning"],
              },
            },
          },
          required: ["responses"],
        },
      });

      if (!output) return;

      // Respond to pending proposals
      for (const resp of output.responses) {
        try {
          await ctx.runMutation(internal.requests.respondInternal, {
            proposalId: resp.proposalId as never,
            status: resp.accept ? "accepted" : "declined",
          });
        } catch { /* proposal may no longer exist */ }
      }

    } catch (err) {
      console.error(`[aiProposals] Failed for ${roleId}:`, err);
    }
  },
});
