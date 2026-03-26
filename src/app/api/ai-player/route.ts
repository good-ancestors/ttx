import { generateText, Output, createGateway } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { GRADING_MODEL } from "@/lib/ai-models";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";

const AIPlayerOutput = z.object({
  actions: z.array(
    z.object({
      text: z.string().describe("A specific action with intended outcome"),
      priority: z.number().min(1).max(10),
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

const gw = createGateway();

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
);

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

    const prompt = `${SCENARIO_CONTEXT}

CURRENT GAME STATE:
- Round: ${roundNumber} (${currentRound?.label ?? ""})
- Current AI capability: ${currentRound?.capabilityLevel ?? "Unknown"}
- World state: Capability ${game.worldState.capability}/10, Alignment ${game.worldState.alignment}/10, US-China Tension ${game.worldState.tension}/10, Public Awareness ${game.worldState.awareness}/10, Regulation ${game.worldState.regulation}/10, Australian Preparedness ${game.worldState.australia}/10

LAB STATUS:
${game.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

YOU ARE PLAYING: ${role?.name ?? roleId} — ${role?.subtitle ?? ""}
${role?.brief ?? ""}

Generate 2-4 actions this actor would take this quarter. Each action should:
1. State what you do clearly and specifically
2. Have an intended outcome
3. Be assigned a priority from 1-10 (total budget: 10)

Be strategic, realistic, and scenario-appropriate. ${role?.isLab ? "Also set your compute allocation (users/capability/safety percentages summing to 100)." : ""}
${role?.artifactPrompt ? `\nOptionally write a creative artifact: ${role.artifactPrompt}` : ""}`;

    const { output } = await generateText({
      model: gw(GRADING_MODEL),
      output: Output.object({ schema: AIPlayerOutput }),
      prompt,
      maxRetries: 2,
    });

    if (output) {
      // Submit the AI player's actions
      await convex.mutation(api.submissions.submit, {
        tableId: tableId as Id<"tables">,
        gameId: gameId as Id<"games">,
        roundNumber,
        roleId,
        actions: output.actions.map((a) => ({
          text: a.text,
          priority: a.priority,
        })),
        computeAllocation: output.computeAllocation,
        artifact: output.artifact,
      });
    }

    return Response.json({ success: true, actions: output });
  } catch (error) {
    console.error("AI player error:", error);
    return Response.json(
      { error: "AI player failed", details: String(error) },
      { status: 500 }
    );
  }
}
