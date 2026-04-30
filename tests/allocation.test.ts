import { describe, it, expect } from "vitest";
import { balanceAllocation } from "../src/lib/allocation";

describe("balanceAllocation", () => {
  it("returns input unchanged when it already sums to 100", () => {
    const out = balanceAllocation({ deployment: 50, research: 30, safety: 20 }, "deployment");
    expect(out.deployment + out.research + out.safety).toBe(100);
    expect(out.deployment).toBe(50);
  });

  it("redistributes proportionally and sums to exactly 100", () => {
    const out = balanceAllocation({ deployment: 80, research: 40, safety: 40 }, "deployment");
    expect(out.deployment).toBe(80);
    expect(out.research + out.safety).toBe(20);
    expect(out.research).toBe(out.safety);
  });

  it("clamps the pinned key into [0, 100]", () => {
    const out = balanceAllocation({ deployment: 150, research: 10, safety: 10 }, "deployment");
    expect(out.deployment).toBe(100);
    expect(out.research + out.safety).toBe(0);
  });

  it("splits the remainder evenly when other keys are all zero", () => {
    const out = balanceAllocation({ deployment: 50, research: 0, safety: 0 }, "deployment");
    expect(out.deployment + out.research + out.safety).toBe(100);
    expect(Math.abs(out.research - out.safety)).toBeLessThanOrEqual(1);
  });

  it("uses largest-remainder rounding so totals are integer and exact", () => {
    const out = balanceAllocation({ a: 33, b: 1, c: 1, d: 1 }, "a");
    expect(out.a).toBe(33);
    expect(out.a + out.b + out.c + out.d).toBe(100);
    for (const v of Object.values(out)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("hands negative inputs to zero floor before redistributing", () => {
    const out = balanceAllocation({ a: 60, b: -10, c: 50 }, "a");
    expect(out.a).toBe(60);
    expect(out.b).toBe(0);
    expect(out.c).toBe(40);
  });
});
