import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convex = new ConvexHttpClient("http://127.0.0.1:3216");

const gameId = await convex.mutation(api.games.create, { tableCount: 6 });
const tables = (await convex.query(api.tables.getByGame, { gameId })).filter(t => t.enabled);
await convex.mutation(api.games.startGame, { gameId });
await convex.mutation(api.games.advancePhase, { gameId, phase: "submit" });
const enabledRoles = tables.map(t => ({ id: t.roleId, name: t.roleName }));

console.log("=== UNIFIED REQUEST SYSTEM TESTS ===\n");

// TEST 1: Endorsement request + accept + verify grading sees it
console.log("TEST 1: Endorsement flow");
await convex.mutation(api.proposals.send, {
  gameId, roundNumber: 1,
  fromRoleId: "us-president", fromRoleName: "United States",
  toRoleId: "openbrain-ceo", toRoleName: "OpenBrain CEO",
  actionText: "Use DPA to consolidate AI labs under federal oversight",
  requestType: "endorsement",
});
// OpenBrain accepts
const pending1 = await convex.query(api.proposals.getForRole, { gameId, roundNumber: 1, roleId: "openbrain-ceo" });
const endorseReq = pending1.find(p => p.status === "pending");
await convex.mutation(api.proposals.respond, { proposalId: endorseReq._id, status: "accepted" });
const after1 = await convex.query(api.proposals.getByGameAndRound, { gameId, roundNumber: 1 });
console.log("  Endorsement:", after1[0].status, "requestType:", after1[0].requestType);
console.log("  " + (after1[0].status === "accepted" && after1[0].requestType === "endorsement" ? "PASS" : "FAIL"));

// TEST 2: Compute request + accept + verify stock deduction
console.log("\nTEST 2: Compute request flow");
const usBefore = tables.find(t => t.roleId === "us-president");
console.log("  US compute before:", usBefore.computeStock + "u");

await convex.mutation(api.proposals.send, {
  gameId, roundNumber: 1,
  fromRoleId: "openbrain-ceo", fromRoleName: "OpenBrain CEO",
  toRoleId: "us-president", toRoleName: "United States",
  actionText: "Request national compute access for Agent-3 development",
  requestType: "compute",
  computeAmount: 4,
});

const pending2 = await convex.query(api.proposals.getForRole, { gameId, roundNumber: 1, roleId: "us-president" });
const computeReq = pending2.find(p => p.requestType === "compute" && p.status === "pending");
await convex.mutation(api.proposals.respond, { proposalId: computeReq._id, status: "accepted" });

const usAfter = await convex.query(api.tables.getByGame, { gameId });
const usTable = usAfter.find(t => t.roleId === "us-president");
console.log("  US compute after:", usTable.computeStock + "u (should be " + (usBefore.computeStock - 4) + ")");
console.log("  " + (usTable.computeStock === usBefore.computeStock - 4 ? "PASS — compute deducted" : "FAIL"));

// TEST 3: Compute request declined — no deduction
console.log("\nTEST 3: Compute request declined");
await convex.mutation(api.proposals.send, {
  gameId, roundNumber: 1,
  fromRoleId: "deepcent-ceo", fromRoleName: "DeepCent CEO",
  toRoleId: "china-president", toRoleName: "China",
  actionText: "Request additional state compute for DeepCent acceleration",
  requestType: "compute",
  computeAmount: 3,
});
const pending3 = await convex.query(api.proposals.getForRole, { gameId, roundNumber: 1, roleId: "china-president" });
const chinaReq = pending3.find(p => p.requestType === "compute" && p.status === "pending");
const chinaBefore = (await convex.query(api.tables.getByGame, { gameId })).find(t => t.roleId === "china-president");
await convex.mutation(api.proposals.respond, { proposalId: chinaReq._id, status: "declined" });
const chinaAfter = (await convex.query(api.tables.getByGame, { gameId })).find(t => t.roleId === "china-president");
console.log("  China compute: " + chinaBefore.computeStock + "u → " + chinaAfter.computeStock + "u (should be unchanged)");
console.log("  " + (chinaAfter.computeStock === chinaBefore.computeStock ? "PASS — no deduction on decline" : "FAIL"));

// TEST 4: Grade with endorsement + decline signals
console.log("\nTEST 4: Grading with endorsement (accepted) + decline signals");
// Also add a decline
await convex.mutation(api.proposals.send, {
  gameId, roundNumber: 1,
  fromRoleId: "us-president", fromRoleName: "United States",
  toRoleId: "us-congress", toRoleName: "US Congress & Judiciary",
  actionText: "Use DPA to consolidate AI labs under federal oversight",
  requestType: "endorsement",
});
// Note: us-congress may not be enabled. Let's check
const congressTable = tables.find(t => t.roleId === "us-congress");
if (congressTable) {
  const pending4 = await convex.query(api.proposals.getForRole, { gameId, roundNumber: 1, roleId: "us-congress" });
  const congressReq = pending4.find(p => p.status === "pending");
  if (congressReq) await convex.mutation(api.proposals.respond, { proposalId: congressReq._id, status: "declined" });
}

// Submit the DPA action and grade it
const usPresTable = tables.find(t => t.roleId === "us-president");
await convex.mutation(api.submissions.submit, {
  tableId: usPresTable._id, gameId, roundNumber: 1, roleId: "us-president",
  actions: [{ text: "Use DPA to consolidate AI labs under federal oversight", priority: 8 }],
});
const subs = await convex.query(api.submissions.getByGameAndRound, { gameId, roundNumber: 1 });
const usSub = subs.find(s => s.roleId === "us-president");
const gradeRes = await fetch("http://localhost:3001/api/grade", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ submissionId: usSub._id, gameId, roundNumber: 1, roleId: "us-president", actions: [{ text: "Use DPA to consolidate AI labs under federal oversight", priority: 8 }] }),
}).then(r => r.json());

const prob = gradeRes.grading?.actions?.[0]?.probability;
const reasoning = gradeRes.grading?.actions?.[0]?.reasoning ?? "";
console.log("  DPA probability:", prob + "%");
console.log("  Reasoning mentions endorsement:", reasoning.toLowerCase().includes("endors") || reasoning.toLowerCase().includes("openbrain") ? "YES" : "no");
console.log("  Reasoning mentions decline/opposition:", reasoning.toLowerCase().includes("declin") || reasoning.toLowerCase().includes("opposition") || reasoning.toLowerCase().includes("congress") ? "YES" : "no");
console.log("  " + (prob >= 30 && prob <= 70 ? "PASS — probability reflects mixed support" : "CHECK — probability: " + prob + "%"));

// TEST 5: AI proposals with request types
console.log("\nTEST 5: AI proposals generate typed requests");
const aiRes = await fetch("http://localhost:3001/api/ai-proposals", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ gameId, roundNumber: 1, roleId: "conscienta-ceo", enabledRoles: enabledRoles.filter(r => r.id !== "conscienta-ceo") }),
}).then(r => r.json());
console.log("  AI responses:", aiRes.responses?.length || 0);
console.log("  New requests:", aiRes.newRequests?.length || 0);
if (aiRes.newRequests?.length > 0) {
  for (const nr of aiRes.newRequests) {
    console.log("    → " + nr.toRoleId + ": " + nr.requestType + (nr.computeAmount ? " (" + nr.computeAmount + "u)" : "") + " — " + nr.actionText.substring(0, 60));
  }
  console.log("  PASS — AI generated typed requests");
} else {
  console.log("  OK — AI chose not to propose (valid behavior)");
}

// Event log check
const events = await convex.query(api.events.getByGame, { gameId, limit: 20 });
const reqEvents = events.filter(e => e.type.startsWith("request"));
console.log("\n=== EVENT LOG ===");
console.log("Request events: " + reqEvents.length);
reqEvents.forEach(e => console.log("  " + e.type + (e.roleId ? " [" + e.roleId + "]" : "") + " " + (e.data?.substring(0, 70) || "")));

console.log("\n=== DONE ===");
