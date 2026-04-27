import { describe, it, expect, beforeAll } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConvexTestClient, FACILITATOR_TOKEN, createTestGame } from "./convex-test-client";

// Integration tests for the labs-as-first-class-entity refactor (PR #14).
// Exercises the public mutations that wrap createLabInternal, mergeLabsInternal,
// decommissionLabInternal, transferLabOwnershipInternal, updateLab*Internal, and
// the updateLabs / restoreSnapshot flows that enforce table invariants.
//
// Run with: npm run test:integration  (requires `npx convex dev` running)

const convex = getConvexTestClient();

/** Helper: fetch all labs for a game including decommissioned. */
async function getAllLabs(gameId: Id<"games">) {
  return convex.query(api.labs.getLabs, { gameId, includeInactive: true });
}

/** Helper: fetch active labs only. */
async function getActiveLabs(gameId: Id<"games">) {
  return convex.query(api.labs.getActiveLabs, { gameId });
}

describe("Labs: addLab uniqueness", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await createTestGame(convex);
  });

  it("rejects a new active lab whose name collides with an existing active lab", async () => {
    // Default game includes an active lab named "OpenBrain". ai-systems role has no lab.
    await expect(
      convex.mutation(api.games.addLab, {
        gameId,
        name: "OpenBrain",
        roleId: "ai-systems",
        rdMultiplier: 2,
        facilitatorToken: FACILITATOR_TOKEN,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("allows re-using the name after the original is decommissioned (soft-delete)", async () => {
    const labs = await getActiveLabs(gameId);
    const deepcent = labs.find((l) => l.name === "DeepCent");
    expect(deepcent).toBeDefined();

    // Merge DeepCent into OpenBrain — this soft-deletes DeepCent.
    await convex.mutation(api.games.mergeLabs, {
      gameId,
      survivorName: "OpenBrain",
      absorbedName: "DeepCent",
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // Name "DeepCent" should now be reusable on a role that has no lab.
    await convex.mutation(api.games.addLab, {
      gameId,
      name: "DeepCent",
      roleId: "ai-systems",
      rdMultiplier: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const active = await getActiveLabs(gameId);
    const newDeepcent = active.find((l) => l.name === "DeepCent");
    expect(newDeepcent).toBeDefined();
    expect(newDeepcent!.ownerRoleId).toBe("ai-systems");

    // The old DeepCent should still exist as decommissioned (soft-delete).
    const all = await getAllLabs(gameId);
    const decommissioned = all.filter(
      (l) => l.name === "DeepCent" && l.status === "decommissioned",
    );
    expect(decommissioned).toHaveLength(1);
    expect(decommissioned[0].mergedIntoLabId).toBeDefined();
    expect(decommissioned[0].ownerRoleId).toBeUndefined();
  });

  it("allows two active labs with the same name in different games", async () => {
    const otherGameId = await createTestGame(convex);
    // Both games start with "OpenBrain" as an active default lab — just confirm that.
    const gameALabs = await getActiveLabs(gameId);
    const gameBLabs = await getActiveLabs(otherGameId);
    expect(gameALabs.some((l) => l.name === "OpenBrain")).toBe(true);
    expect(gameBLabs.some((l) => l.name === "OpenBrain")).toBe(true);
  });
});

describe("Labs: merge semantics", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await createTestGame(convex);
  });

  it("merges: survivor keeps max rdMultiplier, absorbed is decommissioned with mergedIntoLabId", async () => {
    const labsBefore = await getActiveLabs(gameId);
    const openbrain = labsBefore.find((l) => l.name === "OpenBrain")!;
    const deepcent = labsBefore.find((l) => l.name === "DeepCent")!;
    const expectedMax = Math.max(openbrain.rdMultiplier, deepcent.rdMultiplier);

    await convex.mutation(api.games.mergeLabs, {
      gameId,
      survivorName: "OpenBrain",
      absorbedName: "DeepCent",
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const all = await getAllLabs(gameId);
    const survivor = all.find((l) => l._id === openbrain._id)!;
    const absorbed = all.find((l) => l._id === deepcent._id)!;

    expect(survivor.status).toBe("active");
    expect(survivor.rdMultiplier).toBe(expectedMax);
    expect(absorbed.status).toBe("decommissioned");
    expect(absorbed.mergedIntoLabId).toBe(openbrain._id);
    expect(absorbed.ownerRoleId).toBeUndefined();
  });

  it("rejects merge of a lab with itself (by name)", async () => {
    await expect(
      convex.mutation(api.games.mergeLabs, {
        gameId,
        survivorName: "OpenBrain",
        absorbedName: "OpenBrain",
        facilitatorToken: FACILITATOR_TOKEN,
      })
    ).rejects.toThrow(/itself/i);
  });

  it("rejects merge when one side is not an active lab in this game", async () => {
    // DeepCent is already decommissioned in this game; the facilitator-level mergeLabs
    // looks for active labs by name, so this should fail.
    await expect(
      convex.mutation(api.games.mergeLabs, {
        gameId,
        survivorName: "OpenBrain",
        absorbedName: "DeepCent",
        facilitatorToken: FACILITATOR_TOKEN,
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("Labs: ownership transfer via updateLabs", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await createTestGame(convex);
  });

  it("transferring ownerRoleId updates the lab but does not move compute", async () => {
    const labs = await getActiveLabs(gameId);
    const openbrain = labs.find((l) => l.name === "OpenBrain")!;
    const originalOwner = openbrain.ownerRoleId!;
    expect(originalOwner).toBe("openbrain-ceo");

    // Read current compute stock for the old owner via their table.
    const tables = await convex.query(api.tables.getByGame, { gameId });
    const oldOwnerTable = tables.find((t) => t.roleId === originalOwner)!;
    const oldOwnerStockBefore = oldOwnerTable.computeStock ?? 0;

    // Transfer ownership to us-president (a role that doesn't currently own a lab).
    await convex.mutation(api.games.updateLabs, {
      gameId,
      patches: [{ labId: openbrain._id, ownerRoleId: "us-president" }],
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const updatedLabs = await getActiveLabs(gameId);
    const updatedOB = updatedLabs.find((l) => l._id === openbrain._id)!;
    expect(updatedOB.ownerRoleId).toBe("us-president");

    // Old owner's compute stock should be unchanged — ownership transfer does not touch ledger.
    const tablesAfter = await convex.query(api.tables.getByGame, { gameId });
    const oldOwnerAfter = tablesAfter.find((t) => t.roleId === originalOwner)!;
    expect(oldOwnerAfter.computeStock ?? 0).toBe(oldOwnerStockBefore);
  });
});

describe("Labs: updateLabs name-uniqueness", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await createTestGame(convex);
  });

  it("rejects rename of lab A to the name of another active lab", async () => {
    const labs = await getActiveLabs(gameId);
    const openbrain = labs.find((l) => l.name === "OpenBrain")!;
    await expect(
      convex.mutation(api.games.updateLabs, {
        gameId,
        patches: [{ labId: openbrain._id, name: "DeepCent" }],
        facilitatorToken: FACILITATOR_TOKEN,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("allows rename to the name of a decommissioned lab", async () => {
    // Decommission DeepCent by merging into OpenBrain.
    await convex.mutation(api.games.mergeLabs, {
      gameId,
      survivorName: "OpenBrain",
      absorbedName: "DeepCent",
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // Now rename Conscienta to "DeepCent" — collision is with a decommissioned row, must succeed.
    const active = await getActiveLabs(gameId);
    const conscienta = active.find((l) => l.name === "Conscienta")!;
    await convex.mutation(api.games.updateLabs, {
      gameId,
      patches: [{ labId: conscienta._id, name: "DeepCent" }],
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const after = await getActiveLabs(gameId);
    expect(after.find((l) => l._id === conscienta._id)!.name).toBe("DeepCent");
  });

  it("allows rename to a fresh name", async () => {
    const active = await getActiveLabs(gameId);
    const openbrain = active.find((l) => l.name === "OpenBrain")!;
    await convex.mutation(api.games.updateLabs, {
      gameId,
      patches: [{ labId: openbrain._id, name: "NovaLabs" }],
      facilitatorToken: FACILITATOR_TOKEN,
    });
    const after = await getActiveLabs(gameId);
    expect(after.find((l) => l._id === openbrain._id)!.name).toBe("NovaLabs");
  });
});

describe("Labs: restoreSnapshot mergedIntoLabId remap", () => {
  let gameId: Id<"games">;

  beforeAll(async () => {
    gameId = await createTestGame(convex);
    await convex.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  });

  it("restores active labs and clears dangling mergedIntoLabId on useBefore=false", async () => {
    // Round 1: snapshot captures all 3 active labs on advanceRound.
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });

    // Capture round 2 state: merge DeepCent→OpenBrain, then found a brand-new lab.
    await convex.mutation(api.games.mergeLabs, {
      gameId,
      survivorName: "OpenBrain",
      absorbedName: "DeepCent",
      facilitatorToken: FACILITATOR_TOKEN,
    });
    await convex.mutation(api.games.addLab, {
      gameId,
      name: "NovaLabs",
      roleId: "us-president",
      rdMultiplier: 1,
      facilitatorToken: FACILITATOR_TOKEN,
    });
    // Advance to round 3 so round 2's labsAfter snapshot is persisted with DeepCent
    // decommissioned + NovaLabs active.
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });

    // Add a further structural change in round 3 that the restore must undo.
    const r3Active = await getActiveLabs(gameId);
    const novaLabs = r3Active.find((l) => l.name === "NovaLabs");
    expect(novaLabs).toBeDefined();
    // Nothing to do structurally — the test is really: snapshot at end of round 2
    // includes DeepCent (decommissioned, mergedIntoLabId=OpenBrain) and NovaLabs (active).
    // We then restore to round 2's after-snapshot, then assert remap integrity.

    // Advance to round 4 and make another structural mutation: decommission NovaLabs.
    await convex.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    // (No direct decommission public API; use mergeLabs: Conscienta absorbs NovaLabs.)
    await convex.mutation(api.games.mergeLabs, {
      gameId,
      survivorName: "Conscienta",
      absorbedName: "NovaLabs",
      facilitatorToken: FACILITATOR_TOKEN,
    });

    // Now restore to round 2's after-snapshot.
    await convex.mutation(api.games.restoreSnapshot, {
      gameId,
      roundNumber: 2,
      useBefore: false,
      facilitatorToken: FACILITATOR_TOKEN,
    });

    const allAfter = await getAllLabs(gameId);

    // Invariant: every mergedIntoLabId points at a row that actually exists in this game.
    const idSet = new Set(allAfter.map((l) => l._id));
    for (const lab of allAfter) {
      if (lab.mergedIntoLabId !== undefined) {
        expect(idSet.has(lab.mergedIntoLabId)).toBe(true);
      }
    }

    // Round 2's after-snapshot had: OpenBrain active, DeepCent decommissioned (merged into OpenBrain),
    // Conscienta active, NovaLabs active. NovaLabs should be back (active), not the merged-away state.
    const activeAfter = allAfter.filter((l) => l.status === "active");
    const activeNames = activeAfter.map((l) => l.name).sort();
    expect(activeNames).toContain("OpenBrain");
    expect(activeNames).toContain("Conscienta");
    expect(activeNames).toContain("NovaLabs");

    const deepcent = allAfter.find((l) => l.name === "DeepCent");
    expect(deepcent).toBeDefined();
    expect(deepcent!.status).toBe("decommissioned");
    expect(deepcent!.mergedIntoLabId).toBeDefined();
    // DeepCent.mergedIntoLabId must resolve to a row that still exists (the remap guarantee).
    expect(idSet.has(deepcent!.mergedIntoLabId!)).toBe(true);
  });
});

// ─── Scenarios noted but not covered in this file ─────────────────────────────
//
// Scenario 6 (applyResolveInternal nonce mismatch + fail-fast labId validation):
//   The mutation lives in convex/pipelineApply.ts as an internalMutation and is not
//   reachable from ConvexHttpClient (public API surface only exposes `mutation` /
//   `query` definitions, not `internalMutation`). Driving it from an integration
//   test would require either (a) a public test-only wrapper mutation or (b) the
//   full resolve pipeline running end-to-end, which costs $0.20-0.30 per run and
//   is already covered by the LLM-pipeline test in convex-integration.test.ts.
//   Unit-testing it in isolation would need convex-test (ctx mocking) which is
//   not currently wired into this project.
//
// Scenario 5 "hard case" (restoreSnapshot's hard-delete-and-re-insert path):
//   To exercise the pending-insert branch in restoreSnapshot, a lab referenced by
//   a snapshot entry must be physically deleted from the labs table before the
//   restore runs. The public API never hard-deletes labs (decommission is soft),
//   so this branch is only reachable via direct db manipulation or an internal
//   mutation. Skipped for the same reason as above; covered structurally by the
//   "every mergedIntoLabId resolves to an existing row" invariant assertion.
