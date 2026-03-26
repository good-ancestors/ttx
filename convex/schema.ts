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
  }).index("by_game", ["gameId"]),

  // Inter-table proposals: one table proposes a joint action to another
  proposals: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    fromRoleId: v.string(),
    fromRoleName: v.string(),
    toRoleId: v.string(),
    toRoleName: v.string(),
    actionText: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected")
    ),
  })
    .index("by_game_and_round", ["gameId", "roundNumber"])
    .index("by_to_role", ["gameId", "roundNumber", "toRoleId"]),
});
