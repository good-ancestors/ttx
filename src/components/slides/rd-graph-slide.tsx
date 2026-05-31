"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Info, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRd, TURN_TIMELINE } from "./rd-context";
import type { Lab } from "./rd-context";

// ─── Capability text per turn ─────────────────────────────────────────────────

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

const SVG_W = 500;
const PAD = { l: 52, r: 10, t: 16, b: 44 };
const CW = SVG_W - PAD.l - PAD.r; // 438

function xOf(i: number, total: number) {
  return PAD.l + (total <= 1 ? CW / 2 : (i / (total - 1)) * CW);
}

export function RdChart({
  visibleTurns,
  labs,
  multipliers,
}: {
  visibleTurns: (typeof TURN_TIMELINE)[number][];
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
}) {
  // Match the viewBox height to the container's aspect ratio so the chart fills
  // the available space exactly. Because the aspect ratios then match, drawing
  // with preserveAspectRatio="none" scales uniformly — no distortion.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [svgH, setSvgH] = useState(380);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (w > 0 && h > 0) setSvgH(Math.round((SVG_W * h) / w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const CH = svgH - PAD.t - PAD.b;

  // Map a value onto the chart's vertical log axis spanning [logMin, logMax].
  const yOf = (v: number, logMin: number, logMax: number) => {
    const logV = Math.log10(Math.max(v, 10 ** logMin));
    return PAD.t + CH - ((logV - logMin) / (logMax - logMin)) * CH;
  };

  const allVals = visibleTurns.flatMap((t) =>
    labs.map((l) => multipliers[t.id]?.[l.id]).filter((v): v is number => v !== undefined),
  );
  const rawMax = Math.max(...allVals, 10);
  const rawMin = Math.min(...allVals, 1);
  const logMax = Math.ceil(Math.log10(rawMax));
  const logMin = Math.min(0, Math.floor(Math.log10(rawMin)));

  const majorLines: number[] = [];
  for (let e = logMin; e <= logMax; e++) majorLines.push(10 ** e);

  const minorLines: number[] = [];
  for (let e = logMin; e < logMax; e++) {
    const base = 10 ** e;
    for (const m of [2, 4, 6, 8]) {
      const v = base * m;
      if (v > 10 ** logMin && v < 10 ** logMax) minorLines.push(v);
    }
  }

  return (
    <div ref={wrapRef} className="h-full w-full">
    <svg
      viewBox={`0 0 ${SVG_W} ${svgH}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Minor grid lines */}
      {minorLines.map((v) => {
        const y = yOf(v, logMin, logMax);
        const label = v >= 1000 ? `${v / 1000}k` : String(v);
        return (
          <Fragment key={v}>
            <line x1={PAD.l} y1={y} x2={SVG_W - PAD.r} y2={y} stroke="#334155" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#475569">
              {label}×
            </text>
          </Fragment>
        );
      })}
      {/* Major grid lines + Y-axis labels */}
      {majorLines.map((v) => {
        const y = yOf(v, logMin, logMax);
        const label = v >= 1000 ? `${v / 1000}k` : String(v);
        return (
          <Fragment key={v}>
            <line x1={PAD.l} y1={y} x2={SVG_W - PAD.r} y2={y} stroke="#334155" strokeWidth={1} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#64748B">
              {label}×
            </text>
          </Fragment>
        );
      })}

      {/* X-axis labels, slanted ~30° so they don't overlap when many turns are
          shown. End-anchored at each tick so the text trails down-left and
          stays within the viewBox at both edges. */}
      {visibleTurns.map((t, i) => {
        const x = xOf(i, visibleTurns.length);
        const y = svgH - 22;
        return (
          <text
            key={t.id}
            x={x}
            y={y}
            textAnchor="end"
            transform={`rotate(-30, ${x}, ${y})`}
            fontSize={11}
            fill="#94A3B8"
          >
            {t.label}
          </text>
        );
      })}

      {/* Lines + dots per lab. Cleared (undefined) values are skipped — the line
          connects across the gap and no dot is drawn for the missing point. */}
      {labs.map((lab) => {
        const points = visibleTurns
          .map((t, i) => {
            const v = multipliers[t.id]?.[lab.id];
            if (v === undefined) return null;
            return { x: xOf(i, visibleTurns.length), y: yOf(v, logMin, logMax) };
          })
          .filter((p): p is { x: number; y: number } => p !== null);
        if (points.length === 0) return null;
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
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#3B82F6", "#D97706", "#7C3AED", "#DC2626",
  "#059669", "#DB2777", "#0EA5E9", "#F97316",
];

function EditModal({
  visibleTurns,
  labs,
  multipliers,
  setMultiplier,
  addLab,
  removeLab,
  onClose,
}: {
  visibleTurns: (typeof TURN_TIMELINE)[number][];
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
  setMultiplier: (turnId: string, labId: string, value: number | null) => void;
  addLab: (lab: Lab) => void;
  removeLab: (labId: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<{ turnId: string; labId: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[labs.length % PRESET_COLORS.length]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function startEdit(turnId: string, labId: string) {
    setEditing({ turnId, labId });
    const v = multipliers[turnId]?.[labId];
    setDraft(v === undefined ? "" : String(v));
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    if (!editing) return;
    const trimmed = draft.trim();
    if (trimmed === "") {
      // Cleared input → remove the point entirely.
      setMultiplier(editing.turnId, editing.labId, null);
    } else {
      const n = parseFloat(trimmed);
      if (!Number.isNaN(n) && n > 0) setMultiplier(editing.turnId, editing.labId, n);
    }
    setEditing(null);
  }

  function handleAddLab() {
    const name = newName.trim();
    if (!name) return;
    addLab({
      id: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name,
      color: newColor,
    });
    setNewName("");
    setNewColor(PRESET_COLORS[(labs.length + 1) % PRESET_COLORS.length]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-dark/80 p-6 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-navy p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-off-white">Edit R&D Multipliers</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-text-light hover:text-off-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Editable table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pb-2 text-left font-semibold text-text-light">Lab</th>
                {visibleTurns.map((t) => (
                  <th key={t.id} className="pb-2 text-center font-semibold text-text-light">
                    {t.label}
                  </th>
                ))}
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td className="py-1 pr-4 font-semibold" style={{ color: lab.color }}>
                    {lab.name}
                  </td>
                  {visibleTurns.map((t) => {
                    const isEditing = editing?.turnId === t.id && editing?.labId === lab.id;
                    const val = multipliers[t.id]?.[lab.id];
                    return (
                      <td key={t.id} className="py-1 text-center">
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
                            className={`rounded px-2 py-0.5 hover:bg-navy-light ${val === undefined ? "text-text-muted" : "text-off-white"}`}
                            title="Click to edit (clear to remove the point)"
                          >
                            {val === undefined ? "—" : `${val}×`}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-2">
                    <button
                      type="button"
                      onClick={() => removeLab(lab.id)}
                      className="rounded p-1 text-text-light hover:text-viz-danger"
                      title={`Delete ${lab.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tip: prefer leaving future turns blank over deleting a lab. */}
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-navy-light/40 px-3 py-2 text-xs text-text-light">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-viz-warning" aria-hidden />
          <span>
            To retire a lab, consider leaving its future turns blank instead of deleting it — its
            line will stop at the last value it reached on the graph. Deleting removes the lab and
            all of its points entirely.
          </span>
        </div>

        {/* Add lab form */}
        <div className="mt-4 border-t border-navy-light pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-light">
            Add lab
          </p>
          <div className="flex items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddLab(); }}
              placeholder="Lab name"
              className="flex-1 rounded-lg bg-navy-light px-3 py-1.5 text-sm text-off-white placeholder-text-muted outline-none ring-1 ring-transparent focus:ring-viz-capability"
            />
            <div className="flex gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: newColor === c ? `2px solid ${c}` : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddLab}
              disabled={!newName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-viz-capability px-3 py-1.5 text-sm font-semibold text-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Capability bullets ───────────────────────────────────────────────────────

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

  const allBullets = [
    <Fragment key="multiplier">
      Leading R&D multiplier:{" "}
      <span className="font-bold" style={{ color: "var(--color-viz-capability)" }}>
        {leadingMultiplier}×
      </span>{" "}
      — AI progress expected in{" "}
      <span className="font-semibold text-off-white">{yearsLabel} years</span> now happens in 3
      months
    </Fragment>,
    ...bullets.map((b, i) => <Fragment key={i}>{b}</Fragment>),
  ];

  return (
    <ul className="flex flex-col gap-5 lg:gap-6">
      {allBullets.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-4 text-2xl leading-snug text-off-white md:text-3xl lg:text-4xl"
        >
          <span
            aria-hidden
            className="mt-3 h-3 w-3 shrink-0 rounded-full md:mt-4 md:h-3.5 md:w-3.5"
            style={{
              backgroundColor:
                i === 0 ? "var(--color-viz-capability)" : "var(--color-navy-muted)",
            }}
          />
          <span className="leading-snug">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function makeRdSlide(upToTurnId: string, eyebrow: string) {
  function RdGraphSlide() {
    const { labs, multipliers, setMultiplier, addLab, removeLab } = useRd();
    const [editOpen, setEditOpen] = useState(false);
    const openModal = useCallback(() => setEditOpen(true), []);
    const closeModal = useCallback(() => setEditOpen(false), []);

    const turnIdx = TURN_TIMELINE.findIndex((t) => t.id === upToTurnId);
    const visibleTurns = TURN_TIMELINE.slice(0, turnIdx + 1);
    // Pre-game turns appear in the chart for context but are not editable.
    const editableTurns = visibleTurns.filter((t) => !t.pregame);

    const leadingMultiplier = Math.max(
      ...labs
        .map((l) => multipliers[upToTurnId]?.[l.id])
        .filter((v): v is number => v !== undefined),
      1,
    );

    return (
      <div className="flex h-full w-full">
        {/* ── Left: interactive chart ─────────────────────────── */}
        <div
          className="group relative flex w-1/2 cursor-pointer flex-col rounded-2xl px-12 py-14 md:px-16 md:py-16 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-white/0 before:transition-[background-color] before:duration-200 hover:before:bg-white/[0.04]"
          onClick={openModal}
          role="button"
          tabIndex={0}
          aria-label="Click to edit R&D multipliers"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openModal(); }}
        >
          <p className="relative z-10 pb-1 text-2xl font-bold text-off-white md:text-3xl lg:text-4xl">
            AI Research Speed
          </p>
          {/* Legend + edit hint */}
          <div className="relative z-10 flex items-center justify-between pb-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {labs.map((lab) => (
                <span
                  key={lab.id}
                  className="flex items-center gap-2.5 text-2xl font-bold md:text-3xl"
                  style={{ color: lab.color }}
                >
                  <span
                    className="h-4 w-4 rounded-full md:h-5 md:w-5"
                    style={{ backgroundColor: lab.color }}
                  />
                  {lab.name}
                </span>
              ))}
            </div>
            <span className="flex items-center gap-1 text-xs text-text-light opacity-0 transition-opacity group-hover:opacity-100">
              <Pencil className="h-3 w-3" aria-hidden />
              Click to edit
            </span>
          </div>

          {/* Chart */}
          <div className="relative z-10 flex flex-1 items-start justify-center">
            <RdChart visibleTurns={visibleTurns} labs={labs} multipliers={multipliers} />
          </div>
        </div>

        {/* ── Right: capabilities ─────────────────────────────── */}
        <div className="flex w-1/2 flex-col justify-center gap-8 px-10 py-10 lg:px-14">
          <p className="text-base font-semibold uppercase tracking-[0.2em] text-text-light md:text-lg">
            {eyebrow}
          </p>
          <CapabilityBullets turnId={upToTurnId} leadingMultiplier={leadingMultiplier} />
        </div>

        {/* Edit modal */}
        {editOpen && (
          <EditModal
            visibleTurns={editableTurns}
            labs={labs}
            multipliers={multipliers}
            setMultiplier={setMultiplier}
            addLab={addLab}
            removeLab={removeLab}
            onClose={closeModal}
          />
        )}
      </div>
    );
  }
  RdGraphSlide.displayName = `RdGraphSlide(${upToTurnId})`;
  return RdGraphSlide;
}
