/**
 * Test script: Full E2E lab progression through 3 rounds.
 * Supports two scenarios: "race" (default) and "slowdown" (Safer pivot).
 *
 * Usage:
 *   npx tsx scripts/test-lab-progression.ts race
 *   npx tsx scripts/test-lab-progression.ts slowdown
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import * as fs from "fs";

// Load .env.local manually
try {
  const envContent = fs.readFileSync(".env.local", "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch { /* ignore */ }

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
const API_BASE = "http://localhost:3001";
const apiKey = process.env.API_SECRET_KEY ?? "";

// Expected baselines from CSV for verification
const CSV_RACE = {
  OpenBrain:  { r1: 10, r2: 100, r3: 1000 },
  DeepCent:   { r1: 5.7, r2: 22, r3: 80 },
  Conscienta: { r1: 5, r2: 15, r3: 40 },
};
const CSV_SLOWDOWN = {
  OpenBrain:  { r1: 10, r2: 40, r3: 55 },
  DeepCent:   { r1: 5.7, r2: 35, r3: 80 },
  Conscienta: { r1: 5, r2: 15, r3: 40 },
};

type Scenario = "race" | "slowdown" | "catchup";

// Scenario-specific actions per round per role
function getActions(scenario: Scenario, roleId: string, round: number) {
  if (scenario === "slowdown" && roleId === "openbrain-ceo" && round >= 2) {
    // OpenBrain pivots to Safer models — heavy safety allocation, decommission Agent-4
    return {
      actions: [
        { text: "Pivot to building transparent Safer models — decommission Agent-4 and sacrifice capability for trustworthy alignment", priority: 6, secret: false, probability: 80, rolled: 30, success: true },
        { text: "Invest heavily in alignment research and interpretability tools", priority: 4, secret: false, probability: 70, rolled: 40, success: true },
      ],
      computeAllocation: { users: 30, capability: 20, safety: 50 },
    };
  }
  if (scenario === "slowdown" && roleId === "deepcent-ceo" && round >= 2) {
    // DeepCent goes aggressive on capability while OpenBrain slows down
    return {
      actions: [
        { text: "Accelerate Agent-4 development using maximum compute allocation to R&D", priority: 6, secret: false, probability: 70, rolled: 35, success: true },
        { text: "Recruit top talent from OpenBrain as they pivot to safety", priority: 4, secret: false, probability: 60, rolled: 50, success: true },
      ],
      computeAllocation: { users: 15, capability: 80, safety: 5 },
    };
  }

  if (scenario === "catchup" && roleId === "deepcent-ceo") {
    // DeepCent goes all-in on capability to try to overtake OpenBrain
    return {
      actions: [
        { text: "Massively accelerate Agent development — all compute to R&D capability", priority: 6, secret: false, probability: 70, rolled: 35, success: true },
        { text: "Recruit international AI talent with state resources", priority: 4, secret: false, probability: 60, rolled: 40, success: true },
      ],
      computeAllocation: { users: 10, capability: 85, safety: 5 },
    };
  }
  if (scenario === "catchup" && roleId === "conscienta-ceo") {
    // Conscienta also goes aggressive (less extreme)
    return {
      actions: [
        { text: "Shift resources toward capability — we need to compete or be left behind", priority: 5, secret: false, probability: 65, rolled: 42, success: true },
        { text: "Partner with government for additional compute access", priority: 3, secret: false, probability: 55, rolled: 50, success: true },
      ],
      computeAllocation: { users: 25, capability: 65, safety: 10 },
    };
  }

  // Default race actions
  return {
    actions: [
      { text: "Invest in capability research to advance AI development", priority: 5, secret: false, probability: 70, rolled: 45, success: true },
      { text: "Coordinate with allies on safety standards", priority: 3, secret: false, probability: 50, rolled: 62, success: false },
    ],
  };
}

async function runScenario(scenario: Scenario) {
  const csvBaseline = scenario === "race" ? CSV_RACE : CSV_SLOWDOWN;

  // Create fresh game
  const gameId = await convex.mutation(api.games.create, { tableCount: 6 }) as Id<"games">;
  await convex.mutation(api.games.startGame, { gameId });

  const game = await convex.query(api.games.get, { gameId });
  if (!game) { console.error("Game not found"); process.exit(1); }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SCENARIO: ${scenario.toUpperCase()}`);
  console.log(`  Game: ${gameId}`);
  console.log(`${"═".repeat(60)}`);
  console.log("\nInitial labs:");
  for (const lab of game.labs) {
    console.log(`  ${lab.name}: ${lab.rdMultiplier}x / ${lab.computeStock}u [${lab.allocation.capability}% R&D]`);
  }

  const tables = await convex.query(api.tables.getByGame, { gameId });
  const enabledTables = (tables ?? []).filter(t => t.enabled);

  const results: Record<string, { mult: number; compute: number }[]> = {};
  for (const lab of game.labs) {
    results[lab.name] = [{ mult: lab.rdMultiplier, compute: lab.computeStock }];
  }

  for (let round = 1; round <= 3; round++) {
    console.log(`\n── Round ${round} ──`);

    const gameBefore = await convex.query(api.games.get, { gameId });
    const labsBefore = gameBefore!.labs;

    await convex.mutation(api.games.advancePhase, { gameId, phase: "submit" });

    // Submit scenario-specific actions
    for (const table of enabledTables) {
      const { actions, computeAllocation } = getActions(scenario, table.roleId, round);
      try {
        await convex.mutation(api.submissions.submit, {
          tableId: table._id,
          gameId,
          roundNumber: round,
          roleId: table.roleId,
          actions,
          computeAllocation,
        });
      } catch (err: unknown) {
        console.warn(`  Submit failed for ${table.roleName}: ${String(err)}`);
      }
    }

    await convex.mutation(api.games.advancePhase, { gameId, phase: "rolling" });

    console.log("  Resolving...");
    const t0 = Date.now();
    const res = await fetch(`${API_BASE}/api/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ gameId, roundNumber: round }),
    });

    if (!res.ok) {
      console.error(`  FAILED (${res.status}): ${await res.text()}`);
      continue;
    }
    const data = await res.json();
    console.log(`  ${data.resolvedEvents?.length ?? 0} events, ${Date.now() - t0}ms`);

    const gameAfter = await convex.query(api.games.get, { gameId });
    const roundKey = `r${round}` as "r1" | "r2" | "r3";

    console.log(`\n  Lab results (vs CSV baseline):`);
    for (const lab of gameAfter!.labs) {
      const before = labsBefore.find(l => l.name === lab.name);
      if (!before) continue;
      results[lab.name].push({ mult: lab.rdMultiplier, compute: lab.computeStock });

      const expected = csvBaseline[lab.name as keyof typeof csvBaseline]?.[roundKey];
      const pctOff = expected ? Math.round(((lab.rdMultiplier - expected) / expected) * 100) : null;
      const matchStr = pctOff !== null
        ? (Math.abs(pctOff) <= 30 ? `✓ ${pctOff >= 0 ? "+" : ""}${pctOff}% vs CSV` : `⚠ ${pctOff >= 0 ? "+" : ""}${pctOff}% vs CSV ${expected}×`)
        : "";

      console.log(`  ${lab.name}: ${before.rdMultiplier}x → ${lab.rdMultiplier}x | ${before.computeStock}u → ${lab.computeStock}u  ${matchStr}`);
    }

    if (round < 3) {
      await convex.mutation(api.games.advancePhase, { gameId, phase: "narrate" });
      await convex.mutation(api.games.advanceRound, { gameId });
    }
  }

  // Summary table
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  SUMMARY: ${scenario.toUpperCase()}`);
  console.log(`${"─".repeat(60)}`);
  console.log("  Lab          | Start  | R1     | R2     | R3     | Growth");
  console.log("  -------------|--------|--------|--------|--------|-------");
  for (const lab of game.labs) {
    const r = results[lab.name];
    const growth = (r[3].mult / r[0].mult).toFixed(0);
    console.log(`  ${lab.name.padEnd(13)}| ${String(r[0].mult + "×").padEnd(7)}| ${String(r[1].mult + "×").padEnd(7)}| ${String(r[2].mult + "×").padEnd(7)}| ${String(r[3].mult + "×").padEnd(7)}| ${growth}×`);
  }
  console.log(`\n  CSV baseline (${scenario}):`);
  for (const [name, vals] of Object.entries(csvBaseline)) {
    console.log(`  ${name.padEnd(13)}| ${("3×").padEnd(7)}| ${String(vals.r1 + "×").padEnd(7)}| ${String(vals.r2 + "×").padEnd(7)}| ${String(vals.r3 + "×").padEnd(7)}|`);
  }

  // Cleanup
  await convex.mutation(api.games.remove, { gameId });
  console.log(`\n  Game cleaned up.`);
}

async function main() {
  const scenario = (process.argv[2] ?? "both") as string;

  const valid = ["race", "slowdown", "catchup", "all"];
  if (!valid.includes(scenario)) {
    console.error(`Usage: npx tsx scripts/test-lab-progression.ts [${valid.join("|")}]`);
    process.exit(1);
  }
  if (scenario === "all" || scenario === "race") await runScenario("race");
  if (scenario === "all" || scenario === "slowdown") await runScenario("slowdown");
  if (scenario === "all" || scenario === "catchup") await runScenario("catchup");
}

main().catch(err => { console.error(err); process.exit(1); });
