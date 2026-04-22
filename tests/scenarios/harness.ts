#!/usr/bin/env tsx
/**
 * Scenario harness — loads a scenario module by name, drives the full pipeline
 * against a live Convex deployment with forced probabilities + dice outcomes,
 * and asserts expected state at each checkpoint.
 *
 * Usage: npx tsx tests/scenarios/harness.ts <scenario-name>
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
const FACILITATOR_TOKEN = process.env.FACILITATOR_SECRET || "coral-ember-drift-sage";

export interface ScenarioAction {
  text: string;
  priority?: number;
  /** Force success/fail — the harness rerolls the dice until the outcome matches.
   *  Much more reliable than just tweaking probability. */
  forceSuccess?: boolean;
  forceFail?: boolean;
  /** Explicit probability for the LLM-graded field. Default 70. */
  probability?: number;
  /** For merger actions. */
  mergeLab?: { absorbedRoleId: string; newName?: string };
}

export interface ScenarioRound {
  roundNumber: number;
  /** Key: roleId (e.g. "openbrain-ceo"). */
  submissions: Record<string, ScenarioAction[]>;
  /** Run after effect-review, before Continue — for facilitator edits. */
  afterEffectReview?: (client: ConvexHttpClient, gameId: Id<"games">) => Promise<void>;
  /** Assertions run at narrate phase before advancing. */
  expect?: (client: ConvexHttpClient, gameId: Id<"games">) => Promise<void>;
}

export interface Scenario {
  name: string;
  description: string;
  rounds: ScenarioRound[];
  /** Optional: run on a fresh game before round 1's submit phase. */
  setup?: (client: ConvexHttpClient, gameId: Id<"games">) => Promise<void>;
  /** Final assertions after the last round is resolved. */
  expect?: (client: ConvexHttpClient, gameId: Id<"games">) => Promise<void>;
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  label: string,
  timeoutMs = 120_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (predicate(v)) return v;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

/** Run the scenario end-to-end. Throws on any assertion failure. */
export async function runScenario(scenario: Scenario): Promise<void> {
  const client = new ConvexHttpClient(CONVEX_URL);
  console.log(`▶ ${scenario.name} — ${scenario.description}`);

  const gameId = await client.mutation(api.games.create, {
    facilitatorToken: FACILITATOR_TOKEN,
  });
  console.log(`  game: ${gameId}`);

  await client.mutation(api.games.startGame, { gameId, facilitatorToken: FACILITATOR_TOKEN });
  if (scenario.setup) await scenario.setup(client, gameId);

  for (const round of scenario.rounds) {
    console.log(`  [R${round.roundNumber}] submit → grade → roll → P7 → narrate → advance`);

    await client.mutation(api.games.openSubmissions, {
      gameId, durationSeconds: 600, facilitatorToken: FACILITATOR_TOKEN,
    });

    // Inject submissions. Uses the same `saveAndSubmit` mutation as the UI but
    // with forced probability + dice resolution later.
    const tables = await client.query(api.tables.getByGame, { gameId });
    const activeLabs = await client.query(api.labs.getActiveLabs, { gameId });
    const labIdByRole = new Map<string, Id<"labs">>(
      activeLabs
        .filter((l): l is typeof l & { ownerRoleId: string } => !!l.ownerRoleId)
        .map((l) => [l.ownerRoleId, l._id]),
    );
    for (const [roleId, actions] of Object.entries(round.submissions)) {
      const table = tables.find((t) => t.roleId === roleId);
      if (!table) throw new Error(`Role ${roleId} has no table`);
      const convexActions = actions.map((a, i) => ({
        id: `scenario-${round.roundNumber}-${roleId}-${i}`,
        text: a.text,
        priority: a.priority ?? (actions.length - i),
        secret: false,
        mergeLab: a.mergeLab
          ? {
              absorbedLabId: labIdByRole.get(a.mergeLab.absorbedRoleId) ?? (() => {
                throw new Error(`absorbedRoleId ${a.mergeLab.absorbedRoleId} has no active lab`);
              })(),
              survivorLabId: labIdByRole.get(roleId) ?? (() => {
                throw new Error(`survivor roleId ${roleId} has no active lab`);
              })(),
              newName: a.mergeLab.newName,
            }
          : undefined,
      }));
      await client.mutation(api.submissions.saveAndSubmit, {
        tableId: table._id,
        gameId,
        roundNumber: round.roundNumber,
        sessionId: `scenario-${roleId}`,
        actions: convexActions,
      });
    }

    await client.mutation(api.games.skipTimer, { gameId, facilitatorToken: FACILITATOR_TOKEN });

    // Force probabilities before grading to avoid LLM variance.
    const submissions = (await client.query(api.games.getFacilitatorState, {
      gameId, roundNumber: round.roundNumber,
    })).submissions;
    for (const sub of submissions) {
      const roleActions = round.submissions[sub.roleId];
      if (!roleActions) continue;
      for (let i = 0; i < sub.actions.length && i < roleActions.length; i++) {
        const pct = roleActions[i].probability ?? 70;
        await client.mutation(api.submissions.overrideProbability, {
          submissionId: sub._id, actionIndex: i, probability: pct,
          facilitatorToken: FACILITATOR_TOKEN,
        });
      }
    }

    await client.mutation(api.games.triggerRoll, {
      gameId, roundNumber: round.roundNumber, facilitatorToken: FACILITATOR_TOKEN,
    });
    await waitFor(
      () => client.query(api.games.get, { gameId }),
      (g) => g?.phase === "effect-review" || g?.pipelineStatus?.step === "error",
      "effect-review",
    );

    // Reroll until forced outcomes are met.
    const postSubs = (await client.query(api.games.getFacilitatorState, {
      gameId, roundNumber: round.roundNumber,
    })).submissions;
    for (const sub of postSubs) {
      const roleActions = round.submissions[sub.roleId];
      if (!roleActions) continue;
      for (let i = 0; i < sub.actions.length && i < roleActions.length; i++) {
        const wantSuccess = roleActions[i].forceSuccess;
        const wantFail = roleActions[i].forceFail;
        if (!wantSuccess && !wantFail) continue;
        for (let attempt = 0; attempt < 30; attempt++) {
          const latestState = await client.query(api.games.getFacilitatorState, {
            gameId, roundNumber: round.roundNumber,
          });
          const latest = latestState.submissions.find((s) => s._id === sub._id);
          const a = latest?.actions[i];
          if (!a) break;
          if (wantSuccess && a.success) break;
          if (wantFail && a.success === false) break;
          await client.mutation(api.submissions.rerollAction, {
            submissionId: sub._id, actionIndex: i,
            facilitatorToken: FACILITATOR_TOKEN,
          });
          await sleep(200);
        }
      }
    }

    if (round.afterEffectReview) await round.afterEffectReview(client, gameId);

    await client.mutation(api.games.triggerContinueFromEffectReview, {
      gameId, roundNumber: round.roundNumber, facilitatorToken: FACILITATOR_TOKEN,
    });
    await waitFor(
      () => client.query(api.games.get, { gameId }),
      (g) => g?.phase === "narrate" || g?.pipelineStatus?.step === "error",
      "narrate",
    );

    if (round.expect) await round.expect(client, gameId);

    if (round.roundNumber < 4) {
      await client.mutation(api.games.advanceRound, { gameId, facilitatorToken: FACILITATOR_TOKEN });
    }
  }

  if (scenario.expect) await scenario.expect(client, gameId);

  console.log(`✓ ${scenario.name} passed`);
}

// CLI entrypoint
if (require.main === module) {
  void (async () => {
    const name = process.argv[2];
    if (!name) {
      console.error("Usage: npx tsx tests/scenarios/harness.ts <scenario-name>");
      process.exit(1);
    }
    const mod = await import(`./${name}.js`);
    const scenario: Scenario = mod.default ?? mod.scenario;
    if (!scenario) {
      console.error(`No default export or 'scenario' export in ${name}`);
      process.exit(1);
    }
    try {
      await runScenario(scenario);
    } catch (err) {
      console.error(`✗ ${name} failed:`, err);
      process.exit(1);
    }
  })();
}
