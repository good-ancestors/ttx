/**
 * Full 3-round playthrough test.
 * Run with: npx tsx tests/full-playthrough.ts
 *
 * This makes real AI API calls via the Vercel AI Gateway.
 * Costs ~$0.05-0.10 in Gemini Flash credits.
 */

const CONVEX_URL = "http://127.0.0.1:3210";
const APP_URL = "http://localhost:3001";

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(`Mutation ${path} failed: ${JSON.stringify(data)}`);
  return data.value;
}

async function convexQuery(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(`Query ${path} failed: ${JSON.stringify(data)}`);
  return data.value;
}

async function appPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function log(msg: string) {
  console.log(`\n${"=".repeat(60)}\n${msg}\n${"=".repeat(60)}`);
}

function logState(game: any) {
  for (const lab of game.labs) {
    console.log(`  Lab ${lab.name}: ${lab.computeStock}u, ${lab.rdMultiplier}x, alloc=[U${lab.allocation.deployment}% C${lab.allocation.research}% S${lab.allocation.safety}%]`);
  }
}

async function playRound(gameId: string, roundNumber: number, tables: any[]) {
  log(`ROUND ${roundNumber}`);

  const game = await convexQuery("games:get", { gameId });
  console.log(`  Phase: ${game.phase}, Round: ${game.currentRound}`);
  logState(game);

  // 1. Start submissions
  console.log("\n  Opening submissions...");
  await convexMutation("games:advancePhase", { gameId, phase: "submit" });

  // 2. AI players submit for all tables
  console.log("  AI players submitting...");
  const aiPromises = tables.filter(t => t.enabled).map(t =>
    appPost("/api/ai-player", {
      tableId: t._id,
      gameId,
      roundNumber,
      roleId: t.roleId,
    }).then(r => {
      if (r.success) {
        console.log(`    ${t.roleName}: ${r.actions?.actions?.length ?? '?'} actions`);
      } else {
        console.log(`    ${t.roleName}: FAILED - ${r.error}`);
      }
    }).catch(e => console.log(`    ${t.roleName}: ERROR - ${e.message}`))
  );
  await Promise.allSettled(aiPromises);

  // Wait for submissions to settle
  await new Promise(r => setTimeout(r, 2000));

  // 3. Grade all submissions
  console.log("\n  Grading submissions...");
  const subs = await convexQuery("submissions:getByGameAndRound", { gameId, roundNumber });
  console.log(`  ${subs.length} submissions to grade`);

  const gradePromises = subs.filter((s: any) => s.status === "submitted").map((s: any) =>
    appPost("/api/grade", {
      submissionId: s._id,
      gameId,
      roundNumber,
      roleId: s.roleId,
      actions: s.actions.map((a: any) => ({ text: a.text, priority: a.priority })),
    }).then(r => {
      if (r.success) {
        const grading = r.grading?.actions ?? [];
        const role = tables.find(t => t.roleId === s.roleId)?.roleName ?? s.roleId;
        for (const a of grading) {
          console.log(`    [${role}] "${a.text.substring(0, 60)}..." → ${a.probability}%`);
        }
      } else {
        console.log(`    Grade FAILED: ${r.error}`);
      }
    })
  );
  await Promise.allSettled(gradePromises);
  await new Promise(r => setTimeout(r, 1000));

  // 4. Roll all dice
  console.log("\n  Rolling dice...");
  await convexMutation("submissions:rollAllActions", { gameId, roundNumber });

  const resolvedSubs = await convexQuery("submissions:getByGameAndRound", { gameId, roundNumber });
  let successes = 0, failures = 0;
  for (const sub of resolvedSubs) {
    for (const a of sub.actions) {
      if (a.success) successes++; else failures++;
      const role = tables.find((t: any) => t.roleId === sub.roleId)?.roleName ?? sub.roleId;
      console.log(`    [${role}] "${a.text.substring(0, 50)}..." P${a.priority} → ${a.probability}% → d100:${a.rolled} → ${a.success ? "SUCCESS" : "FAILED"}`);
    }
  }
  console.log(`  Results: ${successes} successes, ${failures} failures`);

  // 5. Generate narrative
  console.log("\n  Generating narrative...");
  await convexMutation("games:advancePhase", { gameId, phase: "rolling" });

  const narrative = await appPost("/api/narrate", { gameId, roundNumber });
  if (narrative.success) {
    const n = narrative.narrative;
    console.log("\n  HEADLINES:");
    for (const h of n.headlines) console.log(`    📰 ${h}`);
    console.log("\n  EVENTS:");
    for (const e of n.geopoliticalEvents) console.log(`    🌍 ${e}`);
    console.log("\n  AI STATE:");
    for (const a of n.aiStateOfPlay) console.log(`    🤖 ${a}`);
    console.log(`\n  FACILITATOR NOTES:\n    ${n.facilitatorNotes}`);
    if (n.labUpdates) {
      console.log("  LAB UPDATES:");
      for (const l of n.labUpdates) console.log(`    ${l.name}: ${l.newComputeStock}u, ${l.newRdMultiplier}x`);
    }
  } else {
    console.log(`  NARRATIVE FAILED: ${narrative.error} - ${narrative.details}`);
  }

  // 6. Advance to narrate phase
  await convexMutation("games:advancePhase", { gameId, phase: "narrate" });

  // Check final state
  const endGame = await convexQuery("games:get", { gameId });
  console.log("\n  END OF ROUND STATE:");
  logState(endGame);

  return endGame;
}

async function main() {
  log("CREATING GAME");
  const gameId = await convexMutation("games:create", { tableCount: 6 });
  console.log(`  Game ID: ${gameId}`);

  const tables = await convexQuery("tables:getByGame", { gameId });
  console.log(`  Tables: ${tables.map((t: any) => t.roleName).join(", ")}`);

  // Start the game
  await convexMutation("games:startGame", { gameId });
  console.log("  Game started!");

  // Play 3 rounds
  for (let round = 1; round <= 3; round++) {
    await playRound(gameId, round, tables);

    if (round < 3) {
      console.log(`\n  Advancing to round ${round + 1}...`);
      await convexMutation("games:advanceRound", { gameId });
    }
  }

  // Final assessment
  log("GAME COMPLETE");
  const finalGame = await convexQuery("games:get", { gameId });
  logState(finalGame);

  // Finish
  await convexMutation("games:finishGame", { gameId });
  console.log("\n  Game finished. ✓");
}

main().catch(console.error);
