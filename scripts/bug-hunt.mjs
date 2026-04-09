import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convex = new ConvexHttpClient("http://127.0.0.1:3218");
let passed = 0, failed = 0, bugs = [];

function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(e => { failed++; bugs.push({ name, error: e.message }); console.log(`  ✗ ${name}: ${e.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log("=== BUG HUNT ===\n");

// ─── 1. Game creation edge cases ─────────────────────────────────────────
console.log("1. Game creation");

await test("Create game with tableCount 0", async () => {
  const id = await convex.mutation(api.games.create, { tableCount: 0 });
  const tables = await convex.query(api.tables.getByGame, { gameId: id });
  const enabled = tables.filter(t => t.enabled);
  assert(enabled.length >= 3, `Should have at least 3 required roles, got ${enabled.length}`);
});

await test("Create game with tableCount 17", async () => {
  const id = await convex.mutation(api.games.create, { tableCount: 17 });
  const tables = await convex.query(api.tables.getByGame, { gameId: id });
  const enabled = tables.filter(t => t.enabled);
  assert(enabled.length === 17, `Should have 17 enabled, got ${enabled.length}`);
});

await test("Create game with tableCount 100 (should cap at 17)", async () => {
  const id = await convex.mutation(api.games.create, { tableCount: 100 });
  const tables = await convex.query(api.tables.getByGame, { gameId: id });
  assert(tables.length === 17, `Should have 17 tables, got ${tables.length}`);
});

// ─── 2. Submission edge cases ────────────────────────────────────────────
console.log("\n2. Submission edge cases");

const gameId = await convex.mutation(api.games.create, { tableCount: 5 });
const tables = await convex.query(api.tables.getByGame, { gameId });
const enabledTables = tables.filter(t => t.enabled);
await convex.mutation(api.games.startGame, { gameId });
await convex.mutation(api.games.advancePhase, { gameId, phase: "submit" });

await test("Submit with priority > 10 should throw", async () => {
  try {
    await convex.mutation(api.submissions.submit, {
      tableId: enabledTables[0]._id, gameId, roundNumber: 1, roleId: enabledTables[0].roleId,
      actions: [{ text: "Over budget", priority: 11 }],
    });
    throw new Error("Should have thrown");
  } catch (e) {
    assert(e.message.includes("Priority budget exceeded") || e.message.includes("Uncaught Error"), `Got: ${e.message}`);
  }
});

await test("Submit with > 5 actions should throw", async () => {
  try {
    await convex.mutation(api.submissions.submit, {
      tableId: enabledTables[0]._id, gameId, roundNumber: 1, roleId: enabledTables[0].roleId,
      actions: Array.from({ length: 6 }, (_, i) => ({ text: `Action ${i}`, priority: 1 })),
    });
    throw new Error("Should have thrown");
  } catch (e) {
    assert(e.message.includes("Too many actions") || e.message.includes("Uncaught Error"), `Got: ${e.message}`);
  }
});

await test("Submit during discuss phase should throw", async () => {
  const g2 = await convex.mutation(api.games.create, { tableCount: 3 });
  const t2 = (await convex.query(api.tables.getByGame, { gameId: g2 })).filter(t => t.enabled);
  await convex.mutation(api.games.startGame, { gameId: g2 });
  // Game starts in discuss phase
  try {
    await convex.mutation(api.submissions.submit, {
      tableId: t2[0]._id, gameId: g2, roundNumber: 1, roleId: t2[0].roleId,
      actions: [{ text: "Sneaky submit", priority: 5 }],
    });
    throw new Error("Should have thrown");
  } catch (e) {
    assert(e.message.includes("Cannot submit during") || e.message.includes("Uncaught Error"), `Got: ${e.message}`);
  }
});

await test("Valid submission works", async () => {
  await convex.mutation(api.submissions.submit, {
    tableId: enabledTables[0]._id, gameId, roundNumber: 1, roleId: enabledTables[0].roleId,
    actions: [
      { text: "Action one", priority: 5 },
      { text: "Secret action", priority: 3, secret: true },
    ],
  });
  const sub = await convex.query(api.submissions.getForTable, { tableId: enabledTables[0]._id, roundNumber: 1 });
  assert(sub !== null, "Submission should exist");
  assert(sub.actions.length === 2, `Should have 2 actions, got ${sub.actions.length}`);
  assert(sub.actions[1].secret === true, "Second action should be secret");
});

await test("Double-submit during graded state is rejected", async () => {
  // Apply grading first
  const subs = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
  const sub = subs.find(s => s.roleId === enabledTables[0].roleId);
  await convex.mutation(api.submissions.applyGrading, {
    submissionId: sub._id,
    gradedActions: sub.actions.map(a => ({ text: a.text, priority: a.priority, probability: 50, reasoning: "test" })),
  });
  // Now try to re-submit
  const subId = await convex.mutation(api.submissions.submit, {
    tableId: enabledTables[0]._id, gameId, roundNumber: 1, roleId: enabledTables[0].roleId,
    actions: [{ text: "Late overwrite", priority: 10 }],
  });
  const updated = await convex.query(api.submissions.getForTable, { tableId: enabledTables[0]._id, roundNumber: 1 });
  assert(updated.actions[0].text !== "Late overwrite", "Should not overwrite graded submission");
});

// ─── 3. Rolling edge cases ───────────────────────────────────────────────
console.log("\n3. Rolling edge cases");

await test("Double-roll skips already-resolved", async () => {
  await convex.mutation(api.submissions.rollAllActions, { gameId, roundNumber: 1 });
  const subs1 = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
  const rolls1 = subs1.flatMap(s => s.actions.map(a => a.rolled));

  await convex.mutation(api.submissions.rollAllActions, { gameId, roundNumber: 1 });
  const subs2 = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
  const rolls2 = subs2.flatMap(s => s.actions.map(a => a.rolled));

  assert(JSON.stringify(rolls1) === JSON.stringify(rolls2), "Rolls should be identical (skip resolved)");
});

// ─── 4. Request system edge cases ────────────────────────────────────────
console.log("\n4. Request system");

const g3 = await convex.mutation(api.games.create, { tableCount: 5 });
const t3 = (await convex.query(api.tables.getByGame, { gameId: g3 })).filter(t => t.enabled);
await convex.mutation(api.games.startGame, { gameId: g3 });
await convex.mutation(api.games.advancePhase, { gameId: g3, phase: "submit" });

await test("Send endorsement request", async () => {
  const id = await convex.mutation(api.requests.send, {
    gameId: g3, roundNumber: 1,
    fromRoleId: t3[0].roleId, fromRoleName: t3[0].roleName,
    toRoleId: t3[1].roleId, toRoleName: t3[1].roleName,
    actionText: "Test endorsement", requestType: "endorsement",
  });
  assert(id, "Should return request ID");
});

await test("Negative compute amount rejected", async () => {
  try {
    await convex.mutation(api.requests.send, {
      gameId: g3, roundNumber: 1,
      fromRoleId: t3[0].roleId, fromRoleName: t3[0].roleName,
      toRoleId: t3[1].roleId, toRoleName: t3[1].roleName,
      actionText: "Bad compute", requestType: "compute", computeAmount: -5,
    });
    throw new Error("Should have thrown");
  } catch (e) {
    assert(e.message.includes("positive") || e.message.includes("Uncaught Error"), `Got: ${e.message}`);
  }
});

await test("Double-accept prevented", async () => {
  const reqs = await convex.query(api.requests.getByGameAndRound, { gameId: g3, roundNumber: 1 });
  const pending = reqs.find(r => r.status === "pending");
  await convex.mutation(api.requests.respond, { proposalId: pending._id, status: "accepted" });
  // Second accept should be no-op (status guard)
  await convex.mutation(api.requests.respond, { proposalId: pending._id, status: "accepted" });
  // Verify still accepted (not declined or error)
  const updated = await convex.query(api.requests.getByGameAndRound, { gameId: g3, roundNumber: 1 });
  const req = updated.find(r => r._id === pending._id);
  assert(req.status === "accepted", `Should still be accepted, got ${req.status}`);
});

await test("Compute request with insufficient funds auto-declines", async () => {
  // Find a role with compute
  const usTable = t3.find(t => t.computeStock > 0);
  if (usTable) {
    const reqId = await convex.mutation(api.requests.send, {
      gameId: g3, roundNumber: 1,
      fromRoleId: t3[0].roleId, fromRoleName: t3[0].roleName,
      toRoleId: usTable.roleId, toRoleName: usTable.roleName,
      actionText: "Give me 999 compute", requestType: "compute", computeAmount: 999,
    });
    await convex.mutation(api.requests.respond, { proposalId: reqId, status: "accepted" });
    const reqs = await convex.query(api.requests.getByGameAndRound, { gameId: g3, roundNumber: 1 });
    const req = reqs.find(r => r._id === reqId);
    assert(req.status === "declined", `Should auto-decline insufficient, got ${req.status}`);
  }
});

await test("Compute credit flows to requester on accept", async () => {
  const g4 = await convex.mutation(api.games.create, { tableCount: 6 });
  const t4 = (await convex.query(api.tables.getByGame, { gameId: g4 })).filter(t => t.enabled);
  await convex.mutation(api.games.startGame, { gameId: g4 });
  await convex.mutation(api.games.advancePhase, { gameId: g4, phase: "submit" });

  const giver = t4.find(t => (t.computeStock ?? 0) >= 3);
  const receiver = t4.find(t => t.roleId !== giver?.roleId);
  if (giver && receiver) {
    const giverBefore = giver.computeStock ?? 0;
    const receiverBefore = receiver.computeStock ?? 0;

    const reqId = await convex.mutation(api.requests.send, {
      gameId: g4, roundNumber: 1,
      fromRoleId: receiver.roleId, fromRoleName: receiver.roleName,
      toRoleId: giver.roleId, toRoleName: giver.roleName,
      actionText: "Give me 2 compute", requestType: "compute", computeAmount: 2,
    });
    await convex.mutation(api.requests.respond, { proposalId: reqId, status: "accepted" });

    const updatedTables = await convex.query(api.tables.getByGame, { gameId: g4 });
    const giverAfter = updatedTables.find(t => t.roleId === giver.roleId);
    const receiverAfter = updatedTables.find(t => t.roleId === receiver.roleId);

    assert(giverAfter.computeStock === giverBefore - 2, `Giver should lose 2: ${giverBefore} → ${giverAfter.computeStock}`);
    assert((receiverAfter.computeStock ?? 0) === receiverBefore + 2, `Receiver should gain 2: ${receiverBefore} → ${receiverAfter.computeStock ?? 0}`);
  }
});

// ─── 5. API route edge cases ─────────────────────────────────────────────
console.log("\n5. API routes");

await test("Grade route with invalid gameId returns 404", async () => {
  const res = await fetch("http://localhost:3001/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId: "fake", gameId: "fake", roundNumber: 1, roleId: "fake", actions: [] }),
  });
  const json = await res.json();
  assert(json.error === "Game not found", `Expected 404, got: ${JSON.stringify(json)}`);
});

await test("AI player with invalid game returns 404", async () => {
  const res = await fetch("http://localhost:3001/api/ai-player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId: "fake", gameId: "fake", roundNumber: 1, roleId: "fake" }),
  });
  const json = await res.json();
  assert(json.error === "Game not found", `Expected 404, got: ${JSON.stringify(json)}`);
});

await test("Facilitator adjust with invalid game returns 404", async () => {
  const res = await fetch("http://localhost:3001/api/facilitator-adjust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "fake", instruction: "Set everything to 10" }),
  });
  const json = await res.json();
  assert(json.error === "Game not found", `Expected 404, got: ${JSON.stringify(json)}`);
});

await test("Error responses don't leak details", async () => {
  const res = await fetch("http://localhost:3001/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
  const json = await res.json();
  assert(!json.details, `Should not have details field, got: ${JSON.stringify(json)}`);
});

// ─── 6. Game flow edge cases ─────────────────────────────────────────────
console.log("\n6. Game flow");

await test("Cannot advance past round 3", async () => {
  const gf = await convex.mutation(api.games.create, { tableCount: 3 });
  await convex.mutation(api.games.startGame, { gameId: gf });
  await convex.mutation(api.games.advanceRound, { gameId: gf }); // 1→2
  await convex.mutation(api.games.advanceRound, { gameId: gf }); // 2→3
  await convex.mutation(api.games.advanceRound, { gameId: gf }); // should stay at 3
  const game = await convex.query(api.games.get, { gameId: gf });
  assert(game.currentRound === 3, `Should be round 3, got ${game.currentRound}`);
});

await test("Skip timer clears phaseEndsAt", async () => {
  const gs = await convex.mutation(api.games.create, { tableCount: 3 });
  await convex.mutation(api.games.startGame, { gameId: gs });
  const before = await convex.query(api.games.get, { gameId: gs });
  assert(before.phaseEndsAt !== undefined, "Should have phaseEndsAt after start");
  await convex.mutation(api.games.skipTimer, { gameId: gs });
  const after = await convex.query(api.games.get, { gameId: gs });
  assert(after.phaseEndsAt === undefined, "phaseEndsAt should be cleared");
});

await test("Event log captures game lifecycle", async () => {
  const ge = await convex.mutation(api.games.create, { tableCount: 3 });
  await convex.mutation(api.games.startGame, { gameId: ge });
  await convex.mutation(api.games.advancePhase, { gameId: ge, phase: "submit" });
  await convex.mutation(api.games.finishGame, { gameId: ge });
  const events = await convex.query(api.events.getByGame, { gameId: ge, limit: 10 });
  const types = events.map(e => e.type);
  assert(types.includes("game_start"), "Should log game_start");
  assert(types.includes("phase_change"), "Should log phase_change");
  assert(types.includes("game_finish"), "Should log game_finish");
});

// ─── 8. Redacted query ──────────────────────────────────────────────────
console.log("\n8. Secret action redaction");

await test("Redacted query hides secret action text from other roles", async () => {
  const subs = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
  const secretSub = subs.find(s => s.actions.some(a => a.secret));
  if (secretSub) {
    const redacted = await convex.query(api.submissions.getByGameAndRoundRedacted, {
      gameId, roundNumber: 1, viewerRoleId: "some-other-role",
    });
    const redactedSub = redacted.find(s => s._id === secretSub._id);
    const secretAction = redactedSub.actions.find(a => a.secret);
    assert(secretAction.text === "[Covert action]", `Should be redacted, got: ${secretAction.text}`);
  }
});

await test("Redacted query shows own secret action text", async () => {
  const subs = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
  const secretSub = subs.find(s => s.actions.some(a => a.secret));
  if (secretSub) {
    const redacted = await convex.query(api.submissions.getByGameAndRoundRedacted, {
      gameId, roundNumber: 1, viewerRoleId: secretSub.roleId,
    });
    const own = redacted.find(s => s._id === secretSub._id);
    const secretAction = own.actions.find(a => a.secret);
    assert(secretAction.text !== "[Covert action]", "Own secrets should not be redacted");
  }
});

// ─── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(40)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (bugs.length > 0) {
  console.log("\nBUGS FOUND:");
  bugs.forEach(b => console.log(`  ✗ ${b.name}: ${b.error}`));
}
console.log("=".repeat(40));
