import { describe, it, expect } from "vitest";
import { balanceAllocation, scaleAllocation } from "../src/lib/allocation";

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

describe("scaleAllocation", () => {
  it("scales proportionally to sum exactly to total (no pinned key)", () => {
    const out = scaleAllocation({ a: 50, b: 30, c: 20 }, 100);
    const sum = out.a + out.b + out.c;
    expect(sum).toBeCloseTo(100, 6);
    // ratio preserved
    expect(out.a / out.b).toBeCloseTo(50 / 30, 6);
  });

  it("scales an over-100 input down to 100", () => {
    const out = scaleAllocation({ a: 80, b: 60, c: 60 }, 100);
    const sum = out.a + out.b + out.c;
    expect(sum).toBeCloseTo(100, 6);
    expect(out.a).toBeCloseTo(40, 6);
    expect(out.b).toBeCloseTo(30, 6);
    expect(out.c).toBeCloseTo(30, 6);
  });

  it("splits evenly when every value is zero", () => {
    const out = scaleAllocation({ a: 0, b: 0, c: 0, d: 0 }, 100);
    expect(out.a).toBeCloseTo(25, 6);
    expect(out.b).toBeCloseTo(25, 6);
    expect(out.c).toBeCloseTo(25, 6);
    expect(out.d).toBeCloseTo(25, 6);
  });

  it("supports a non-100 total", () => {
    const out = scaleAllocation({ a: 1, b: 1 }, 10);
    expect(out.a).toBeCloseTo(5, 6);
    expect(out.b).toBeCloseTo(5, 6);
  });

  it("treats negative values as zero", () => {
    const out = scaleAllocation({ a: 50, b: -10, c: 50 }, 100);
    expect(out.a).toBeCloseTo(50, 6);
    expect(out.b).toBe(0);
    expect(out.c).toBeCloseTo(50, 6);
  });
});
