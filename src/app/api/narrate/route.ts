import { z } from "zod";
import { checkApiAuth } from "@/lib/api-auth";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { NARRATIVE_MODEL, NARRATIVE_FALLBACK } from "@/lib/ai-models";
import { buildNarrativeFromEventsPrompt } from "@/lib/ai-prompts";
import { generateWithFallback, streamPrimary } from "@/lib/ai-fallback";

const NarrativeOutput = z.object({
  narrative: z.string(),
  headlines: z.array(z.string()),
});

type NarrativeOutputType = z.infer<typeof NarrativeOutput>;

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      gameId,
      roundNumber,
    }: { gameId: string; roundNumber: number } = body;

    const [game, rounds] = await Promise.all([
      convex.query(api.games.get, { gameId: gameId as Id<"games"> }),
      convex.query(api.rounds.getByGame, { gameId: gameId as Id<"games"> }),
    ]);
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }
    const currentRound = rounds?.find((r) => r.number === roundNumber);

    if (!currentRound?.resolvedEvents || currentRound.resolvedEvents.length === 0) {
      return Response.json(
        { error: "No resolved events found — run /api/resolve first" },
        { status: 400 }
      );
    }

    // Get world state AFTER resolution (current game state = post-resolve)
    const worldStateAfter = currentRound.worldStateAfter ?? game.worldState;

    // World state before = previous round's worldStateAfter, or game defaults for round 1
    const previousRound = (rounds ?? [])
      .filter((r) => r.number < roundNumber)
      .sort((a, b) => b.number - a.number)[0];
    const worldStateBefore = previousRound?.worldStateAfter ?? {
      capability: 3, alignment: 5, tension: 4, awareness: 3, regulation: 2, australia: 3,
    };

    const prompt = buildNarrativeFromEventsPrompt({
      round: roundNumber,
      roundLabel: currentRound.label,
      roundTitle: currentRound.title,
      resolvedEvents: currentRound.resolvedEvents,
      worldStateBefore,
      worldStateAfter,
      previousRounds: (rounds ?? [])
        .filter((r) => r.number < roundNumber && r.summary?.narrative)
        .map((r) => ({
          number: r.number,
          label: r.label,
          narrative: r.summary?.narrative,
        })),
    });

    /** Write narrative output to Convex */
    async function applyNarrative(
      output: NarrativeOutputType,
      usedModel: string,
      timeMs: number,
      tokens?: number,
    ) {
      await convex.mutation(api.rounds.applySummary, {
        gameId: gameId as Id<"games">,
        roundNumber,
        summary: {
          narrative: output.narrative,
          headlines: output.headlines,
          geopoliticalEvents: [],
          aiStateOfPlay: [],
          facilitatorNotes: currentRound!.facilitatorNotes,
        },
      });

      // Track narrative AI metadata (merge with existing resolve metadata)
      const existingMeta = currentRound!.aiMeta ?? {};
      await convex.mutation(api.rounds.setAiMeta, {
        gameId: gameId as Id<"games">,
        roundNumber,
        aiMeta: {
          ...existingMeta,
          narrativeModel: usedModel,
          narrativeTimeMs: timeMs,
          narrativeTokens: tokens,
        },
      });
    }

    // Check if streaming was requested
    const url = new URL(request.url);
    const useStream = url.searchParams.get("stream") === "true";

    if (useStream) {
      const aiStream = streamPrimary({
        primary: NARRATIVE_MODEL,
        fallback: NARRATIVE_FALLBACK,
        schema: NarrativeOutput,
        prompt,
      });

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

      const pump = async () => {
        const reader = aiStream.getReader();
        const writer = writable.getWriter();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });

            for (const line of text.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6));
                if (data.__complete && data.output) {
                  await applyNarrative(
                    data.output as NarrativeOutputType,
                    data.model as string,
                    data.timeMs as number,
                    data.tokens as number | undefined,
                  );
                }
              } catch {
                // Not valid JSON — ignore
              }
            }

            await writer.write(value);
          }
          await writer.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ __error: true, message: errorMsg })}\n\n`),
          );
          await writer.close();
        }
      };

      void pump();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming path (backward compatible)
    const { output, model: usedModel, timeMs, tokens } = await generateWithFallback({
      primary: NARRATIVE_MODEL,
      fallback: NARRATIVE_FALLBACK,
      schema: NarrativeOutput,
      prompt,
    });

    if (!output) {
      return Response.json({ error: "All AI models failed to generate narrative", model: usedModel }, { status: 502 });
    }

    await applyNarrative(output, usedModel, timeMs, tokens);

    return Response.json({ success: true, narrative: output, model: usedModel, timeMs });
  } catch (error) {
    console.error("Narrative error:", error);
    return Response.json(
      { error: "Narrative generation failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
