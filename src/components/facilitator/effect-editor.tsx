"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  ChevronDown,
  CircleX,
  Flame,
  GitMerge,
  Landmark,
  MessageSquare,
  PencilLine,
  Plus,
  Rocket,
  Save,
  ShieldAlert,
  TrendingDown,
  Zap,
  X,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import type { StructuredEffect, Confidence } from "@/lib/ai-prompts";

/** Label + icon + tone + one-line summary per effect. One switch over the
 *  discriminant. Icons: Lucide only (no emoji). */
function describeEffect(e: StructuredEffect): { label: string; Icon: typeof GitMerge; tone: string; summary: string } {
  switch (e.type) {
    case "merge":
      return { label: "Merge", Icon: GitMerge, tone: "text-viz-warning",
        summary: `${e.absorbed} → ${e.survivor}${e.newName ? ` (${e.newName})` : ""}` };
    case "decommission":
      return { label: "Decommission", Icon: CircleX, tone: "text-viz-danger", summary: e.labName };
    case "breakthrough":
      return { label: "Breakthrough", Icon: Rocket, tone: "text-viz-capability", summary: `${e.labName} (new model)` };
    case "modelRollback":
      return { label: "Model rollback", Icon: TrendingDown, tone: "text-viz-warning", summary: `${e.labName} (prior model)` };
    case "computeDestroyed":
      return { label: "Compute destroyed", Icon: Flame, tone: "text-viz-danger", summary: `${e.labName} −${e.amount}u` };
    case "researchDisruption":
      return { label: "Disruption", Icon: ShieldAlert, tone: "text-viz-warning", summary: `${e.labName} (one round)` };
    case "researchBoost":
      return { label: "Boost", Icon: Zap, tone: "text-viz-safety", summary: `${e.labName} (one round)` };
    case "transferOwnership":
      return { label: "Transfer ownership", Icon: Landmark, tone: "text-viz-warning", summary: `${e.labName} → ${e.controllerRoleId}` };
    case "computeTransfer":
      return { label: "Compute transfer", Icon: ArrowRightLeft, tone: "text-viz-capability",
        summary: `${e.fromRoleId} → ${e.toRoleId}: ${e.amount}u` };
    case "foundLab":
      return { label: "Found lab", Icon: Plus, tone: "text-viz-safety", summary: `${e.name} (${e.seedCompute}u)` };
    case "narrativeOnly":
      return { label: "Narrative only", Icon: MessageSquare, tone: "text-text-light", summary: "no mechanical effect" };
  }
}

interface LabOption { labId: string; name: string }
interface RoleOption { roleId: string; name: string }

/** Props the editor needs. `overrideStructuredEffect` is the Convex mutation. */
interface EffectEditorProps {
  effect: StructuredEffect | undefined;
  confidence: Confidence | undefined;
  submissionId: Id<"submissions">;
  actionIndex: number;
  labs: LabOption[];
  roles: RoleOption[];
  overrideStructuredEffect: (args: {
    submissionId: Id<"submissions">;
    actionIndex: number;
    structuredEffect?: StructuredEffect;
    acknowledge?: boolean;
  }) => Promise<unknown>;
  /** Facilitator-only editor; hidden in projector mode. */
  isProjector: boolean;
  /** Optional: disables edits while dice have been rolled (effects are locked
   *  post-roll — use Re-resolve to change them). */
  locked?: boolean;
}

/** "Merge: X → Y" style label; narrativeOnly hides the colon+summary. */
function formatEffectLabel(label: string, summary: string, type: StructuredEffect["type"]): string {
  return type === "narrativeOnly" ? label : `${label}: ${summary}`;
}

/** Compact badge + click-to-edit popover. Caller passes a `narrativeOnly`
 *  placeholder when the grader emitted no effect — needed so low-confidence
 *  rows always have a badge to click for the P2 acknowledge gate. */
export function EffectEditor(props: EffectEditorProps) {
  const { effect, isProjector, locked } = props;
  if (!effect) return null;

  const { label, Icon, tone, summary } = describeEffect(effect);
  const text = formatEffectLabel(label, summary, effect.type);

  // Read-only surfaces (projector + post-roll locked) render the same badge
  // without a popover; locked gets a muted tone and an aria-label.
  if (isProjector || locked) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-medium ${tone}${locked ? " opacity-75" : ""}`}
        aria-label={locked ? `${text} — locked, dice already rolled` : text}
      >
        <Icon className="w-3 h-3" aria-hidden="true" />
        <span className="truncate" aria-hidden="true">{text}</span>
      </span>
    );
  }

  return <EffectBadgeWithPopover {...props} />;
}

function EffectBadgeWithPopover(props: EffectEditorProps) {
  const { effect, confidence, submissionId, actionIndex, labs, roles, overrideStructuredEffect } = props;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLSelectElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setMenuPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 340) });
    };
    update();
    if (open) {
      setTimeout(() => firstFocusRef.current?.focus(), 0);
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  if (!effect) return null;

  const { label, Icon, tone, summary } = describeEffect(effect);
  const lowConfidence = confidence === "low";

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border transition-colors ${
          lowConfidence
            ? "border-viz-warning/60 bg-viz-warning/10 text-viz-warning hover:bg-viz-warning/20"
            : `border-navy-light bg-navy-dark ${tone} hover:bg-navy-light`
        }`}
        title={lowConfidence ? "Low confidence — click to review or edit" : "Click to edit effect"}
      >
        <Icon className="w-3 h-3" aria-hidden="true" />
        <span className="truncate max-w-[200px]">{formatEffectLabel(label, summary, effect.type)}</span>
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>
      {open && menuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Edit effect"
          className="fixed z-[1000] bg-navy-dark border border-navy-light rounded-lg shadow-xl p-3 min-w-[320px]"
          style={{ top: menuPos.top, left: menuPos.left }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }}
        >
          <EffectForm
            initialEffect={effect}
            labs={labs}
            roles={roles}
            firstFocusRef={firstFocusRef}
            onSubmit={async (next) => {
              await overrideStructuredEffect({
                submissionId,
                actionIndex,
                structuredEffect: next,
                acknowledge: true,
              });
              setOpen(false);
              triggerRef.current?.focus();
            }}
            onAcknowledge={lowConfidence ? async () => {
              await overrideStructuredEffect({
                submissionId,
                actionIndex,
                structuredEffect: effect,
                acknowledge: true,
              });
              setOpen(false);
              triggerRef.current?.focus();
            } : undefined}
            onCancel={() => { setOpen(false); triggerRef.current?.focus(); }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

type EffectType = StructuredEffect["type"];

function EffectForm({
  initialEffect,
  labs,
  roles,
  firstFocusRef,
  onSubmit,
  onAcknowledge,
  onCancel,
}: {
  initialEffect: StructuredEffect;
  labs: LabOption[];
  roles: RoleOption[];
  firstFocusRef?: RefObject<HTMLSelectElement | null>;
  onSubmit: (effect: StructuredEffect) => Promise<void>;
  /** Only present when confidence is "low" — lets facilitator accept without edits. */
  onAcknowledge?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<EffectType>(initialEffect.type);
  const [fields, setFields] = useState<Record<string, string>>(() => stringifyFields(initialEffect));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labNames = labs.map((l) => l.name);
  const roleIds = roles.map((r) => ({ id: r.roleId, name: r.name }));

  const save = async () => {
    setError(null);
    const built = buildEffect(type, fields);
    if (typeof built === "string") { setError(built); return; }
    setSaving(true);
    try {
      await onSubmit(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <PencilLine className="w-3.5 h-3.5 text-text-light" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light">Effect</span>
      </div>

      <label className="block text-[10px] text-text-light">
        Type
        <select
          ref={firstFocusRef}
          value={type}
          onChange={(e) => { setType(e.target.value as EffectType); setFields({}); }}
          className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white"
        >
          <optgroup label="Structural">
            <option value="merge">Merge</option>
            <option value="decommission">Decommission</option>
            <option value="transferOwnership">Transfer ownership</option>
            <option value="foundLab">Found lab (new)</option>
          </optgroup>
          <optgroup label="Position (R&D multiplier)">
            <option value="breakthrough">Breakthrough (ship new model)</option>
            <option value="modelRollback">Model rollback (ship prior / safer model)</option>
          </optgroup>
          <optgroup label="Stock (compute)">
            <option value="computeDestroyed">Compute destroyed (positive units)</option>
            <option value="computeTransfer">Compute transfer (role → role)</option>
          </optgroup>
          <optgroup label="Productivity (one round)">
            <option value="researchDisruption">Research disruption (throughput ↓)</option>
            <option value="researchBoost">Research boost (throughput ↑)</option>
          </optgroup>
          <option value="narrativeOnly">Narrative only (no mechanics)</option>
        </select>
      </label>

      <FieldsForType type={type} fields={fields} setFields={setFields} labNames={labNames} roleIds={roleIds} />

      {error && <div className="text-[11px] text-viz-danger">{error}</div>}

      <div className="flex gap-1.5 pt-1">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 text-[11px] px-2 py-1 bg-white text-navy rounded font-bold hover:bg-off-white disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        {onAcknowledge && (
          <button
            onClick={() => void onAcknowledge()}
            className="text-[11px] px-2 py-1 bg-viz-warning/20 text-viz-warning rounded font-semibold hover:bg-viz-warning/30 border border-viz-warning/40"
            title="Accept as-is and clear the low-confidence flag"
          >
            Looks good
          </button>
        )}
        <button
          onClick={onCancel}
          className="text-[11px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

/** Serialise effect fields to string form for <input>/<select>. Scalars map
 *  directly; foundLab.allocation is fanned out to allocDeployment/Research/Safety
 *  string entries so the form can edit each leg, then re-assembled in the
 *  builder. Other nested shapes are dropped — none currently exist on the union. */
function stringifyFields(e: StructuredEffect): Record<string, string> {
  const f: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === "type") continue;
    if (v == null) continue;
    if (typeof v === "string") {
      f[k] = v;
    } else if (typeof v === "number") {
      f[k] = String(v);
    } else if (k === "allocation" && typeof v === "object") {
      const a = v as { deployment?: number; research?: number; safety?: number };
      if (typeof a.deployment === "number") f.allocDeployment = String(a.deployment);
      if (typeof a.research === "number") f.allocResearch = String(a.research);
      if (typeof a.safety === "number") f.allocSafety = String(a.safety);
    }
  }
  return f;
}

/** Effect types that are fully described by a single labName field — the
 *  validation and shape are identical aside from the discriminant. */
const LAB_NAME_ONLY_LABELS: Partial<Record<EffectType, string>> = {
  decommission: "Decommission",
  breakthrough: "Breakthrough",
  modelRollback: "Model rollback",
  researchDisruption: "Research disruption",
  researchBoost: "Research boost",
};

/** Per-type builders for effects whose shape is more than `{type, labName}`.
 *  Each receives a pre-built `get`/`getNum` accessor pair and returns either
 *  a fully-typed effect or a user-facing error string. */
type FieldGetter = (k: string) => string | undefined;
type NumberGetter = (k: string) => number | undefined;
type EffectBuilder = (get: FieldGetter, getNum: NumberGetter) => StructuredEffect | string;

const COMPLEX_BUILDERS: Partial<Record<EffectType, EffectBuilder>> = {
  merge: (get) => {
    const survivor = get("survivor");
    const absorbed = get("absorbed");
    if (!survivor || !absorbed) return "Merge requires both survivor and absorbed lab names";
    if (survivor === absorbed) return "Survivor and absorbed cannot be the same lab";
    return { type: "merge", survivor, absorbed, newName: get("newName"), newSpec: get("newSpec") };
  },
  computeDestroyed: (get, getNum) => {
    const labName = get("labName");
    const amount = getNum("amount");
    if (!labName || amount == null) return "Compute destroyed requires lab name and amount";
    if (amount <= 0) return "Amount must be positive — compute is conserved, destruction only";
    return { type: "computeDestroyed", labName, amount };
  },
  transferOwnership: (get) => {
    const labName = get("labName");
    const controllerRoleId = get("controllerRoleId");
    if (!labName || !controllerRoleId) return "Transfer requires lab and new controller role";
    return { type: "transferOwnership", labName, controllerRoleId };
  },
  computeTransfer: (get, getNum) => {
    const fromRoleId = get("fromRoleId");
    const toRoleId = get("toRoleId");
    const amount = getNum("amount");
    if (!fromRoleId || !toRoleId || amount == null) return "Transfer requires from, to, and amount";
    if (fromRoleId === toRoleId) return "From and to must differ";
    if (amount <= 0) return "Amount must be positive";
    return { type: "computeTransfer", fromRoleId, toRoleId, amount };
  },
  foundLab: (get, getNum) => {
    const name = get("name");
    const seedCompute = getNum("seedCompute");
    if (!name || seedCompute == null) return "Found lab requires name and seed compute";
    const d = getNum("allocDeployment");
    const r = getNum("allocResearch");
    const s = getNum("allocSafety");
    let allocation: { deployment: number; research: number; safety: number } | undefined;
    if (d != null || r != null || s != null) {
      if (d == null || r == null || s == null) return "Allocation requires all three of deployment/research/safety";
      if (d + r + s !== 100) return `Allocation must sum to 100 (currently ${d + r + s})`;
      allocation = { deployment: d, research: r, safety: s };
    }
    return { type: "foundLab", name, seedCompute, spec: get("spec"), allocation };
  },
  narrativeOnly: () => ({ type: "narrativeOnly" }),
};

/** Build a validated StructuredEffect from the form fields. Returns the effect
 *  or an error message string. */
function buildEffect(type: EffectType, f: Record<string, string>): StructuredEffect | string {
  const get: FieldGetter = (k) => {
    const v = f[k]?.trim();
    return v ? v : undefined;
  };
  const getNum: NumberGetter = (k) => {
    const raw = f[k]?.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  // Five effect types follow the same single-labName shape — fold them into one branch.
  const labNameOnlyLabel = LAB_NAME_ONLY_LABELS[type];
  if (labNameOnlyLabel) {
    const labName = get("labName");
    if (!labName) return `${labNameOnlyLabel} requires a lab name`;
    return { type, labName } as StructuredEffect;
  }

  // Exhaustive: every EffectType is in either LAB_NAME_ONLY_LABELS or COMPLEX_BUILDERS.
  return COMPLEX_BUILDERS[type]!(get, getNum);
}

function FieldsForType({
  type,
  fields,
  setFields,
  labNames,
  roleIds,
}: {
  type: EffectType;
  fields: Record<string, string>;
  setFields: (f: Record<string, string>) => void;
  labNames: string[];
  roleIds: { id: string; name: string }[];
}) {
  const set = (k: string, v: string) => setFields({ ...fields, [k]: v });

  const labSelect = (key: string, placeholder = "Select lab") => (
    <select
      value={fields[key] ?? ""}
      onChange={(e) => set(key, e.target.value)}
      className="w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white"
    >
      <option value="">{placeholder}</option>
      {labNames.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  const roleSelect = (key: string, placeholder = "Select role") => (
    <select
      value={fields[key] ?? ""}
      onChange={(e) => set(key, e.target.value)}
      className="w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white"
    >
      <option value="">{placeholder}</option>
      {roleIds.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
    </select>
  );

  switch (type) {
    case "merge":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Survivor{labSelect("survivor")}</label>
          <label className="block text-[10px] text-text-light">Absorbed{labSelect("absorbed")}</label>
          <label className="block text-[10px] text-text-light">
            Rename survivor (optional)
            <input type="text" value={fields.newName ?? ""} onChange={(e) => set("newName", e.target.value)}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white" />
          </label>
          <label className="block text-[10px] text-text-light">
            New spec for survivor (optional)
            <textarea value={fields.newSpec ?? ""} onChange={(e) => set("newSpec", e.target.value)}
              rows={2} maxLength={2000}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white resize-none" />
          </label>
        </div>
      );
    case "decommission":
      return <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>;
    case "breakthrough":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>
          <p className="text-[11px] text-text-light/70 italic">
            Lab ships a new generation of base model. R&D multiplier ×1.4–1.6 at apply
            time (random, capped to the round&apos;s maxMultiplier). No number to enter —
            magnitude is determined mechanically, not by the facilitator.
          </p>
        </div>
      );
    case "modelRollback":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>
          <p className="text-[11px] text-text-light/70 italic">
            Lab reverts to (or ships) a less capable base model — a Safer pivot or
            forced downgrade. R&D multiplier ×0.4–0.6 at apply time (random, floored
            at 1).
          </p>
        </div>
      );
    case "computeDestroyed":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>
          <label className="block text-[10px] text-text-light">
            Amount destroyed (positive units)
            <input type="number" min={1} value={fields.amount ?? ""} onChange={(e) => set("amount", e.target.value)}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white font-mono" />
          </label>
          <p className="text-[10px] text-text-light/70 italic">
            Positive quantity only — compute is conserved. Clamped to ≤50u and to the
            owner&apos;s available stock. Emits a negative ledger adjustment.
          </p>
        </div>
      );
    case "researchDisruption":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>
          <p className="text-[11px] text-text-light/70 italic">
            One-round productivity drop (×0.5–0.8). Use for facility offline, researcher
            exodus, cyber attack short of destruction, political pressure slowing work.
            Next round returns to 1.0 unless re-emitted.
          </p>
        </div>
      );
    case "researchBoost":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>
          <p className="text-[11px] text-text-light/70 italic">
            One-round productivity boost (×1.2–1.5). Use for algorithmic insight, key
            talent hire, tooling upgrade, crash programme. Next round returns to 1.0.
          </p>
        </div>
      );
    case "transferOwnership":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">Lab{labSelect("labName")}</label>
          <label className="block text-[10px] text-text-light">New controller{roleSelect("controllerRoleId")}</label>
        </div>
      );
    case "computeTransfer":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">From role{roleSelect("fromRoleId")}</label>
          <label className="block text-[10px] text-text-light">To role{roleSelect("toRoleId")}</label>
          <label className="block text-[10px] text-text-light">
            Amount (u)
            <input type="number" value={fields.amount ?? ""} onChange={(e) => set("amount", e.target.value)}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white font-mono" />
          </label>
        </div>
      );
    case "foundLab":
      return (
        <div className="space-y-1.5">
          <label className="block text-[10px] text-text-light">
            Lab name
            <input type="text" value={fields.name ?? ""} onChange={(e) => set("name", e.target.value)}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white" />
          </label>
          <label className="block text-[10px] text-text-light">
            Seed compute (u)
            <input type="number" value={fields.seedCompute ?? ""} onChange={(e) => set("seedCompute", e.target.value)}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white font-mono" />
          </label>
          <label className="block text-[10px] text-text-light">
            Spec (optional)
            <textarea value={fields.spec ?? ""} onChange={(e) => set("spec", e.target.value)}
              rows={2} maxLength={2000}
              className="mt-0.5 w-full bg-navy border border-navy-light rounded px-2 py-1 text-xs text-white resize-none" />
          </label>
          <fieldset className="border border-navy-light rounded px-2 py-1.5">
            <legend className="text-[10px] text-text-light px-1">Allocation % (optional — defaults to 34/33/33)</legend>
            <div className="grid grid-cols-3 gap-1.5">
              <label className="flex flex-col gap-0.5 text-[10px] text-text-light">
                Deploy
                <input type="number" value={fields.allocDeployment ?? ""} onChange={(e) => set("allocDeployment", e.target.value)}
                  className="bg-navy border border-navy-light rounded px-1.5 py-1 text-xs text-white font-mono" />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-text-light">
                Research
                <input type="number" value={fields.allocResearch ?? ""} onChange={(e) => set("allocResearch", e.target.value)}
                  className="bg-navy border border-navy-light rounded px-1.5 py-1 text-xs text-white font-mono" />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-text-light">
                Safety
                <input type="number" value={fields.allocSafety ?? ""} onChange={(e) => set("allocSafety", e.target.value)}
                  className="bg-navy border border-navy-light rounded px-1.5 py-1 text-xs text-white font-mono" />
              </label>
            </div>
          </fieldset>
        </div>
      );
    case "narrativeOnly":
      return (
        <p className="text-[11px] text-text-light/70 italic">
          Action rolls and logs to the narrative but produces no mechanical state change.
        </p>
      );
  }
}
