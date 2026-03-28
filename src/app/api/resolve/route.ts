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

// Resolve schema — events + world state only. Lab updates are a separate call.
function buildResolveSchema() {
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
const ResolveOutput = buildResolveSchema();
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

function buildResolveContext(opts: {
  game: GameData & { labs: Lab[] };
  submissions: Array<{ roleId: string; actions: Array<{ text: string; priority: number; probability?: number; rolled?: number; success?: boolean; secret?: boolean }> }>;
  rounds: Array<{ number: number; label: string; title?: string; summary?: { narrative?: string }; worldStateAfter?: Record<string, number>; capabilityLevel?: string }>;
  allTables: TableRow[] | null;
  roundNumber: number;
  aiDisposition?: { label: string; description: string };
}): ResolveContext {
  const { game, submissions, rounds, allTables, roundNumber, aiDisposition } = opts;
  const resolveSchema = buildResolveSchema();

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

/** Apply lab updates to Convex */
async function applyLabUpdates(
  gameId: string,
  currentLabs: { name: string; roleId: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number }; spec?: string }[],
  updates: { name: string; newComputeStock: number; newRdMultiplier: number; newAllocation?: { users: number; capability: number; safety: number } }[],
  maxMultiplier: number,
) {
  const updatedLabs = currentLabs.map((lab) => {
    const update = updates.find((u) => u.name === lab.name)
      ?? updates.find((u) => u.name.toLowerCase() === lab.name.toLowerCase());
    if (!update) return lab;
    return {
      ...lab,
      computeStock: Math.max(0, Math.round(update.newComputeStock)),
      rdMultiplier: Math.min(maxMultiplier, Math.max(0, Math.round(update.newRdMultiplier * 10) / 10)),
      allocation: update.newAllocation ? normaliseAllocation(update.newAllocation) : lab.allocation,
    };
  });
  await convex.mutation(api.games.updateLabs, {
    gameId: gameId as Id<"games">,
    labs: updatedLabs,
  });
}

/** Apply resolved output to Convex — shared by streaming and non-streaming paths */
async function applyResolution(opts: {
  output: ResolveOutputType;
  gameId: string;
  roundNumber: number;
  game: GameData;
  allTables: TableRow[] | null;
  roleCompute: RoleCompute[];
  usedModel: string;
  timeMs: number;
  tokens?: number;
}) {
  const { output, gameId, roundNumber, game, allTables, roleCompute, usedModel, timeMs, tokens } = opts;
  console.info(`[resolve] R${roundNumber} applyResolution: ${output.resolvedEvents?.length ?? 0} events, model=${usedModel}`);

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

  // Lab updates — ALWAYS a dedicated API call (separate from events/worldState for reliability)
  const maxMultiplier = roundNumber === 1 ? 15 : roundNumber === 2 ? 200 : roundNumber === 3 ? 5000 : 10000;
  const labNames = game.labs.map((l) => l.name) as [string, ...string[]];
  const labSchema = z.object({
    labs: z.array(z.object({
      name: z.enum(labNames),
      newComputeStock: z.number(),
      newRdMultiplier: z.number(),
      newAllocation: z.object({ users: z.number(), capability: z.number(), safety: z.number() }),
    })).length(labNames.length),
  });

  const eventSummary = output.resolvedEvents.map(e => `- ${e.description}`).join("\n");
  const labPrompt = `Update lab state for Round ${roundNumber} of an AI race scenario.

CURRENT LABS:
${game.labs.map(l => `- ${l.name}: ${l.rdMultiplier}x R&D multiplier, ${l.computeStock}u compute | Alloc: Users ${l.allocation.users}%, R&D ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

THIS ROUND'S EVENTS:
${eventSummary}

SCENARIO PROGRESSION (R&D multiplier targets for the LEADING lab):
- Round 1: 5-10x (Agent-2 era, early AGI)
- Round 2: 20-50x (Agent-3, 10x accelerator)
- Round 3: 100-500x (Agent-4, approaching ASI)
- Round 4: 500-5000x (ASI threshold)

RULES:
- Output ALL ${labNames.length} labs with updated values
- The leading lab's multiplier MUST be in the target range for Round ${roundNumber}
- Trailing labs should be 40-70% of the leader
- Compute stock grows ~30-50% per round from new infrastructure + allocations
- If events describe sanctions/seizures/sabotage, adjust compute accordingly
- Allocation shifts based on CEO actions (if any)`;

  let labsSource = "none";
  try {
    const { output: labOutput, model: labModel } = await generateWithFallback({
      primary: "anthropic/claude-haiku-4-5",
      fallback: RESOLVE_FALLBACK,
      prompt: labPrompt,
      schema: labSchema,
      maxRetries: 3,
    });
    if (labOutput?.labs && labOutput.labs.length > 0) {
      labsSource = `dedicated:${labModel}`;
      console.info(`[resolve] R${roundNumber} lab updates (${labModel}): ${JSON.stringify(labOutput.labs.map(u => ({ name: u.name, mult: u.newRdMultiplier, compute: u.newComputeStock })))}`);
      await applyLabUpdates(gameId, game.labs, labOutput.labs, maxMultiplier);
    } else {
      console.error(`[resolve] R${roundNumber} lab update call returned empty output`);
    }
  } catch (err) {
    console.error(`[resolve] R${roundNumber} lab update call failed:`, err);
  }

  // Safety net: if labs still below expected floor after the dedicated call
  const minFloors: Record<number, number> = { 1: 3, 2: 10, 3: 100, 4: 500 };
  const minFloor = minFloors[roundNumber] ?? 3;
  const postLabGame = await convex.query(api.games.get, { gameId: gameId as Id<"games"> });
  const postLeading = postLabGame ? Math.max(...postLabGame.labs.map((l: { rdMultiplier: number }) => l.rdMultiplier)) : 1;
  if (postLeading < minFloor) {
    labsSource += "+fallback";
    const scale = minFloor / Math.max(1, postLeading);
    console.warn(`[resolve] R${roundNumber} FLOOR: leading ${postLeading}x < ${minFloor}x. Scaling by ${scale.toFixed(1)}x.`);
    const bumpedLabs = (postLabGame?.labs ?? game.labs).map((lab: { name: string; roleId: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number }; spec?: string }) => ({
      ...lab,
      rdMultiplier: Math.min(maxMultiplier, Math.round(lab.rdMultiplier * scale * 10) / 10),
      computeStock: lab.computeStock + Math.round(roundNumber * 3),
    }));
    await convex.mutation(api.games.updateLabs, { gameId: gameId as Id<"games">, labs: bumpedLabs });
  }

  const finalGame = await convex.query(api.games.get, { gameId: gameId as Id<"games"> });
  if (finalGame) {
    console.info(`[resolve] R${roundNumber} FINAL labs: ${finalGame.labs.map((l: { name: string; rdMultiplier: number; computeStock: number }) => `${l.name}: ${l.rdMultiplier}x/${l.computeStock}u`).join(", ")} | source=${labsSource}`);
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
  // Read latest labs from Convex (updated by dedicated lab call above)
  const snapshotGame = await convex.query(api.games.get, { gameId: gameId as Id<"games"> });
  const snapshotLabs = snapshotGame?.labs ?? game.labs;

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
    const { prompt, resolveSchema, roleCompute } = buildResolveContext({
      game,
      submissions: submissions ?? [],
      rounds: rounds ?? [],
      allTables,
      roundNumber,
      aiDisposition,
    });

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
        await applyResolution({
          output: data.output,
          gameId,
          roundNumber,
          game,
          allTables,
          roleCompute,
          usedModel: data.model,
          timeMs: data.timeMs,
          tokens: data.tokens,
        });
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

    await applyResolution({ output, gameId, roundNumber, game, allTables, roleCompute, usedModel, timeMs, tokens });

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
