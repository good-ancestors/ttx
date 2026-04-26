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

// Single source of truth for the lab names referenced from R2's forced actions
// and from the assertion block — prevents string-drift between submission and
// verification (e.g. "Mistral-Nine" vs "Mistral Nine").
const LAB_CONSCIENTA = "Conscienta";
const LAB_MISTRAL = "Mistral-Nine";
const LAB_UNIFIED = "Unified AI Safety Initiative";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

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
            mergeLab: { absorbedRoleId: "conscienta-ceo", newName: LAB_UNIFIED },
          },
        ],
        "deepcent-ceo": [
          {
            text: "I spin off a new EU-hosted lab Mistral-Nine.",
            priority: 8,
            forceSuccess: true,
            probability: 80,
            foundLab: { name: LAB_MISTRAL, seedCompute: 12 },
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
        assert(FACILITATOR_TOKEN, "FACILITATOR_SECRET required");

        // Capture, restore, verify intermediate, re-run, verify final equals
        // captured — all in round.expect so capture-and-final are at the SAME
        // phase (R2 narrate). Pool-acquisition materialisation only happens on
        // advance, so anchoring both observations to narrate avoids that
        // skewing the table.computeStock equality check.

        const captured = await captureState(client, gameId);
        assert(captured.unifiedLab, `Pre-restore: expected '${LAB_UNIFIED}' active, got: ${JSON.stringify(captured.labsByName)}`);
        assert(captured.mistralLab, `Pre-restore: expected '${LAB_MISTRAL}' active, got: ${JSON.stringify(captured.labsByName)}`);
        assert(captured.conscientaStatus === "decommissioned", `Pre-restore: expected ${LAB_CONSCIENTA} decommissioned, got ${captured.conscientaStatus}`);

        await client.mutation(api.games.restoreSnapshot, {
          gameId, roundNumber: 2, useBefore: true, facilitatorToken: FACILITATOR_TOKEN,
        });

        const game = await client.query(api.games.get, { gameId });
        assert(game, "Game disappeared after restore");
        assert(game.currentRound === 2, `Expected currentRound=2 post-restore, got ${game.currentRound}`);
        assert(game.phase === "submit", `Expected phase=submit post-restore, got ${game.phase}`);

        const intermediate = await client.query(api.games.getFacilitatorState, { gameId, roundNumber: 2 });
        assert(intermediate.submissions.length > 0, "Expected reset-not-deleted submissions post-restore, got 0");
        for (const sub of intermediate.submissions) {
          assert(sub.status === "submitted", `Expected submission status=submitted post-restore, got ${sub.status} for role ${sub.roleId}`);
          for (const action of sub.actions) {
            if (action.actionStatus !== "submitted") continue;
            assert(action.rolled == null, `Expected rolled cleared on action for ${sub.roleId}, got ${action.rolled}`);
            assert(action.success == null, `Expected success cleared on action for ${sub.roleId}, got ${action.success}`);
            assert(action.probability == null, `Expected probability cleared on action for ${sub.roleId}, got ${action.probability}`);
          }
        }

        const labsAfterRestore = await client.query(api.labs.getLabs, { gameId, includeInactive: true });
        const findLabAfterRestore = (name: string) => labsAfterRestore.find((l) => l.name === name);
        const conscientaAfterRestore = findLabAfterRestore(LAB_CONSCIENTA);
        assert(
          conscientaAfterRestore?.status === "active",
          `Expected ${LAB_CONSCIENTA} active post-restore, got ${conscientaAfterRestore?.status}`,
        );
        assert(
          findLabAfterRestore(LAB_MISTRAL)?.status !== "active",
          `Expected ${LAB_MISTRAL} to be removed post-restore, but it's still active`,
        );
        assert(
          findLabAfterRestore(LAB_UNIFIED)?.status !== "active",
          `Expected ${LAB_UNIFIED} to be reverted post-restore, but it's still active`,
        );

        const r2 = scenario.rounds.find((r) => r.roundNumber === 2)!;
        await driveResolveOnce(client, gameId, r2);

        const final = await captureState(client, gameId);
        assert(final.conscientaStatus === "decommissioned", `Post-rerun: expected ${LAB_CONSCIENTA} decommissioned, got ${final.conscientaStatus}`);
        assert(final.unifiedLab, `Post-rerun: missing '${LAB_UNIFIED}' lab`);
        assert(final.mistralLab, `Post-rerun: missing '${LAB_MISTRAL}' lab`);

        // table.computeStock is the cached sum of settled ledger rows per role —
        // equality here is the conservation invariant.
        for (const [roleId, before] of Object.entries(captured.tableStockByRole)) {
          const after = final.tableStockByRole[roleId];
          assert(after === before, `Post-rerun stock drift for ${roleId}: captured=${before}, after=${after}`);
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
  const [labs, tables] = await Promise.all([
    client.query(api.labs.getLabs, { gameId, includeInactive: true }),
    client.query(api.tables.getByGame, { gameId }),
  ]);
  const labsByName: CapturedState["labsByName"] = {};
  for (const l of labs) {
    labsByName[l.name] = { status: l.status, ownerRoleId: l.ownerRoleId ?? undefined };
  }
  const tableStockByRole: Record<string, number> = {};
  for (const t of tables) {
    if (t.computeStock != null) tableStockByRole[t.roleId] = t.computeStock;
  }
  const findActive = (name: string) =>
    labsByName[name]?.status === "active" ? labsByName[name] : undefined;
  return {
    labsByName,
    conscientaStatus: labsByName[LAB_CONSCIENTA]?.status ?? "missing",
    unifiedLab: findActive(LAB_UNIFIED),
    mistralLab: findActive(LAB_MISTRAL),
    tableStockByRole,
  };
}

export default scenario;
