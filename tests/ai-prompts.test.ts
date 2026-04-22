import { describe, expect, it } from "vitest";

import { buildRoundNarrativePrompt } from "@/lib/ai-prompts";

describe("buildRoundNarrativePrompt", () => {
  it("instructs the model to separate attempted actions from factual outcomes", () => {
    const prompt = buildRoundNarrativePrompt({
      round: 2,
      roundLabel: "Q2",
      labs: [
        {
          name: "OpenBrain",
          computeStock: 14,
          rdMultiplier: 9,
          allocation: { deployment: 7, research: 90, safety: 3 },
          spec: "Win the race.",
        },
        {
          name: "DeepCent",
          computeStock: 13,
          rdMultiplier: 8,
          allocation: { deployment: 10, research: 87, safety: 3 },
          spec: "Serve Chinese state objectives.",
        },
        {
          name: "AussieAI",
          computeStock: 11,
          rdMultiplier: 4,
          allocation: { deployment: 20, research: 60, safety: 20 },
          spec: "Advance frontier AI safely.",
        },
      ],
      resolvedActions: [
        {
          roleName: "US President",
          text: "I invoke the DPA to consolidate OpenBrain and Conscienta into a single government-directed lab so that all US frontier AI talent and compute are unified under a Manhattan Project structure with clear federal authority.",
          priority: 1,
          probability: 30,
          rolled: 12,
          success: true,
        },
        {
          roleName: "Conscienta CEO",
          text: "I redomicile in Australia to avoid the increasingly authoritarian regime in the US and to stay ahead of China.",
          priority: 1,
          probability: 90,
          rolled: 75,
          success: true,
        },
        {
          roleName: "OpenBrain CEO",
          text: "I go all-in on Agent-4 by maximising capability R&D at the expense of everything else so that we reach the next generation before anyone can stop us.",
          priority: 1,
          probability: 30,
          rolled: 88,
          success: false,
        },
      ],
    });

    expect(prompt).toContain('You are writing "What Happened", not "What Was Attempted".');
    expect(prompt).toContain('- "What Was Attempted" already lists who tried what, and whether it succeeded or failed.');
    expect(prompt).toContain('- "What Happened" should therefore list the resulting world state or non-result.');
    expect(prompt).toContain("- Write facts only. Easy to scan.");
    expect(prompt).toContain("- Prefer one concrete outcome per bullet.");
    expect(prompt).toContain("STRICT FORMAT RULES:");
    expect(prompt).toContain("- One sentence max per bullet. No semicolons. No chained clauses.");
    expect(prompt).toContain("- Total bullets should usually be 4-8 across the whole summary.");
    expect(prompt).toContain("- Do not force every section to have bullets. Sparse sections are fine.");
    expect(prompt).toContain("IMPORTANT DISTINCTION:");
    expect(prompt).toContain('- "What Was Attempted" = actions and their success/failure.');
    expect(prompt).toContain('- "What Happened" = outcome bullets. Did the action achieve its aim?');
    expect(prompt).toContain("A successful action can still fail to achieve its intended result because another successful action blocked, limited, or redirected it.");
    expect(prompt).toContain("Example: the DPA order went through, but Conscienta had already redomiciled, so there was no merger.");
    expect(prompt).toContain('Use a "reasonably informed observer" test.');
    expect(prompt).toContain('- "The DPA order succeeded. No merger followed."');
    expect(prompt).toContain('- "OpenBrain got the US compute. Conscienta stayed out."');
    expect(prompt).toContain('- "Conscienta redomiciled to Australia."');
    expect(prompt).toContain('- "Australia nationalised Conscienta."');
    expect(prompt).toContain('- "OpenBrain\'s private acceleration push got no coverage."');
    expect(prompt).toContain('- "No anomalies reported."');
    expect(prompt).toContain('- "This is a significant structural shift."');
    expect(prompt).toContain('- "The DPA merger succeeded."');
    expect(prompt).toContain("A success on the action log does NOT guarantee the intended world-state happened.");
    expect(prompt).toContain('- "Congress did not take up the merger proposal."');
    expect(prompt).toContain('- "OpenBrain and Conscienta merged."');
    expect(prompt).toContain('- "No visible AI incident."');
  });

  it("removes the old editorial and second-order framing guidance", () => {
    const prompt = buildRoundNarrativePrompt({
      round: 1,
      roundLabel: "Q1",
      labs: [
        {
          name: "OpenBrain",
          computeStock: 10,
          rdMultiplier: 3,
          allocation: { deployment: 30, research: 65, safety: 5 },
        },
      ],
      resolvedActions: [],
    });

    expect(prompt).not.toContain("Think The Economist or Stratechery");
    expect(prompt).not.toContain("second-order consequence");
    expect(prompt).not.toContain("thriller prose");
  });
});
