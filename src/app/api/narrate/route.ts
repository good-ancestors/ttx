import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { NARRATIVE_MODEL, NARRATIVE_FALLBACK } from "@/lib/ai-models";
import { buildNarrativePrompt } from "@/lib/ai-prompts";
import { generateWithFallback } from "@/lib/ai-fallback";

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
  roleComputeUpdates: z.optional(
    z.array(
      z.object({
        roleId: z.string(),
        newComputeStock: z.number(),
      })
    )
  ),
});

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
          secret: a.secret,
        }));
    });

    // Fetch non-lab players with compute for the prompt
    const allTables = await convex.query(api.tables.getByGame, {
      gameId: gameId as Id<"games">,
    });
    const roleCompute = (allTables ?? [])
      .filter((t) => t.enabled && (t.computeStock ?? 0) > 0)
      .map((t) => ({
        roleId: t.roleId,
        roleName: t.roleName,
        computeStock: t.computeStock ?? 0,
      }));

    const { output, model: usedModel, timeMs, tokens } = await generateWithFallback({
      primary: NARRATIVE_MODEL,
      fallback: NARRATIVE_FALLBACK,
      schema: NarrativeOutput,
      prompt: buildNarrativePrompt({
        round: roundNumber,
        roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
        roundTitle: currentRound?.title ?? "",
        worldState: game.worldState,
        capabilityLevel: currentRound?.capabilityLevel ?? "Unknown",
        resolvedActions,
        labs: game.labs,
        roleCompute,
      }),
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

      // Clamp world state: 0-10 range, max ±3 change per round, NaN falls back to current
      const clampDelta = (newVal: number, current: number, maxDelta = 3) => {
        if (!Number.isFinite(newVal)) return current;
        const clamped = Math.max(0, Math.min(10, Math.round(newVal)));
        const delta = clamped - current;
        if (Math.abs(delta) > maxDelta) {
          return current + Math.sign(delta) * maxDelta;
        }
        return clamped;
      };
      await convex.mutation(api.games.updateWorldState, {
        gameId: gameId as Id<"games">,
        worldState: {
          capability: clampDelta(output.worldState.capability, game.worldState.capability),
          alignment: clampDelta(output.worldState.alignment, game.worldState.alignment),
          tension: clampDelta(output.worldState.tension, game.worldState.tension),
          awareness: clampDelta(output.worldState.awareness, game.worldState.awareness),
          regulation: clampDelta(output.worldState.regulation, game.worldState.regulation),
          australia: clampDelta(output.worldState.australia, game.worldState.australia),
        },
      });

      // Update role compute stocks (non-lab players with compute)
      if (output.roleComputeUpdates) {
        const tables = await convex.query(api.tables.getByGame, {
          gameId: gameId as Id<"games">,
        });
        for (const update of output.roleComputeUpdates) {
          const table = tables?.find((t) => t.roleId === update.roleId);
          if (table) {
            await convex.mutation(api.games.updateTableCompute, {
              tableId: table._id,
              computeStock: Math.max(0, Math.round(update.newComputeStock)),
            });
          }
        }
      }

      // Update lab compute stocks, R&D multipliers, and allocation
      if (output.labUpdates) {
        const maxMultiplier = roundNumber === 1 ? 15 : roundNumber === 2 ? 100 : 1000;
        const updatedLabs = game.labs.map((lab) => {
          const update = output.labUpdates.find((u) => u.name === lab.name);
          if (!update) return lab;
          // Clamp to round bounds. The prompt instructs the AI that multipliers
          // should only decrease when a model is decommissioned (e.g., Safer pivot).
          // We trust the AI's judgment here — server only enforces the ceiling.
          const newMultiplier = Math.min(maxMultiplier, Math.max(0, update.newRdMultiplier));
          return {
            ...lab,
            computeStock: Math.max(0, Math.round(update.newComputeStock)),
            rdMultiplier: newMultiplier,
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

      // Snapshot final state for post-game review
      const finalGame = await convex.query(api.games.get, {
        gameId: gameId as Id<"games">,
      });
      const finalTables = await convex.query(api.tables.getByGame, {
        gameId: gameId as Id<"games">,
      });
      if (finalGame) {
        const roleComputeAfter = (finalTables ?? [])
          .filter((t) => t.enabled && (t.computeStock ?? 0) > 0)
          .map((t) => ({
            roleId: t.roleId,
            roleName: t.roleName,
            computeStock: t.computeStock ?? 0,
          }));

        await convex.mutation(api.rounds.snapshotState, {
          gameId: gameId as Id<"games">,
          roundNumber,
          worldStateAfter: finalGame.worldState,
          labsAfter: finalGame.labs,
          roleComputeAfter,
        });
      }
    }

    // Track narrative AI metadata
    if (output) {
      await convex.mutation(api.rounds.setAiMeta, {
        gameId: gameId as Id<"games">,
        roundNumber,
        aiMeta: {
          narrativeModel: usedModel,
          narrativeTimeMs: timeMs,
          narrativeTokens: tokens,
        },
      });
    }

    return Response.json({ success: true, narrative: output, model: usedModel, timeMs });
  } catch (error) {
    console.error("Narrative error:", error);
    return Response.json(
      { error: "Narrative generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
