"use client";

import { useState } from "react";
import { ROLES, AI_SYSTEMS_ROLE_ID, PRIORITY_DECAY, suggestEndorsements } from "@/lib/game-data";
import { EyeOff, Eye, Handshake, Trash2, Plus, X, ChevronUp, ChevronDown, GripVertical, Send, Zap } from "lucide-react";


export type PriorityLevel = "low" | "medium" | "high";

export interface ComputeTarget {
  roleId: string;
  amount: number;
}

export interface ActionDraft {
  text: string;
  priority: PriorityLevel;
  secret: boolean;
  endorseTargets: string[]; // roleIds
  computeTargets: ComputeTarget[];
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

interface Props {
  actions: ActionDraft[];
  onChange: (actions: ActionDraft[]) => void;
  roleId: string;
  roleName: string;
  enabledRoles?: { id: string; name: string }[];
  /** Roles that can be asked for compute (has-compute tag, excluding self) */
  computeRoles?: { id: string; name: string }[];
  isSubmitted: boolean;
  onSubmitAction?: (index: number) => void;
}

export function ActionInput({ actions, onChange, roleId, enabledRoles, computeRoles, isSubmitted, onSubmitAction }: Props) {
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text">
          Your Actions ({filledCount})
        </h3>
        {filledCount > 1 && (
          <span className="text-[11px] text-text-muted">
            Drag to reorder — top = highest priority
          </span>
        )}
      </div>

      <div className="space-y-3">
        {actions.map((action, i) => (
          <ActionCard
            key={`action-${i}`}
            action={action}
            index={i}
            totalActions={filledCount}
            ownRoleId={roleId}
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
  ownRoleId,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  otherRoles,
  computeRoles,
  isSubmitted,
  canRemove,
  onAddNext,
  onSubmit,
}: {
  action: ActionDraft;
  index: number;
  totalActions: number;
  ownRoleId?: string;
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  otherRoles: { id: string; name: string }[];
  computeRoles?: { id: string; name: string }[];
  isSubmitted: boolean;
  canRemove: boolean;
  onAddNext?: () => void;
  onSubmit?: () => void;
}) {
  const [showEndorse, setShowEndorse] = useState(false);
  const [showComputeRequest, setShowComputeRequest] = useState(false);

  // Suggest endorsement targets based on action text keywords
  const activeRoleIds = otherRoles.map((r) => r.id);
  const suggestions = action.text.trim().length > 20 && action.endorseTargets.length === 0 && !isSubmitted
    ? suggestEndorsements(action.text, ownRoleId ?? "", activeRoleIds)
    : [];

  return (
    <div className={`bg-white rounded-xl border p-4 ${action.secret ? "border-viz-warning/40" : action.endorseTargets.length > 0 ? "border-[#059669]/30" : "border-border"}`}>
      {action.text.trim() && totalActions > 1 && (
        <ReorderBar index={index} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
      )}

      <textarea
        value={action.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
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
              className="min-h-[44px] px-3 rounded-lg text-xs font-bold text-white bg-navy hover:bg-navy-light transition-colors flex items-center gap-1.5"
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
          onUpdate={onUpdate}
          onClose={() => setShowComputeRequest(false)}
        />
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-muted">Ask for support?</span>
          {suggestions.map((roleId) => {
            const role = otherRoles.find((r) => r.id === roleId);
            if (!role) return null;
            return (
              <button
                key={roleId}
                onClick={() => onUpdate({ endorseTargets: [...new Set([...action.endorseTargets, roleId])] })}
                className="text-[11px] px-2 py-1 bg-[#ECFDF5] text-[#059669] rounded-full font-medium hover:bg-[#D1FAE5] transition-colors flex items-center gap-1"
              >
                <Handshake className="w-3 h-3" />
                {role.name}
              </button>
            );
          })}
        </div>
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
}: {
  action: ActionDraft;
  computeRoles: { id: string; name: string }[];
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onClose: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState("");
  const [amount, setAmount] = useState(1);

  const addTarget = () => {
    if (!selectedRole || amount <= 0) return;
    // Replace existing target for same role, or add new
    const existing = action.computeTargets.filter((t) => t.roleId !== selectedRole);
    onUpdate({ computeTargets: [...existing, { roleId: selectedRole, amount }] });
    setSelectedRole("");
    setAmount(1);
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2">Request compute from:</p>

      {/* Existing targets */}
      {action.computeTargets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {action.computeTargets.map((target) => {
            const role = computeRoles.find((r) => r.id === target.roleId);
            return (
              <span
                key={target.roleId}
                className="text-xs px-2.5 py-1.5 rounded-full font-medium bg-[#D97706] text-white flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                {role?.name ?? target.roleId}: {target.amount}u
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
          <option value="">Choose player...</option>
          {computeRoles
            .filter((r) => !action.computeTargets.some((t) => t.roleId === r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
        </select>
        <input
          type="number"
          min={1}
          max={10}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          className="w-16 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text font-mono text-center"
          placeholder="u"
        />
        <button
          onClick={addTarget}
          disabled={!selectedRole}
          className="min-h-[44px] px-3 rounded-lg text-xs font-bold text-white bg-[#D97706] hover:bg-[#B45309] transition-colors disabled:opacity-50 disabled:cursor-default"
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
