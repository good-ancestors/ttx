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
 *
 * Taxonomy (four-layer model):
 *   Position     — breakthrough / modelRollback / merge (rdMultiplier)
 *   Stock        — computeDestroyed / computeTransfer / merge (computeStock)
 *   Productivity — researchDisruption / researchBoost (one-round modifier)
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

  describe("breakthrough (position ↑, semantic)", () => {
    it("valid → labName only; code picks the factor at apply time", () => {
      expect(normaliseStructuredEffect({ type: "breakthrough", labName: "OpenBrain" })).toEqual({
        type: "breakthrough", labName: "OpenBrain",
      });
    });
    it("drops LLM-picked magnitudes even if emitted — magnitude is not the LLM's job", () => {
      expect(normaliseStructuredEffect({ type: "breakthrough", labName: "OpenBrain", factor: 1.8, newMultiplier: 99 })).toEqual({
        type: "breakthrough", labName: "OpenBrain",
      });
    });
    it("missing labName → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "breakthrough" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("modelRollback (position ↓, semantic)", () => {
    it("valid → labName only", () => {
      expect(normaliseStructuredEffect({ type: "modelRollback", labName: "DeepCent" })).toEqual({
        type: "modelRollback", labName: "DeepCent",
      });
    });
    it("missing labName → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "modelRollback" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("computeDestroyed (stock ↓)", () => {
    it("positive amount → kept", () => {
      expect(normaliseStructuredEffect({ type: "computeDestroyed", labName: "DeepCent", amount: 15 })).toEqual({
        type: "computeDestroyed", labName: "DeepCent", amount: 15,
      });
    });
    it("zero amount → narrativeOnly (non-positive rejected at normalisation layer)", () => {
      // SEC-M-R3-1: non-positive amounts are rejected here to prevent a zero-destruction
      // effect from reaching the apply path and being treated as a no-op without a P7 signal.
      expect(normaliseStructuredEffect({ type: "computeDestroyed", labName: "X", amount: 0 })).toEqual({
        type: "narrativeOnly",
      });
    });
    it("negative amount → narrativeOnly (non-positive rejected at normalisation layer)", () => {
      // SEC-M-R3-1: negative amounts are also rejected — conservation violation caught early.
      expect(normaliseStructuredEffect({ type: "computeDestroyed", labName: "X", amount: -10 })).toEqual({
        type: "narrativeOnly",
      });
    });
    it("missing amount → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "computeDestroyed", labName: "X" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("researchDisruption (productivity ↓, one round)", () => {
    it("valid → labName only", () => {
      expect(normaliseStructuredEffect({ type: "researchDisruption", labName: "OpenBrain" })).toEqual({
        type: "researchDisruption", labName: "OpenBrain",
      });
    });
    it("missing labName → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "researchDisruption" })).toEqual({ type: "narrativeOnly" });
    });
  });

  describe("researchBoost (productivity ↑, one round)", () => {
    it("valid → labName only", () => {
      expect(normaliseStructuredEffect({ type: "researchBoost", labName: "Conscienta" })).toEqual({
        type: "researchBoost", labName: "Conscienta",
      });
    });
    it("missing labName → narrativeOnly", () => {
      expect(normaliseStructuredEffect({ type: "researchBoost" })).toEqual({ type: "narrativeOnly" });
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

  describe("computeTransfer (stock ↔)", () => {
    it("valid — LLM-picked amount (the one place numerical magnitude is the LLM's job)", () => {
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
