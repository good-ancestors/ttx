import { z } from "zod";
import { COPILOT_APPLY_SIGNAL } from "@/lib/game-data";
import { checkApiAuth } from "@/lib/api-auth";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, ROLE_MAP } from "@/lib/game-data";
import { GRADING_MODEL, GRADING_FALLBACK } from "@/lib/ai-models";
import { generateWithFallback } from "@/lib/ai-fallback";

const AdjustOutput = z.object({
  // "question" = needs more info, "proposal" = here's what I'd change, "info" = just answering
  intent: z.enum(["question", "proposal", "info"]),
  response: z.string(), // The conversational reply
  // Only present when intent === "proposal"
  labUpdates: z.optional(
    z.array(
      z.object({
        name: z.string(),
        isNew: z.optional(z.boolean()),
        roleId: z.optional(z.string()),
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
  narrativeUpdate: z.optional(z.string()),
  labMerge: z.optional(z.object({
    survivorLab: z.string(),
    absorbedLab: z.string(),
  })),
  restoreSnapshot: z.optional(z.number()),
});

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  // Server-side routes pass the facilitator secret directly to Convex mutations
  const facilitatorToken = process.env.FACILITATOR_SECRET;

  try {
    const body = await request.json();
    const {
      gameId,
      instruction,
      conversationHistory,
      dryRun,
    }: {
      gameId: string;
      instruction: string;
      conversationHistory?: { role: string; content: string }[];
      dryRun?: boolean;
    } = body;

    const game = await convex.query(api.games.get, { gameId: gameId as Id<"games"> });
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    // Parallel context fetch — all depend on game.currentRound
    const [allRounds, currentSubmissions] = await Promise.all([
      convex.query(api.rounds.getByGame, { gameId: gameId as Id<"games"> }),
      convex.query(api.submissions.getByGameAndRound, { gameId: gameId as Id<"games">, roundNumber: game.currentRound, facilitatorToken: process.env.FACILITATOR_SECRET }),
    ]);
    const currentRound = allRounds?.find((r) => r.number === game.currentRound);
    const currentNarrative = currentRound?.summary?.narrative ?? "";
    const resolvedActions = (currentSubmissions ?? []).flatMap((sub) => {
      const role = ROLE_MAP.get(sub.roleId);
      return sub.actions
        .filter((a) => a.rolled != null)
        .map((a) => `[${role?.name ?? sub.roleId}] "${a.text}" → ${a.success ? "SUCCESS" : "FAILED"} (${a.probability}%, rolled ${a.rolled})`);
    });

    // If this is a confirmed apply, use the last proposal from history
    const isApply = instruction === COPILOT_APPLY_SIGNAL;

    // Build conversation context
    const historyText = conversationHistory && conversationHistory.length > 0
      ? `\nCONVERSATION SO FAR:\n${conversationHistory.map((m) => `${m.role === "user" ? "FACILITATOR" : "COPILOT"}: ${m.content}`).join("\n")}\n`
      : "";

    const prompt = `You are the facilitator's AI copilot for an AGI tabletop exercise. You help the facilitator manage the game by answering questions, proposing changes, and applying adjustments.

CURRENT GAME PHASE: ${game.phase} | Round ${game.currentRound}

CURRENT LABS:
${game.labs.map((l) => `- ${l.name} (${l.roleId}): ${l.computeStock}u compute, ${l.rdMultiplier}x R&D | Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}
${resolvedActions.length > 0 ? `\nTHIS ROUND'S RESOLVED ACTIONS:\n${resolvedActions.join("\n")}` : ""}
${currentNarrative ? `\nCURRENT NARRATIVE: "${currentNarrative}"` : ""}

ENABLED ROLES:
${ROLES.filter((r) => currentSubmissions?.some((s) => s.roleId === r.id) || game.labs.some((l) => l.roleId === r.id)).map((r) => `- ${r.name} (${r.id})`).join("\n")}
${historyText}
${isApply ? `THE FACILITATOR HAS CONFIRMED — apply the changes you proposed in your last message. Set intent to "proposal" and include the same changes.` : `THE FACILITATOR SAYS: "${instruction}"`}

YOUR BEHAVIOR:
1. If the facilitator asks a QUESTION about game state, player actions, or history: set intent to "info" and answer it. No changes needed.
2. If the facilitator wants to CHANGE something but the request is ambiguous or has multiple valid interpretations: set intent to "question" and ask for clarification. Be specific about what you need to know.
3. If the facilitator wants to CHANGE something and it's clear enough to act on: set intent to "proposal" and:
   - In "response", describe what you'll change and why (be specific with numbers)
   - Include the proposed labUpdates/narrativeUpdate
   ${dryRun ? '- The facilitator will review your proposal before you apply it. End your response with "Apply these changes?"' : "- Apply the changes."}
4. For lab mergers: use labMerge with survivorLab (keeps the name/role) and absorbedLab (removed). The survivor gets the absorbed lab's compute stock added and keeps the higher R&D multiplier.
5. For adding labs: propose a name, controlling role, and R&D multiplier. The lab inherits the controlling role's existing compute (no separate starting compute).
6. For reverting/undoing: use restoreSnapshot with the round number to revert to. This restores world state, labs, and role compute to the end of that round.
7. Be precise and literal. "Reduce by 30%" means calculate 30% and subtract. "Set to 5" means set exactly to 5.
8. Keep responses SHORT (1-3 sentences). This is a live game — the facilitator doesn't have time to read paragraphs.`;

    const { output } = await generateWithFallback({
      primary: GRADING_MODEL,
      fallback: GRADING_FALLBACK,
      prompt,
      schema: AdjustOutput,
    });

    if (!output) {
      return Response.json({ error: "AI copilot failed" }, { status: 500 });
    }

    const hasChanges = output.intent === "proposal" && (
      (output.labUpdates !== undefined && output.labUpdates.length > 0) ||
      output.narrativeUpdate !== undefined ||
      output.labMerge !== undefined ||
      output.restoreSnapshot !== undefined
    );

    // Only apply mutations if not dry run OR if this is a confirmed apply
    const shouldApply = hasChanges && (!dryRun || isApply);

    if (shouldApply) {
      // Apply lab changes
      if (output.labUpdates && output.labUpdates.length > 0) {
        const existingNames = new Set(game.labs.map((l) => l.name));
        const newLabs = output.labUpdates.filter((u) => u.isNew && !existingNames.has(u.name));
        const existingUpdates = output.labUpdates.filter((u) => !u.isNew && existingNames.has(u.name));

        for (const newLab of newLabs) {
          await convex.mutation(api.games.addLab, {
            gameId: gameId as Id<"games">,
            name: newLab.name,
            roleId: newLab.roleId ?? newLab.name.toLowerCase().replace(/\s+/g, "-"),
            rdMultiplier: newLab.rdMultiplier ?? 1,
            facilitatorToken,
          });
        }

        if (existingUpdates.length > 0) {
          const freshGame = newLabs.length > 0
            ? await convex.query(api.games.get, { gameId: gameId as Id<"games"> })
            : game;
          if (freshGame) {
            const updatedLabs = freshGame.labs.map((lab) => {
              const update = existingUpdates.find((u) => u.name === lab.name);
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
              facilitatorToken,
            });
          }
        }
      }

      // Apply lab merge
      if (output.labMerge) {
        await convex.mutation(api.games.mergeLabs, {
          gameId: gameId as Id<"games">,
          survivorName: output.labMerge.survivorLab,
          absorbedName: output.labMerge.absorbedLab,
          facilitatorToken,
        });
      }

      // Restore snapshot
      if (output.restoreSnapshot !== undefined) {
        await convex.mutation(api.games.restoreSnapshot, {
          gameId: gameId as Id<"games">,
          roundNumber: output.restoreSnapshot,
          facilitatorToken,
        });
      }

      // Apply narrative update
      if (output.narrativeUpdate) {
        const freshRounds = await convex.query(api.rounds.getByGame, { gameId: gameId as Id<"games"> });
        const freshRound = freshRounds?.find((r) => r.number === game.currentRound);
        if (freshRound) {
          await convex.mutation(api.rounds.applySummary, {
            gameId: gameId as Id<"games">,
            roundNumber: game.currentRound,
            summary: {
              ...(freshRound.summary ?? { geopoliticalEvents: [], aiStateOfPlay: [], headlines: [] }),
              narrative: output.narrativeUpdate,
            },
            facilitatorToken,
          });
        }
      }

      // Log
      await convex.mutation(api.events.log, {
        gameId: gameId as Id<"games">,
        type: "facilitator_adjust",
        data: JSON.stringify({ instruction, explanation: output.response }),
      });
    }

    return Response.json({
      success: true,
      explanation: output.response,
      intent: output.intent,
      hasChanges,
      applied: shouldApply,
    });
  } catch (error) {
    console.error("Facilitator adjust error:", error);
    return Response.json(
      { error: "Copilot failed — try again" },
      { status: 500 }
    );
  }
}
