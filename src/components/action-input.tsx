"use client";

import { useEffect, useState } from "react";
import { ROLES, AI_SYSTEMS_ROLE_ID, PRIORITY_DECAY } from "@/lib/game-data";
import { EyeOff, Eye, Handshake, Trash2, Plus, X, ChevronUp, ChevronDown, GripVertical, Send, Zap, FlaskConical, GitMerge } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";


export type PriorityLevel = "low" | "medium" | "high";

/**
 * Compute transfer attached to an action.
 *
 * "send": submitter's compute is escrowed immediately on submit.
 *   Success → credited to recipient. Failure → refunded to submitter.
 *
 * "request": no escrow from submitter. A request doc is created for the target
 *   to accept/decline during submit phase.
 *   - Accepted: target's compute is escrowed. Success → credited to submitter.
 *     Failure → refunded to target.
 *   - Ignored/Declined + Success: taken from target clamped to available balance.
 *   - Ignored/Declined + Failure: nothing happens.
 */
export interface ComputeTarget {
  roleId: string;
  amount: number;
  direction: "send" | "request";
}

export interface ActionDraft {
  text: string;
  priority: PriorityLevel;
  secret: boolean;
  endorseTargets: string[]; // roleIds
  computeTargets: ComputeTarget[];
  /** If set, this action is a "Found a lab" attempt. On roll success the seedCompute is
   *  consumed and a new lab row is created owned by the submitter. On failure the escrow refunds.
   *  seedCompute is auto-set to the founder's entire current compute stock at toggle time.
   *  allocation lets the founder set the lab's initial deployment/research/safety split. */
  foundLab?: {
    name: string;
    spec?: string;
    seedCompute: number;
    allocation?: { deployment: number; research: number; safety: number };
  };
  mergeLab?: { absorbedLabId: Id<"labs">; survivorLabId: Id<"labs">; newName?: string; newSpec?: string };
}

/** Assign priorities using the auto-decay table based on position order. */
export function normaliseActions(actions: ActionDraft[]): { text: string; priority: number; secret?: boolean }[] {
  const filled = actions.filter((a) => a.text.trim());
  const count = filled.length;
  if (count === 0) return [];
  const decay = PRIORITY_DECAY[count] ?? PRIORITY_DECAY[5];

  return filled.map((a, i) => ({
    text: a.text.trim(),
    priority: decay[i] ?? 1,
    secret: a.secret || undefined,
  }));
}

function emptyAction(): ActionDraft {
  return { text: "", priority: "medium", secret: false, endorseTargets: [], computeTargets: [] };
}

export interface LabRef { labId: Id<"labs">; name: string }

interface Props {
  actions: ActionDraft[];
  onChange: (actions: ActionDraft[]) => void;
  roleId: string;
  roleName: string;
  enabledRoles?: { id: string; name: string }[];
  /** Roles that can send/receive compute (has-compute tag, excluding self) */
  computeRoles?: { id: string; name: string; computeStock?: number }[];
  ownComputeStock?: number;
  /** Lab owned by this player — enables the Merge-lab button. */
  ownedLab?: LabRef;
  /** Candidate labs for a merger (excludes the submitter's own). */
  otherLabs?: LabRef[];
  isSubmitted: boolean;
  onSubmitAction?: (index: number) => void;
}

export function ActionInput({ actions, onChange, roleId, enabledRoles, computeRoles, ownComputeStock, ownedLab, otherLabs, isSubmitted, onSubmitAction }: Props) {
  // Filter out own role and AI Systems (AI Systems uses influence, not endorsements)
  const otherRoles = (enabledRoles ?? ROLES.filter((r) => r.id !== roleId))
    .filter((r) => typeof r === "object" && "id" in r ? r.id !== roleId && r.id !== AI_SYSTEMS_ROLE_ID : true);

  const updateAction = (index: number, patch: Partial<ActionDraft>) => {
    const next = [...actions];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeAction = (index: number) => {
    if (actions.length <= 1) {
      onChange([emptyAction()]);
      return;
    }
    onChange(actions.filter((_, i) => i !== index));
  };

  const addAction = () => {
    if (actions.length < 5) {
      onChange([...actions, emptyAction()]);
    }
  };

  // Auto-add placeholder when last card is filled
  const lastAction = actions[actions.length - 1];
  const needsPlaceholder = lastAction?.text.trim() && actions.length < 5;

  const filledCount = actions.filter((a) => a.text.trim()).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-text">
          Your Actions ({filledCount})
        </h3>
        {filledCount > 1 && (
          <span className="text-[11px] font-semibold text-text-muted">
            Top = highest priority
          </span>
        )}
      </div>
      <p className="text-[11px] text-text-muted mb-3">
        List in priority order. Top action gets the biggest push — lower ones decay from there.
        {filledCount > 1 ? " Use ↑ / ↓ to reorder." : ""}
      </p>

      <div className="space-y-3">
        {actions.map((action, i) => (
          <ActionCard
            key={`action-${i}`}
            action={action}
            index={i}
            totalActions={filledCount}
            onUpdate={(patch) => updateAction(i, patch)}
            onRemove={() => removeAction(i)}
            onMoveUp={i > 0 && !isSubmitted ? () => {
              const next = [...actions];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              onChange(next);
            } : undefined}
            onMoveDown={i < actions.length - 1 && !isSubmitted ? () => {
              const next = [...actions];
              [next[i], next[i + 1]] = [next[i + 1], next[i]];
              onChange(next);
            } : undefined}
            otherRoles={otherRoles}
            computeRoles={computeRoles}
            ownComputeStock={ownComputeStock}
            ownedLab={ownedLab}
            otherLabs={otherLabs}
            isSubmitted={isSubmitted}
            canRemove={actions.length > 1 || action.text.trim() !== ""}
            onAddNext={actions.length < 5 && !isSubmitted ? addAction : undefined}
            onSubmit={onSubmitAction && action.text.trim() ? () => onSubmitAction(i) : undefined}
          />
        ))}
      </div>

      {needsPlaceholder && !isSubmitted && (
        <button
          onClick={addAction}
          className="mt-3 w-full py-2.5 border-2 border-dashed border-border rounded-xl text-sm text-text-muted
                     hover:border-navy-light hover:text-text transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add another action
        </button>
      )}
    </div>
  );
}

function ActionCard({
  action,
  index,
  totalActions,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  otherRoles,
  computeRoles,
  ownComputeStock,
  ownedLab,
  otherLabs,
  isSubmitted,
  canRemove,
  onAddNext,
  onSubmit,
}: {
  action: ActionDraft;
  index: number;
  totalActions: number;
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  otherRoles: { id: string; name: string }[];
  computeRoles?: { id: string; name: string; computeStock?: number }[];
  ownComputeStock?: number;
  ownedLab?: LabRef;
  otherLabs?: LabRef[];
  isSubmitted: boolean;
  canRemove: boolean;
  onAddNext?: () => void;
  onSubmit?: () => void;
}) {
  const [showEndorse, setShowEndorse] = useState(false);
  const [showComputeRequest, setShowComputeRequest] = useState(false);

  const [idleNudge, setIdleNudge] = useState(false);
  useEffect(() => {
    if (isSubmitted || !action.text.trim()) return;
    const t = setTimeout(() => setIdleNudge(true), 15_000);
    return () => clearTimeout(t);
  }, [action.text, isSubmitted]);

  return (
    <div className={`bg-white rounded-xl border p-4 ${action.secret ? "border-viz-warning/40" : action.endorseTargets.length > 0 ? "border-[#059669]/30" : "border-border"}`}>
      {action.text.trim() && totalActions > 1 && (
        <ReorderBar index={index} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
      )}

      <textarea
        value={action.text}
        onChange={(e) => { onUpdate({ text: e.target.value }); setIdleNudge(false); }}
        onFocus={(e) => {
          setTimeout(() => {
            (e.target as HTMLElement).closest('.rounded-xl')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 300);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (action.text.trim() && onAddNext) onAddNext();
          }
        }}
        placeholder={index === 0 ? "I do [action] so that [intended outcome]..." : "I do [action] so that [intended outcome]..."}
        rows={4}
        maxLength={500}
        disabled={isSubmitted}
        spellCheck={false}
        className="w-full bg-transparent text-sm text-text resize-none outline-none placeholder:text-text-muted/50 mb-2"
      />
      {action.text.length > 400 && !isSubmitted && (
        <p className="text-[11px] text-text-muted text-right -mt-1 mb-1">
          {action.text.length}/500
        </p>
      )}

      {/* Controls row — only show when there's text */}
      {(action.text.trim() || isSubmitted) && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Secret toggle */}
          <button
            onClick={() => onUpdate({ secret: !action.secret })}
            disabled={isSubmitted}
            aria-label={action.secret ? "Secret — hidden from others" : "Make secret"}
            aria-pressed={action.secret}
            className={`min-h-[44px] px-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              action.secret
                ? "bg-[#FFF7ED] text-viz-warning"
                : "text-text-light hover:text-text-muted hover:bg-warm-gray"
            }`}
          >
            {action.secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="text-xs font-medium">{action.secret ? "Secret" : "Visible"}</span>
          </button>

          {/* Endorsement toggle */}
          <button
            onClick={() => { setShowEndorse(!showEndorse); setShowComputeRequest(false); }}
            disabled={isSubmitted}
            aria-label="Request support from other players"
            aria-expanded={showEndorse}
            className={`min-h-[44px] px-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              action.endorseTargets.length > 0
                ? "bg-[#ECFDF5] text-[#059669]"
                : "text-text-light hover:text-text-muted hover:bg-warm-gray"
            }`}
          >
            <Handshake className="w-4 h-4" />
            <span className="text-xs font-medium">
              Support{action.endorseTargets.length > 0 ? ` (${action.endorseTargets.length})` : ""}
            </span>
          </button>

          {/* Found-a-lab toggle — only for has-compute roles without an existing lab
              and with enough compute to meet the 10u minimum seed. Founding consumes the
              founder's entire current compute pool on success (refunded on failure). */}
          {computeRoles && !ownedLab && (ownComputeStock ?? 0) >= 10 && (
            <button
              onClick={() => onUpdate({
                foundLab: action.foundLab ? undefined : {
                  name: "",
                  seedCompute: ownComputeStock ?? 10,
                  allocation: { deployment: 33, research: 34, safety: 33 },
                },
              })}
              disabled={isSubmitted}
              aria-label="Found a new lab with this action"
              aria-pressed={!!action.foundLab}
              className={`min-h-[44px] px-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                action.foundLab
                  ? "bg-[#EDE9FE] text-[#7C3AED]"
                  : "text-text-light hover:text-text-muted hover:bg-warm-gray"
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span className="text-xs font-medium">Found lab</span>
            </button>
          )}

          {ownedLab && otherLabs && otherLabs.length > 0 && (
            <button
              onClick={() => onUpdate({
                mergeLab: action.mergeLab
                  ? undefined
                  : { absorbedLabId: otherLabs[0].labId, survivorLabId: ownedLab.labId },
              })}
              disabled={isSubmitted}
              aria-label="Propose a merger with another lab"
              aria-pressed={!!action.mergeLab}
              className={`min-h-[44px] px-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                action.mergeLab
                  ? "bg-[#E0F2FE] text-[#0369A1]"
                  : "text-text-light hover:text-text-muted hover:bg-warm-gray"
              }`}
            >
              <GitMerge className="w-4 h-4" />
              <span className="text-xs font-medium">Merge lab</span>
            </button>
          )}

          {/* Compute request toggle — only for has-compute roles with targets */}
          {computeRoles && computeRoles.length > 0 && (
            <button
              onClick={() => { setShowComputeRequest(!showComputeRequest); setShowEndorse(false); }}
              disabled={isSubmitted}
              aria-label="Request compute from other players"
              aria-expanded={showComputeRequest}
              className={`min-h-[44px] px-2.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                action.computeTargets.length > 0
                  ? "bg-[#FFF7ED] text-[#D97706]"
                  : "text-text-light hover:text-text-muted hover:bg-warm-gray"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span className="text-xs font-medium">
                Compute{action.computeTargets.length > 0 ? ` (${action.computeTargets.length})` : ""}
              </span>
            </button>
          )}

          {/* Spacer + submit + remove */}
          <div className="flex-1" />
          {onSubmit && !isSubmitted && (
            <button
              onClick={onSubmit}
              aria-label="Submit this action"
              className={`min-h-[44px] px-3 rounded-lg text-xs font-bold text-white bg-navy hover:bg-navy-light transition-colors flex items-center gap-1.5 ${idleNudge ? "animate-submit-nudge" : ""}`}
            >
              <Send className="w-3.5 h-3.5" /> Submit
            </button>
          )}
          {canRemove && !isSubmitted && (
            <button
              onClick={onRemove}
              aria-label="Remove action"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-light hover:text-viz-danger hover:bg-[#FEF2F2] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {showEndorse && !isSubmitted && (
        <EndorsementPicker
          action={action}
          otherRoles={otherRoles}
          onUpdate={onUpdate}
          onClose={() => setShowEndorse(false)}
        />
      )}

      {showComputeRequest && !isSubmitted && computeRoles && computeRoles.length > 0 && (
        <ComputeRequestPicker
          action={action}
          computeRoles={computeRoles}
          ownComputeStock={ownComputeStock}
          onUpdate={onUpdate}
          onClose={() => setShowComputeRequest(false)}
        />
      )}

      {/* Found-a-lab inline form: full compute pool is staked; founder sets allocation. */}
      {action.foundLab && !isSubmitted && (
        <FoundLabForm
          foundLab={action.foundLab}
          ownComputeStock={ownComputeStock ?? 0}
          onUpdate={(fl) => onUpdate({ foundLab: fl })}
        />
      )}

      {/* Merge-lab inline form */}
      {action.mergeLab && !isSubmitted && ownedLab && otherLabs && (
        <MergeLabForm
          mergeLab={action.mergeLab}
          ownedLab={ownedLab}
          otherLabs={otherLabs}
          onUpdate={(ml) => onUpdate({ mergeLab: ml })}
        />
      )}

      {/* Secret badge */}
      {action.secret && action.text.trim() && (
        <div className="mt-2 text-[10px] text-viz-warning font-bold flex items-center gap-1">
          <EyeOff className="w-3 h-3" /> This action will be hidden from other players
        </div>
      )}
    </div>
  );
}

function EndorsementPicker({
  action,
  otherRoles,
  onUpdate,
  onClose,
}: {
  action: ActionDraft;
  otherRoles: { id: string; name: string }[];
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onClose: () => void;
}) {

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2">Request support from:</p>
      <div className="flex flex-wrap gap-1.5">
        {otherRoles.map((r) => {
          const selected = action.endorseTargets.includes(r.id);
          return (
            <button
              key={r.id}
              onClick={() => {
                if (selected) {
                  onUpdate({ endorseTargets: action.endorseTargets.filter((id) => id !== r.id) });
                } else {
                  onUpdate({ endorseTargets: [...new Set([...action.endorseTargets, r.id])] });
                }
              }}
              className={`text-xs min-h-[44px] px-3 py-1.5 rounded-full font-medium transition-colors duration-200 ${
                selected
                  ? "bg-[#059669] text-white"
                  : "bg-warm-gray text-text-muted hover:bg-border"
              }`}
            >
              {selected && <span className="mr-0.5">✓</span>}
              {r.name}
            </button>
          );
        })}
      </div>
      {action.endorseTargets.length > 0 && (
        <button
          onClick={() => {
            onUpdate({ endorseTargets: [] });
            onClose();
          }}
          className="mt-1.5 text-[11px] text-text-muted hover:text-text flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Clear all and unlock text
        </button>
      )}
    </div>
  );
}

function ComputeRequestPicker({
  action,
  computeRoles,
  onUpdate,
  onClose,
  ownComputeStock,
}: {
  action: ActionDraft;
  computeRoles: { id: string; name: string; computeStock?: number }[];
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onClose: () => void;
  ownComputeStock?: number;
}) {
  const [direction, setDirection] = useState<"send" | "request">("send");
  const [selectedRole, setSelectedRole] = useState("");
  const [amount, setAmount] = useState(1);

  // Cap the input at what's actually available. For send: your own stock.
  // For request: the source role's stock (clamped to the absolute hard-cap of 100u).
  const sourceStock = direction === "send"
    ? ownComputeStock
    : computeRoles.find((r) => r.id === selectedRole)?.computeStock;
  const maxAmount = Math.max(1, Math.min(100, sourceStock ?? 100));

  const addTarget = () => {
    if (!selectedRole || amount <= 0) return;
    const capped = Math.min(amount, maxAmount);
    const existing = action.computeTargets.filter((t) => t.roleId !== selectedRole);
    onUpdate({ computeTargets: [...existing, { roleId: selectedRole, amount: capped, direction }] });
    setSelectedRole("");
    setAmount(1);
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      {/* Direction toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden mb-2">
        <button
          onClick={() => setDirection("send")}
          className={`flex-1 min-h-[36px] text-xs font-bold transition-colors ${
            direction === "send"
              ? "bg-[#D97706] text-white"
              : "bg-warm-gray text-text-muted hover:bg-border"
          }`}
        >
          Send compute
        </button>
        <button
          onClick={() => setDirection("request")}
          className={`flex-1 min-h-[36px] text-xs font-bold transition-colors ${
            direction === "request"
              ? "bg-[#7C3AED] text-white"
              : "bg-warm-gray text-text-muted hover:bg-border"
          }`}
        >
          Request compute
        </button>
      </div>
      <p className="text-[11px] text-text-muted mb-2">
        {direction === "send"
          ? "Send your compute to another player. Deducted now, transferred on success, refunded on failure."
          : "Request compute from another player. They can accept or decline. Transferred on action success."}
      </p>

      {/* Existing targets */}
      {action.computeTargets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {action.computeTargets.map((target) => {
            const role = computeRoles.find((r) => r.id === target.roleId);
            const isSend = target.direction === "send";
            return (
              <span
                key={target.roleId}
                className={`text-xs px-2.5 py-1.5 rounded-full font-medium text-white flex items-center gap-1 ${
                  isSend ? "bg-[#D97706]" : "bg-[#7C3AED]"
                }`}
              >
                <Zap className="w-3 h-3" />
                {isSend ? "Send" : "Request"} {target.amount}u {isSend ? "to" : "from"} {role?.name ?? target.roleId}
                <button
                  onClick={() => onUpdate({ computeTargets: action.computeTargets.filter((t) => t.roleId !== target.roleId) })}
                  className="ml-0.5 hover:bg-white/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Add new target */}
      <div className="flex items-center gap-2">
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="flex-1 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text"
        >
          <option value="">{direction === "send" ? "Choose recipient..." : "Choose source..."}</option>
          {computeRoles
            .filter((r) => !action.computeTargets.some((t) => t.roleId === r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.computeStock != null ? ` (${r.computeStock}u)` : ""}</option>
            ))}
        </select>
        <input
          type="number"
          min={1}
          max={maxAmount}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.min(maxAmount, parseInt(e.target.value) || 1)))}
          className="w-16 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text font-mono text-center"
          placeholder="u"
        />
        <button
          onClick={addTarget}
          disabled={!selectedRole}
          className={`min-h-[44px] px-3 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-default ${
            direction === "send"
              ? "bg-[#D97706] hover:bg-[#B45309]"
              : "bg-[#7C3AED] hover:bg-[#6D28D9]"
          }`}
        >
          Add
        </button>
      </div>

      {action.computeTargets.length > 0 && (
        <button
          onClick={() => { onUpdate({ computeTargets: [] }); onClose(); }}
          className="mt-1.5 text-[11px] text-text-muted hover:text-text flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Clear all
        </button>
      )}
    </div>
  );
}

function FoundLabForm({
  foundLab,
  ownComputeStock,
  onUpdate,
}: {
  foundLab: NonNullable<ActionDraft["foundLab"]>;
  ownComputeStock: number;
  onUpdate: (fl: NonNullable<ActionDraft["foundLab"]>) => void;
}) {
  // The founder always stakes their full current compute pool. Keep the form's
  // seedCompute synced to the current stock so the value reflects anything that
  // changes between toggling and submitting.
  useEffect(() => {
    if (ownComputeStock > 0 && foundLab.seedCompute !== ownComputeStock) {
      onUpdate({ ...foundLab, seedCompute: ownComputeStock });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownComputeStock]);

  const alloc = foundLab.allocation ?? { deployment: 33, research: 34, safety: 33 };
  const setAlloc = (patch: Partial<typeof alloc>) => {
    onUpdate({ ...foundLab, allocation: { ...alloc, ...patch } });
  };
  const total = alloc.deployment + alloc.research + alloc.safety;

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2 flex items-center gap-1">
        <FlaskConical className="w-3 h-3 text-[#7C3AED]" />
        New lab staked with your full compute pool ({ownComputeStock}u). Refunded on failure.
      </p>
      <input
        type="text"
        value={foundLab.name}
        onChange={(e) => onUpdate({ ...foundLab, name: e.target.value })}
        placeholder="Lab name"
        maxLength={60}
        className="w-full min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text mb-2"
      />
      <textarea
        value={foundLab.spec ?? ""}
        onChange={(e) => onUpdate({ ...foundLab, spec: e.target.value || undefined })}
        placeholder="Lab spec / mission (optional)"
        maxLength={500}
        rows={2}
        className="w-full rounded-lg border border-border bg-warm-gray px-2 py-1 text-xs text-text resize-none mb-2"
      />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-muted">Initial allocation</span>
        <span className={`text-[10px] font-mono ${total === 100 ? "text-text-muted" : "text-viz-danger"}`}>
          {total}% {total !== 100 ? "(must total 100)" : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {(["deployment", "research", "safety"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <label className="text-[11px] text-text-muted capitalize w-20 shrink-0">{k}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={alloc[k]}
              onChange={(e) => setAlloc({ [k]: parseInt(e.target.value) || 0 })}
              className="flex-1"
            />
            <span className="text-[11px] font-mono w-10 text-right">{alloc[k]}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MergeLabForm({
  mergeLab,
  ownedLab,
  otherLabs,
  onUpdate,
}: {
  mergeLab: NonNullable<ActionDraft["mergeLab"]>;
  ownedLab: LabRef;
  otherLabs: LabRef[];
  onUpdate: (ml: ActionDraft["mergeLab"]) => void;
}) {
  const counterpartyId = mergeLab.absorbedLabId === ownedLab.labId
    ? mergeLab.survivorLabId
    : mergeLab.absorbedLabId;
  const submitterIsSurvivor = mergeLab.survivorLabId === ownedLab.labId;

  const setCounterparty = (newLabId: Id<"labs">) => {
    onUpdate({
      ...mergeLab,
      absorbedLabId: submitterIsSurvivor ? newLabId : ownedLab.labId,
      survivorLabId: submitterIsSurvivor ? ownedLab.labId : newLabId,
    });
  };

  const setSurvivor = (side: "mine" | "theirs") => {
    const theirId = counterpartyId;
    onUpdate({
      ...mergeLab,
      absorbedLabId: side === "mine" ? theirId : ownedLab.labId,
      survivorLabId: side === "mine" ? ownedLab.labId : theirId,
    });
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2 flex items-center gap-1">
        <GitMerge className="w-3 h-3 text-[#0369A1]" />
        Merger: the absorbed lab is decommissioned and its compute flows to the survivor owner.
      </p>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-text-muted shrink-0 w-24">Other lab:</label>
        <select
          value={counterpartyId}
          onChange={(e) => setCounterparty(e.target.value as Id<"labs">)}
          className="flex-1 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text"
        >
          {otherLabs.map((l) => (
            <option key={l.labId} value={l.labId}>{l.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-text-muted shrink-0 w-24">Survivor:</label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setSurvivor("mine")}
            className={`min-h-[36px] px-3 text-xs font-bold transition-colors ${
              submitterIsSurvivor ? "bg-[#0369A1] text-white" : "bg-warm-gray text-text-muted hover:bg-border"
            }`}
          >
            My lab ({ownedLab.name})
          </button>
          <button
            onClick={() => setSurvivor("theirs")}
            className={`min-h-[36px] px-3 text-xs font-bold transition-colors ${
              !submitterIsSurvivor ? "bg-[#0369A1] text-white" : "bg-warm-gray text-text-muted hover:bg-border"
            }`}
          >
            Their lab
          </button>
        </div>
      </div>
      <input
        type="text"
        value={mergeLab.newName ?? ""}
        onChange={(e) => onUpdate({ ...mergeLab, newName: e.target.value || undefined })}
        placeholder="New name for the merged lab (optional)"
        maxLength={60}
        className="w-full min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text mb-2"
      />
      <textarea
        value={mergeLab.newSpec ?? ""}
        onChange={(e) => onUpdate({ ...mergeLab, newSpec: e.target.value || undefined })}
        placeholder="New AI directive / spec for the merged lab (optional)"
        maxLength={500}
        rows={2}
        className="w-full rounded-lg border border-border bg-warm-gray px-2 py-1 text-xs text-text resize-none"
      />
    </div>
  );
}

function ReorderBar({ index, onMoveUp, onMoveDown }: { index: number; onMoveUp?: () => void; onMoveDown?: () => void }) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <GripVertical className="w-3.5 h-3.5 text-text-muted/40" />
      <span className="text-[11px] font-bold text-text-muted font-mono w-4">#{index + 1}</span>
      <div className="flex gap-0.5">
        {onMoveUp && (
          <button onClick={onMoveUp} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-text-muted hover:bg-warm-gray transition-colors" aria-label="Move up">
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
        {onMoveDown && (
          <button onClick={onMoveDown} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-text-muted hover:bg-warm-gray transition-colors" aria-label="Move down">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export { emptyAction };
