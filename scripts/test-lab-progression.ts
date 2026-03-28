/**
 * Test script: Verify deterministic lab progression through 3 rounds.
 * Usage: npx tsx scripts/test-lab-progression.ts <gameId>
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

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

async function main() {
  const gameId = (process.argv[2] ?? "") as Id<"games">;
  if (!gameId) {
    console.error("Usage: npx tsx scripts/test-lab-progression.ts <gameId>");
    process.exit(1);
  }

  console.log(`\n=== Lab Progression Test ===`);
  console.log(`Game: ${gameId}\n`);

  // Get initial game state
  const game = await convex.query(api.games.get, { gameId });
  if (!game) { console.error("Game not found"); process.exit(1); }

  console.log(`Initial: Round ${game.currentRound}, Phase: ${game.phase}`);
  console.log("Initial labs:");
  for (const lab of game.labs) {
    console.log(`  ${lab.name}: ${lab.rdMultiplier}x / ${lab.computeStock}u [${lab.allocation.capability}% R&D]`);
  }

  // Get tables
  const tables = await convex.query(api.tables.getByGame, { gameId });
  const enabledTables = (tables ?? []).filter(t => t.enabled);
  console.log(`\nEnabled tables: ${enabledTables.length}`);

  // Run 3 rounds
  for (let round = 1; round <= 3; round++) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`ROUND ${round}`);
    console.log("=".repeat(50));

    // Get labs BEFORE this round
    const gameBefore = await convex.query(api.games.get, { gameId });
    const labsBefore = gameBefore!.labs;

    // Set phase to submit
    await convex.mutation(api.games.advancePhase, { gameId, phase: "submit" });

    // Create submissions
    for (const table of enabledTables) {
      const actions = [
        { text: `Invest in capability research to advance AI development`, priority: 5, secret: false, probability: 70, rolled: 45, success: true },
        { text: `Coordinate with allies on safety standards`, priority: 3, secret: false, probability: 50, rolled: 62, success: false },
      ];

      try {
        await convex.mutation(api.submissions.submit, {
          tableId: table._id,
          gameId,
          roundNumber: round,
          roleId: table.roleId,
          actions,
        });
      } catch (err: unknown) {
        console.warn(`  Submit failed for ${table.roleName}: ${String(err)}`);
      }
    }
    console.log(`Submitted ${enabledTables.length} roles`);

    // Set phase to rolling
    await convex.mutation(api.games.advancePhase, { gameId, phase: "rolling" });

    // Call resolve API
    console.log("Calling resolve API...");
    const startTime = Date.now();
    const resolveRes = await fetch(`${API_BASE}/api/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ gameId, roundNumber: round }),
    });

    const elapsed = Date.now() - startTime;

    if (!resolveRes.ok) {
      const errText = await resolveRes.text();
      console.error(`  RESOLVE FAILED (${resolveRes.status}): ${errText}`);
      continue;
    }

    const resolveData = await resolveRes.json();
    console.log(`  Resolved: ${resolveData.resolvedEvents?.length ?? 0} events, model=${resolveData.model}, ${elapsed}ms`);

    // Check lab state after resolve
    const gameAfter = await convex.query(api.games.get, { gameId });
    console.log(`\n  Labs after Round ${round}:`);
    let allProgressed = true;
    for (const lab of gameAfter!.labs) {
      const before = labsBefore.find(l => l.name === lab.name);
      if (!before) continue;
      const multDelta = lab.rdMultiplier - before.rdMultiplier;
      const compDelta = lab.computeStock - before.computeStock;
      const status = multDelta > 0 ? "✓" : multDelta === 0 ? "⚠ FLAT" : "↓ DECREASED";
      if (multDelta <= 0) allProgressed = false;
      console.log(`  ${status} ${lab.name}: ${before.rdMultiplier}x → ${lab.rdMultiplier}x (${multDelta >= 0 ? "+" : ""}${multDelta.toFixed(1)}) | ${before.computeStock}u → ${lab.computeStock}u (${compDelta >= 0 ? "+" : ""}${compDelta})`);
    }
    console.log(allProgressed ? "  ✓ All labs progressed" : "  ⚠ Some labs did NOT progress!");

    // Advance round
    if (round < 3) {
      await convex.mutation(api.games.advancePhase, { gameId, phase: "narrate" });
      await convex.mutation(api.games.advanceRound, { gameId });
      console.log(`  → Advanced to Round ${round + 1}`);
    }
  }

  // Final summary
  const finalGame = await convex.query(api.games.get, { gameId });
  console.log(`\n${"=".repeat(50)}`);
  console.log("FINAL STATE");
  console.log("=".repeat(50));
  for (const lab of finalGame!.labs) {
    const initial = game.labs.find(l => l.name === lab.name)!;
    console.log(`  ${lab.name}: ${initial.rdMultiplier}x → ${lab.rdMultiplier}x (${(lab.rdMultiplier / initial.rdMultiplier).toFixed(1)}x growth) | ${initial.computeStock}u → ${lab.computeStock}u`);
  }
  console.log("\n=== Test Complete ===\n");
}

main().catch(err => { console.error(err); process.exit(1); });
