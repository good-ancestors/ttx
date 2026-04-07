import { describe, it, expect } from "vitest";
import { ROLES } from "@/lib/game-data";
import type { RoleHandout, HandoutData } from "@/lib/role-handouts";
import handoutData from "../public/role-handouts.json";

const handouts = handoutData as HandoutData;

// ─── Structured Handouts ─────────────────────────────────────────────────────

describe("Role Handouts", () => {
  it("every ROLE has a matching handout entry", () => {
    for (const role of ROLES) {
      expect(handouts[role.id], `Missing handout for ${role.id}`).toBeDefined();
    }
  });

  it("every handout is a structured object, not a string", () => {
    for (const [roleId, entry] of Object.entries(handouts)) {
      expect(typeof entry, `${roleId} is still a legacy string`).toBe("object");
    }
  });

  it("every handout has required fields", () => {
    for (const [roleId, handout] of Object.entries(handouts)) {
      const h = handout as RoleHandout;
      expect(h.role, `${roleId} missing role`).toBeTruthy();
      expect(h.resources, `${roleId} missing resources`).toBeTruthy();
      expect(h.objective, `${roleId} missing objective`).toBeTruthy();
      expect(h.body, `${roleId} missing body`).toBeTruthy();
      expect(Array.isArray(h.startOfExercise), `${roleId} startOfExercise not array`).toBe(true);
      expect(Array.isArray(h.options), `${roleId} options not array`).toBe(true);
    }
  });

  it("no handout has empty role/resources/objective", () => {
    for (const [roleId, handout] of Object.entries(handouts)) {
      const h = handout as RoleHandout;
      expect(h.role.length, `${roleId} role is empty`).toBeGreaterThan(10);
      expect(h.resources.length, `${roleId} resources is empty`).toBeGreaterThan(10);
      expect(h.objective.length, `${roleId} objective is empty`).toBeGreaterThan(10);
    }
  });

  it("sections have title and content when present", () => {
    for (const [roleId, handout] of Object.entries(handouts)) {
      const h = handout as RoleHandout;
      if (h.sections) {
        for (const section of h.sections) {
          expect(section.title, `${roleId} section missing title`).toBeTruthy();
          expect(section.content, `${roleId} section "${section.title}" missing content`).toBeTruthy();
        }
      }
    }
  });
});

// ─── Briefs ──────────────────────────────────────────────────────────────────

describe("Role Briefs", () => {
  it("every brief matches the handout role field", () => {
    for (const role of ROLES) {
      const handout = handouts[role.id] as RoleHandout | undefined;
      if (!handout) continue;
      // Brief should be the same as the handout's "role" field
      expect(role.brief, `${role.id} brief doesn't match handout role`).toBe(handout.role);
    }
  });

  it("briefs are concise (under 200 chars)", () => {
    for (const role of ROLES) {
      expect(role.brief.length, `${role.id} brief too long: ${role.brief.length} chars`).toBeLessThan(200);
    }
  });
});

// ─── Sample Actions ──────────────────────────────────────────────────────────

describe("Sample Actions", () => {
  it("every role has round 1 sample actions", async () => {
    const { default: sampleData } = await import("../public/sample-actions.json");
    const data = sampleData as Record<string, Record<string, unknown[]>>;
    for (const role of ROLES) {
      const r1 = data[role.id]?.["1"];
      expect(r1, `${role.id} missing round 1 sample actions`).toBeDefined();
      expect(Array.isArray(r1), `${role.id} round 1 not array`).toBe(true);
      if (Array.isArray(r1)) {
        expect(r1.length, `${role.id} has no round 1 actions`).toBeGreaterThan(0);
      }
    }
  });
});
