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
const PRE_GAME_MULTIPLIERS: Record<string, number> = {
  OpenBrain: 1.15,
  DeepCent: 1.08,
  Conscienta: 1.12,
  "Other US Labs": 1.1,
  "Rest of World": 1.05,
};

// Milestone markers — only shown when the peak value reaches them
const MILESTONES = [
  { multiplier: 3, label: "Agent-2", color: "#22C55E" },
  { multiplier: 10, label: "Agent-3", color: "#06B6D4" },
  { multiplier: 100, label: "Agent-4", color: "#F59E0B" },
  { multiplier: 1000, label: "ASI", color: "#EF4444" },
];

function labColor(roleId: string): string {
  return ROLES.find((r) => r.id === roleId)?.color ?? "#94A3B8";
}

// Dynamic scale: adapts to the peak value
// At game start (peak ~3x), 3x is near the top
// As labs grow, the scale expands to accommodate
function makeScaleY(ceiling: number) {
  return (multiplier: number): number => {
    const v = Math.max(1, multiplier);
    if (ceiling <= 15) {
      // Early game: linear 1 to ceiling
      return (v - 1) / (ceiling - 1);
    }
    // Late game: hybrid linear/log
    if (v <= 10) {
      return ((v - 1) / 9) * 0.5;
    }
    const logCeiling = Math.log10(ceiling);
    return 0.5 + ((Math.log10(v) - 1) / (logCeiling - 1)) * 0.5;
  };
}

export function RdProgressChart({
  rounds,
  currentLabs,
  currentRound = 1,
  compact = false,
}: {
  rounds: Round[];
  currentLabs: Lab[];
  currentRound?: number;
  compact?: boolean;
}) {
  const allLabs = [...DEFAULT_LABS, ...BACKGROUND_LABS.map((l, i) => ({ ...l, roleId: `bg-${i}` }))];
  const completedRounds = rounds.filter((r) => r.labsAfter && r.labsAfter.length > 0);

  // Chart dimensions
  const width = 340;
  const height = compact ? 170 : 210;
  const padLeft = 32;
  const padRight = 50;
  const padTop = 10;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Dynamic x-axis: only show up to current round + 1
  const allLabels = ["Pre", "Start", "R1", "R2", "R3", "R4"];
  const visibleCount = Math.min(allLabels.length, currentRound + 2); // Pre, Start, + current round
  const xLabels = allLabels.slice(0, visibleCount);
  const xCount = xLabels.length;

  function xPos(i: number): number {
    return padLeft + (i / Math.max(1, xCount - 1)) * chartW;
  }

  // Build per-lab point series
  type LabSeries = { name: string; roleId: string; points: { x: number; y: number; value: number }[]; isBackground: boolean };
  const series: LabSeries[] = [];

  for (const lab of allLabs) {
    const isBackground = !DEFAULT_LABS.some((d) => d.roleId === lab.roleId);
    const points: { x: number; y: number; value: number }[] = [];

    // Pre-game (~Oct 2027)
    const preVal = PRE_GAME_MULTIPLIERS[lab.name] ?? 1.1;
    points.push({ x: xPos(0), y: 0, value: preVal }); // y set after scale determined

    // Start (game creation state)
    points.push({ x: xPos(1), y: 0, value: lab.rdMultiplier });

    // Completed rounds
    for (let i = 0; i < completedRounds.length; i++) {
      const roundLab = completedRounds[i].labsAfter?.find((l) => l.name === lab.name);
      const val = roundLab?.rdMultiplier ?? lab.rdMultiplier;
      points.push({ x: xPos(2 + i), y: 0, value: val });
    }

    // Current round if values changed from last snapshot
    if (completedRounds.length < 4 && completedRounds.length > 0) {
      const currentLab = currentLabs.find((l) => l.name === lab.name);
      const val = currentLab?.rdMultiplier ?? lab.rdMultiplier;
      const lastSnapshotVal = points[points.length - 1]?.value;
      if (val !== lastSnapshotVal) {
        points.push({ x: xPos(2 + completedRounds.length), y: 0, value: val });
      }
    }

    series.push({ name: lab.name, roleId: lab.roleId, points, isBackground });
  }

  // Find peak value across all visible points
  const peakValue = Math.max(
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    3 // minimum ceiling so the chart isn't empty
  );

  // Dynamic ceiling: next nice round number above peak, with 20% headroom
  const ceilingRaw = peakValue * 1.3;
  const ceiling = ceilingRaw <= 5 ? 5
    : ceilingRaw <= 15 ? 15
    : ceilingRaw <= 50 ? 50
    : ceilingRaw <= 200 ? 200
    : ceilingRaw <= 1500 ? 1500
    : 10000;

  const scaleY = makeScaleY(ceiling);

  function yPos(multiplier: number): number {
    return padTop + chartH - scaleY(multiplier) * chartH;
  }

  // Now set y positions on all points
  for (const s of series) {
    for (const p of s.points) {
      p.y = yPos(p.value);
    }
  }

  // Y-axis ticks: only show values up to the ceiling
  const allTicks = [1, 2, 3, 5, 10, 50, 100, 500, 1000, 5000];
  const yTicks = allTicks.filter((v) => v <= ceiling && scaleY(v) <= 1.05);

  // Milestones: only show those at or below the peak (+ small buffer)
  const visibleMilestones = MILESTONES.filter((m) => m.multiplier <= peakValue * 1.5);

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
              {v >= 1000 ? `${v / 1000}k` : v}×
            </text>
          </g>
        ))}

        {/* Milestone labels on right edge — only visible ones */}
        {visibleMilestones.filter((m) => scaleY(m.multiplier) <= 1).map((m) => (
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

        {/* X-axis labels — only visible rounds */}
        {xLabels.map((label, i) => (
          <text
            key={label}
            x={xPos(i)}
            y={height - 6}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize={10}
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

        {/* Main lab lines — step function (flat during round, jump at resolve) */}
        {series.filter((s) => !s.isBackground).map((s) => {
          const stepPoints: string[] = [];
          for (let i = 0; i < s.points.length; i++) {
            if (i === 0) {
              stepPoints.push(`${s.points[i].x},${s.points[i].y}`);
            } else {
              stepPoints.push(`${s.points[i].x},${s.points[i - 1].y}`);
              stepPoints.push(`${s.points[i].x},${s.points[i].y}`);
            }
          }
          return (
          <g key={s.roleId}>
            <polyline
              points={stepPoints.join(" ")}
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
          );
        })}
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
