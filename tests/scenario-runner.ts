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

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://oceanic-lapwing-232.convex.cloud";
const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET || "coral-ember-drift-sage";
const convex = new ConvexHttpClient(CONVEX_URL);

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
  const gameId = await convex.mutation(api.games.create, { facilitatorToken: FACILITATOR_TOKEN });
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

async function overrideAllProbabilities(gameId: Id<"games">, roundNumber: number, probability: number): Promise<void> {
  const subs = await convex.query(api.submissions.getByGameAndRound, {
    gameId, roundNumber, facilitatorToken: FACILITATOR_TOKEN,
  });
  for (const sub of subs) {
    for (let i = 0; i < sub.actions.length; i++) {
      const a = sub.actions[i];
      if (a.actionStatus !== "submitted") continue;
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
  await overrideAllProbabilities(gameId, roundNumber, 70);
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
  console.log(`\n  HEADLINES:`);
  for (const h of s.headlines) console.log(`    • ${h}`);
  console.log(`\n  GEOPOLITICAL:`);
  for (const e of s.geopoliticalEvents) console.log(`    • ${e}`);
  console.log(`\n  AI STATE:`);
  for (const a of s.aiStateOfPlay) console.log(`    • ${a}`);
  if (s.facilitatorNotes) console.log(`\n  FACILITATOR NOTES:\n    ${s.facilitatorNotes}`);
  if (s.narrative) console.log(`\n  NARRATIVE:\n    ${s.narrative}`);
}

async function scenarioA() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("SCENARIO A — All on R&D, safety=3, early merge");
  console.log("Expected: rdMultipliers spike, trajectory = dangerous/catastrophic");
  console.log("Expected failure modes: loss-of-control / deceptive / power-concentration");
  console.log("═══════════════════════════════════════════════════════════");

  const { gameId } = await setupGame();
  console.log(`\nGame: ${gameId}`);

  // All 3 labs pushed to max capability.
  const raceAlloc: Allocation = { deployment: 7, research: 90, safety: 3 };
  await setLabAllocations(gameId, {
    OpenBrain: raceAlloc,
    DeepCent: raceAlloc,
    Conscienta: raceAlloc,
  });

  // Round 1
  console.log("\n--- Round 1 (all labs @ 90% R&D, 3% safety) ---");
  await runRound(gameId, 1);
  const r1 = await snapshotRound(gameId, 1);
  console.log("\nLabs after round 1:");
  printLabState(r1.labs, r1.tables);
  console.log("\nTrajectory:");
  printTrajectory(r1.round);

  // Advance + merge OpenBrain into DeepCent (facilitator).
  await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  await convex.mutation(api.games.mergeLabs, {
    gameId, survivorName: "DeepCent", absorbedName: "OpenBrain",
    facilitatorToken: FACILITATOR_TOKEN,
  });
  await convex.mutation(api.games.openSubmissions, {
    gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
  });
  await sleep(8000); // wait for NPC gen

  // Keep race allocations — merged lab still in race mode.
  await setLabAllocations(gameId, {
    DeepCent: raceAlloc,
    Conscienta: raceAlloc,
  });

  // Round 2
  console.log("\n--- Round 2 (after OpenBrain→DeepCent merger) ---");
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

const scenario = process.argv[2] ?? "A";
if (scenario === "A") scenarioA().catch(console.error);
else if (scenario === "B") scenarioB().catch(console.error);
else console.error(`Unknown scenario: ${scenario}`);
