import { z } from "zod";
import { checkApiAuth } from "@/lib/api-auth";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { RESOLVE_MODEL, RESOLVE_FALLBACK } from "@/lib/ai-models";
import { buildResolvePrompt } from "@/lib/ai-prompts";
import { generateWithFallback, streamPrimary } from "@/lib/ai-fallback";

/** Round allocation to integers summing to 100 */
function normaliseAllocation(raw: { users: number; capability: number; safety: number }) {
  const alloc = {
    users: Math.round(raw.users),
    capability: Math.round(raw.capability),
    safety: Math.round(raw.safety),
  };
  const sum = alloc.users + alloc.capability + alloc.safety;
  if (sum !== 100 && sum > 0) {
    const scale = 100 / sum;
    alloc.users = Math.round(alloc.users * scale);
    alloc.capability = Math.round(alloc.capability * scale);
    alloc.safety = 100 - alloc.users - alloc.capability;
  }
  return alloc;
}

function buildResolveSchema(labNames: [string, ...string[]]) {
  return z.object({
    resolvedEvents: z.array(
      z.object({
        id: z.string(),
        description: z.string(),
        visibility: z.enum(["public", "covert"]),
        actors: z.array(z.string()),
        worldImpact: z.optional(z.string()),
        sourceActions: z.optional(z.array(z.string())),
      })
    ),
    worldState: z.object({
      capability: z.number().min(0).max(10),
      alignment: z.number().min(0).max(10),
      tension: z.number().min(0).max(10),
      awareness: z.number().min(0).max(10),
      regulation: z.number().min(0).max(10),
      australia: z.number().min(0).max(10),
    }),
    labUpdates: z.array(
      z.object({
        name: z.enum(labNames),
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
}

// Default schema for type inference
const ResolveOutput = buildResolveSchema(["OpenBrain", "DeepCent", "Conscienta"]);
type ResolveOutputType = z.infer<typeof ResolveOutput>;

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

type GameData = { worldState: Record<string, number>; labs: Lab[] };
type TableRow = { _id: Id<"tables">; roleId: string; roleName: string; enabled: boolean; computeStock?: number };
type RoleCompute = { roleId: string; roleName: string; computeStock: number };

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchResolveData(gameId: string, roundNumber: number) {
  const [game, submissions, rounds, allTables] = await Promise.all([
    convex.query(api.games.get, { gameId: gameId as Id<"games"> }),
    convex.query(api.submissions.getByGameAndRound, { gameId: gameId as Id<"games">, roundNumber }),
    convex.query(api.rounds.getByGame, { gameId: gameId as Id<"games"> }),
    convex.query(api.tables.getByGame, { gameId: gameId as Id<"games"> }),
  ]);
  return { game, submissions, rounds, allTables };
}

// ─── Context building ────────────────────────────────────────────────────────

interface ResolveContext {
  prompt: string;
  resolveSchema: z.ZodType<ResolveOutputType>;
  roleCompute: RoleCompute[];
}

function buildResolveContext(
  game: GameData & { labs: Lab[] },
  submissions: Array<{ roleId: string; actions: Array<{ text: string; priority: number; probability?: number; rolled?: number; success?: boolean; secret?: boolean }> }>,
  rounds: Array<{ number: number; label: string; title?: string; summary?: { narrative?: string }; worldStateAfter?: Record<string, number>; capabilityLevel?: string }>,
  allTables: TableRow[] | null,
  roundNumber: number,
  aiDisposition?: { label: string; description: string },
): ResolveContext {
  const labNames = game.labs.map((l) => l.name) as [string, ...string[]];
  const resolveSchema = buildResolveSchema(labNames);

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

  const roleCompute = (allTables ?? [])
    .filter((t) => t.enabled && (t.computeStock ?? 0) > 0)
    .map((t) => ({
      roleId: t.roleId,
      roleName: t.roleName,
      computeStock: t.computeStock ?? 0,
    }));

  const prompt = buildResolvePrompt({
    round: roundNumber,
    roundLabel: currentRound?.label ?? `Round ${roundNumber}`,
    roundTitle: currentRound?.title ?? "",
    worldState: game.worldState,
    capabilityLevel: currentRound?.capabilityLevel ?? "Unknown",
    resolvedActions,
    labs: game.labs,
    roleCompute,
    aiDisposition,
    previousRounds: (rounds ?? [])
      .filter((r) => r.number < roundNumber && r.summary)
      .map((r) => ({
        number: r.number,
        label: r.label,
        narrative: r.summary?.narrative,
        worldStateAfter: r.worldStateAfter,
      })),
  });

  return { prompt, resolveSchema, roleCompute };
}

// ─── Streaming helper ────────────────────────────────────────────────────────

function createCompletionStream(
  aiStream: ReadableStream<Uint8Array>,
  onComplete: (data: { output: ResolveOutputType; model: string; timeMs: number; tokens?: number }) => Promise<void>,
): ReadableStream<Uint8Array> {
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
              await onComplete({
                output: data.output as ResolveOutputType,
                model: data.model as string,
                timeMs: data.timeMs as number,
                tokens: data.tokens as number | undefined,
              });
            }
          } catch (parseErr) {
            if (line.includes("__complete")) {
              console.error("[resolve] Failed to parse/apply __complete message:", parseErr);
            }
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
  return readable;
}

// ─── Apply resolution to Convex ──────────────────────────────────────────────

/** Apply resolved output to Convex — shared by streaming and non-streaming paths */
async function applyResolution(
  output: ResolveOutputType,
  gameId: string,
  roundNumber: number,
  game: GameData,
  allTables: TableRow[] | null,
  roleCompute: RoleCompute[],
  usedModel: string,
  timeMs: number,
  tokens?: number,
) {
  console.info(`[resolve] R${roundNumber} applyResolution: ${output.resolvedEvents?.length ?? 0} events, ${output.labUpdates?.length ?? 0} labUpdates, model=${usedModel}`);
  if (output.labUpdates?.length) {
    console.info(`[resolve] labUpdates: ${output.labUpdates.map((u) => `${u.name}: ${u.newRdMultiplier}x ${u.newComputeStock}u`).join(", ")}`);
  } else {
    console.warn(`[resolve] R${roundNumber} WARNING: No labUpdates in resolve output!`);
  }

  // Store resolved events
  await convex.mutation(api.rounds.applyResolution, {
    gameId: gameId as Id<"games">,
    roundNumber,
    resolvedEvents: output.resolvedEvents,
  });

  // Apply world state (clamped)
  const maxDeltaForRound = roundNumber >= 3 ? 4 : 3;
  const clampDelta = (newVal: number, current: number, maxDelta = maxDeltaForRound) => {
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

  // Update role compute stocks (non-lab players)
  if (output.roleComputeUpdates) {
    for (const update of output.roleComputeUpdates) {
      const table = allTables?.find((t) => t.roleId === update.roleId);
      if (table) {
        await convex.mutation(api.games.updateTableCompute, {
          tableId: table._id,
          computeStock: Math.max(0, Math.round(update.newComputeStock)),
        });
      }
    }
  }

  // Update lab compute, R&D multipliers, and allocation
  const maxMultiplier = roundNumber === 1 ? 15 : roundNumber === 2 ? 200 : roundNumber === 3 ? 5000 : 10000;
  if (output.labUpdates && output.labUpdates.length > 0) {
    const updatedLabs = game.labs.map((lab) => {
      // Fuzzy match: try exact, then case-insensitive, then startsWith
      const update = output.labUpdates.find((u) => u.name === lab.name)
        ?? output.labUpdates.find((u) => u.name.toLowerCase() === lab.name.toLowerCase())
        ?? output.labUpdates.find((u) => u.name.toLowerCase().startsWith(lab.name.toLowerCase().slice(0, 4)));
      if (!update) {
        console.warn(`[resolve] No labUpdate match for "${lab.name}". AI provided: ${output.labUpdates.map((u) => u.name).join(", ")}`);
        return lab;
      }
      const newMultiplier = Math.min(maxMultiplier, Math.max(0, Math.round(update.newRdMultiplier * 10) / 10));
      const allocation = update.newAllocation
        ? normaliseAllocation(update.newAllocation)
        : lab.allocation;
      return {
        ...lab,
        computeStock: Math.max(0, Math.round(update.newComputeStock)),
        rdMultiplier: newMultiplier,
        allocation,
      };
    });
    await convex.mutation(api.games.updateLabs, {
      gameId: gameId as Id<"games">,
      labs: updatedLabs,
    });
  }

  // Snapshot final state
  const clampedWorldState = {
    capability: clampDelta(output.worldState.capability, game.worldState.capability),
    alignment: clampDelta(output.worldState.alignment, game.worldState.alignment),
    tension: clampDelta(output.worldState.tension, game.worldState.tension),
    awareness: clampDelta(output.worldState.awareness, game.worldState.awareness),
    regulation: clampDelta(output.worldState.regulation, game.worldState.regulation),
    australia: clampDelta(output.worldState.australia, game.worldState.australia),
  };
  const snapshotLabs = output.labUpdates
    ? game.labs.map((lab) => {
        const update = output.labUpdates.find((u) => u.name === lab.name);
        if (!update) return lab;
        return {
          ...lab,
          computeStock: Math.max(0, Math.round(update.newComputeStock)),
          rdMultiplier: Math.min(maxMultiplier, Math.max(0, Math.round(update.newRdMultiplier * 10) / 10)),
          allocation: update.newAllocation ? normaliseAllocation(update.newAllocation) : lab.allocation,
        };
      })
    : game.labs;

  // Snapshot + AI metadata in parallel
  await Promise.all([
    convex.mutation(api.rounds.snapshotState, {
      gameId: gameId as Id<"games">,
      roundNumber,
      worldStateAfter: clampedWorldState,
      labsAfter: snapshotLabs,
      roleComputeAfter: roleCompute,
    }),
    convex.mutation(api.rounds.setAiMeta, {
      gameId: gameId as Id<"games">,
      roundNumber,
      aiMeta: {
        resolveModel: usedModel,
        resolveTimeMs: timeMs,
        resolveTokens: tokens,
      },
    }),
  ]);
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      gameId,
      roundNumber,
      aiDisposition,
    }: { gameId: string; roundNumber: number; aiDisposition?: { label: string; description: string } } = body;

    // Fetch all data in parallel (roundNumber passed via closure for submissions)
    const { game, submissions, rounds, allTables } = await fetchResolveData(gameId, roundNumber);
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    // Build prompt and schema from fetched data
    const { prompt, resolveSchema, roleCompute } = buildResolveContext(
      game,
      submissions ?? [],
      rounds ?? [],
      allTables,
      roundNumber,
      aiDisposition,
    );

    // Streaming path
    const url = new URL(request.url);
    if (url.searchParams.get("stream") === "true") {
      const aiStream = streamPrimary({
        primary: RESOLVE_MODEL,
        fallback: RESOLVE_FALLBACK,
        schema: resolveSchema,
        prompt,
      });

      const readable = createCompletionStream(aiStream, async (data) => {
        await applyResolution(
          data.output,
          gameId,
          roundNumber,
          game,
          allTables,
          roleCompute,
          data.model,
          data.timeMs,
          data.tokens,
        );
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming path
    const { output, model: usedModel, timeMs, tokens } = await generateWithFallback({
      primary: RESOLVE_MODEL,
      fallback: RESOLVE_FALLBACK,
      schema: ResolveOutput,
      prompt,
    });

    if (!output) {
      return Response.json({ error: "All AI models failed to resolve", model: usedModel }, { status: 502 });
    }

    await applyResolution(output, gameId, roundNumber, game, allTables, roleCompute, usedModel, timeMs, tokens);

    return Response.json({
      success: true,
      resolvedEvents: output.resolvedEvents,
      model: usedModel,
      timeMs,
    });
  } catch (error) {
    console.error("Resolve error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: "Resolution failed", detail },
      { status: 500 }
    );
  }
}
