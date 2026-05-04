"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ROLES, AI_SYSTEMS_ROLE_ID, PRIORITY_DECAY, DEFAULT_LAB_ALLOCATION } from "@/lib/game-data";
import { EyeOff, Eye, Handshake, Trash2, Plus, ChevronUp, ChevronDown, GripVertical, Send, Zap, FlaskConical, GitMerge } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import {
  EndorsementPicker,
  ComputeRequestPicker,
  FoundLabForm,
  MergeLabForm,
} from "./action-input-pickers";


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

      {/* Controls row — always rendered for discoverability. Disabled until text is
          entered so staged config can't be silently dropped by normaliseActions on submit. */}
      <ActionControlsRow
        action={action}
        isSubmitted={isSubmitted}
        isFirstCard={index === 0}
        canRemove={canRemove}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onSubmit={onSubmit}
        showEndorse={showEndorse}
        setShowEndorse={setShowEndorse}
        showComputeRequest={showComputeRequest}
        setShowComputeRequest={setShowComputeRequest}
        computeRoles={computeRoles}
        ownComputeStock={ownComputeStock}
        ownedLab={ownedLab}
        otherLabs={otherLabs}
        idleNudge={idleNudge}
      />

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

/** Shared chip-style toggle used by every button in ActionControlsRow.
 *  Centralises the disabled + min-touch-target styling so new toggles can't
 *  forget either. */
function ToggleButton({
  icon,
  label,
  active,
  activeClass,
  disabled,
  onClick,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
}: {
  icon: ReactNode;
  label: ReactNode;
  active: boolean;
  activeClass: string;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  ariaPressed?: boolean;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      className={`min-h-[44px] px-2.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
        active ? activeClass : "text-text-light hover:text-text-muted hover:bg-warm-gray"
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

/** Toggle row beneath the textarea — secret, endorse, found lab, merge lab,
 *  compute request, submit, remove. Conditional buttons depend on role
 *  capabilities (compute holders, lab owners). Pulled out of ActionCard to
 *  keep that component within the complexity budget. */
function ActionControlsRow({
  action,
  isSubmitted,
  isFirstCard,
  canRemove,
  onUpdate,
  onRemove,
  onSubmit,
  showEndorse,
  setShowEndorse,
  showComputeRequest,
  setShowComputeRequest,
  computeRoles,
  ownComputeStock,
  ownedLab,
  otherLabs,
  idleNudge,
}: {
  action: ActionDraft;
  isSubmitted: boolean;
  isFirstCard: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
  onSubmit?: () => void;
  showEndorse: boolean;
  setShowEndorse: (v: boolean) => void;
  showComputeRequest: boolean;
  setShowComputeRequest: (v: boolean) => void;
  computeRoles?: { id: string; name: string; computeStock?: number }[];
  ownComputeStock?: number;
  ownedLab?: LabRef;
  otherLabs?: LabRef[];
  idleNudge: boolean;
}) {
  const isEmpty = !action.text.trim() && !isSubmitted;
  const lockedOut = isSubmitted || isEmpty;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <ToggleButton
          icon={action.secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          label={action.secret ? "Secret" : "Visible"}
          active={action.secret}
          activeClass="bg-[#FFF7ED] text-viz-warning"
          disabled={lockedOut}
          onClick={() => onUpdate({ secret: !action.secret })}
          ariaLabel={action.secret ? "Secret — hidden from others" : "Make secret"}
          ariaPressed={action.secret}
        />

        <ToggleButton
          icon={<Handshake className="w-4 h-4" />}
          label={`Support${action.endorseTargets.length > 0 ? ` (${action.endorseTargets.length})` : ""}`}
          active={action.endorseTargets.length > 0}
          activeClass="bg-[#ECFDF5] text-[#059669]"
          disabled={lockedOut}
          onClick={() => { setShowEndorse(!showEndorse); setShowComputeRequest(false); }}
          ariaLabel="Request support from other players"
          ariaExpanded={showEndorse}
        />

        {/* Found-a-lab toggle — only for has-compute roles without an existing lab
            and with enough compute to meet the 10u minimum seed. Founding consumes the
            founder's entire current compute pool on success (refunded on failure). */}
        {computeRoles && !ownedLab && (ownComputeStock ?? 0) >= 10 && (
          <ToggleButton
            icon={<FlaskConical className="w-4 h-4" />}
            label="Found lab"
            active={!!action.foundLab}
            activeClass="bg-[#EDE9FE] text-[#7C3AED]"
            disabled={lockedOut}
            onClick={() => onUpdate({
              foundLab: action.foundLab ? undefined : {
                name: "",
                seedCompute: ownComputeStock ?? 10,
                allocation: { ...DEFAULT_LAB_ALLOCATION },
              },
            })}
            ariaLabel="Found a new lab with this action"
            ariaPressed={!!action.foundLab}
          />
        )}

        {ownedLab && otherLabs && otherLabs.length > 0 && (
          <ToggleButton
            icon={<GitMerge className="w-4 h-4" />}
            label="Merge lab"
            active={!!action.mergeLab}
            activeClass="bg-[#E0F2FE] text-[#0369A1]"
            disabled={lockedOut}
            onClick={() => onUpdate({
              mergeLab: action.mergeLab
                ? undefined
                : { absorbedLabId: otherLabs[0].labId, survivorLabId: ownedLab.labId },
            })}
            ariaLabel="Propose a merger with another lab"
            ariaPressed={!!action.mergeLab}
          />
        )}

        {computeRoles && computeRoles.length > 0 && (
          <ToggleButton
            icon={<Zap className="w-4 h-4" />}
            label={`Compute${action.computeTargets.length > 0 ? ` (${action.computeTargets.length})` : ""}`}
            active={action.computeTargets.length > 0}
            activeClass="bg-[#FFF7ED] text-[#D97706]"
            disabled={lockedOut}
            onClick={() => { setShowComputeRequest(!showComputeRequest); setShowEndorse(false); }}
            ariaLabel="Request compute from other players"
            ariaExpanded={showComputeRequest}
          />
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
      {isFirstCard && isEmpty && (
        <p className="text-[11px] text-text-muted mt-1.5">
          Type your action to enable these options.
        </p>
      )}
    </>
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
