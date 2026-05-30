"use client";

import { Fragment, useRef, useState } from "react";
import { SlideShell, SlideEyebrow, SlideTitle } from "./slide-primitives";
import { useRd, TURN_TIMELINE } from "./rd-context";
import type { Lab } from "./rd-context";

// ─── Capability bullet templates per turn ─────────────────────────────────────
// The multiplier value and computed-years line are injected at render time.

const STATIC_BULLETS: Record<string, string[]> = {
  "turn-1": [
    "Can complete tasks like the best remote worker",
    "As persuasive as the most persuasive humans",
    "Significant progress on robotics — skillfully controls robots",
    '"AI CEOs" perform like human CEOs',
    "The majority of AI progress is now driven by compute, not talent",
  ],
  "turn-2": [
    "Superhuman persuasion — more persuasive than any human",
    "Significant progress on robotics — skillfully controls robots",
    '"AI CEOs" perform like human CEOs',
    "Almost all AI progress is now driven by compute, not talent",
  ],
  "turn-3": [
    "Superhuman persuasion",
    "Advanced robotics",
    "Superhuman strategy",
    "Cyber dominance",
    "Talent is largely irrelevant — essentially all AI progress is driven by compute",
  ],
};

// ─── SVG line chart ───────────────────────────────────────────────────────────

const PAD = { l: 56, r: 16, t: 12, b: 36 };
const SVG_W = 760;
const SVG_H = 200;
const CHART_W = SVG_W - PAD.l - PAD.r;
const CHART_H = SVG_H - PAD.t - PAD.b;

function logY(v: number, logMax: number): number {
  const logV = Math.log10(Math.max(v, 0.5));
  return PAD.t + CHART_H - (logV / logMax) * CHART_H;
}

function RdChart({
  visibleTurns,
  labs,
  multipliers,
}: {
  visibleTurns: (typeof TURN_TIMELINE)[number][];
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
}) {
  const allVals = visibleTurns.flatMap((t) => labs.map((l) => multipliers[t.id]?.[l.id] ?? 1));
  const rawMax = Math.max(...allVals, 10);
  // Round logMax up to nearest integer for clean grid lines
  const logMax = Math.ceil(Math.log10(rawMax));

  const xOf = (i: number) =>
    PAD.l + (visibleTurns.length === 1 ? CHART_W / 2 : (i / (visibleTurns.length - 1)) * CHART_W);

  // Y-axis grid lines at powers of 10
  const gridLines: number[] = [];
  for (let e = 0; e <= logMax; e++) gridLines.push(10 ** e);

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full"
      aria-hidden
      style={{ maxHeight: "200px" }}
    >
      {/* Grid lines */}
      {gridLines.map((v) => {
        const y = logY(v, logMax);
        return (
          <Fragment key={v}>
            <line
              x1={PAD.l}
              y1={y}
              x2={SVG_W - PAD.r}
              y2={y}
              stroke="#334155"
              strokeWidth={1}
            />
            <text
              x={PAD.l - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="#64748B"
            >
              {v >= 1000 ? `${v / 1000}k` : String(v)}×
            </text>
          </Fragment>
        );
      })}

      {/* X axis labels */}
      {visibleTurns.map((t, i) => (
        <text
          key={t.id}
          x={xOf(i)}
          y={SVG_H - 4}
          textAnchor="middle"
          fontSize={10}
          fill="#94A3B8"
        >
          {t.label}
        </text>
      ))}

      {/* Lines + dots per lab */}
      {labs.map((lab) => {
        const points = visibleTurns.map((t, i) => {
          const v = multipliers[t.id]?.[lab.id] ?? 1;
          return { x: xOf(i), y: logY(v, logMax), v };
        });
        const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        return (
          <Fragment key={lab.id}>
            <path d={d} stroke={lab.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill={lab.color} />
            ))}
          </Fragment>
        );
      })}
    </svg>
  );
}

// ─── Editable multiplier table ────────────────────────────────────────────────

function EditableTable({
  visibleTurns,
  labs,
  multipliers,
  setMultiplier,
}: {
  visibleTurns: (typeof TURN_TIMELINE)[number][];
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
  setMultiplier: (turnId: string, labId: string, value: number) => void;
}) {
  const [editing, setEditing] = useState<{ turnId: string; labId: string } | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(turnId: string, labId: string) {
    setEditing({ turnId, labId });
    setDraft(String(multipliers[turnId]?.[labId] ?? 1));
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    if (!editing) return;
    const n = parseFloat(draft);
    if (!Number.isNaN(n) && n > 0) setMultiplier(editing.turnId, editing.labId, n);
    setEditing(null);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm md:text-base">
        <thead>
          <tr>
            <th className="pb-1 text-left font-semibold text-text-light">Lab</th>
            {visibleTurns.map((t) => (
              <th key={t.id} className="pb-1 text-center font-semibold text-text-light">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labs.map((lab) => (
            <tr key={lab.id}>
              <td className="py-0.5 pr-4 font-semibold" style={{ color: lab.color }}>
                {lab.name}
              </td>
              {visibleTurns.map((t) => {
                const isEditing = editing?.turnId === t.id && editing?.labId === lab.id;
                const val = multipliers[t.id]?.[lab.id] ?? 1;
                return (
                  <td key={t.id} className="py-0.5 text-center">
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-16 rounded bg-navy-light px-1 text-center text-off-white outline-none ring-1 ring-viz-capability"
                        inputMode="numeric"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(t.id, lab.id)}
                        className="rounded px-2 py-0.5 text-off-white transition hover:bg-navy-light"
                        title="Click to edit"
                      >
                        {val}×
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Capability bullets for this turn ─────────────────────────────────────────

function CapabilityBullets({
  turnId,
  leadingMultiplier,
}: {
  turnId: string;
  leadingMultiplier: number;
}) {
  const bullets = STATIC_BULLETS[turnId] ?? [];
  const years = Math.round(leadingMultiplier / 4);
  const yearsLabel = years >= 1000 ? `${Math.round(years / 100) / 10}k` : String(years);

  return (
    <ul className="flex w-full flex-col gap-3 text-left">
      {/* Dynamic multiplier bullet first */}
      <li className="flex items-start gap-4 text-lg text-off-white md:text-xl">
        <span
          aria-hidden
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--color-viz-capability)" }}
        />
        <span>
          Leading R&D multiplier:{" "}
          <span className="font-bold" style={{ color: "var(--color-viz-capability)" }}>
            {leadingMultiplier}×
          </span>{" "}
          — AI progress expected in{" "}
          <span className="font-semibold text-off-white">{yearsLabel} years</span> now happens in 3
          months
        </span>
      </li>
      {bullets.map((b, i) => (
        <li key={i} className="flex items-start gap-4 text-lg text-off-white md:text-xl">
          <span
            aria-hidden
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-navy-muted)" }}
          />
          <span className="leading-snug">{b}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function makeRdSlide(upToTurnId: string, eyebrow: string) {
  function RdGraphSlide() {
    const { labs, multipliers, setMultiplier } = useRd();

    const turnIdx = TURN_TIMELINE.findIndex((t) => t.id === upToTurnId);
    const visibleTurns = TURN_TIMELINE.slice(0, turnIdx + 1);

    const leadingMultiplier = Math.max(
      ...labs.map((l) => multipliers[upToTurnId]?.[l.id] ?? 1),
      1,
    );

    return (
      <SlideShell align="start" className="gap-4 py-10 md:py-12">
        <SlideEyebrow>{eyebrow}</SlideEyebrow>
        <SlideTitle>R&amp;D Progress &amp; AI Capabilities</SlideTitle>

        {/* Legend */}
        <div className="flex flex-wrap gap-4">
          {labs.map((lab) => (
            <span key={lab.id} className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: lab.color }} />
              <span style={{ color: lab.color }}>{lab.name}</span>
            </span>
          ))}
        </div>

        <RdChart visibleTurns={visibleTurns} labs={labs} multipliers={multipliers} />

        <EditableTable
          visibleTurns={visibleTurns}
          labs={labs}
          multipliers={multipliers}
          setMultiplier={setMultiplier}
        />

        <div className="mt-2 w-full border-t border-navy-light pt-4">
          <CapabilityBullets turnId={upToTurnId} leadingMultiplier={leadingMultiplier} />
        </div>
      </SlideShell>
    );
  }
  RdGraphSlide.displayName = `RdGraphSlide(${upToTurnId})`;
  return RdGraphSlide;
}
