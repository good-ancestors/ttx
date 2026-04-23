// Shared Convex validators — imported by schema.ts and by mutation arg lists
// so the discriminated union lives in exactly one place.

import { v } from "convex/values";

/** Structured effect emitted by the batched grading LLM and editable by the
 *  facilitator at P2. Applied deterministically at resolve. The TS union lives
 *  in src/lib/ai-prompts.ts (StructuredEffect) and must stay in sync.
 *
 *  Two legacy variants (computeChange, multiplierOverride) are kept here at
 *  validator level ONLY so `npx convex deploy` doesn't fail validation on
 *  submissions persisted before the four-layer redesign. The grader no longer
 *  emits them, the TS union doesn't include them, and the apply path maps any
 *  still-persisted occurrence to narrativeOnly via normaliseStructuredEffect's
 *  default case. Drop these two variants once prod data has been cleaned. */
export const structuredEffectValidator = v.union(
  v.object({ type: v.literal("merge"), survivor: v.string(), absorbed: v.string(), newName: v.optional(v.string()), newSpec: v.optional(v.string()) }),
  v.object({ type: v.literal("decommission"), labName: v.string() }),
  v.object({ type: v.literal("breakthrough"), labName: v.string() }),
  v.object({ type: v.literal("modelRollback"), labName: v.string() }),
  v.object({ type: v.literal("computeDestroyed"), labName: v.string(), amount: v.number() }),
  v.object({ type: v.literal("researchDisruption"), labName: v.string() }),
  v.object({ type: v.literal("researchBoost"), labName: v.string() }),
  v.object({ type: v.literal("transferOwnership"), labName: v.string(), controllerRoleId: v.string() }),
  v.object({ type: v.literal("computeTransfer"), fromRoleId: v.string(), toRoleId: v.string(), amount: v.number() }),
  v.object({ type: v.literal("foundLab"), name: v.string(), spec: v.optional(v.string()), seedCompute: v.number(), allocation: v.optional(v.object({ deployment: v.number(), research: v.number(), safety: v.number() })) }),
  v.object({ type: v.literal("narrativeOnly") }),
  // Legacy — read-only tolerance for pre-redesign persisted docs. See block comment above.
  v.object({ type: v.literal("computeChange"), labName: v.string(), change: v.number() }),
  v.object({ type: v.literal("multiplierOverride"), labName: v.string(), newMultiplier: v.number() }),
);

/** Grader's confidence per graded action. `low` forces the P2 click-through gate. */
export const confidenceValidator = v.union(v.literal("high"), v.literal("medium"), v.literal("low"));
