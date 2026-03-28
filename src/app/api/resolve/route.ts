import { z } from "zod";
import { checkApiAuth } from "@/lib/api-auth";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES, DEFAULT_LABS, BASELINE_RD_TARGETS, NEW_COMPUTE_PER_GAME_ROUND, LAB_PROGRESSION, stripLabForSnapshot } from "@/lib/game-data";
import { RESOLVE_MODEL, RESOLVE_FALLBACK } from "@/lib/ai-models";
import { buildResolvePrompt } from "@/lib/ai-prompts";
import { generateWithFallback, streamPrimary } from "@/lib/ai-fallback";
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

// ─── Deterministic lab growth ────────────────────────────────────────────────

/** Pure function: compute new lab state based on allocations and recursive self-improvement. */
function computeLabGrowth(
  currentLabs: Lab[],
  ceoAllocations: Map<string, { users: number; capability: number; safety: number }>,
  roundNumber: number,
  maxMult: number,
): Lab[] {
  const P = LAB_PROGRESSION;
  const totalComputeStock = currentLabs.reduce((s, l) => s + l.computeStock, 0);
  const newCompute = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 3;

  // Apply allocations and distribute new compute
  const labs = currentLabs.map(lab => {
    const allocation = ceoAllocations.get(lab.name) ?? lab.allocation;
    const computeShare = lab.computeStock / Math.max(1, totalComputeStock);
    const computeStock = lab.computeStock + Math.round(newCompute * computeShare);
    return { ...lab, allocation, computeStock };
  });

  // Effective R&D = stock × allocation% × multiplier (the recursive self-improvement loop)
  const effectiveRd = labs.map(l => l.computeStock * (l.allocation.capability / 100) * l.rdMultiplier);
  const totalEffectiveRd = effectiveRd.reduce((s, v) => s + v, 0);

  return labs.map((lab, i) => {
    const rdShare = effectiveRd[i] / Math.max(1, totalEffectiveRd);
    const baselineTarget = BASELINE_RD_TARGETS[lab.name]?.[roundNumber];

    let newMultiplier: number;
    if (baselineTarget) {
      const defaultAlloc = ROLES.find(r => r.id === lab.roleId)?.defaultCompute;
      const baselineRdPct = defaultAlloc?.capability ?? 50;
      const allocRatio = lab.allocation.capability / Math.max(1, baselineRdPct);

      const startingCompute = DEFAULT_LABS.find(l => l.name === lab.name)?.computeStock ?? lab.computeStock;
      const computeRatio = lab.computeStock / Math.max(1, startingCompute);
      const computeFactor = Math.pow(computeRatio, P.COMPUTE_SENSITIVITY);

      if (allocRatio < P.RECURSIVE_LOOP_THRESHOLD) {
        // Safer path: recursive loop broken, linear growth only
        const saferGrowthRate = 1 + allocRatio * P.SAFER_GROWTH_COEFFICIENT * computeFactor;
        newMultiplier = Math.round(lab.rdMultiplier * Math.min(P.SAFER_GROWTH_CAP, saferGrowthRate) * 10) / 10;
      } else {
        // Race path: exponential toward baseline target
        const allocExponent = allocRatio < 1 ? P.RACE_ALLOC_PENALTY_EXP : P.RACE_ALLOC_BOOST_EXP;
        const allocFactor = Math.pow(allocRatio, allocExponent);
        const combinedRatio = Math.pow(allocFactor, P.ALLOC_WEIGHT) * Math.pow(computeFactor, 1 - P.ALLOC_WEIGHT);
        const baseGrowthRatio = baselineTarget / lab.rdMultiplier;
        newMultiplier = Math.round(lab.rdMultiplier * (1 + (baseGrowthRatio - 1) * combinedRatio) * 10) / 10;
      }
    } else {
      // Unknown lab (added mid-game): grow based on effective R&D share
      const poolGrowth: Record<number, number> = { 1: 3, 2: 10, 3: 10, 4: 10 };
      newMultiplier = Math.round(lab.rdMultiplier * (1 + rdShare * (poolGrowth[roundNumber] ?? 5)) * 10) / 10;
    }

    return { ...lab, rdMultiplier: Math.min(maxMult, newMultiplier) };
  });
}

// ─── Apply resolution to Convex ──────────────────────────────────────────────

/** Apply resolved output to Convex — shared by streaming and non-streaming paths */
async function applyResolution(opts: {
  output: ResolveOutputType;
  gameId: string;
  roundNumber: number;
  game: GameData;
  submissions: Array<{ roleId: string; computeAllocation?: { users: number; capability: number; safety: number } }>;
  allTables: TableRow[] | null;
  roleCompute: RoleCompute[];
  usedModel: string;
  timeMs: number;
  tokens?: number;
}) {
  const { output, gameId, roundNumber, game, submissions, allTables, roleCompute, usedModel, timeMs, tokens } = opts;
  const P = LAB_PROGRESSION;
  const maxMult = P.maxMultiplier(roundNumber);
  console.info(`[resolve] R${roundNumber} applyResolution: ${output.resolvedEvents?.length ?? 0} events, model=${usedModel}`);

  // Store resolved events
  await convex.mutation(api.rounds.applyResolution, {
    gameId: gameId as Id<"games">,
    roundNumber,
    resolvedEvents: output.resolvedEvents,
  });

  // Clamp world state deltas (computed once, reused for mutation + snapshot)
  const maxDeltaForRound = roundNumber >= 3 ? 4 : 3;
  const clampDelta = (newVal: number, current: number, maxDelta = maxDeltaForRound) => {
    if (!Number.isFinite(newVal)) return current;
    const clamped = Math.max(0, Math.min(10, Math.round(newVal)));
    const delta = clamped - current;
    return Math.abs(delta) > maxDelta ? current + Math.sign(delta) * maxDelta : clamped;
  };
  const clampedWorldState = {
    capability: clampDelta(output.worldState.capability, game.worldState.capability),
    alignment: clampDelta(output.worldState.alignment, game.worldState.alignment),
    tension: clampDelta(output.worldState.tension, game.worldState.tension),
    awareness: clampDelta(output.worldState.awareness, game.worldState.awareness),
    regulation: clampDelta(output.worldState.regulation, game.worldState.regulation),
    australia: clampDelta(output.worldState.australia, game.worldState.australia),
  };
  await convex.mutation(api.games.updateWorldState, {
    gameId: gameId as Id<"games">,
    worldState: clampedWorldState,
  });

  // Update role compute stocks in parallel (non-lab players)
  if (output.roleComputeUpdates) {
    await Promise.all(output.roleComputeUpdates.map(update => {
      const table = allTables?.find((t) => t.roleId === update.roleId);
      if (!table) return Promise.resolve();
      return convex.mutation(api.games.updateTableCompute, {
        tableId: table._id,
        computeStock: Math.max(0, Math.round(update.newComputeStock)),
      });
    }));
  }

  // ── Lab state update: DETERMINISTIC baseline + event modifiers ──────────────
  // See docs/lab-progression.md for full explanation of the mechanic.

  // Extract CEO allocation changes from already-fetched submissions (no extra query)
  const ceoAllocations = new Map<string, { users: number; capability: number; safety: number }>();
  for (const sub of submissions) {
    if (sub.computeAllocation) {
      const labForRole = game.labs.find(l => l.roleId === sub.roleId);
      if (labForRole) {
        ceoAllocations.set(labForRole.name, sub.computeAllocation);
      }
    }
  }

  // Deterministic lab growth — see docs/lab-progression.md
  const updatedLabs = computeLabGrowth(game.labs, ceoAllocations, roundNumber, maxMult);

  // Event-based modifiers + merges via focused AI call
  const labNames = game.labs.map((l) => l.name) as [string, ...string[]];
  const modifierSchema = z.object({
    modifiers: z.array(z.object({
      labName: z.enum(labNames),
      computeChange: z.number(),
      multiplierFactor: z.number(),
      reason: z.string(),
    })),
    merges: z.optional(z.array(z.object({
      survivorLab: z.enum(labNames),
      absorbedLab: z.enum(labNames),
      reason: z.string(),
    }))),
  });

  const eventSummary = output.resolvedEvents.map(e => `- ${e.description}`).join("\n");
  type Modifier = { labName: string; computeChange: number; multiplierFactor: number; reason: string };
  type Merge = { survivorLab: string; absorbedLab: string; reason: string };
  let modifiers: Modifier[] = [];
  let merges: Merge[] = [];
  try {
    const { output: modOutput } = await generateWithFallback({
      primary: "anthropic/claude-haiku-4-5",
      fallback: RESOLVE_FALLBACK,
      prompt: `Given these game events, output any modifiers to lab compute/R&D progress, and any lab mergers.
Only output modifiers for events that DIRECTLY affect a specific lab's resources or capability.
Only output merges when a successful action explicitly consolidates two labs (e.g., DPA nationalisation, Manhattan Project).
If no events affect labs, output empty arrays.

EVENTS:
${eventSummary}

LABS: ${labNames.join(", ")}

Examples of modifiers:
- Sanctions on China → DeepCent computeChange: -5, multiplierFactor: 0.9
- DPA consolidation → OpenBrain computeChange: +10 (from seized labs)
- Sabotage of alignment research → target lab multiplierFactor: 1.1
- Taiwan invasion → all labs computeChange: -8 (chip supply disrupted)
- Pivot to Safer models → lab multiplierFactor: 0.3
- Safety budget increased to 30%+ → lab multiplierFactor: 0.85

Examples of merges:
- DPA picks OpenBrain as national champion, absorbs Conscienta → survivorLab: "OpenBrain", absorbedLab: "Conscienta"
- Manhattan Project nationalises both US labs → survivorLab: "OpenBrain", absorbedLab: "Conscienta" (or vice versa)
Do NOT output a merge unless the event clearly describes one lab absorbing another.`,
      schema: modifierSchema,
      maxRetries: 2,
    });
    if (modOutput?.modifiers) {
      modifiers = modOutput.modifiers;
      if (modifiers.length > 0) {
        console.info(`[resolve] R${roundNumber} event modifiers: ${JSON.stringify(modifiers)}`);
      }
    }
    if (modOutput?.merges?.length) {
      merges = modOutput.merges;
      console.info(`[resolve] R${roundNumber} lab merges: ${JSON.stringify(merges)}`);
    }
  } catch (err) {
    console.warn(`[resolve] R${roundNumber} modifier call failed (non-critical):`, err);
  }

  // Apply modifiers to baseline
  let finalLabs = updatedLabs.map(lab => {
    const labModifiers = modifiers.filter(m => m.labName === lab.name);
    let { computeStock, rdMultiplier } = lab;
    for (const mod of labModifiers) {
      computeStock = Math.max(0, computeStock + mod.computeChange);
      rdMultiplier = Math.min(maxMult, Math.max(P.MIN_MULTIPLIER, Math.round(rdMultiplier * mod.multiplierFactor * 10) / 10));
    }
    return { ...lab, computeStock, rdMultiplier };
  });

  // Apply merges — survivor gets absorbed lab's compute + higher multiplier
  for (const merge of merges) {
    const absorbed = finalLabs.find(l => l.name === merge.absorbedLab);
    if (!absorbed) continue;
    finalLabs = finalLabs
      .filter(l => l.name !== merge.absorbedLab)
      .map(l => l.name === merge.survivorLab ? {
        ...l,
        computeStock: l.computeStock + absorbed.computeStock,
        rdMultiplier: Math.max(l.rdMultiplier, absorbed.rdMultiplier),
      } : l);
    // Also execute the Convex mutation so the merge persists independently
    await convex.mutation(api.games.mergeLabs, {
      gameId: gameId as Id<"games">,
      survivorName: merge.survivorLab,
      absorbedName: merge.absorbedLab,
    });
    console.info(`[resolve] R${roundNumber} MERGED: ${merge.absorbedLab} → ${merge.survivorLab} (${merge.reason})`);
  }

  console.info(`[resolve] R${roundNumber} FINAL labs: ${finalLabs.map(l => `${l.name}: ${l.rdMultiplier}x/${l.computeStock}u`).join(", ")} | modifiers=${modifiers.length}`);
  await convex.mutation(api.games.updateLabs, { gameId: gameId as Id<"games">, labs: finalLabs });

  // Snapshot uses locally computed data (no extra Convex query needed)
  const snapshotLabs = finalLabs.map(stripLabForSnapshot);

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
          submissions: submissions ?? [],
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

    await applyResolution({ output, gameId, roundNumber, game, submissions: submissions ?? [], allTables, roleCompute, usedModel, timeMs, tokens });

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
