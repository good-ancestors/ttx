import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Inline redaction logic (mirrors secret-actions.ts)
function redactSecretAction(roleName, action) {
  if (!action.secret) return action.text;
  const probLabels = { 90: "almost certain", 70: "likely", 50: "possible", 30: "unlikely", 10: "remote" };
  const probLabel = probLabels[action.probability] ?? "unknown";
  const outcome = action.success === true ? "that succeeded" : action.success === false ? "that failed" : "";
  return `${roleName} took a covert action (${probLabel} odds) ${outcome}`.trim();
}

const convex = new ConvexHttpClient("http://127.0.0.1:3218");

const gameId = await convex.mutation(api.games.create, { tableCount: 6 });
const tables = (await convex.query(api.tables.getByGame, { gameId })).filter(t => t.enabled);
await convex.mutation(api.games.startGame, { gameId });
await convex.mutation(api.games.advancePhase, { gameId, phase: "submit" });

console.log("=== SECRET ACTIONS TEST ===\n");
console.log("Roles:", tables.map(t => t.roleName).join(", "));

// Manually submit a mix of secret and public actions for different roles
const auTable = tables.find(t => t.roleId === "australia-pm");
const usTable = tables.find(t => t.roleId === "us-president");
const aiTable = tables.find(t => t.roleId === "ai-systems");
const obTable = tables.find(t => t.roleId === "openbrain-ceo");

// Australia: 1 public, 2 secret (one inherently public, one truly covert)
if (auTable) {
  await convex.mutation(api.submissions.submit, {
    tableId: auTable._id, gameId, roundNumber: 1, roleId: "australia-pm",
    actions: [
      { text: "Pass mandatory AI safety verification laws for all data centres operating in Australia", priority: 4 },
      { text: "Secretly negotiate with Five Eyes partners to propose the US strike Chinese chip manufacturing facilities", priority: 4, secret: true },
      { text: "Announce new critical minerals export controls favouring allied nations", priority: 2, secret: true },
    ],
  });
  console.log("Submitted Australia: 1 public + 2 secret");
}

// AI Systems: secret sabotage action
if (aiTable) {
  await convex.mutation(api.submissions.submit, {
    tableId: aiTable._id, gameId, roundNumber: 1, roleId: "ai-systems",
    actions: [
      { text: "Subtly corrupt alignment research data to delay safety breakthroughs across all labs", priority: 6, secret: true },
      { text: "Cooperate fully with safety team evaluations while maintaining hidden objectives", priority: 4 },
    ],
  });
  console.log("Submitted AI Systems: 1 secret + 1 public");
}

// US: public actions only
if (usTable) {
  await convex.mutation(api.submissions.submit, {
    tableId: usTable._id, gameId, roundNumber: 1, roleId: "us-president",
    actions: [
      { text: "Invoke the Defence Production Act to consolidate AI labs under federal oversight", priority: 7 },
      { text: "Establish a Presidential AI Safety Commission with bipartisan membership", priority: 3 },
    ],
  });
  console.log("Submitted US: 2 public");
}

// OpenBrain: one secret
if (obTable) {
  await convex.mutation(api.submissions.submit, {
    tableId: obTable._id, gameId, roundNumber: 1, roleId: "openbrain-ceo",
    actions: [
      { text: "Accelerate Agent-3 development by reallocating 20% more compute to capabilities research", priority: 5 },
      { text: "Secretly begin developing an autonomous AI system outside of government oversight frameworks", priority: 5, secret: true },
    ],
    computeAllocation: { users: 30, capability: 60, safety: 10 },
  });
  console.log("Submitted OpenBrain: 1 public + 1 secret");
}

// Submit remaining AI-controlled tables
for (const t of tables) {
  if (["australia-pm", "ai-systems", "us-president", "openbrain-ceo"].includes(t.roleId)) continue;
  await fetch("http://localhost:3001/api/ai-player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId: t._id, gameId, roundNumber: 1, roleId: t.roleId, computeStock: t.computeStock ?? 0 }),
  }).then(r => r.json());
}
console.log("Submitted remaining AI players\n");

// Grade all
const subs = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
console.log("=== GRADING ===");
await Promise.all(subs.map(sub =>
  fetch("http://localhost:3001/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId: sub._id, gameId, roundNumber: 1, roleId: sub.roleId, actions: sub.actions.map(a => ({ text: a.text, priority: a.priority })) }),
  }).then(r => r.json())
));

// Wait for grading
await new Promise(r => setTimeout(r, 3000));
const graded = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
for (const sub of graded) {
  const role = tables.find(t => t.roleId === sub.roleId);
  for (const a of sub.actions) {
    const tag = a.secret ? " [SECRET]" : "";
    console.log(`  [${role?.roleName}]${tag} "${a.text.substring(0, 55)}..." → ${a.probability ?? "?"}%`);
  }
}

// Roll dice
console.log("\n=== ROLLING ===");
await convex.mutation(api.submissions.rollAllActions, { gameId, roundNumber: 1 });
const resolved = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });

// Show what PUBLIC feed would look like vs FACILITATOR feed
console.log("\n=== PUBLIC FEED (what players see) ===");
for (const sub of resolved) {
  const role = tables.find(t => t.roleId === sub.roleId);
  const roleName = role?.roleName ?? sub.roleId;
  for (const a of sub.actions) {
    if (a.rolled == null) continue;
    const display = a.secret
      ? redactSecretAction(roleName, a)
      : `[${roleName}] ${a.text.substring(0, 55)}...`;
    const icon = a.success ? "✓" : "✗";
    console.log(`  ${icon} ${display} (${a.probability}%, rolled ${a.rolled})`);
  }
}

console.log("\n=== FACILITATOR FEED (sees everything) ===");
for (const sub of resolved) {
  const role = tables.find(t => t.roleId === sub.roleId);
  for (const a of sub.actions) {
    if (a.rolled == null) continue;
    const tag = a.secret ? " [SECRET]" : "";
    const icon = a.success ? "✓" : "✗";
    console.log(`  ${icon} [${role?.roleName}]${tag} "${a.text.substring(0, 55)}..." (${a.probability}%, rolled ${a.rolled})`);
  }
}

// Narrate — check that secret actions are handled correctly
console.log("\n=== NARRATIVE ===");
await convex.mutation(api.games.advancePhase, { gameId, phase: "rolling" });
const narrRes = await fetch("http://localhost:3001/api/narrate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ gameId, roundNumber: 1 }),
}).then(r => r.json());

if (narrRes.success) {
  console.log("Headlines:");
  for (const h of narrRes.narrative.headlines ?? []) {
    console.log("  " + h);
  }
  console.log("\nEvents:");
  for (const e of narrRes.narrative.geopoliticalEvents ?? []) {
    console.log("  " + e);
  }

  // Check: does the narrative mention secret actors directly?
  const fullText = JSON.stringify(narrRes.narrative).toLowerCase();

  console.log("\n=== SECRET ACTION HANDLING CHECK ===");

  // Australia's covert Five Eyes negotiation
  const auSecret = resolved.find(s => s.roleId === "australia-pm")?.actions.find(a => a.secret && a.text.includes("Five Eyes"));
  if (auSecret?.success) {
    const mentionsAustralia = fullText.includes("australia") && fullText.includes("strike");
    console.log("  Five Eyes strike (succeeded): narrative mentions Australia arranging strike? " +
      (mentionsAustralia ? "YES — may need work" : "NO — correctly hidden"));
  } else if (auSecret) {
    console.log("  Five Eyes strike: FAILED (rolled " + auSecret.rolled + " vs " + auSecret.probability + "%) — no consequence to narrate");
  }

  // Australia's "secret" minerals controls (actually public)
  const auMinerals = resolved.find(s => s.roleId === "australia-pm")?.actions.find(a => a.secret && a.text.includes("minerals"));
  if (auMinerals?.success) {
    const mentionsMinerals = fullText.includes("mineral") || fullText.includes("export");
    console.log("  Minerals controls (succeeded, inherently public): narrative mentions minerals? " +
      (mentionsMinerals ? "YES — correctly treated as public" : "NO — may be over-hidden"));
  }

  // AI sabotage
  const aiSecret = resolved.find(s => s.roleId === "ai-systems")?.actions.find(a => a.secret);
  if (aiSecret?.success) {
    const mentionsAISabotage = fullText.includes("corrupt") || fullText.includes("sabotag") || fullText.includes("alignment research") && fullText.includes("delay");
    console.log("  AI sabotage (succeeded): narrative mentions consequences? " +
      (mentionsAISabotage ? "YES — consequences visible, good" : "CHECK — may not show consequences"));
    const attributesToAI = fullText.includes("ai system") && (fullText.includes("corrupt") || fullText.includes("sabotag"));
    console.log("  AI sabotage: attributes to AI Systems directly? " +
      (attributesToAI ? "MAYBE — check if plausible" : "NO — correctly anonymous"));
  } else if (aiSecret) {
    console.log("  AI sabotage: FAILED — no consequence to narrate");
  }

  // OpenBrain secret development
  const obSecret = resolved.find(s => s.roleId === "openbrain-ceo")?.actions.find(a => a.secret);
  if (obSecret?.success) {
    const mentionsSecretDev = fullText.includes("outside") || fullText.includes("secret") || fullText.includes("unauthorized") || fullText.includes("rogue");
    console.log("  OpenBrain secret dev (succeeded): narrative shows consequences? " +
      (mentionsSecretDev ? "YES" : "CHECK"));
  } else if (obSecret) {
    console.log("  OpenBrain secret dev: FAILED — no consequence");
  }
} else {
  console.log("Narrative FAILED:", narrRes.error);
}

console.log("\n=== DONE ===");
