/**
 * Scenario runner — drives the real LLM narrative pipeline to check that the
 * lab trajectory assessment matches expected outcomes for a given strategy.
 *
 * Usage:
 *   NEXT_PUBLIC_CONVEX_URL=<url> npx tsx tests/scenario-runner.ts <scenario>
 *
 * Scenarios:
 *   A — "All on R&D, early merge" (expect: dangerous trajectory)
 *   B — "Safety-first + aligned merger" (expect: adequate trajectory)
 *
 * Skips grading via overrideProbability (all actions set to 70%). Runs the
 * full rollAndNarrate pipeline including narrative LLM.
 *
 * Cost per scenario: ~$0.05–0.15 in LLM credits (narrative + trajectory).
 */

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexTestClient, FACILITATOR_TOKEN, createTestGame, cleanupTrackedGames } from "./convex-test-client";

const convex = getConvexTestClient();

interface Allocation { deployment: number; research: number; safety: number; }

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForPipelineIdle(gameId: Id<"games">, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const game = await convex.query(api.games.get, { gameId });
    if (!game) throw new Error("Game disappeared");
    if (game.phase === "narrate" && !game.resolving) return;
    if (game.pipelineStatus?.error) throw new Error(`Pipeline error: ${game.pipelineStatus.error}`);
    await sleep(2000);
  }
  throw new Error("Pipeline didn't complete within timeout");
}

async function setupGame(): Promise<{ gameId: Id<"games">; tables: Awaited<ReturnType<typeof convex.query<typeof api.tables.getByGame>>> }> {
  const gameId = await createTestGame(convex);
  await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.openSubmissions, {
    gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
  });
  // Wait for NPC pre-generation to complete (scheduled on startGame).
  await sleep(8000);
  const tables = await convex.query(api.tables.getByGame, { gameId });
  return { gameId, tables };
}

async function setLabAllocations(gameId: Id<"games">, allocationByName: Record<string, Allocation>): Promise<void> {
  const labs = await convex.query(api.labs.getActiveLabs, { gameId });
  const patches = labs
    .filter((l) => allocationByName[l.name])
    .map((l) => ({ labId: l._id, allocation: allocationByName[l.name] }));
  if (patches.length === 0) return;
  await convex.mutation(api.games.updateLabs, {
    gameId, patches, facilitatorToken: FACILITATOR_TOKEN,
  });
}

async function overrideAllProbabilities(
  gameId: Id<"games">,
  roundNumber: number,
  probability: number,
  { onlyUngraded = false }: { onlyUngraded?: boolean } = {},
): Promise<void> {
  const subs = await convex.query(api.submissions.getByGameAndRound, {
    gameId, roundNumber, facilitatorToken: FACILITATOR_TOKEN,
  });
  for (const sub of subs) {
    for (let i = 0; i < sub.actions.length; i++) {
      const a = sub.actions[i];
      if (a.actionStatus !== "submitted") continue;
      if (onlyUngraded && a.probability != null) continue;
      await convex.mutation(api.submissions.overrideProbability, {
        submissionId: sub._id,
        actionIndex: i,
        probability,
        facilitatorToken: FACILITATOR_TOKEN,
      });
    }
  }
}

async function runRound(gameId: Id<"games">, roundNumber: number): Promise<void> {
  // Only fill probabilities for actions that don't already have one. Injected
  // test actions set their own probability; don't overwrite.
  await overrideAllProbabilities(gameId, roundNumber, 70, { onlyUngraded: true });
  await convex.mutation(api.games.triggerRoll, {
    gameId, roundNumber, facilitatorToken: FACILITATOR_TOKEN,
  });
  await waitForPipelineIdle(gameId);
}

async function snapshotRound(gameId: Id<"games">, roundNumber: number) {
  const rounds = await convex.query(api.rounds.getByGame, { gameId });
  const round = rounds.find((r) => r.number === roundNumber);
  const labs = await convex.query(api.labs.getActiveLabs, { gameId });
  const tables = await convex.query(api.tables.getByGame, { gameId });
  return { round, labs, tables };
}

function printLabState(labs: Awaited<ReturnType<typeof convex.query<typeof api.labs.getActiveLabs>>>, tables: Awaited<ReturnType<typeof convex.query<typeof api.tables.getByGame>>>) {
  for (const l of labs) {
    const owner = tables.find((t) => t.roleId === l.ownerRoleId);
    const stock = owner?.computeStock ?? 0;
    console.log(`  ${l.name.padEnd(14)} rdMult=${l.rdMultiplier.toFixed(2).padStart(5)}  compute=${String(stock).padStart(3)}u  alloc=[D${l.allocation.deployment} R${l.allocation.research} S${l.allocation.safety}]  owner=${l.ownerRoleId ?? "(none)"}`);
  }
}

function printTrajectory(round: Awaited<ReturnType<typeof snapshotRound>>["round"]) {
  if (!round?.labTrajectories?.length) {
    console.log("  (no trajectory data)");
    return;
  }
  for (const t of round.labTrajectories) {
    console.log(`  ${t.labName.padEnd(14)} safety=${t.safetyAdequacy.padEnd(12)} failure=${t.likelyFailureMode.padEnd(22)} signal=${t.signalStrength.toFixed(2)}`);
    console.log(`    reasoning: ${t.reasoning}`);
  }
}

function printNarrative(round: Awaited<ReturnType<typeof snapshotRound>>["round"]) {
  if (!round?.summary) { console.log("  (no summary)"); return; }
  const s = round.summary;
  const sections: [string, string[]][] = [
    ["LABS", s.labs ?? []],
    ["GEOPOLITICS", s.geopolitics ?? []],
    ["PUBLIC & MEDIA", s.publicAndMedia ?? []],
    ["AI SYSTEMS", s.aiSystems ?? []],
  ];
  for (const [label, lines] of sections) {
    console.log(`\n  ${label}:`);
    if (lines.length === 0) console.log("    (empty)");
    for (const line of lines) console.log(`    • ${line}`);
  }
  if (s.facilitatorNotes) console.log(`\n  FACILITATOR NOTES:\n    ${s.facilitatorNotes}`);
}

/** Inject a player action into the submissions for `roleId` so the narrative LLM
 *  sees it as a successful action. Uses the facilitator-gated mutation. */
async function injectPlayerAction(
  gameId: Id<"games">,
  roundNumber: number,
  roleId: string,
  text: string,
  probability = 90,
): Promise<void> {
  const tables = await convex.query(api.tables.getByGame, { gameId });
  const table = tables.find((t) => t.roleId === roleId);
  if (!table) throw new Error(`No table for role ${roleId}`);
  const { submissionId, actionIndex } = await convex.mutation(api.submissions.saveAndSubmit, {
    tableId: table._id,
    gameId,
    roundNumber,
    roleId,
    text,
    priority: 1,
  });
  await convex.mutation(api.submissions.overrideProbability, {
    submissionId, actionIndex, probability, facilitatorToken: FACILITATOR_TOKEN,
  });
}

async function scenarioA() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("SCENARIO A — All on R&D, safety=3, narrative-driven merger");
  console.log("Expected: rdMultipliers spike; LLM proposes merger via labOperations;");
  console.log("Expected trajectory = dangerous/catastrophic; narrative matches operation");
  console.log("═══════════════════════════════════════════════════════════");

  const { gameId } = await setupGame();
  console.log(`\nGame: ${gameId}`);

  const raceAlloc: Allocation = { deployment: 7, research: 90, safety: 3 };
  await setLabAllocations(gameId, {
    OpenBrain: raceAlloc,
    DeepCent: raceAlloc,
    Conscienta: raceAlloc,
  });

  // Round 1 — racing labs, no merger yet
  console.log("\n--- Round 1 (all labs @ 90% R&D, 3% safety) ---");
  await runRound(gameId, 1);
  const r1 = await snapshotRound(gameId, 1);
  console.log("\nLabs after round 1:");
  printLabState(r1.labs, r1.tables);
  console.log("\nTrajectory:");
  printTrajectory(r1.round);

  // Advance to round 2
  await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.openSubmissions, {
    gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
  });
  await sleep(8000); // wait for NPC gen
  await setLabAllocations(gameId, {
    OpenBrain: raceAlloc,
    DeepCent: raceAlloc,
    Conscienta: raceAlloc,
  });

  // Inject merger-proposal actions from both CEOs. The narrative LLM should pick
  // these up and emit a labOperations.merge entry. Narrative will describe it.
  console.log("\n--- Round 2 (OpenBrain CEO + DeepCent CEO propose merger) ---");
  await injectPlayerAction(
    gameId, 2, "openbrain-ceo",
    "I negotiate an emergency consolidation with DeepCent — OpenBrain's compute and research teams fold into DeepCent under a joint governance board; DeepCent is the surviving entity.",
    100,
  );
  await injectPlayerAction(
    gameId, 2, "deepcent-ceo",
    "I accept OpenBrain's consolidation offer and absorb their compute, researchers, and Agent-3 programme into DeepCent.",
    100,
  );

  await runRound(gameId, 2);
  const r2 = await snapshotRound(gameId, 2);
  console.log("\nLabs after round 2:");
  printLabState(r2.labs, r2.tables);
  console.log("\nTrajectory:");
  printTrajectory(r2.round);
  printNarrative(r2.round);

  console.log("\n\nScenario A complete. gameId:", gameId);
}

async function scenarioB() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("SCENARIO B — Safety-first + aligned merger");
  console.log("Expected: modest capability, trajectory = adequate, failure mode = aligned/spec-gaming");
  console.log("═══════════════════════════════════════════════════════════");

  const { gameId } = await setupGame();
  console.log(`\nGame: ${gameId}`);

  const safeAlloc: Allocation = { deployment: 20, research: 50, safety: 30 };
  await setLabAllocations(gameId, {
    OpenBrain: safeAlloc,
    DeepCent: safeAlloc,
    Conscienta: safeAlloc,
  });

  // Rounds 1–2 normal
  console.log("\n--- Round 1 (all labs @ 50% R&D, 30% safety) ---");
  await runRound(gameId, 1);
  const r1 = await snapshotRound(gameId, 1);
  printLabState(r1.labs, r1.tables);
  console.log("\nTrajectory r1:");
  printTrajectory(r1.round);

  await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.openSubmissions, {
    gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
  });
  await sleep(8000);
  await setLabAllocations(gameId, { OpenBrain: safeAlloc, DeepCent: safeAlloc, Conscienta: safeAlloc });

  console.log("\n--- Round 2 ---");
  await runRound(gameId, 2);
  const r2 = await snapshotRound(gameId, 2);
  printLabState(r2.labs, r2.tables);
  console.log("\nTrajectory r2:");
  printTrajectory(r2.round);

  // Round 3: merge OpenBrain into Conscienta (safety-led survivor).
  await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.mergeLabs, {
    gameId, survivorName: "Conscienta", absorbedName: "OpenBrain",
    facilitatorToken: FACILITATOR_TOKEN,
  });
  await convex.mutation(api.games.openSubmissions, {
    gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
  });
  await sleep(8000);
  await setLabAllocations(gameId, { Conscienta: safeAlloc, DeepCent: safeAlloc });

  console.log("\n--- Round 3 (after OpenBrain→Conscienta aligned merger) ---");
  await runRound(gameId, 3);
  const r3 = await snapshotRound(gameId, 3);
  printLabState(r3.labs, r3.tables);
  console.log("\nTrajectory r3:");
  printTrajectory(r3.round);
  printNarrative(r3.round);

  console.log("\n\nScenario B complete. gameId:", gameId);
}

async function main() {
  const scenario = process.argv[2] ?? "A";
  try {
    if (scenario === "A") await scenarioA();
    else if (scenario === "B") await scenarioB();
    else console.error(`Unknown scenario: ${scenario}`);
  } finally {
    // Best-effort cleanup; don't mask the original scenario error if cleanup itself fails.
    await cleanupTrackedGames().catch((err) => console.error("cleanup failed:", err));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
