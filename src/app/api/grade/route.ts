import { z } from "zod";
import { checkApiAuth } from "@/lib/api-auth";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { GRADING_MODEL, GRADING_FALLBACK } from "@/lib/ai-models";
import { buildGradingPrompt } from "@/lib/ai-prompts";
import { generateWithFallback } from "@/lib/ai-fallback";

const GradingOutput = z.object({
  actions: z.array(
    z.object({
      text: z.string(),
      probability: z.union([
        z.enum(["90", "70", "50", "30", "10"]).transform(Number),
        z.number().min(0).max(100),
      ]).transform((p) => {
        // Snap to nearest valid bucket
        const buckets = [10, 30, 50, 70, 90];
        return buckets.reduce((closest, curr) =>
          Math.abs(curr - p) < Math.abs(closest - p) ? curr : closest
        );
      }),
      reasoning: z.string(),
    })
  ),
});

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      submissionId,
      gameId,
      roundNumber,
      roleId,
      actions,
      enabledRoles,
      aiDisposition,
    }: {
      submissionId: string;
      gameId: string;
      roundNumber: number;
      roleId: string;
      actions: { text: string; priority: number }[];
      enabledRoles?: string[];
      aiDisposition?: { label: string; description: string };
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

    // Fetch all submissions for holistic grading (see other players' actions)
    const allSubmissions = await convex.query(api.submissions.getByGameAndRound, {
      gameId: gameId as Id<"games">,
      roundNumber,
    });
    const otherSubmissions = (allSubmissions ?? [])
      .filter((s) => s.roleId !== roleId && s.status === "submitted")
      .map((s) => ({
        roleName: ROLES.find((r) => r.id === s.roleId)?.name ?? s.roleId,
        actions: s.actions.map((a) => ({ text: a.text, priority: a.priority })),
      }));

    // Fetch all requests involving this role (both directions)
    const allProposals = await convex.query(api.requests.getByGameAndRound, {
      gameId: gameId as Id<"games">,
      roundNumber,
    });
    const actionRequests = (allProposals ?? [])
      .filter(
        (p) =>
          p.status !== "pending" &&
          (p.fromRoleId === roleId || p.toRoleId === roleId)
      )
      .map((p) => ({
        actionText: p.actionText,
        fromRoleName: p.fromRoleName,
        toRoleName: p.toRoleName,
        requestType: p.requestType ?? "endorsement",
        computeAmount: p.computeAmount,
        status: p.status,
      }));

    const roleLab = game.labs.find((l) => l.roleId === roleId);

    const prompt = buildGradingPrompt({
      round: roundNumber,
      roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
      worldState: game.worldState,
      roleName: role?.name ?? roleId,
      roleDescription: role?.brief ?? "",
      roleTags: role?.tags,
      actions,
      labs: game.labs,
      capabilityLevel: currentRound?.capabilityLevel ?? "Unknown",
      actionRequests,
      enabledRoles,
      aiDisposition,
      otherSubmissions,
      labSpec: roleLab?.spec,
    });

    const { output, model, timeMs, tokens } = await generateWithFallback({
      primary: GRADING_MODEL,
      fallback: GRADING_FALLBACK,
      prompt,
      schema: GradingOutput,
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

      // Track AI metadata
      await convex.mutation(api.submissions.setAiMeta, {
        submissionId: submissionId as Id<"submissions">,
        aiMeta: {
          gradingModel: model,
          gradingTimeMs: timeMs,
          gradingTokens: tokens,
        },
      });
    }

    if (!output) {
      return Response.json({ error: "All AI models failed to grade", model }, { status: 502 });
    }

    return Response.json({ success: true, grading: output, model, timeMs });
  } catch (error) {
    console.error("Grading error:", error);
    return Response.json(
      { error: "Grading failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
