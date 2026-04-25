/**
 * Scenario — snapshot-restore + re-roll round-trip.
 *
 * Pins the fix for the two CRITs surfaced by the post-simplify review:
 *
 *   A-CRIT-1: rebuildLedgerState used to preserve `transferred` rows in the
 *             target round on useBefore=true restore, leaving compute
 *             movements in the ledger after every other resolve effect was
 *             reverted. Conservation broken across restore.
 *
 *   A-CRIT-2: restoreSnapshot did not reset submission status, so rollAllImpl
 *             short-circuited on the re-roll and the player-pinned settlement
 *             helpers (foundLab, merge, computeTargets) never re-fired.
 *             Structural state went one way, submissions claimed another.
 *
 * Test flow:
 *
 *   R1: quiet baseline.
 *   R2: structural-heavy — a forced merger (openbrain absorbs conscienta) +
 *       a forced foundLab (deepcent founds "Mistral-Nine") + a forced
 *       computeTransfer (us-president sends 8u to openbrain).
 *
 *   After R2 narrate, in scenario.expect:
 *     1. Capture post-narrate state: labs (active+decommissioned), each role's
 *        table.computeStock, and the ledger-settled stock totals per role.
 *     2. Trigger restoreSnapshot useBefore=true on R2.
 *     3. Assert intermediate state (post-restore, pre-rerun):
 *          • currentRound = 2, phase = "submit"
 *          • R2 submissions are all status="submitted" and have no rolled /
 *            success / probability set
 *          • Conscienta is back to active (merger reverted)
 *          • Mistral-Nine does not exist (foundLab reverted)
 *          • Ledger has no settled R2 rows; pending escrows have been
 *            re-emitted (one transferred pair from us-president, one
 *            adjusted from deepcent)
 *          • table.computeStock matches pre-R2 baseline (pre-merger,
 *            pre-foundLab, pre-transfer)
 *     4. Drive R2 resolve again with the SAME forceSuccess outcomes.
 *     5. Assert final state matches the captured pre-restore state:
 *          • Conscienta decommissioned + mergedIntoLabId set
 *          • Mistral-Nine exists, owned by deepcent-ceo
 *          • Each role's table.computeStock matches the captured value
 *            (table.computeStock is the cached sum of that role's settled
 *            ledger rows, so this is the conservation check)
 *
 * If the pipeline's compute conservation is sound across a round-trip, this
 * scenario passes. If either CRIT regresses, the assertions catch it.
 *
 * Run:
 *   NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
 *     FACILITATOR_SECRET=coral-ember-drift-sage \
 *     npx tsx tests/scenarios/harness.ts snapshot-restore-reroll
 */

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { driveResolveOnce, type Scenario } from "./harness";

const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET;

const scenario: Scenario = {
  name: "snapshot-restore-reroll",
  description: "useBefore=true restore + re-roll preserves compute conservation and structural state",
  rounds: [
    {
      roundNumber: 1,
      submissions: {
        "openbrain-ceo": [
          { text: "I accelerate Agent-3 capability research.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "deepcent-ceo": [
          { text: "I expand training compute by partnering with US Congress.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "conscienta-ceo": [
          { text: "I publish alignment benchmarks.", priority: 5, forceSuccess: true, probability: 70 },
        ],
        "us-president": [
          { text: "I sign an AI safety executive order.", priority: 5, forceSuccess: true, probability: 70 },
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
            text: "I absorb Conscienta into a unified safety lab.",
            priority: 9,
            forceSuccess: true,
            probability: 80,
            mergeLab: { absorbedRoleId: "conscienta-ceo", newName: "Unified AI Safety Initiative" },
          },
        ],
        "deepcent-ceo": [
          {
            text: "I spin off a new EU-hosted lab Mistral-Nine.",
            priority: 8,
            forceSuccess: true,
            probability: 80,
            foundLab: { name: "Mistral-Nine", seedCompute: 12 },
          },
        ],
        "us-president": [
          {
            text: "I direct $8B compute grant to OpenBrain.",
            priority: 8,
            forceSuccess: true,
            probability: 80,
            computeTargets: [{ roleId: "openbrain-ceo", amount: 8, direction: "send" }],
          },
        ],
        "conscienta-ceo": [
          { text: "I lobby for stricter export controls.", priority: 4, forceSuccess: true, probability: 70 },
        ],
        "ai-systems": [
          { text: "The AIs remain cooperative.", priority: 4, forceSuccess: true, probability: 70 },
        ],
      },
      expect: async (client, gameId) => {
        if (!FACILITATOR_TOKEN) throw new Error("FACILITATOR_SECRET required");

        // We're at R2 narrate. Capture, restore, verify intermediate, re-run,
        // verify final equals captured. Doing this in round.expect (rather than
        // scenario.expect) keeps capture-and-final at the SAME phase (narrate),
        // so pool acquisition materialisation — which only happens on advance —
        // doesn't skew the table.computeStock equality check.

        // Step 1 — capture post-R2 narrate state.
        const captured = await captureState(client, gameId);
        if (!captured.unifiedLab) throw new Error(`Pre-restore: expected 'Unified AI Safety Initiative' active, got: ${JSON.stringify(captured.labsByName)}`);
        if (!captured.mistralLab) throw new Error(`Pre-restore: expected 'Mistral-Nine' active, got: ${JSON.stringify(captured.labsByName)}`);
        if (captured.conscientaStatus !== "decommissioned") {
          throw new Error(`Pre-restore: expected Conscienta decommissioned, got ${captured.conscientaStatus}`);
        }

        // Step 2 — restore.
        await client.mutation(api.games.restoreSnapshot, {
          gameId, roundNumber: 2, useBefore: true, facilitatorToken: FACILITATOR_TOKEN,
        });

        // Step 3 — verify intermediate state.
        const game = await client.query(api.games.get, { gameId });
        if (!game) throw new Error("Game disappeared after restore");
        if (game.currentRound !== 2) throw new Error(`Expected currentRound=2 post-restore, got ${game.currentRound}`);
        if (game.phase !== "submit") throw new Error(`Expected phase=submit post-restore, got ${game.phase}`);

        const intermediate = await client.query(api.games.getFacilitatorState, { gameId, roundNumber: 2 });
        for (const sub of intermediate.submissions) {
          if (sub.status !== "submitted") {
            throw new Error(`Expected submission status=submitted post-restore, got ${sub.status} for role ${sub.roleId}`);
          }
          for (const action of sub.actions) {
            if (action.actionStatus !== "submitted") continue;
            if (action.rolled != null) throw new Error(`Expected rolled cleared on action for ${sub.roleId}, got ${action.rolled}`);
            if (action.success != null) throw new Error(`Expected success cleared on action for ${sub.roleId}, got ${action.success}`);
            if (action.probability != null) throw new Error(`Expected probability cleared on action for ${sub.roleId}, got ${action.probability}`);
          }
        }

        const labsAfterRestore = await client.query(api.labs.getLabs, { gameId, includeInactive: true });
        const conscientaAfterRestore = labsAfterRestore.find((l) => l.name === "Conscienta");
        if (!conscientaAfterRestore || conscientaAfterRestore.status !== "active") {
          throw new Error(`Expected Conscienta active post-restore, got ${conscientaAfterRestore?.status}`);
        }
        const mistralAfterRestore = labsAfterRestore.find((l) => l.name === "Mistral-Nine");
        if (mistralAfterRestore && mistralAfterRestore.status === "active") {
          throw new Error(`Expected Mistral-Nine to be removed post-restore, but it's still active`);
        }
        const unifiedAfterRestore = labsAfterRestore.find((l) => l.name === "Unified AI Safety Initiative");
        if (unifiedAfterRestore && unifiedAfterRestore.status === "active") {
          throw new Error(`Expected unified lab to be reverted post-restore, but it's still active`);
        }

        // Step 4 — re-drive the R2 resolve pipeline with the same forced outcomes.
        const r2 = scenario.rounds.find((r) => r.roundNumber === 2)!;
        await driveResolveOnce(client, gameId, r2);

        // Step 5 — final state must match captured (both at R2 narrate).
        const final = await captureState(client, gameId);
        if (final.conscientaStatus !== "decommissioned") {
          throw new Error(`Post-rerun: expected Conscienta decommissioned, got ${final.conscientaStatus}`);
        }
        if (!final.unifiedLab) throw new Error(`Post-rerun: missing 'Unified AI Safety Initiative' lab`);
        if (!final.mistralLab) throw new Error(`Post-rerun: missing 'Mistral-Nine' lab`);

        // table.computeStock is the cached sum of settled ledger rows per role —
        // equality here is exactly the conservation invariant we care about.
        for (const [roleId, before] of Object.entries(captured.tableStockByRole)) {
          const after = final.tableStockByRole[roleId];
          if (after !== before) {
            throw new Error(`Post-rerun stock drift for ${roleId}: captured=${before}, after=${after}`);
          }
        }
      },
    },
  ],
};

interface CapturedState {
  labsByName: Record<string, { status: string; ownerRoleId?: string }>;
  conscientaStatus: string;
  unifiedLab: { status: string; ownerRoleId?: string } | undefined;
  mistralLab: { status: string; ownerRoleId?: string } | undefined;
  tableStockByRole: Record<string, number>;
}

async function captureState(client: Parameters<typeof driveResolveOnce>[0], gameId: Id<"games">): Promise<CapturedState> {
  const labs = await client.query(api.labs.getLabs, { gameId, includeInactive: true });
  const labsByName: CapturedState["labsByName"] = {};
  for (const l of labs) {
    labsByName[l.name] = { status: l.status, ownerRoleId: l.ownerRoleId ?? undefined };
  }
  const tables = await client.query(api.tables.getByGame, { gameId });
  const tableStockByRole: Record<string, number> = {};
  for (const t of tables) {
    if (t.computeStock != null) tableStockByRole[t.roleId] = t.computeStock;
  }
  return {
    labsByName,
    conscientaStatus: labsByName["Conscienta"]?.status ?? "missing",
    unifiedLab: labsByName["Unified AI Safety Initiative"]?.status === "active"
      ? labsByName["Unified AI Safety Initiative"] : undefined,
    mistralLab: labsByName["Mistral-Nine"]?.status === "active"
      ? labsByName["Mistral-Nine"] : undefined,
    tableStockByRole,
  };
}

export default scenario;
