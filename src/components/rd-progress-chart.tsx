"use client";

import { ROLES, DEFAULT_LABS, BACKGROUND_LABS } from "@/lib/game-data";

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

interface Round {
  number: number;
  label: string;
  labsAfter?: Lab[];
}

// Pre-game baseline multipliers (Oct 2027 — before Agent-2 breakthrough)
// Matches the left edge of the source material's R&D Progress chart
const PRE_GAME_MULTIPLIERS: Record<string, number> = {
  OpenBrain: 1.15,
  DeepCent: 1.08,
  "Conscienta": 1.12,
  "Other US Labs": 1.1,
  "Rest of World": 1.05,
};

// Milestone markers on the capability scale
const MILESTONES = [
  { multiplier: 3, label: "Agent-2", color: "#22C55E" },
  { multiplier: 10, label: "Agent-3", color: "#06B6D4" },
  { multiplier: 100, label: "Agent-4", color: "#F59E0B" },
  { multiplier: 1000, label: "ASI", color: "#EF4444" },
];

function labColor(roleId: string): string {
  return ROLES.find((r) => r.id === roleId)?.color ?? "#94A3B8";
}

// Hybrid scale: linear 1-10×, then log above 10×
// This makes early-game differences visible while still fitting late-game values
function scaleY(multiplier: number): number {
  const v = Math.max(1, multiplier);
  if (v <= 10) {
    // Linear 1-10 → maps to 0-0.6 of chart height
    return ((v - 1) / 9) * 0.6;
  }
  // Log above 10 → maps to 0.6-1.0
  // log10(10)=1, log10(1000)=3, so range is 2 units
  return 0.6 + ((Math.log10(v) - 1) / 2) * 0.4;
}

export function RdProgressChart({
  rounds,
  currentLabs,
  compact = false,
}: {
  rounds: Round[];
  currentLabs: Lab[];
  compact?: boolean;
}) {
  const allLabs = [...DEFAULT_LABS, ...BACKGROUND_LABS.map((l, i) => ({ ...l, roleId: `bg-${i}` }))];
  const completedRounds = rounds.filter((r) => r.labsAfter && r.labsAfter.length > 0);

  // Chart dimensions
  const width = 340;
  const height = compact ? 170 : 210;
  const padLeft = 32;
  const padRight = 50; // Space for value labels
  const padTop = 10;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Fixed x-axis: Pre, Start, R1, R2, R3, R4 — always show all labels
  const xLabels = ["Pre", "Start", "R1", "R2", "R3", "R4"];
  const xCount = xLabels.length;

  function xPos(i: number): number {
    return padLeft + (i / Math.max(1, xCount - 1)) * chartW;
  }

  function yPos(multiplier: number): number {
    return padTop + chartH - scaleY(multiplier) * chartH;
  }

  // Build per-lab point series
  type LabSeries = { name: string; roleId: string; points: { x: number; y: number; value: number }[]; isBackground: boolean };
  const series: LabSeries[] = [];

  for (const lab of allLabs) {
    const isBackground = !DEFAULT_LABS.some((d) => d.roleId === lab.roleId);
    const points: { x: number; y: number; value: number }[] = [];

    // Pre-game (~Oct 2027)
    const preVal = PRE_GAME_MULTIPLIERS[lab.name] ?? 1.1;
    points.push({ x: xPos(0), y: yPos(preVal), value: preVal });

    // Start (game creation state)
    points.push({ x: xPos(1), y: yPos(lab.rdMultiplier), value: lab.rdMultiplier });

    // Completed rounds (R1=index 2, R2=index 3, R3=index 4)
    for (let i = 0; i < completedRounds.length; i++) {
      const roundLab = completedRounds[i].labsAfter?.find((l) => l.name === lab.name);
      const val = roundLab?.rdMultiplier ?? lab.rdMultiplier;
      points.push({ x: xPos(2 + i), y: yPos(val), value: val });
    }

    // Current round (not yet resolved) — only show if value changed from last snapshot
    // (e.g., facilitator adjusted mid-round). Otherwise line ends at last completed round.
    if (completedRounds.length < 4 && completedRounds.length > 0) {
      const currentLab = currentLabs.find((l) => l.name === lab.name);
      const val = currentLab?.rdMultiplier ?? lab.rdMultiplier;
      const lastSnapshotVal = points[points.length - 1]?.value;
      if (val !== lastSnapshotVal) {
        points.push({ x: xPos(2 + completedRounds.length), y: yPos(val), value: val });
      }
    }

    series.push({ name: lab.name, roleId: lab.roleId, points, isBackground });
  }

  // Y-axis tick values (hybrid scale)
  const yTicks = [1, 2, 3, 5, 10, 100, 1000].filter((v) => scaleY(v) <= 1.05);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-4">
      <span className="text-sm font-semibold uppercase tracking-wider text-text-light mb-2 block">
        R&D Progress
      </span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: compact ? 170 : 210 }}
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padLeft}
              y1={yPos(v)}
              x2={width - padRight}
              y2={yPos(v)}
              stroke="#334155"
              strokeWidth={0.5}
              strokeDasharray="4,3"
            />
            <text
              x={padLeft - 4}
              y={yPos(v) + 3}
              textAnchor="end"
              fill="#64748B"
              fontSize={9}
              fontFamily="monospace"
            >
              {v >= 1000 ? "1k" : v}×
            </text>
          </g>
        ))}

        {/* Milestone labels on right edge */}
        {MILESTONES.filter((m) => scaleY(m.multiplier) <= 1).map((m) => (
          <text
            key={m.label}
            x={width - 2}
            y={yPos(m.multiplier) + 3}
            textAnchor="end"
            fill={m.color}
            fontSize={8}
            opacity={0.6}
          >
            {m.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={label}
            x={xPos(i)}
            y={height - 6}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize={10}
            fontWeight={label === "Now" ? 600 : 400}
          >
            {label}
          </text>
        ))}

        {/* Background lab lines (faded dashed) */}
        {series.filter((s) => s.isBackground).map((s) => (
          <polyline
            key={s.roleId}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#475569"
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.3}
          />
        ))}

        {/* Main lab lines */}
        {series.filter((s) => !s.isBackground).map((s) => (
          <g key={s.roleId}>
            <polyline
              points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={labColor(s.roleId)}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Data points */}
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === s.points.length - 1 ? 4.5 : 2.5}
                fill={labColor(s.roleId)}
              />
            ))}
            {/* Value label on latest point */}
            <text
              x={s.points[s.points.length - 1].x + 7}
              y={s.points[s.points.length - 1].y + 4}
              fill={labColor(s.roleId)}
              fontSize={11}
              fontWeight={700}
              fontFamily="monospace"
            >
              {s.points[s.points.length - 1].value < 10
                ? `${Math.round(s.points[s.points.length - 1].value * 10) / 10}×`
                : `${Math.round(s.points[s.points.length - 1].value)}×`}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {series.filter((s) => !s.isBackground).map((s) => (
          <span key={s.roleId} className="flex items-center gap-1.5 text-xs text-text-light">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: labColor(s.roleId) }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
