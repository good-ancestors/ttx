import { describe, expect, it } from "vitest";

import { buildResolveDecidePrompt, buildResolveNarrativePrompt } from "@/lib/ai-prompts";

const LAB = {
  name: "OpenBrain",
  computeStock: 14,
  rdMultiplier: 9,
  allocation: { deployment: 7, research: 90, safety: 3 },
  spec: "Win the race.",
};

const ACTIONS = [
  {
    roleName: "US President",
    text: "Invoke the DPA to consolidate OpenBrain and Conscienta.",
    priority: 1,
    probability: 30,
    rolled: 12,
    success: true,
  },
  {
    roleName: "Conscienta CEO",
    text: "Redomicile in Australia.",
    priority: 1,
    probability: 90,
    rolled: 75,
    success: true,
  },
];

describe("buildResolveDecidePrompt", () => {
  it("focuses on structural operations and excludes narrative prose rules", () => {
    const prompt = buildResolveDecidePrompt({
      round: 2,
      roundLabel: "Q2",
      labs: [LAB],
      resolvedActions: ACTIONS,
    });

    // Decide pass outputs operations only — no prose.
    expect(prompt).toContain("DECIDE pass");
    expect(prompt).toContain("LAB OPERATIONS — output any that apply:");
    expect(prompt).toContain("IDENTIFIERS — this is load-bearing:");
    expect(prompt).toContain("Only output operations DIRECTLY caused by successful actions.");

    // The narrative pass handles summary / trajectories — decide should NOT mention them.
    expect(prompt).not.toContain("outcomes:");
    expect(prompt).not.toContain("stateOfPlay");
    expect(prompt).not.toContain("pressures");
    expect(prompt).not.toContain("LAB TRAJECTORIES");
    expect(prompt).not.toContain("SUMMARY STYLE");
  });

  it("lists the action log (successes + failures)", () => {
    const prompt = buildResolveDecidePrompt({
      round: 1,
      roundLabel: "Q1",
      labs: [LAB],
      resolvedActions: ACTIONS,
    });
    expect(prompt).toContain("SUCCESSFUL PUBLIC ACTIONS:");
    expect(prompt).toContain("FAILED PUBLIC ACTIONS:");
    expect(prompt).toContain("DPA");
    expect(prompt).toContain("Redomicile");
  });

  it("surfaces conflict guidance for simultaneous successes", () => {
    const prompt = buildResolveDecidePrompt({
      round: 2,
      roundLabel: "Q2",
      labs: [LAB],
      resolvedActions: ACTIONS,
    });
    expect(prompt).toContain("CONFLICTS:");
    expect(prompt).toContain("one successful action can block, overtake, or redirect another");
  });
});

describe("buildResolveNarrativePrompt", () => {
  it("shows both start and end lab state so the narrator reads frozen ground truth", () => {
    const before = [LAB];
    const after = [
      { ...LAB, name: "MergedLab", rdMultiplier: 10 }, // simulate a merger-rename
    ];

    const prompt = buildResolveNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labsBefore: before,
      labsAfter: after,
      resolvedActions: ACTIONS,
    });

    expect(prompt).toContain("LAB STATUS (start of round):");
    expect(prompt).toContain("LAB STATUS (end of round — ground truth):");
    // The start/end diff should appear so the narrator doesn't miss structural changes.
    expect(prompt).toContain("APPLIED STATE CHANGES");
  });

  it("teaches the three-field situation-briefing shape", () => {
    const prompt = buildResolveNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labsBefore: [LAB],
      labsAfter: [LAB],
      resolvedActions: ACTIONS,
    });

    expect(prompt).toContain("**outcomes**");
    expect(prompt).toContain("**stateOfPlay**");
    expect(prompt).toContain("**pressures**");
    expect(prompt).toContain('Contradicting LAB STATUS (END).');
  });

  it("bans the old non-event filler and flourish patterns", () => {
    const prompt = buildResolveNarrativePrompt({
      round: 1,
      roundLabel: "Q1",
      labsBefore: [LAB],
      labsAfter: [LAB],
      resolvedActions: [],
    });

    expect(prompt).toContain('"No anomalies reported."');
    expect(prompt).toContain("non-public action being negated");
    expect(prompt).toContain("Filler non-events.");
  });

  it("does not include the old combined-prompt guidance that predates the split", () => {
    const prompt = buildResolveNarrativePrompt({
      round: 1,
      roundLabel: "Q1",
      labsBefore: [LAB],
      labsAfter: [LAB],
      resolvedActions: [],
    });

    // Narrative pass never emits labOperations itself now.
    expect(prompt).not.toContain("LAB OPERATIONS — output any that apply:");
    // Old "What Happened vs What Was Attempted" framing has been replaced.
    expect(prompt).not.toContain('You are writing "What Happened"');
    // Old flourish bans that got removed during the narrative reframe.
    expect(prompt).not.toContain("Think The Economist");
    expect(prompt).not.toContain("thriller prose");
  });
});
