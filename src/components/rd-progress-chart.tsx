"use client";

import { useMemo, useState } from "react";
import { ROLES, DEFAULT_LABS, BACKGROUND_LABS } from "@/lib/game-data";
import { FullScreenOverlay } from "@/components/full-screen-overlay";
import { Maximize2 } from "lucide-react";

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

// Milestone markers — capability levels, not model names.
// Grounded in source material (ai-2027.com): 3×=superhuman coder,
// 10×=autonomous researcher, 100×=superintelligence, 1000×=recursive singularity.
const MILESTONES = [
  { multiplier: 3, label: "Coder", color: "#22C55E" },
  { multiplier: 10, label: "Researcher", color: "#06B6D4" },
  { multiplier: 100, label: "Genius", color: "#F59E0B" },
  { multiplier: 1000, label: "Singularity", color: "#EF4444" },
];

function labColor(roleId: string): string {
  const known = ROLES.find((r) => r.id === roleId)?.color;
  if (known) return known;
  let hash = 0;
  for (const char of roleId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const colors = ["#14B8A6", "#F97316", "#E11D48", "#0EA5E9", "#84CC16", "#F59E0B"];
  return colors[hash % colors.length];
}

// Dynamic scale: adapts to the peak value
function makeScaleY(ceiling: number) {
  return (multiplier: number): number => {
    const v = Math.max(1, multiplier);
    if (ceiling <= 15) {
      return (v - 1) / (ceiling - 1);
    }
    if (v <= 10) {
      return ((v - 1) / 9) * 0.5;
    }
    const logCeiling = Math.log10(ceiling);
    return 0.5 + ((Math.log10(v) - 1) / (logCeiling - 1)) * 0.5;
  };
}

// ─── Data preparation (pure, testable) ──────────────────────────────────────

interface ChartPoint { x: number; y: number; value: number }
interface LabSeries {
  name: string;
  roleId: string;
  points: ChartPoint[];
  isBackground: boolean;
  isInactive: boolean;
}

interface ChartLayout {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  chartW: number;
  chartH: number;
}

interface ChartData {
  series: LabSeries[];
  xLabels: string[];
  yTicks: number[];
  visibleMilestones: typeof MILESTONES;
  ceiling: number;
  scaleY: (v: number) => number;
  yPos: (v: number) => number;
  xPos: (i: number) => number;
  layout: ChartLayout;
}

function buildChartData(
  rounds: Round[],
  currentLabs: Lab[],
  currentRound: number,
  compact: boolean,
): ChartData {
  const snapshotLabs = rounds.flatMap((round) => round.labsAfter ?? []);
  const allLabs = [
    ...DEFAULT_LABS,
    ...currentLabs,
    ...snapshotLabs,
    ...BACKGROUND_LABS.map((l, i) => ({ ...l, roleId: `bg-${i}` })),
  ].reduce<Lab[]>((labs, lab) => {
    if (labs.some((existing) => existing.name === lab.name)) return labs;
    labs.push(lab);
    return labs;
  }, []);
  const completedRounds = rounds.filter((r) => r.labsAfter && r.labsAfter.length > 0);

  const width = 340;
  const height = compact ? 170 : 210;
  const padLeft = 32;
  const padRight = 50;
  const padTop = 10;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const layout = { width, height, padLeft, padRight, padTop, padBottom, chartW, chartH };

  const allLabels = ["Pre", "Start", "R1", "R2", "R3", "R4"];
  const visibleCount = Math.min(allLabels.length, currentRound + 2);
  const xLabels = allLabels.slice(0, visibleCount);
  const xCount = xLabels.length;

  function xPos(i: number): number {
    return padLeft + (i / Math.max(1, xCount - 1)) * chartW;
  }

  // Build per-lab point series
  const series: LabSeries[] = [];

  for (const lab of allLabs) {
    const isBackground = lab.roleId.startsWith("bg-");
    const isInactive = !isBackground && !currentLabs.some((l) => l.name === lab.name);
    const points: ChartPoint[] = [];

    points.push({ x: xPos(0), y: 0, value: PRE_GAME_MULTIPLIERS[lab.name] ?? 1.1 });
    points.push({ x: xPos(1), y: 0, value: lab.rdMultiplier });

    for (let i = 0; i < completedRounds.length; i++) {
      const roundLab = completedRounds[i].labsAfter?.find((l) => l.name === lab.name);
      if (!roundLab && isInactive) break;
      points.push({
        x: xPos(2 + i),
        y: 0,
        value: roundLab?.rdMultiplier ?? points[points.length - 1]?.value ?? lab.rdMultiplier,
      });
    }

    // Only plot round data from actual snapshots — no live fallbacks

    series.push({ name: lab.name, roleId: lab.roleId, points, isBackground, isInactive });
  }

  // Scale
  const peakValue = Math.max(...series.flatMap((s) => s.points.map((p) => p.value)), 3);
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

  for (const s of series) {
    for (const p of s.points) {
      p.y = yPos(p.value);
    }
  }

  const allTicks = [1, 2, 3, 5, 10, 50, 100, 500, 1000, 5000];
  const yTicks = allTicks.filter((v) => v <= ceiling && scaleY(v) <= 1.05);
  const visibleMilestones = MILESTONES.filter((m) => m.multiplier <= peakValue * 1.5);

  return { series, xLabels, yTicks, visibleMilestones, ceiling, scaleY, yPos, xPos, layout };
}

// ─── Renderer ───────────────────────────────────────────────────────────────

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
  const { series, xLabels, yTicks, visibleMilestones, scaleY, yPos, xPos, layout } = useMemo(
    () => buildChartData(rounds, currentLabs, currentRound, compact),
    [rounds, currentLabs, currentRound, compact],
  );
  const { width, height, padLeft, padRight } = layout;
  const [fullScreen, setFullScreen] = useState(false);

  const chartContent = (maxH?: number) => (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: maxH ?? (compact ? 170 : 210) }}
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padLeft} y1={yPos(v)} x2={width - padRight} y2={yPos(v)}
              stroke="#334155" strokeWidth={0.5} strokeDasharray="4,3"
            />
            <text x={padLeft - 4} y={yPos(v) + 3} textAnchor="end" fill="#64748B" fontSize={9} fontFamily="monospace">
              {v >= 1000 ? `${v / 1000}k` : v}×
            </text>
          </g>
        ))}

        {/* Milestone labels on right edge */}
        {visibleMilestones.filter((m) => scaleY(m.multiplier) <= 1).map((m) => (
          <text key={m.label} x={width - 2} y={yPos(m.multiplier) + 3} textAnchor="end" fill={m.color} fontSize={8} opacity={0.6}>
            {m.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text key={label} x={xPos(i)} y={height - 6} textAnchor="middle" fill="#94A3B8" fontSize={10}>
            {label}
          </text>
        ))}

        {/* Background lab lines (faded dashed) */}
        {series.filter((s) => s.isBackground).map((s) => (
          <polyline
            key={s.roleId}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="#475569" strokeWidth={1} strokeDasharray="3,3" opacity={0.3}
          />
        ))}

        {/* Main lab lines — diagonal */}
        {series.filter((s) => !s.isBackground).map((s) => {
          const linePoints = s.points.map(p => `${p.x},${p.y}`).join(" ");
          const color = labColor(s.roleId);
          const last = s.points[s.points.length - 1];
          return (
          <g key={s.roleId}>
            <polyline
              points={linePoints}
              fill="none" stroke={color}
              strokeWidth={s.isInactive ? 2 : 2.5}
              strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={s.isInactive ? "6,4" : undefined}
            />
            {s.points.map((p, i) => (
              <circle
                key={`${s.roleId}-pt-${i}`} cx={p.x} cy={p.y}
                r={i === s.points.length - 1 ? (s.isInactive ? 3.5 : 4.5) : 2.5}
                fill={color}
              />
            ))}
            <text
              x={last.x + 7} y={last.y + 4} fill={color}
              fontSize={s.isInactive ? 9 : 11}
              fontWeight={s.isInactive ? 500 : 700}
              fontFamily="monospace"
            >
              {last.value < 10 ? `${Math.round(last.value * 10) / 10}×` : `${Math.round(last.value)}×`}
            </text>
          </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {series.filter((s) => !s.isBackground).map((s) => (
          <span key={s.roleId} className={`flex items-center gap-1.5 text-xs ${s.isInactive ? "text-text-light/80" : "text-text-light"}`}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: labColor(s.roleId) }} />
            {s.name}{s.isInactive ? " (inactive)" : ""}
          </span>
        ))}
      </div>
    </>
  );

  return (
    <>
    {fullScreen && (
      <FullScreenOverlay title="R&D Progress" onClose={() => setFullScreen(false)} bodyClassName="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full">
        {chartContent(600)}
      </FullScreenOverlay>
    )}

    <div className="bg-navy-dark rounded-xl border border-navy-light p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          R&D Progress
        </span>
        <button onClick={() => setFullScreen(true)} className="text-text-light hover:text-white p-0.5 transition-colors" title="Full screen">
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
      {chartContent()}
    </div>
    </>
  );
}
