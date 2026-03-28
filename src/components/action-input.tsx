"use client";

import { useState } from "react";
import { ROLES, PRIORITY_DECAY, suggestEndorsements } from "@/lib/game-data";
import { EyeOff, Eye, Handshake, Trash2, Plus, X } from "lucide-react";


export type PriorityLevel = "low" | "medium" | "high";

export interface ActionDraft {
  text: string;
  priority: PriorityLevel;
  secret: boolean;
  endorseTargets: string[]; // roleIds
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
  const decay = PRIORITY_DECAY[filledCount] ?? PRIORITY_DECAY[5];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text">
          Your Actions ({filledCount})
        </h3>
        {filledCount > 0 && (
          <span className="text-[11px] text-text-muted font-mono">
            #1 = highest priority
          </span>
        )}
      </div>

      <div className="space-y-3">
        {actions.map((action, i) => (
          <ActionCard
            key={i}
            action={action}
            index={i}
            decayPriority={action.text.trim() && decay ? decay[actions.slice(0, i).filter((a) => a.text.trim()).length] : undefined}
            ownRoleId={roleId}
            onUpdate={(patch) => updateAction(i, patch)}
            onRemove={() => removeAction(i)}
            otherRoles={otherRoles}
            isSubmitted={isSubmitted}
            onSendRequest={onSendRequest}
            onCancelRequest={onCancelRequest}
            canRemove={actions.length > 1 || action.text.trim() !== ""}
            onAddNext={actions.length < 5 && !isSubmitted ? addAction : undefined}
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
  decayPriority,
  ownRoleId,
  onUpdate,
  onRemove,
  otherRoles,
  isSubmitted,
  canRemove,
  onSendRequest,
  onCancelRequest,
  onAddNext,
}: {
  action: ActionDraft;
  index: number;
  decayPriority?: number;
  ownRoleId?: string;
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
  otherRoles: { id: string; name: string }[];
  isSubmitted: boolean;
  canRemove: boolean;
  onSendRequest?: (targetRoleId: string, targetRoleName: string, actionText: string) => void;
  onCancelRequest?: (targetRoleId: string, actionText: string) => void;
  onAddNext?: () => void;
}) {
  const [showEndorse, setShowEndorse] = useState(false);

  // Suggest endorsement targets based on action text keywords
  const activeRoleIds = otherRoles.map((r) => r.id);
  const suggestions = action.text.trim().length > 20 && action.endorseTargets.length === 0 && !isSubmitted
    ? suggestEndorsements(action.text, ownRoleId ?? "", activeRoleIds)
    : [];

  return (
    <div className={`bg-white rounded-xl border p-4 ${action.secret ? "border-viz-warning/40" : "border-border"}`}>
      {/* Text input */}
      <textarea
        value={action.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (action.text.trim() && onAddNext) onAddNext();
          }
        }}
        placeholder={index === 0 ? "I do [action] so that [intended outcome]..." : "I do [action] so that [intended outcome]..."}
        rows={2}
        disabled={isSubmitted}
        spellCheck={false}
        className="w-full bg-transparent text-sm text-text resize-none outline-none placeholder:text-text-muted/50 mb-2"
      />

      {/* Controls row — only show when there's text */}
      {(action.text.trim() || isSubmitted) && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-decay priority indicator */}
          {decayPriority != null && (
            <span className="min-h-[44px] px-3 flex items-center text-xs font-bold font-mono bg-navy/10 text-navy rounded-lg">
              Priority: {decayPriority}/10
            </span>
          )}

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
            onClick={() => setShowEndorse(!showEndorse)}
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

          {/* Spacer + remove */}
          <div className="flex-1" />
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
                  className={`text-xs min-h-[36px] px-3 py-1.5 rounded-full font-medium transition-colors ${
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

      {/* Endorsement suggestions — keyword-matched chips */}
      {suggestions.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-muted">Ask for support?</span>
          {suggestions.map((roleId) => {
            const role = otherRoles.find((r) => r.id === roleId);
            if (!role) return null;
            return (
              <button
                key={roleId}
                onClick={() => onUpdate({ endorseTargets: [...action.endorseTargets, roleId] })}
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

export { emptyAction };
