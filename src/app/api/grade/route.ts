import { generateText, Output, createGateway } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { GRADING_MODEL } from "@/lib/ai-models";
import { buildGradingPrompt } from "@/lib/ai-prompts";

const GradingOutput = z.object({
  actions: z.array(
    z.object({
      text: z.string(),
      probability: z
        .enum(["90", "70", "50", "30", "10"])
        .transform(Number),
      reasoning: z.string(),
    })
  ),
});

// AI SDK picks up AI_GATEWAY_API_KEY automatically from env
const gw = createGateway();

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      submissionId,
      gameId,
      roundNumber,
      roleId,
      actions,
    }: {
      submissionId: string;
      gameId: string;
      roundNumber: number;
      roleId: string;
      actions: { text: string; priority: number }[];
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

    // Fetch accepted proposals involving this role
    const allProposals = await convex.query(api.proposals.getByGameAndRound, {
      gameId: gameId as Id<"games">,
      roundNumber,
    });
    const acceptedAgreements = (allProposals ?? [])
      .filter(
        (p) =>
          p.status === "accepted" &&
          (p.fromRoleId === roleId || p.toRoleId === roleId)
      )
      .map(
        (p) =>
          `"${p.actionText}" (agreed between ${p.fromRoleName} and ${p.toRoleName})`
      );

    const prompt = buildGradingPrompt({
      round: roundNumber,
      roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
      worldState: game.worldState,
      roleName: role?.name ?? roleId,
      roleDescription: role?.brief ?? "",
      actions,
      labs: game.labs,
      capabilityLevel: currentRound?.capabilityLevel ?? "Unknown",
      acceptedAgreements,
    });

    const { output } = await generateText({
      model: gw(GRADING_MODEL),
      output: Output.object({
        schema: GradingOutput,
      }),
      prompt,
      maxRetries: 3,
    });

    if (output) {
      await convex.mutation(api.submissions.applyGrading, {
        submissionId: submissionId as Id<"submissions">,
        gradedActions: output.actions.map((a, i) => ({
          text: actions[i]?.text ?? a.text,
          priority: actions[i]?.priority ?? 3,
          probability: a.probability,
          reasoning: a.reasoning,
        })),
      });
    }

    return Response.json({ success: true, grading: output });
  } catch (error) {
    console.error("Grading error:", error);
    return Response.json(
      { error: "Grading failed", details: String(error) },
      { status: 500 }
    );
  }
}
