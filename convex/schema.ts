import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
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
    worldState: v.object({
      capability: v.number(),
      alignment: v.number(),
      tension: v.number(),
      awareness: v.number(),
      regulation: v.number(),
      australia: v.number(),
    }),
    labs: v.array(
      v.object({
        name: v.string(),
        roleId: v.string(),
        computeStock: v.number(),
        rdMultiplier: v.number(),
        allocation: v.object({
          users: v.number(),
          capability: v.number(),
          safety: v.number(),
        }),
      })
    ),
    locked: v.boolean(),
  }),

  tables: defineTable({
    gameId: v.id("games"),
    roleId: v.string(),
    roleName: v.string(),
    joinCode: v.string(),
    connected: v.boolean(),
    isAI: v.boolean(),
    enabled: v.boolean(),
    computeStock: v.optional(v.number()),
  })
    .index("by_game", ["gameId"])
    .index("by_joinCode", ["joinCode"]),

  submissions: defineTable({
    tableId: v.id("tables"),
    roundNumber: v.number(),
    gameId: v.id("games"),
    roleId: v.string(),
    actions: v.array(
      v.object({
        text: v.string(),
        priority: v.number(),
        secret: v.optional(v.boolean()),
        probability: v.optional(v.number()),
        reasoning: v.optional(v.string()),
        rolled: v.optional(v.number()),
        success: v.optional(v.boolean()),
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
    title: v.string(),
    narrative: v.string(),
    capabilityLevel: v.string(),
    summary: v.optional(
      v.object({
        geopoliticalEvents: v.array(v.string()),
        aiStateOfPlay: v.array(v.string()),
        headlines: v.array(v.string()),
        facilitatorNotes: v.optional(v.string()),
      })
    ),
    fallbackNarrative: v.optional(v.string()),
    aiMeta: v.optional(
      v.object({
        narrativeModel: v.optional(v.string()),
        narrativeTimeMs: v.optional(v.number()),
        narrativeTokens: v.optional(v.number()),
      })
    ),
    // Snapshots captured after round resolves — for post-game review
    worldStateAfter: v.optional(
      v.object({
        capability: v.number(),
        alignment: v.number(),
        tension: v.number(),
        awareness: v.number(),
        regulation: v.number(),
        australia: v.number(),
      })
    ),
    labsAfter: v.optional(
      v.array(
        v.object({
          name: v.string(),
          roleId: v.string(),
          computeStock: v.number(),
          rdMultiplier: v.number(),
          allocation: v.object({
            users: v.number(),
            capability: v.number(),
            safety: v.number(),
          }),
        })
      )
    ),
    roleComputeAfter: v.optional(
      v.array(
        v.object({
          roleId: v.string(),
          roleName: v.string(),
          computeStock: v.number(),
        })
      )
    ),
  }).index("by_game", ["gameId"]),

  // Action support requests: endorsement or compute, attached to a specific action
  requests: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    fromRoleId: v.string(),
    fromRoleName: v.string(),
    toRoleId: v.string(),
    toRoleName: v.string(),
    actionText: v.string(),
    requestType: v.union(
      v.literal("endorsement"),
      v.literal("compute"),
      v.literal("both")
    ),
    computeAmount: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined")
    ),
  })
    .index("by_game_and_round", ["gameId", "roundNumber"])
    .index("by_to_role", ["gameId", "roundNumber", "toRoleId"]),

  // Append-only event log for observability and post-game analysis
  events: defineTable({
    gameId: v.id("games"),
    timestamp: v.number(),
    type: v.string(),
    roleId: v.optional(v.string()),
    data: v.optional(v.string()),
  }).index("by_game", ["gameId"]),
});
