import { describe, it, expect } from "vitest";
import { normaliseStructuredEffect } from "@/lib/ai-prompts";

/**
 * normaliseStructuredEffect is the LLM-output → typed-union boundary. The
 * grading tool-use schema is a flat object with every field optional; this
 * function projects the flat payload onto the discriminated union and drops
 * unused fields so the Convex validator accepts it. Malformed shapes collapse
 * to narrativeOnly rather than throwing — so the pipeline keeps running even
 * when the LLM emits nonsense, and the facilitator can spot the fallback at
 * P2 (narrativeOnly + low confidence).
 */
describe("normaliseStructuredEffect", () => {
  describe("garbage in → narrativeOnly", () => {
    it("null → narrativeOnly", () => {
      expect(normaliseStructuredEffect(null)).toEqual({ type: "narrativeOnly" });
    });
    it("undefined → narrativeOnly", () => {
      expect(normaliseStructuredEffect(undefined)).toEqual({ type: "narrativeOnly" });
    });
    it("string → narrativeOnly", () => {
      expect(normaliseStructuredEffect("merge OpenBrain and Anthropic")).toEqual({ type: "narrativeOnly" });
    });
    it("object without type → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ labName: "OpenBrain" })).toEqual({ type: "narrativeOnly" });
    });
    it("unknown type → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "bananaSplit", labName: "OpenBrain" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("merge", () => {
    it("valid merge → full shape", () => {
      expect(normaliseStructuredEffect({
        type: "merge", survivor: "OpenBrain", absorbed: "Anthropic", newName: "OmniBrain",
        // junk fields grader might emit alongside — should be dropped
        labName: "irrelevant", change: 10,
      })).toEqual({
        type: "merge", survivor: "OpenBrain", absorbed: "Anthropic", newName: "OmniBrain",
      });
    });
    it("missing survivor → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "merge", absorbed: "Anthropic" })).toEqual({ type: "narrativeOnly" });
    });
    it("missing absorbed → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "merge", survivor: "OpenBrain" })).toEqual({ type: "narrativeOnly" });
    });
    it("omits newName when blank", () => {
      const out = normaliseStructuredEffect({ type: "merge", survivor: "X", absorbed: "Y", newName: "" });
      expect(out).toEqual({ type: "merge", survivor: "X", absorbed: "Y" });
    });
  });

  describe("decommission", () => {
    it("valid → labName", () => {
      expect(normaliseStructuredEffect({ type: "decommission", labName: "Anthropic" })).toEqual({
        type: "decommission", labName: "Anthropic",
      });
    });
    it("missing labName → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "decommission" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("computeChange", () => {
    it("positive change", () => {
      expect(normaliseStructuredEffect({ type: "computeChange", labName: "OpenBrain", change: 30 })).toEqual({
        type: "computeChange", labName: "OpenBrain", change: 30,
      });
    });
    it("negative change (e.g. sanctions)", () => {
      expect(normaliseStructuredEffect({ type: "computeChange", labName: "DeepCent", change: -20 })).toEqual({
        type: "computeChange", labName: "DeepCent", change: -20,
      });
    });
    it("zero change is kept at this layer — downstream validator rejects it", () => {
      // Rationale: downstream validator surfaces change:0 as a rejectedOp so the
      // facilitator sees the grader emitted a degenerate effect. Swallowing it
      // here would hide the signal.
      expect(normaliseStructuredEffect({ type: "computeChange", labName: "OpenBrain", change: 0 })).toEqual({
        type: "computeChange", labName: "OpenBrain", change: 0,
      });
    });
    it("missing change → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "computeChange", labName: "OpenBrain" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("multiplierOverride", () => {
    it("valid", () => {
      expect(normaliseStructuredEffect({ type: "multiplierOverride", labName: "OpenBrain", newMultiplier: 3.6 })).toEqual({
        type: "multiplierOverride", labName: "OpenBrain", newMultiplier: 3.6,
      });
    });
    it("missing newMultiplier → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "multiplierOverride", labName: "X" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("transferOwnership", () => {
    it("valid", () => {
      expect(normaliseStructuredEffect({
        type: "transferOwnership", labName: "OpenBrain", controllerRoleId: "us-president",
      })).toEqual({
        type: "transferOwnership", labName: "OpenBrain", controllerRoleId: "us-president",
      });
    });
    it("empty controllerRoleId → narrativeOnly (can't unown a lab)", () => {
      // Empty string is a common grader misfire — historically produced orphan
      // labs. narrativeOnly forces the facilitator to pick a valid controller
      // or explicit decommission.
      expect(normaliseStructuredEffect({
        type: "transferOwnership", labName: "OpenBrain", controllerRoleId: "",
      })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("computeTransfer", () => {
    it("valid", () => {
      expect(normaliseStructuredEffect({
        type: "computeTransfer", fromRoleId: "us-president", toRoleId: "openbrain-ceo", amount: 50,
      })).toEqual({
        type: "computeTransfer", fromRoleId: "us-president", toRoleId: "openbrain-ceo", amount: 50,
      });
    });
    it("missing amount → narrativeOnly", () => {
      expect(normaliseStructuredEffect({
        type: "computeTransfer", fromRoleId: "us-president", toRoleId: "openbrain-ceo",
      })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("foundLab", () => {
    it("valid with spec", () => {
      expect(normaliseStructuredEffect({
        type: "foundLab", name: "AussieAI", seedCompute: 20, spec: "Safe-by-default alignment research.",
      })).toEqual({
        type: "foundLab", name: "AussieAI", seedCompute: 20, spec: "Safe-by-default alignment research.",
      });
    });
    it("valid without spec", () => {
      expect(normaliseStructuredEffect({ type: "foundLab", name: "AussieAI", seedCompute: 20 })).toEqual({
        type: "foundLab", name: "AussieAI", seedCompute: 20,
      });
    });
    it("missing seedCompute → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "foundLab", name: "AussieAI" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("narrativeOnly passes through", () => {
    it("explicit narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "narrativeOnly" })).toEqual({ type: "narrativeOnly" });
    });
    it("narrativeOnly with junk fields drops the junk", () => {
      expect(normaliseStructuredEffect({ type: "narrativeOnly", labName: "X", change: 99 })).toEqual({ type: "narrativeOnly" });
    });
  });
});
