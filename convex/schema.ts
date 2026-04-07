import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared validators for world state and lab snapshot shapes
export const worldStateValidator = v.object({
  capability: v.number(),
  alignment: v.number(),
  tension: v.number(),
  awareness: v.number(),
  regulation: v.number(),
  australia: v.number(),
});

/** Lab snapshot. computeStock is a DERIVED CACHE — the source of truth is table.computeStock.
 *  Synced from tables at: game creation, pipeline resolution (post-growth), facilitator overrides.
 *  May be slightly stale during submit phase (not reflecting in-flight escrow/transfers). */
export const labSnapshotValidator = v.object({
  name: v.string(),
  roleId: v.string(),
  computeStock: v.number(),
  rdMultiplier: v.number(),
  allocation: v.object({
    users: v.number(),
    capability: v.number(),
    safety: v.number(),
  }),
  spec: v.optional(v.string()),
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
    worldState: worldStateValidator,
    labs: v.array(labSnapshotValidator),
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
      })
    ),
    computeAllocation: v.optional(
      v.object({
        users: v.number(),
        capability: v.number(),
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
    // Pre-resolve snapshot — captured before resolve runs (safe revert point)
    worldStateBefore: v.optional(worldStateValidator),
    labsBefore: v.optional(v.array(labSnapshotValidator)),
    roleComputeBefore: v.optional(
      v.array(
        v.object({
          roleId: v.string(),
          roleName: v.string(),
          computeStock: v.number(),
        })
      )
    ),
    // Compute snapshot at submit-phase open (before player transfers)
    roleComputeAtSubmitOpen: v.optional(
      v.array(v.object({ roleId: v.string(), roleName: v.string(), computeStock: v.number() }))
    ),
    // Unified compute record — all holders (labs + governments + civil society)
    computeHolders: v.optional(v.array(v.object({
      roleId: v.string(),
      name: v.string(),
      stockBefore: v.number(),
      produced: v.number(),
      transferred: v.number(),
      adjustment: v.number(),
      adjustmentReason: v.optional(v.string()),
      stockAfter: v.number(),
      override: v.optional(v.number()),
      overrideReason: v.optional(v.string()),
      sharePct: v.number(),
      status: v.optional(v.union(v.literal("merged"), v.literal("created"))),
    }))),
    // Post-resolve snapshot — for post-game review and restore
    worldStateAfter: v.optional(worldStateValidator),
    labsAfter: v.optional(v.array(labSnapshotValidator)),
    roleComputeAfter: v.optional(
      v.array(
        v.object({
          roleId: v.string(),
          roleName: v.string(),
          computeStock: v.number(),
        })
      )
    ),
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
});
