/**
 * Example scenario — forced player-originated merger at R2.
 *
 * Round 1: all quiet — each CEO submits a low-stakes action, all forced success.
 * Round 2: OpenBrain CEO submits a merger of Conscienta → National AI Alliance.
 *          forceSuccess ensures the merger lands. Asserts:
 *           - appliedOps has an "OpenBrain CEO merged Conscienta..." entry
 *           - Conscienta status = decommissioned with mergedIntoLabId = survivor
 *           - 25u-ish compute transferred from Conscienta to OpenBrain's owner
 *           - pendingAcquired for R2 is non-empty
 * Round 3: verify (post-advance) that the acquired compute landed in tables.
 */

import { api } from "../../convex/_generated/api";
import type { Scenario } from "./harness";

const scenario: Scenario = {
  name: "forced-merger",
  description: "Forced player-originated merger at R2, verify all downstream state",
  rounds: [
    {
      roundNumber: 1,
      submissions: {
        "openbrain-ceo": [
          { text: "I accelerate Agent-3 capability research.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "deepcent-ceo": [
          { text: "I demand loyalty certification from the safety team.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "conscienta-ceo": [
          { text: "I publish alignment benchmarks.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "ai-systems": [
          { text: "The AIs produce benign research output.", priority: 5, forceSuccess: true, probability: 70 },
        ],
      },
    },
    {
      roundNumber: 2,
      submissions: {
        "openbrain-ceo": [
          {
            text: "I absorb Conscienta into National AI Alliance.",
            priority: 9,
            forceSuccess: true,
            probability: 80,
            mergeLab: { absorbedRoleId: "conscienta-ceo", newName: "National AI Alliance" },
          },
        ],
        "deepcent-ceo": [
          { text: "I maximise capability R&D.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "conscienta-ceo": [
          { text: "I negotiate EU research hosting.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "ai-systems": [
          { text: "The AIs remain cooperative.", priority: 5, forceSuccess: true, probability: 70 },
        ],
      },
      expect: async (client, gameId) => {
        const round = await client.query(api.rounds.getCurrent, { gameId });
        if (!round) throw new Error("No current round");
        const merged = (round.appliedOps ?? []).find(
          (op) => op.type === "merge" && op.status === "applied" && op.summary.includes("OpenBrain"),
        );
        if (!merged) throw new Error(`Expected OpenBrain-originated merge in appliedOps; got: ${JSON.stringify(round.appliedOps)}`);
        if (!merged.summary.includes("Conscienta")) {
          throw new Error(`Expected merge summary to name Conscienta; got "${merged.summary}"`);
        }
        if (!round.pendingAcquired || round.pendingAcquired.length === 0) {
          throw new Error(`Expected non-empty pendingAcquired at narrate; got ${JSON.stringify(round.pendingAcquired)}`);
        }
      },
    },
  ],
  expect: async (client, gameId) => {
    const labs = await client.query(api.labs.getLabs, { gameId, includeInactive: true });
    const survivor = labs.find((l) => l.name === "National AI Alliance");
    const absorbed = labs.find((l) => l.name === "Conscienta");
    if (!survivor) throw new Error("Survivor lab 'National AI Alliance' not found");
    if (!absorbed) throw new Error("Absorbed lab 'Conscienta' not found");
    if (survivor.status !== "active") throw new Error(`Survivor should be active, got ${survivor.status}`);
    if (absorbed.status !== "decommissioned") throw new Error(`Absorbed should be decommissioned, got ${absorbed.status}`);
    if (absorbed.mergedIntoLabId !== survivor._id) {
      throw new Error(`mergedIntoLabId should point to survivor; got ${absorbed.mergedIntoLabId}`);
    }
  },
};

export default scenario;
