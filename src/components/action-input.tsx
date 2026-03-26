"use client";

import { useState } from "react";
import { ROLES } from "@/lib/game-data";
import { EyeOff, Eye, Handshake, Trash2, Plus, X } from "lucide-react";

export type PriorityLevel = "low" | "medium" | "high";

export interface ActionDraft {
  text: string;
  priority: PriorityLevel;
  secret: boolean;
  endorseTargets: string[]; // roleIds
}

const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  low: "bg-warm-gray text-text-muted",
  medium: "bg-navy/10 text-navy",
  high: "bg-navy text-white",
};

export function priorityToNumber(p: PriorityLevel): number {
  return p === "high" ? 5 : p === "medium" ? 3 : 2;
}

export function normaliseActions(actions: ActionDraft[]): { text: string; priority: number; secret?: boolean }[] {
  const filled = actions.filter((a) => a.text.trim());
  const rawPriorities = filled.map((a) => priorityToNumber(a.priority));
  const total = rawPriorities.reduce((s, p) => s + p, 0);

  if (total <= 10) {
    return filled.map((a, i) => ({
      text: a.text.trim(),
      priority: rawPriorities[i],
      secret: a.secret || undefined,
    }));
  }

  // Scale down proportionally
  const scale = 10 / total;
  return filled.map((a, i) => ({
    text: a.text.trim(),
    priority: Math.max(1, Math.round(rawPriorities[i] * scale)),
    secret: a.secret || undefined,
  }));
}

function emptyAction(): ActionDraft {
  return { text: "", priority: "medium", secret: false, endorseTargets: [] };
}

interface Props {
  actions: ActionDraft[];
  onChange: (actions: ActionDraft[]) => void;
  roleId: string;
  roleName: string;
  enabledRoles?: { id: string; name: string }[];
  isSubmitted: boolean;
  onSendRequest?: (targetRoleId: string, targetRoleName: string, actionText: string) => void;
  onCancelRequest?: (targetRoleId: string, actionText: string) => void;
}

export function ActionInput({ actions, onChange, roleId, enabledRoles, isSubmitted, onSendRequest, onCancelRequest }: Props) {
  const otherRoles = (enabledRoles ?? ROLES.filter((r) => r.id !== roleId)).filter((r) => typeof r === "object" && "id" in r ? r.id !== roleId : true);

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
        {filledCount > 0 && (
          <span className="text-[11px] text-text-muted font-mono">
            max 5 actions
          </span>
        )}
      </div>

      <div className="space-y-3">
        {actions.map((action, i) => (
          <ActionCard
            key={i}
            action={action}
            index={i}
            onUpdate={(patch) => updateAction(i, patch)}
            onRemove={() => removeAction(i)}
            otherRoles={otherRoles}
            isSubmitted={isSubmitted}
            onSendRequest={onSendRequest}
            onCancelRequest={onCancelRequest}
            canRemove={actions.length > 1 || action.text.trim() !== ""}
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
  onUpdate,
  onRemove,
  otherRoles,
  isSubmitted,
  canRemove,
  onSendRequest,
  onCancelRequest,
}: {
  action: ActionDraft;
  index: number;
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
  otherRoles: { id: string; name: string }[];
  isSubmitted: boolean;
  canRemove: boolean;
  onSendRequest?: (targetRoleId: string, targetRoleName: string, actionText: string) => void;
  onCancelRequest?: (targetRoleId: string, actionText: string) => void;
}) {
  const [showEndorse, setShowEndorse] = useState(false);

  return (
    <div className={`bg-white rounded-xl border p-4 ${action.secret ? "border-viz-warning/40" : "border-border"}`}>
      {/* Text input */}
      <textarea
        value={action.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder={index === 0 ? "What does your actor do this quarter?" : "Add another action..."}
        rows={2}
        disabled={isSubmitted}
        spellCheck={false}
        className="w-full bg-transparent text-sm text-text resize-none outline-none placeholder:text-text-muted/50 mb-2"
      />

      {/* Controls row — only show when there's text */}
      {(action.text.trim() || isSubmitted) && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["low", "medium", "high"] as PriorityLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => onUpdate({ priority: level })}
                disabled={isSubmitted}
                className={`px-2.5 py-1 text-[11px] font-bold capitalize transition-colors ${
                  action.priority === level
                    ? PRIORITY_COLORS[level]
                    : "bg-white text-text-muted hover:bg-warm-gray"
                } disabled:opacity-60`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Secret toggle */}
          <button
            onClick={() => onUpdate({ secret: !action.secret })}
            disabled={isSubmitted}
            className={`p-1.5 rounded-lg transition-colors ${
              action.secret
                ? "bg-[#FFF7ED] text-viz-warning"
                : "text-text-light hover:text-text-muted hover:bg-warm-gray"
            }`}
            title={action.secret ? "Secret — hidden from others" : "Make secret"}
          >
            {action.secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Endorsement toggle */}
          <button
            onClick={() => setShowEndorse(!showEndorse)}
            disabled={isSubmitted}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
              action.endorseTargets.length > 0
                ? "bg-[#ECFDF5] text-[#059669]"
                : "text-text-light hover:text-text-muted hover:bg-warm-gray"
            }`}
            title="Request support from other players"
          >
            <Handshake className="w-4 h-4" />
            {action.endorseTargets.length > 0 && (
              <span className="text-[10px] font-bold">{action.endorseTargets.length}</span>
            )}
          </button>

          {/* Spacer + remove */}
          <div className="flex-1" />
          {canRemove && !isSubmitted && (
            <button
              onClick={onRemove}
              className="p-1.5 rounded-lg text-text-light hover:text-viz-danger hover:bg-[#FEF2F2] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Endorsement targets — inline multi-select */}
      {showEndorse && !isSubmitted && (
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
                      // Cancel the request so it disappears for the target
                      if (onCancelRequest && action.text.trim()) {
                        onCancelRequest(r.id, action.text.trim());
                      }
                    } else {
                      onUpdate({ endorseTargets: [...action.endorseTargets, r.id] });
                      // Send request immediately so target sees it while still writing
                      if (onSendRequest && action.text.trim()) {
                        onSendRequest(r.id, r.name, action.text.trim());
                      }
                    }
                  }}
                  className={`text-[11px] px-2 py-1 rounded-full font-medium transition-colors ${
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
                setShowEndorse(false);
              }}
              className="mt-1.5 text-[11px] text-text-muted hover:text-text flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
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

export { emptyAction };
