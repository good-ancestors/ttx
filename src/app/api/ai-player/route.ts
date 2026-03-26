import { z } from "zod";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, isLabCeo, isLabSafety, hasCompute } from "@/lib/game-data";
import { GRADING_MODEL, GRADING_FALLBACK } from "@/lib/ai-models";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";
import { generateWithFallback } from "@/lib/ai-fallback";

const AIPlayerOutput = z.object({
  actions: z.array(
    z.object({
      text: z.string().describe("A specific action with intended outcome"),
      priority: z.number().min(1).max(10),
      secret: z.optional(z.boolean()).describe("Set true for covert/secret actions that should be hidden from other players"),
    })
  ).min(1).max(5),
  computeAllocation: z.optional(
    z.object({
      users: z.number().min(0).max(100),
      capability: z.number().min(0).max(100),
      safety: z.number().min(0).max(100),
    })
  ),
  artifact: z.optional(z.string()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tableId,
      gameId,
      roundNumber,
      roleId,
    }: {
      tableId: string;
      gameId: string;
      roundNumber: number;
      roleId: string;
    } = body;

    const game = await convex.query(api.games.get, {
      gameId: gameId as Id<"games">,
    });
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    const role = ROLES.find((r) => r.id === roleId);
    const rounds = await convex.query(api.rounds.getByGame, {
      gameId: gameId as Id<"games">,
    });
    const currentRound = rounds?.find((r) => r.number === roundNumber);

    // ── Previous round context (items 2-3: diversity + memory) ──
    let previousContext = "";
    if (roundNumber > 1) {
      const prevRound = rounds?.find((r) => r.number === roundNumber - 1);

      // Previous round narrative
      if (prevRound?.summary) {
        previousContext += `\nPREVIOUS ROUND (${prevRound.label}) — WHAT HAPPENED:`;
        previousContext += `\nHeadlines: ${prevRound.summary.headlines.join(" | ")}`;
        if (prevRound.summary.geopoliticalEvents.length > 0) {
          previousContext += `\nKey events: ${prevRound.summary.geopoliticalEvents.slice(0, 3).join("; ")}`;
        }
      }

      // Previous world state snapshot for comparison
      if (prevRound?.worldStateAfter) {
        const ws = prevRound.worldStateAfter;
        previousContext += `\nWorld state after last round: Cap ${ws.capability}/10, Align ${ws.alignment}/10, Tension ${ws.tension}/10`;
      }

      // This role's previous actions and outcomes
      const prevSubs = await convex.query(api.submissions.getByGameAndRound, {
        gameId: gameId as Id<"games">,
        roundNumber: roundNumber - 1,
      });
      const ownPrevSub = prevSubs?.find((s) => s.roleId === roleId);
      if (ownPrevSub && ownPrevSub.actions.length > 0) {
        previousContext += `\nYOUR PREVIOUS ACTIONS AND OUTCOMES:`;
        for (const a of ownPrevSub.actions) {
          const result = a.success === true ? "SUCCEEDED" : a.success === false ? "FAILED" : "unknown";
          previousContext += `\n- "${a.text}" → ${result}${a.probability ? ` (${a.probability}% chance, rolled ${a.rolled})` : ""}`;
        }
        previousContext += `\nAdapt your strategy based on what worked and what didn't.`;
      }
    }

    // ── Safety lead specific context (item 3) ──
    let safetyLeadContext = "";
    if (role && isLabSafety(role) && role.labId) {
      const lab = game.labs.find((l) => l.name.toLowerCase().includes(role.labId!));
      if (lab) {
        safetyLeadContext += `\nYOUR LAB'S CURRENT STATE (${lab.name}):`;
        safetyLeadContext += `\n- Compute: ${lab.computeStock}u, R&D multiplier: ${lab.rdMultiplier}x`;
        safetyLeadContext += `\n- Allocation: Users ${lab.allocation.users}%, Capability ${lab.allocation.capability}%, Safety ${lab.allocation.safety}%`;
        safetyLeadContext += `\nYou cannot directly change the allocation — that's the CEO's decision. But your actions can influence it.`;
        safetyLeadContext += `\nFocus on: advising on the spec, arguing for more safety resources, collaborating with external safety experts, testing the AI, or going public if you believe the CEO is being reckless.`;
      }

      // CEO's previous actions
      if (roundNumber > 1) {
        const ceoRoleId = role.labId ? `${role.labId}-ceo` : undefined;
        if (ceoRoleId) {
          const prevSubs = await convex.query(api.submissions.getByGameAndRound, {
            gameId: gameId as Id<"games">,
            roundNumber: roundNumber - 1,
          });
          const ceoSub = prevSubs?.find((s) => s.roleId === ceoRoleId);
          if (ceoSub) {
            safetyLeadContext += `\nYOUR CEO'S PREVIOUS ACTIONS:`;
            for (const a of ceoSub.actions) {
              safetyLeadContext += `\n- "${a.text}"`;
            }
            if (ceoSub.computeAllocation) {
              safetyLeadContext += `\nCEO set allocation: Users ${ceoSub.computeAllocation.users}%, Capability ${ceoSub.computeAllocation.capability}%, Safety ${ceoSub.computeAllocation.safety}%`;
            }
          }
        }
      }
    }

    // ── Proposals context ──
    let proposalContext = "";
    const allProposals = await convex.query(api.requests.getByGameAndRound, {
      gameId: gameId as Id<"games">,
      roundNumber,
    });
    const accepted = (allProposals ?? []).filter(
      (p) => p.status === "accepted" && (p.fromRoleId === roleId || p.toRoleId === roleId)
    );
    if (accepted.length > 0) {
      proposalContext += `\nACCEPTED AGREEMENTS THIS ROUND:`;
      for (const p of accepted) {
        const partner = p.fromRoleId === roleId ? p.toRoleName : p.fromRoleName;
        proposalContext += `\n- Agreement with ${partner}: "${p.actionText}"`;
      }
      proposalContext += `\nIncorporate these agreements into your actions where relevant.`;
    }

    const enabledRoles: string[] = body.enabledRoles ?? [];
    const activeRolesNote = enabledRoles.length > 0
      ? `\nACTIVE PLAYERS THIS GAME: ${enabledRoles.join(", ")}\nYou can reference any global actor in your actions, but support requests can only target active players.`
      : "";

    const prompt = `${SCENARIO_CONTEXT}
${activeRolesNote}

CURRENT GAME STATE:
- Round: ${roundNumber} (${currentRound?.label ?? ""})
- Current AI capability: ${currentRound?.capabilityLevel ?? "Unknown"}
- World state: Capability ${game.worldState.capability}/10, Alignment ${game.worldState.alignment}/10, US-China Tension ${game.worldState.tension}/10, Public Awareness ${game.worldState.awareness}/10, Regulation ${game.worldState.regulation}/10, Australian Preparedness ${game.worldState.australia}/10

LAB STATUS:
${game.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}
${previousContext}${safetyLeadContext}${proposalContext}

YOU ARE PLAYING: ${role?.name ?? roleId} — ${role?.subtitle ?? ""}
${role?.brief ?? ""}

PERSONALITY: ${role?.personality ?? "Strategic and scenario-appropriate."}

Generate 2-4 actions this actor would take this quarter. Each action should:
1. State what you do clearly and specifically
2. Have an intended outcome
3. Be assigned a priority from 1-10 (total budget: 10)

Be strategic, realistic, and scenario-appropriate. Do NOT repeat actions from previous rounds — adapt your strategy.
${role && isLabCeo(role) ? "Also set your compute allocation (users/capability/safety percentages summing to 100)." : ""}
${role && hasCompute(role) && !isLabCeo(role) ? `You have ${body.computeStock ?? 0} compute units that other players may request via the support request system.` : ""}
${role?.artifactPrompt ? `\nOptionally write a creative artifact: ${role.artifactPrompt}` : ""}`;

    const { output, model: usedModel, timeMs } = await generateWithFallback({
      primary: GRADING_MODEL,
      fallback: GRADING_FALLBACK,
      prompt,
      schema: AIPlayerOutput,
    });

    if (output) {
      const subId = await convex.mutation(api.submissions.submit, {
        tableId: tableId as Id<"tables">,
        gameId: gameId as Id<"games">,
        roundNumber,
        roleId,
        actions: output.actions.map((a) => ({
          text: a.text,
          priority: a.priority,
          secret: a.secret || undefined,
        })),
        computeAllocation: output.computeAllocation,
        artifact: output.artifact,
      });

      await convex.mutation(api.submissions.setAiMeta, {
        submissionId: subId,
        aiMeta: { playerModel: usedModel, playerTimeMs: timeMs },
      });
    }

    return Response.json({ success: true, actions: output, model: usedModel, timeMs });
  } catch (error) {
    console.error("AI player error:", error);
    return Response.json(
      { error: "AI player failed", details: String(error) },
      { status: 500 }
    );
  }
}
