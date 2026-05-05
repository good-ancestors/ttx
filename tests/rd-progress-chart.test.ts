import { describe, it, expect } from "vitest";
import { buildChartData } from "@/components/rd-progress-chart";
import type { Lab } from "@/lib/game-data";

// Reproduces the post-merger ghost-lab bug:
// OpenBrain merges into another lab, so it's gone from currentLabs but still
// appears in earlier rounds' labsAfter snapshots. Before the fix, the chart
// rendered two `OpenBrain (inactive)` series — one from DEFAULT_LABS (keyed
// on roleId) and one from snapshot (keyed on labId) — with the snapshot one
// pinned at the merger-round multiplier across every subsequent phase.
function snapshotLab(over: Partial<Lab>): Lab {
  return {
    labId: "lab_openbrain",
    name: "OpenBrain",
    roleId: "openbrain-ceo",
    computeStock: 0,
    rdMultiplier: 14,
    allocation: { deployment: 47, research: 50, safety: 3 },
    status: "active",
    ...over,
  };
}

describe("buildChartData — post-merger inactive lab handling", () => {
  it("does not duplicate a merged-out lab in the legend", () => {
    // OpenBrain was active through R1 then merged into DeepCent in R2.
    const r1 = snapshotLab({ rdMultiplier: 14, status: "active" });
    const r2Decommissioned = snapshotLab({ rdMultiplier: 14, status: "decommissioned" });
    const r2DeepCent: Lab = {
      labId: "lab_deepcent",
      name: "DeepCent",
      roleId: "deepcent-ceo",
      computeStock: 0,
      rdMultiplier: 18,
      allocation: { deployment: 42, research: 55, safety: 3 },
      status: "active",
    };

    const rounds = [
      { number: 1, label: "Q1", labsAfter: [r1] },
      { number: 2, label: "Q2", labsAfter: [r2Decommissioned, r2DeepCent] },
    ];
    // currentLabs: only the survivor remains.
    const currentLabs: Lab[] = [r2DeepCent];

    const data = buildChartData(rounds, currentLabs, 2, false);

    const openBrainSeries = data.series.filter(
      (s) => !s.isBackground && s.name === "OpenBrain",
    );
    expect(openBrainSeries).toHaveLength(1);
    expect(openBrainSeries[0].isInactive).toBe(true);
  });

  it("ends the inactive line at the last active round, not at the frozen merger value", () => {
    const r1 = snapshotLab({ rdMultiplier: 14, status: "active" });
    const r2Decommissioned = snapshotLab({ rdMultiplier: 14, status: "decommissioned" });

    const rounds = [
      { number: 1, label: "Q1", labsAfter: [r1] },
      { number: 2, label: "Q2", labsAfter: [r2Decommissioned] },
    ];
    const data = buildChartData(rounds, [], 2, false);

    const openBrain = data.series.find(
      (s) => !s.isBackground && s.name === "OpenBrain",
    );
    expect(openBrain).toBeDefined();
    // Pre + Start + R1 only. R2's decommissioned snapshot must NOT be drawn.
    expect(openBrain!.points).toHaveLength(3);
    // Start should reflect the DEFAULT_LABS starting multiplier (3×), not the
    // frozen R1 value (14×) — i.e. the DEFAULT_LABS entry wins the dedup.
    expect(openBrain!.points[1].value).toBe(3);
    expect(openBrain!.points[2].value).toBe(14);
  });

  it("does not produce inactive entries when no mergers have happened", () => {
    const ob: Lab = {
      labId: "lab_openbrain",
      name: "OpenBrain",
      roleId: "openbrain-ceo",
      computeStock: 0,
      rdMultiplier: 5,
      allocation: { deployment: 47, research: 50, safety: 3 },
      status: "active",
    };
    const dc: Lab = {
      labId: "lab_deepcent",
      name: "DeepCent",
      roleId: "deepcent-ceo",
      computeStock: 0,
      rdMultiplier: 4,
      allocation: { deployment: 42, research: 55, safety: 3 },
      status: "active",
    };
    const cs: Lab = {
      labId: "lab_conscienta",
      name: "Conscienta",
      roleId: "conscienta-ceo",
      computeStock: 0,
      rdMultiplier: 3,
      allocation: { deployment: 50, research: 43, safety: 7 },
      status: "active",
    };
    const data = buildChartData(
      [{ number: 1, label: "Q1", labsAfter: [ob, dc, cs] }],
      [ob, dc, cs],
      1,
      false,
    );
    const inactive = data.series.filter((s) => !s.isBackground && s.isInactive);
    expect(inactive).toEqual([]);
  });
});
