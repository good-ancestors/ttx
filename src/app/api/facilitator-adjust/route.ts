import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { GRADING_MODEL, GRADING_FALLBACK } from "@/lib/ai-models";
import { generateWithFallback } from "@/lib/ai-fallback";

const AdjustOutput = z.object({
  worldState: z.optional(
    z.object({
      capability: z.optional(z.number()),
      alignment: z.optional(z.number()),
      tension: z.optional(z.number()),
      awareness: z.optional(z.number()),
      regulation: z.optional(z.number()),
      australia: z.optional(z.number()),
    })
  ),
  labUpdates: z.optional(
    z.array(
      z.object({
        name: z.string(),
        computeStock: z.optional(z.number()),
        rdMultiplier: z.optional(z.number()),
        allocation: z.optional(
          z.object({
            users: z.number(),
            capability: z.number(),
            safety: z.number(),
          })
        ),
      })
    )
  ),
  explanation: z.string(),
});

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gameId, instruction }: { gameId: string; instruction: string } = body;

    const game = await convex.query(api.games.get, {
      gameId: gameId as Id<"games">,
    });
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    const prompt = `You are the game state adjuster for an AGI tabletop exercise.

CURRENT WORLD STATE:
- Capability: ${game.worldState.capability}/10
- Alignment: ${game.worldState.alignment}/10
- US-China Tension: ${game.worldState.tension}/10
- Public Awareness: ${game.worldState.awareness}/10
- Regulatory Response: ${game.worldState.regulation}/10
- Australian Preparedness: ${game.worldState.australia}/10

CURRENT LABS:
${game.labs.map((l) => `- ${l.name}: ${l.computeStock}u compute, ${l.rdMultiplier}x R&D | Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

THE FACILITATOR INSTRUCTS:
"${instruction}"

Apply the facilitator's instruction to the game state. Output ONLY the values that should change — omit fields that stay the same. For world state dials, output the new absolute value (0-10). For labs, output new values for any field that changes.

Be precise and literal. If the facilitator says "reduce OpenBrain compute by 30%", calculate 30% of the current stock and subtract it. If they say "tension to 5", set it to 5 exactly.

In the explanation field, describe what you changed and why.`;

    const { output } = await generateWithFallback({
      primary: GRADING_MODEL,
      fallback: GRADING_FALLBACK,
      prompt,
      schema: AdjustOutput,
    });

    if (!output) {
      return Response.json({ error: "AI adjustment failed" }, { status: 500 });
    }

    // Apply world state changes (only specified fields)
    if (output.worldState) {
      const ws = { ...game.worldState };
      for (const [key, val] of Object.entries(output.worldState)) {
        if (val !== undefined && val !== null) {
          (ws as Record<string, number>)[key] = Math.max(0, Math.min(10, Math.round(val)));
        }
      }
      await convex.mutation(api.games.updateWorldState, {
        gameId: gameId as Id<"games">,
        worldState: ws,
      });
    }

    // Apply lab changes (only specified fields)
    if (output.labUpdates && output.labUpdates.length > 0) {
      const updatedLabs = game.labs.map((lab) => {
        const update = output.labUpdates!.find((u) => u.name === lab.name);
        if (!update) return lab;
        return {
          ...lab,
          computeStock: update.computeStock !== undefined
            ? Math.max(0, Math.round(update.computeStock))
            : lab.computeStock,
          rdMultiplier: update.rdMultiplier !== undefined
            ? Math.max(0, update.rdMultiplier)
            : lab.rdMultiplier,
          allocation: update.allocation ?? lab.allocation,
        };
      });
      await convex.mutation(api.games.updateLabs, {
        gameId: gameId as Id<"games">,
        labs: updatedLabs,
      });
    }

    // Log the adjustment
    await convex.mutation(api.events.log, {
      gameId: gameId as Id<"games">,
      type: "facilitator_adjust",
      data: JSON.stringify({ instruction, explanation: output.explanation }),
    });

    return Response.json({
      success: true,
      explanation: output.explanation,
      worldState: output.worldState,
      labUpdates: output.labUpdates,
    });
  } catch (error) {
    console.error("Facilitator adjust error:", error);
    return Response.json(
      { error: "Adjustment failed", details: String(error) },
      { status: 500 }
    );
  }
}
