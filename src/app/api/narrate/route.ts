import { generateText, Output, createGateway } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { NARRATIVE_MODEL } from "@/lib/ai-models";
import { buildNarrativePrompt } from "@/lib/ai-prompts";

const NarrativeOutput = z.object({
  geopoliticalEvents: z.array(z.string()),
  aiStateOfPlay: z.array(z.string()),
  headlines: z.array(z.string()),
  worldState: z.object({
    capability: z.number(),
    alignment: z.number(),
    tension: z.number(),
    awareness: z.number(),
    regulation: z.number(),
    australia: z.number(),
  }),
  facilitatorNotes: z.string(),
  labUpdates: z.array(
    z.object({
      name: z.string(),
      newComputeStock: z.number(),
      newRdMultiplier: z.number(),
      newAllocation: z.object({
        users: z.number(),
        capability: z.number(),
        safety: z.number(),
      }),
    })
  ),
});

const gw = createGateway();

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      gameId,
      roundNumber,
    }: { gameId: string; roundNumber: number } = body;

    const game = await convex.query(api.games.get, {
      gameId: gameId as Id<"games">,
    });
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    const submissions = await convex.query(api.submissions.getByGameAndRound, {
      gameId: gameId as Id<"games">,
      roundNumber,
    });

    const rounds = await convex.query(api.rounds.getByGame, {
      gameId: gameId as Id<"games">,
    });
    const currentRound = rounds?.find((r) => r.number === roundNumber);

    const resolvedActions = (submissions ?? []).flatMap((sub) => {
      const role = ROLES.find((r) => r.id === sub.roleId);
      return sub.actions
        .filter((a) => a.rolled != null)
        .map((a) => ({
          roleName: role?.name ?? sub.roleId,
          text: a.text,
          priority: a.priority,
          probability: a.probability ?? 50,
          rolled: a.rolled!,
          success: a.success ?? false,
        }));
    });

    const { output } = await generateText({
      model: gw(NARRATIVE_MODEL),
      output: Output.object({
        schema: NarrativeOutput,
      }),
      prompt: buildNarrativePrompt({
        round: roundNumber,
        roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
        roundTitle: currentRound?.title ?? "",
        worldState: game.worldState,
        capabilityLevel: currentRound?.capabilityLevel ?? "Unknown",
        resolvedActions,
        labs: game.labs,
      }),
      maxRetries: 3,
    });

    if (output) {
      await convex.mutation(api.rounds.applySummary, {
        gameId: gameId as Id<"games">,
        roundNumber,
        summary: {
          geopoliticalEvents: output.geopoliticalEvents,
          aiStateOfPlay: output.aiStateOfPlay,
          headlines: output.headlines,
          facilitatorNotes: output.facilitatorNotes,
        },
      });

      // Clamp world state values to 0-10
      const clamp = (v: number) => Math.max(0, Math.min(10, Math.round(v)));
      await convex.mutation(api.games.updateWorldState, {
        gameId: gameId as Id<"games">,
        worldState: {
          capability: clamp(output.worldState.capability),
          alignment: clamp(output.worldState.alignment),
          tension: clamp(output.worldState.tension),
          awareness: clamp(output.worldState.awareness),
          regulation: clamp(output.worldState.regulation),
          australia: clamp(output.worldState.australia),
        },
      });

      // Update lab compute stocks, R&D multipliers, and allocation
      if (output.labUpdates) {
        // Clamp multiplier to reasonable bounds
        const maxMultiplier = roundNumber === 1 ? 10 : roundNumber === 2 ? 40 : 200;
        const updatedLabs = game.labs.map((lab) => {
          const update = output.labUpdates.find((u) => u.name === lab.name);
          if (!update) return lab;
          return {
            ...lab,
            computeStock: Math.max(0, Math.round(update.newComputeStock)),
            rdMultiplier: Math.min(maxMultiplier, Math.max(0, update.newRdMultiplier)),
            allocation: update.newAllocation
              ? {
                  users: Math.round(update.newAllocation.users),
                  capability: Math.round(update.newAllocation.capability),
                  safety: Math.round(update.newAllocation.safety),
                }
              : lab.allocation,
          };
        });
        await convex.mutation(api.games.updateLabs, {
          gameId: gameId as Id<"games">,
          labs: updatedLabs,
        });
      }
    }

    return Response.json({ success: true, narrative: output });
  } catch (error) {
    console.error("Narrative error:", error);
    return Response.json(
      { error: "Narrative generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
