import { describe, expect, it } from "vitest";

import { buildBatchedGradingPrompt, buildResolveNarrativePrompt } from "@/lib/ai-prompts";

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

describe("buildBatchedGradingPrompt", () => {
  const BASIC_ROLE = {
    roleId: "us-president",
    roleName: "US President",
    roleDescription: "Commander in chief.",
    roleTags: ["government"],
    actions: [
      { actionId: "a1", text: "Invoke the DPA to consolidate OpenBrain.", priority: 5 },
      { actionId: "a2", text: "Hold a press conference about AI safety.", priority: 2 },
    ],
  };

  it("is a single-call batched prompt that emits all four per-action fields", () => {
    const prompt = buildBatchedGradingPrompt({
      round: 2,
      roundLabel: "Q2",
      enabledRoles: ["US President", "OpenBrain CEO"],
      labs: [LAB],
      roles: [BASIC_ROLE],
    });

    // Per-action output contract
    expect(prompt).toContain("probability");
    expect(prompt).toContain("reasoning");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("structuredEffect");
    // Effect taxonomy
    expect(prompt).toContain('"merge"');
    expect(prompt).toContain('"decommission"');
    expect(prompt).toContain('"computeChange"');
    expect(prompt).toContain('"multiplierOverride"');
    expect(prompt).toContain('"transferOwnership"');
    expect(prompt).toContain('"computeTransfer"');
    expect(prompt).toContain('"narrativeOnly"');
    // actionId matching rule
    expect(prompt).toContain("Match each output entry to its input by actionId");
  });

  it("surfaces pinned effects inline so the grader knows shapes are fixed", () => {
    const prompt = buildBatchedGradingPrompt({
      round: 2,
      roundLabel: "Q2",
      enabledRoles: ["US President"],
      labs: [LAB],
      roles: [{
        ...BASIC_ROLE,
        actions: [{
          actionId: "m1",
          text: "Announce merger with Anthropic.",
          priority: 8,
          pinnedEffect: {
            kind: "merge",
            absorbedLabName: "Anthropic",
            survivorLabName: "OpenBrain",
            submitterIsAbsorbed: false,
          },
        }],
      }],
    });
    expect(prompt).toContain("PINNED merge");
    expect(prompt).toContain("Anthropic");
    expect(prompt).toContain("OpenBrain");
  });

  it("lists all submitted actions grouped by role with stable actionIds", () => {
    const prompt = buildBatchedGradingPrompt({
      round: 1,
      roundLabel: "Q1",
      enabledRoles: ["US President"],
      labs: [LAB],
      roles: [BASIC_ROLE],
    });
    expect(prompt).toContain("a1.");
    expect(prompt).toContain("a2.");
    expect(prompt).toContain("Invoke the DPA");
    expect(prompt).toContain("press conference");
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

  it("diffs the two lab snapshots so the narrator can cite concrete transitions", () => {
    // A decommissioned lab (gone from after) should surface as "no longer active".
    const before = [
      LAB,
      { name: "DeepCent", computeStock: 17, rdMultiplier: 2.5, allocation: { deployment: 42, research: 55, safety: 3 } },
    ];
    const after = [LAB];

    const prompt = buildResolveNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labsBefore: before,
      labsAfter: after,
      resolvedActions: [],
    });

    expect(prompt).toContain("DeepCent is no longer an active lab");
  });

  it("reports compute and multiplier deltas in the applied-changes diff", () => {
    const before = [LAB]; // computeStock 14, rdMultiplier 9
    const after = [{ ...LAB, computeStock: 22, rdMultiplier: 12 }];

    const prompt = buildResolveNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labsBefore: before,
      labsAfter: after,
      resolvedActions: [],
    });

    expect(prompt).toContain("OpenBrain compute stock: 14 → 22.");
    expect(prompt).toContain("OpenBrain R&D multiplier: 9 → 12.");
  });

  it("marks newly-founded labs in the applied-changes diff", () => {
    const before = [LAB];
    const after = [
      LAB,
      { name: "AussieAI", computeStock: 11, rdMultiplier: 1, allocation: { deployment: 20, research: 60, safety: 20 } },
    ];

    const prompt = buildResolveNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labsBefore: before,
      labsAfter: after,
      resolvedActions: [],
    });

    expect(prompt).toContain("AussieAI appeared as a new active lab this round.");
  });

  it("omits the APPLIED STATE CHANGES block when nothing changed", () => {
    // No structural changes, no compute growth, no multiplier change.
    const prompt = buildResolveNarrativePrompt({
      round: 1,
      roundLabel: "Q1",
      labsBefore: [LAB],
      labsAfter: [LAB],
      resolvedActions: [],
    });

    expect(prompt).not.toContain("APPLIED STATE CHANGES");
  });

  it("teaches the four-domain summary shape", () => {
    const prompt = buildResolveNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labsBefore: [LAB],
      labsAfter: [LAB],
      resolvedActions: ACTIONS,
    });

    expect(prompt).toContain("**labs**");
    expect(prompt).toContain("**geopolitics**");
    expect(prompt).toContain("**publicAndMedia**");
    expect(prompt).toContain("**aiSystems**");
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
    expect(prompt).toContain("non-public action negated");
    expect(prompt).toContain("Flowery writing");
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
