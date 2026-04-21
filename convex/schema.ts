import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
      v.literal("narrate")
    ),
    phaseEndsAt: v.optional(v.number()),
    // Labs moved out to their own table. Active labs queried via labs table.
    locked: v.boolean(),
    // Resolve lock with TTL: auto-expires after 3 minutes if process dies
    resolving: v.optional(v.boolean()),
    resolvingStartedAt: v.optional(v.number()),
    // Server-side pipeline status — all clients observe reactively
    pipelineStatus: v.optional(v.object({
      step: v.string(),
      detail: v.optional(v.string()),
      progress: v.optional(v.string()),
      startedAt: v.number(),
      error: v.optional(v.string()),
    })),
    // Nonce for preventing double-execution of resolve
    resolveNonce: v.optional(v.string()),
    // Facilitator overrides for next round's compute share distribution (roleId → %)
    computeShareOverrides: v.optional(v.record(v.string(), v.number())),
    // Game-level join code for Jackbox-style lobby (players enter one code → pick role)
    joinCode: v.optional(v.string()),
  }).index("by_joinCode", ["joinCode"]),

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
        })),
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
    // Structured resolution output — what happened this round
    resolvedEvents: v.optional(
      v.array(
        v.object({
          id: v.string(),
          description: v.string(),
          visibility: v.union(v.literal("public"), v.literal("covert")),
          actors: v.array(v.string()),
          worldImpact: v.optional(v.string()),
          sourceActions: v.optional(v.array(v.string())),
        })
      )
    ),
    facilitatorNotes: v.optional(v.string()),
    summary: v.optional(
      v.object({
        narrative: v.optional(v.string()),
        headlines: v.array(v.string()),
        geopoliticalEvents: v.array(v.string()),
        aiStateOfPlay: v.array(v.string()),
        facilitatorNotes: v.optional(v.string()),
      })
    ),
    labTrajectories: v.optional(v.array(labTrajectoryValidator)),
    fallbackNarrative: v.optional(v.string()),
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
    // Pre-resolve snapshot of lab structural state (multiplier, allocation, spec, name).
    // Compute history lives in the computeTransactions ledger — not duplicated here.
    labsBefore: v.optional(v.array(labSnapshotValidator)),
    // Post-resolve snapshot of lab structural state — for post-game review and restore.
    labsAfter: v.optional(v.array(labSnapshotValidator)),
    // Pipeline nonce — prevents double-execution of resolve
    resolveNonce: v.optional(v.string()),
    // Partial events written during streaming resolve (before final write)
    partialEvents: v.optional(v.array(
      v.object({
        id: v.string(),
        description: v.string(),
        visibility: v.union(v.literal("public"), v.literal("covert")),
        actors: v.array(v.string()),
        worldImpact: v.optional(v.string()),
        sourceActions: v.optional(v.array(v.string())),
      })
    )),
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
  }).index("by_game", ["gameId"]),

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
      v.literal("adjusted"),     // narrative LLM computeChange (reason required); regenerated
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
