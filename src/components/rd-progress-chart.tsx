"use client";

import { useMemo, useState } from "react";
import { ROLE_MAP, DEFAULT_LABS, BACKGROUND_LABS, type Lab } from "@/lib/game-data";
import { FullScreenOverlay } from "@/components/full-screen-overlay";
import { Maximize2 } from "lucide-react";
import type { RdOverride } from "@/components/facilitator/types";

/** Round shape consumed by the chart — a subset of `RoundLite`.
 *  `rdOverrides` are layered on top of `labsAfter` so the rendered point
 *  reflects facilitator corrections while the snapshot stays immutable. */
interface Round {
  number: number;
  label: string;
  labsAfter?: Lab[];
  rdOverrides?: RdOverride[];
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

// Secondary index for when a series' identity key is the lab's labId
// rather than its role id (ROLE_MAP is keyed by role id only).
const ROLE_BY_LAB_ID = new Map<string, string>();
for (const role of ROLE_MAP.values()) {
  if (role.labId) ROLE_BY_LAB_ID.set(role.labId, role.color);
}

function labColor(lab: { roleId?: string; labId?: string; name: string }): string {
  if (lab.roleId) {
    const byRole = ROLE_MAP.get(lab.roleId)?.color;
    if (byRole) return byRole;
  }
  if (lab.labId) {
    const byLabId = ROLE_BY_LAB_ID.get(lab.labId);
    if (byLabId) return byLabId;
  }
  const key = lab.labId ?? lab.roleId ?? lab.name;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
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

interface ChartPoint { x: number; y: number; value: number; overridden?: boolean }
interface LabSeries {
  name: string;
  roleId: string;
  color: string;
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

/** Compose one chart point for a completed round, layering any rdMultiplier
 *  override on top of the immutable labsAfter snapshot. Latest sequence wins
 *  when multiple overrides exist for the same lab. */
function roundChartPoint({
  round,
  roundLab,
  fallbackName,
  fallbackValue,
  x,
}: {
  round: Round;
  roundLab: Lab | undefined;
  fallbackName: string;
  fallbackValue: number;
  x: number;
}): ChartPoint {
  const subjectName = roundLab?.name ?? fallbackName;
  const matchingOverrides = (round.rdOverrides ?? []).filter((o) => o.subject === subjectName);
  const latestOverride = matchingOverrides.length > 0
    ? matchingOverrides.reduce((a, b) => (a.sequence > b.sequence ? a : b))
    : undefined;
  const snapshotValue = roundLab?.rdMultiplier ?? fallbackValue;
  const value = latestOverride?.after ?? snapshotValue;
  const overridden = latestOverride !== undefined && latestOverride.after !== snapshotValue;
  return { x, y: 0, value, overridden };
}

export function buildChartData(
  rounds: Round[],
  currentLabs: Lab[],
  currentRound: number,
  compact: boolean,
): ChartData {
  // Filter out decommissioned snapshot entries. decommissionLabInternal clears
  // ownerRoleId on the live doc before snapshotAfter runs, so the post-merger
  // snapshot of the absorbed lab has roleId: undefined. Without this filter
  // the chart sees two Conscienta entries — one from DEFAULT_LABS (roleId
  // "conscienta-ceo") and one from the roleId-less post-decommission snapshot
  // — neither dedupes against the other. The historical line we want is
  // already carried by DEFAULT_LABS + earlier rounds' active snapshots.
  const snapshotLabs = rounds.flatMap((round) =>
    (round.labsAfter ?? []).filter((l) => l.status !== "decommissioned"),
  );
  // Enrich DEFAULT_LABS with the live labId (matched by name) so
  // ownership transfers don't split one lab into two series. The identity
  // key below prefers labId over roleId — otherwise transferOwnership
  // changes a lab's roleId (owner) and creates a phantom "inactive" series.
  // Pull from snapshotLabs too: a merged-out lab is absent from currentLabs,
  // so without snapshot fallback its DEFAULT_LABS entry would key on roleId
  // while pre-merge active snapshots key on labId — duplicate "inactive"
  // series. Map constructor lets later entries win, so currentLabs comes
  // last to ensure a renamed survivor still maps to the live labId.
  const labIdByName = new Map(
    [...snapshotLabs, ...currentLabs]
      .filter((l) => l.labId)
      .map((l) => [l.name, l.labId] as const),
  );
  const defaultLabsEnriched = DEFAULT_LABS.map((l) => ({
    ...l,
    labId: labIdByName.get(l.name),
  }));
  // Key on labId first: it's stable across ownership transfers (unlike
  // roleId, which tracks the current owner) and renames (unlike name).
  // DEFAULT_LABS entries inherit the live labId via the name-match above.
  const identityKey = (l: { labId?: string; roleId?: string; name: string }): string =>
    l.labId ?? l.roleId ?? l.name;
  const allLabs = [
    ...defaultLabsEnriched,
    ...currentLabs,
    ...snapshotLabs,
    ...BACKGROUND_LABS.map((l, i) => ({ ...l, roleId: `bg-${i}` })),
  ].reduce<Lab[]>((labs, lab) => {
    const k = identityKey(lab);
    if (labs.some((existing) => identityKey(existing) === k)) return labs;
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

  const currentByKey = new Map(currentLabs.map((l) => [identityKey(l), l]));
  const series: LabSeries[] = [];

  for (const lab of allLabs) {
    const labKey = identityKey(lab);
    const isBackground = lab.roleId?.startsWith("bg-") ?? false;
    const currentLab = currentByKey.get(labKey);
    const isInactive = !isBackground && !currentLab;
    const points: ChartPoint[] = [];

    points.push({ x: xPos(0), y: 0, value: PRE_GAME_MULTIPLIERS[lab.name] ?? 1.1 });
    points.push({ x: xPos(1), y: 0, value: lab.rdMultiplier });

    for (let i = 0; i < completedRounds.length; i++) {
      const round = completedRounds[i];
      // Skip decommissioned snapshot rows: they carry the lab's frozen
      // pre-merge rdMultiplier and would otherwise pin the inactive line
      // at that value across every subsequent round.
      const roundLab = round.labsAfter?.find(
        (l) => identityKey(l) === labKey && l.status !== "decommissioned",
      );
      if (!roundLab && isInactive) break;
      const fallbackValue = points[points.length - 1]?.value ?? lab.rdMultiplier;
      const point = roundChartPoint({
        round,
        roundLab,
        fallbackName: lab.name,
        fallbackValue,
        x: xPos(2 + i),
      });
      points.push(point);
    }

    // Use the latest name so renames (e.g. "DeepCent" → "DeepCent (Inspected)") display correctly.
    // Color must come from the lab's role/labId, not labKey — otherwise it diverges
    // from the lab cards in "Where We Are Now" (labKey can be a synthetic labId
    // string that won't hit ROLE_MAP).
    series.push({
      name: currentLab?.name ?? lab.name,
      roleId: labKey,
      color: labColor(currentLab ?? lab),
      points,
      isBackground,
      isInactive,
    });
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
  isProjector = false,
}: {
  rounds: Round[];
  currentLabs: Lab[];
  currentRound?: number;
  compact?: boolean;
  isProjector?: boolean;
}) {
  const { series, xLabels, yTicks, visibleMilestones, scaleY, yPos, xPos, layout } = useMemo(
    () => buildChartData(rounds, currentLabs, currentRound, compact),
    [rounds, currentLabs, currentRound, compact],
  );
  const { width, height, padLeft, padRight } = layout;
  const [fullScreen, setFullScreen] = useState(false);

  const chartContent = (maxH?: number | string) => (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{
          maxHeight: maxH ?? (compact ? 170 : isProjector ? 140 : 210),
          ...(isProjector && maxH === undefined ? { width: "70%" } : {}),
        }}
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
          const color = s.color;
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
            {s.points.map((p, i) => {
              const baseRadius = i === s.points.length - 1 ? (s.isInactive ? 3.5 : 4.5) : 2.5;
              return (
                <g key={`${s.roleId}-pt-${i}`}>
                  {p.overridden && (
                    // Hollow ring marks a facilitator override layered on top of
                    // the round's labsAfter snapshot — point reflects the corrected
                    // value, not what the mechanics produced.
                    <circle
                      cx={p.x} cy={p.y}
                      r={baseRadius + 2.5}
                      fill="none" stroke={color} strokeWidth={1.2} opacity={0.55}
                    >
                      <title>{`Facilitator override: ${p.value < 10 ? Math.round(p.value * 10) / 10 : Math.round(p.value)}×`}</title>
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r={baseRadius} fill={color} />
                </g>
              );
            })}
            <text
              x={last.x + 7} y={last.y - 6} fill={color}
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

      {/* Legend — uses fixed px sizing in projector mode so it doesn't blow
       *  up under the 32px root font and push the chart container offscreen. */}
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 mt-1"
        style={isProjector ? { fontSize: 40 } : undefined}
      >
        {series.filter((s) => !s.isBackground).map((s) => (
          <span key={s.roleId} className={`flex items-center gap-1.5 ${isProjector ? "" : "text-xs"} ${s.isInactive ? "text-text-light/80" : "text-text-light"}`}>
            <span
              className="rounded-full"
              style={isProjector ? { width: 28, height: 28, backgroundColor: s.color } : { width: 10, height: 10, backgroundColor: s.color }}
            />
            {s.name}{s.isInactive ? " (inactive)" : ""}
          </span>
        ))}
      </div>
    </>
  );

  return (
    <>
    {fullScreen && (
      <FullScreenOverlay
        title="R&D Progress"
        onClose={() => setFullScreen(false)}
        bodyClassName={
          isProjector
            ? "flex-1 flex flex-col justify-center w-full"
            : "flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full"
        }
      >
        {chartContent(isProjector ? "calc(100vh - 200px)" : 600)}
      </FullScreenOverlay>
    )}

    <div
      className={isProjector ? "bg-navy-dark rounded-xl border border-navy-light" : "bg-navy-dark rounded-xl border border-navy-light p-4"}
      style={isProjector ? { padding: 12 } : undefined}
    >
      <div
        className={isProjector ? "flex items-center justify-between" : "flex items-center justify-between mb-2"}
        style={isProjector ? { marginBottom: 6 } : undefined}
      >
        <span
          className={isProjector ? "font-semibold uppercase tracking-wider text-text-light" : "text-sm font-semibold uppercase tracking-wider text-text-light"}
          style={isProjector ? { fontSize: 28 } : undefined}
        >
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
