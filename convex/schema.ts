import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { structuredEffectValidator, confidenceValidator } from "./validators";

/** Lab snapshot captured on round resolve. The lab's canonical state lives in the labs table;
 *  this snapshot is a point-in-time copy used for restoreSnapshot and post-game timeline views.
 *  computeStock is a display convenience — authoritative stock is in the computeTransactions ledger. */
const labSnapshotValidator = v.object({
  labId: v.id("labs"),
  name: v.string(),
  roleId: v.optional(v.string()),
  computeStock: v.number(),
  rdMultiplier: v.number(),
  allocation: v.object({
    deployment: v.number(),
    research: v.number(),
    safety: v.number(),
  }),
  spec: v.optional(v.string()),
  colour: v.string(),
  status: v.union(v.literal("active"), v.literal("decommissioned")),
  mergedIntoLabId: v.optional(v.id("labs")),
  createdRound: v.number(),
  jurisdiction: v.optional(v.string()),
});

export const labTrajectoryValidator = v.object({
  labName: v.string(),
  safetyAdequacy: v.union(
    v.literal("adequate"), v.literal("concerning"),
    v.literal("dangerous"), v.literal("catastrophic")
  ),
  likelyFailureMode: v.union(
    v.literal("aligned"), v.literal("deceptive"), v.literal("spec-gaming"),
    v.literal("power-concentration"), v.literal("benevolent-override"),
    v.literal("loss-of-control"), v.literal("misuse")
  ),
  reasoning: v.string(),
  signalStrength: v.number(),
});

export default defineSchema({
  // Labs — first-class entities (split out from games.labs[] array).
  // Ownership is attached here; compute lives on the owner's role (tables.computeStock).
  // Mergers set status="decommissioned" and mergedIntoLabId pointing at the survivor.
  labs: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    spec: v.optional(v.string()),
    rdMultiplier: v.number(),
    allocation: v.object({
      deployment: v.number(),
      research: v.number(),
      safety: v.number(),
    }),
    ownerRoleId: v.optional(v.string()),          // null = unowned (e.g. post-merge, awaiting transfer)
    colour: v.string(),                           // persisted on lab (stable across ownership transfer)
    status: v.union(v.literal("active"), v.literal("decommissioned")),
    mergedIntoLabId: v.optional(v.id("labs")),    // set when status=decommissioned via merger
    createdRound: v.number(),                     // round at founding — for filtering chart history
    // Legal/regulatory home of the lab. Affects probability weighting for actions
    // that depend on jurisdiction (nationalisation, export controls, regulatory
    // moves) and narrative framing. Mutated by redomicile actions; unrelated to
    // ownership (ownerRoleId).
    jurisdiction: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_owner", ["gameId", "ownerRoleId"])
    .index("by_game_and_status", ["gameId", "status"]),

  games: defineTable({
    name: v.optional(v.string()),
    status: v.union(
      v.literal("lobby"),
      v.literal("playing"),
      v.literal("finished")
    ),
    currentRound: v.number(),
    phase: v.union(
      v.literal("discuss"),
      v.literal("submit"),
      v.literal("rolling"),
      // P7 mandatory pause per docs/resolve-pipeline.md — effects have been applied,
      // facilitator reviews what landed (and any flagged rejections) before the
      // deterministic R&D growth + compute acquisition + narrative LLM run.
      v.literal("effect-review"),
      v.literal("narrate")
    ),
    phaseEndsAt: v.optional(v.number()),
    // Labs moved out to their own table. Active labs queried via labs table.
    locked: v.boolean(),
    // Facilitator overrides for next round's compute share distribution (roleId → %)
    computeShareOverrides: v.optional(v.record(v.string(), v.number())),
    // Game-level join code for Jackbox-style lobby (players enter one code → pick role)
    joinCode: v.optional(v.string()),
  }).index("by_joinCode", ["joinCode"]),

  /** Companion to the `games` row — write-hot resolve fields live here so
   *  patches don't invalidate every games-doc subscriber. One row per game,
   *  created lazily on first write. See convex/gameRuntime.ts. */
  gameRuntime: defineTable({
    gameId: v.id("games"),
    /** Resolve lock with TTL: auto-expires after RESOLVE_LOCK_TTL_MS if the
     *  resolve action dies mid-flight. */
    resolving: v.optional(v.boolean()),
    resolvingStartedAt: v.optional(v.number()),
    pipelineStatus: v.optional(v.object({
      step: v.string(),
      detail: v.optional(v.string()),
      progress: v.optional(v.string()),
      startedAt: v.number(),
      error: v.optional(v.string()),
    })),
    /** Nonce gating post-LLM apply against superseded resolve runs. */
    resolveNonce: v.optional(v.string()),
  }).index("by_game", ["gameId"]),

  tables: defineTable({
    gameId: v.id("games"),
    roleId: v.string(),
    roleName: v.string(),
    joinCode: v.string(),
    connected: v.boolean(),
    controlMode: v.union(v.literal("human"), v.literal("ai"), v.literal("npc")),
    enabled: v.boolean(),
    computeStock: v.optional(v.number()),
    aiDisposition: v.optional(v.string()),
    // Session tracking: random ID per browser tab, used to detect seat conflicts.
    activeSessionId: v.optional(v.string()),
    // Display name entered on role picker (not an account — just for facilitator visibility)
    playerName: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_role", ["gameId", "roleId"])
    .index("by_joinCode", ["joinCode"]),

  // Driver heartbeat companion to `tables`. Patched every ~30s by the active
  // driver tab; observer takeover reads it. Lives in its own doc so heartbeat
  // writes don't invalidate `tables`-reading queries (getForPlayer reads every
  // tables row in the game for compute stock — without this split, every
  // heartbeat would re-fan to every subscriber).
  tablePresence: defineTable({
    gameId: v.id("games"),
    tableId: v.id("tables"),
    driverLastSeenAt: v.number(),
    // Set when the driver explicitly hands off the seat (Leave button), so
    // observers can be told "driver left" rather than "driver appears idle"
    // and skip the show-at-30s gate. Cleared when a new driver claims the
    // seat. The takeover gate itself still keys off driverLastSeenAt (which
    // handOffSeat backdates), so this flag is purely a presentation hint.
    driverLeftAt: v.optional(v.number()),
  })
    .index("by_table", ["tableId"])
    .index("by_game", ["gameId"]),

  // Observers — extra participants seated at a physical table whose driver
  // runs the role. Read-only consumers of the same Convex state; can
  // self-promote to driver if the seat goes stale. No heartbeat: stale rows
  // clean up via the 4-hour session TTL on the device.
  tableObservers: defineTable({
    gameId: v.id("games"),
    roleId: v.string(),
    sessionId: v.string(),
    observerName: v.string(),
    joinedAt: v.number(),
  })
    .index("by_role", ["gameId", "roleId"])
    .index("by_game", ["gameId"]),

  submissions: defineTable({
    tableId: v.id("tables"),
    roundNumber: v.number(),
    gameId: v.id("games"),
    roleId: v.string(),
    actions: v.array(
      v.object({
        actionId: v.string(), // Stable UUID — survives text edits, used to link requests
        text: v.string(),
        priority: v.number(),
        secret: v.optional(v.boolean()),
        actionStatus: v.union(v.literal("draft"), v.literal("submitted")),
        probability: v.optional(v.number()),
        reasoning: v.optional(v.string()),
        rolled: v.optional(v.number()),
        success: v.optional(v.boolean()),
        aiInfluence: v.optional(v.number()),
        computeTargets: v.optional(v.array(v.object({
          roleId: v.string(),
          amount: v.number(),
          direction: v.optional(v.union(v.literal("send"), v.literal("request"))),
        }))),
        /** Found-a-lab action metadata. If set, the action is a lab-founding attempt:
         *  on submit, seedCompute is escrowed (pending adjusted row); on roll success a new
         *  lab row is created with the submitter as owner and the escrow settles (cost consumed);
         *  on roll failure the escrow is cancelled (founder keeps the compute). Minimum 10u. */
        foundLab: v.optional(v.object({
          name: v.string(),
          spec: v.optional(v.string()),
          seedCompute: v.number(),
          /** Founder-chosen allocation split for the new lab's compute
           *  (deployment/research/safety). Percentages, summing to 100.
           *  Optional for backward compat; defaults to {33,34,33} if absent. */
          allocation: v.optional(v.object({
            deployment: v.number(),
            research: v.number(),
            safety: v.number(),
          })),
        })),
        /** Merger attempt attached to this action. Submitter must own absorbed or survivor. */
        mergeLab: v.optional(v.object({
          absorbedLabId: v.id("labs"),
          survivorLabId: v.id("labs"),
          newName: v.optional(v.string()),
          newSpec: v.optional(v.string()),
        })),
        /** Structured effect emitted by the grader LLM (or player-pinned via mergeLab/foundLab/
         *  computeTargets). Consumed deterministically at apply time — no second LLM pass. Each
         *  variant carries the exact fields needed to execute the effect; names resolve to labIds
         *  and roleIds at apply time. `narrativeOnly` means the action is prose-only on success.
         *  Missing = legacy round pre-refactor, treated as narrativeOnly by apply path.
         *
         *  Four-layer model (see docs/resolve-pipeline.md):
         *    Position — breakthrough / modelRollback / merge change rdMultiplier.
         *    Stock    — computeDestroyed / computeTransfer / merge move compute.
         *    Velocity — derived at resolve time, never an effect.
         *    Productivity — researchDisruption / researchBoost (one-round throughput mod). */
        structuredEffect: v.optional(structuredEffectValidator),
        /** Grader's confidence in its grade + effect. `low` forces P2 click-through before
         *  Continue unlocks — facilitator must acknowledge (or edit) each low-confidence row. */
        confidence: v.optional(confidenceValidator),
      })
    ),
    computeAllocation: v.optional(
      v.object({
        deployment: v.number(),
        research: v.number(),
        safety: v.number(),
      })
    ),
    artifact: v.optional(v.string()),
    aiMeta: v.optional(
      v.object({
        gradingModel: v.optional(v.string()),
        gradingTimeMs: v.optional(v.number()),
        gradingTokens: v.optional(v.number()),
        playerModel: v.optional(v.string()),
        playerTimeMs: v.optional(v.number()),
      })
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("graded"),
      v.literal("resolved")
    ),
  })
    .index("by_game_and_round", ["gameId", "roundNumber"])
    .index("by_table_and_round", ["tableId", "roundNumber"]),

  rounds: defineTable({
    gameId: v.id("games"),
    number: v.number(),
    label: v.string(),
    facilitatorNotes: v.optional(v.string()),
    summary: v.optional(
      v.object({
        // Current shape — function-driven fields. The LLM writes these reading a
        // frozen end-of-round state; cannot contradict mechanics.
        outcomes: v.optional(v.string()),       // 2-3 sentences: what successful actions produced
        stateOfPlay: v.optional(v.string()),    // 1-2 sentences: where key players sit now
        pressures: v.optional(v.string()),      // 1-2 sentences: what's set up for next round
        facilitatorNotes: v.optional(v.string()),
        // Legacy shape (pre-narrative-reframe): 4-domain buckets. Older rounds retain
        // these; readers fall back to joined old buckets when the new fields are absent.
        labs: v.optional(v.array(v.string())),
        geopolitics: v.optional(v.array(v.string())),
        publicAndMedia: v.optional(v.array(v.string())),
        aiSystems: v.optional(v.array(v.string())),
      })
    ),
    labTrajectories: v.optional(v.array(labTrajectoryValidator)),
    aiMeta: v.optional(
      v.object({
        resolveModel: v.optional(v.string()),
        resolveTimeMs: v.optional(v.number()),
        resolveTokens: v.optional(v.number()),
        narrativeModel: v.optional(v.string()),
        narrativeTimeMs: v.optional(v.number()),
        narrativeTokens: v.optional(v.number()),
      })
    ),
    // Raw LLM prompt + response for the narrative resolve call, for facilitator debugging.
    resolveDebug: v.optional(
      v.object({
        prompt: v.string(),
        responseJson: v.string(),
        error: v.optional(v.string()),
        capturedAt: v.number(),
      })
    ),
    // Structural operations the decide LLM proposed and how they resolved. Surfaced on the
    // P7 effect-review screen so the facilitator can see what landed and what was rejected
    // before the deterministic R&D growth + compute acquisition runs. Written at the end of
    // the effect-application phase; cleared on re-resolve.
    appliedOps: v.optional(v.array(v.object({
      type: v.string(),              // merge | decommission | transferOwnership | multiplierUpdate | productivityMod | computeDestroyed | computeTransfer | foundLab | rejected
      status: v.union(v.literal("applied"), v.literal("rejected")),
      summary: v.string(),           // human-readable one-line description of what happened
      reason: v.optional(v.string()),// LLM's reason for the op (applied ops) or why it was rejected
      // Rejection metadata. Populated on status === "rejected" entries. category is
      // "invalid_reference" (target doesn't exist / wrong state) or
      // "precondition_failure" (op-specific rule violated). Used by the P7 panel to
      // group + style flags by severity. opType is the original op type that was rejected.
      category: v.optional(v.string()),
      opType: v.optional(v.string()),
    }))),
    // One-round productivity modifiers from researchDisruption / researchBoost
    // effects. labId → multiplicative factor applied to this round's R&D growth
    // only (folded into computeLabGrowth alongside stock/research%/multiplier).
    // Cleared when continueFromEffectReview consumes them, so it never persists
    // into the next round. Re-applies via re-emission if the narrative still
    // holds.
    pendingProductivityMods: v.optional(v.array(v.object({
      labId: v.id("labs"),
      modifier: v.number(),
    }))),
    // Chronological audit log of mechanical state mutations during this round's
    // resolve — every write to lab.rdMultiplier, lab owner's computeStock, or
    // productivity during phases 5, 9, and 10, plus post-resolve facilitator
    // overrides (phase "override"). Rendered under Applied Effects in the P7
    // UI so the facilitator can inspect the full chain before Advance.
    // Populated atomically alongside each phase's apply mutation; cleared on
    // re-resolve. Override entries persist across re-resolve clearing only when
    // they were written outside the pipeline (i.e. via updateLabs).
    mechanicsLog: v.optional(v.array(v.object({
      sequence: v.number(),
      phase: v.union(v.literal(5), v.literal(9), v.literal(10), v.literal("override")),
      source: v.union(
        v.literal("player-pinned"),
        v.literal("grader-effect"),
        v.literal("natural-growth"),
        v.literal("acquisition"),
        v.literal("facilitator-edit"),
      ),
      subject: v.string(),
      field: v.union(v.literal("rdMultiplier"), v.literal("computeStock"), v.literal("productivity")),
      before: v.number(),
      after: v.number(),
      reason: v.string(),
    }))),
    // Compute acquired this round, deferred until the facilitator clicks Advance.
    // continueFromEffectReview computes the amounts (from lab-growth delta + pool shares)
    // and stashes them here. advanceRound materialises these into `acquired` ledger rows
    // + patches table.computeStock, then clears the field. This preserves the reveal:
    // "this is what's coming at Q2 start" during narrate, then the compute actually
    // arrives in players' tables only on the Advance click.
    pendingAcquired: v.optional(v.array(v.object({
      roleId: v.string(),
      amount: v.number(),
    }))),
    // Pre-resolve snapshot of lab structural state (multiplier, allocation, spec, name).
    // Compute history lives in the computeTransactions ledger — not duplicated here.
    labsBefore: v.optional(v.array(labSnapshotValidator)),
    // Post-resolve snapshot of lab structural state — for post-game review and restore.
    labsAfter: v.optional(v.array(labSnapshotValidator)),
    // Pipeline nonce — prevents double-execution of resolve
    resolveNonce: v.optional(v.string()),
  }).index("by_game", ["gameId"])
    .index("by_game_and_number", ["gameId", "number"]),

  // Action support requests: endorsement or compute, attached to a specific action
  requests: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    fromRoleId: v.string(),
    fromRoleName: v.string(),
    toRoleId: v.string(),
    toRoleName: v.string(),
    actionId: v.string(), // Stable link to the action
    actionText: v.string(), // Kept for display — not used as join key when actionId is present
    requestType: v.union(
      v.literal("endorsement"),
      v.literal("compute")
    ),
    computeAmount: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined")
    ),
  })
    .index("by_game_and_round", ["gameId", "roundNumber"])
    .index("by_to_role", ["gameId", "roundNumber", "toRoleId"])
    .index("by_from_role", ["gameId", "roundNumber", "fromRoleId"]),

  // Append-only event log for observability and post-game analysis
  events: defineTable({
    gameId: v.id("games"),
    timestamp: v.number(),
    type: v.string(),
    roleId: v.optional(v.string()),
    data: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    // Composite index so the resolve pipeline's "events since timestamp T"
    // lookup can range-scan instead of collecting every event for the game
    // and filtering in memory (O(events-in-round) vs O(events-in-game)).
    .index("by_game_and_timestamp", ["gameId", "timestamp"]),

  // Ledger of compute movements — the single source of truth for stock over time.
  // table.computeStock is a cache of settled rows (sum of amount where roleId=X, status=settled).
  // Regenerate wipes acquired/adjusted/merged rows and re-emits; preserves starting/transferred/facilitator.
  computeTransactions: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    createdAt: v.number(),
    type: v.union(
      v.literal("starting"),     // game creation: seed per role; never regenerated
      v.literal("acquired"),     // pool share acquisition on resolve; regenerated
      v.literal("transferred"),  // player send or settled accepted request; preserved across regens
      v.literal("adjusted"),     // computeDestroyed effect (reason required); regenerated
      v.literal("merged"),       // structural merger pair (counterparty required); regenerated
      v.literal("facilitator"),  // manual override with reason; never regenerated
    ),
    status: v.union(v.literal("pending"), v.literal("settled")),
    roleId: v.string(),
    counterpartyRoleId: v.optional(v.string()),
    amount: v.number(),          // signed delta from roleId's perspective
    reason: v.optional(v.string()),
    actionId: v.optional(v.string()),
    submissionId: v.optional(v.id("submissions")),
  })
    .index("by_game_and_round", ["gameId", "roundNumber"])
    .index("by_game_and_role", ["gameId", "roleId"])
    .index("by_action", ["gameId", "actionId"]),
});
