"use client";

import type { Id } from "@convex/_generated/dataModel";
import { isLabCeo, isLabSafety, hasCompute, type Role } from "@/lib/game-data";
import { DispositionChooser } from "@/components/table/table-lobby";
import { DispositionBadge } from "@/components/table/disposition-badge";
import { LabSpecsPanel } from "@/components/table/lab-specs-panel";
import { LabSpecEditor } from "@/components/table/lab-spec-editor";
import { type ActionDraft } from "@/components/action-input";
import { ActionInput } from "@/components/action-input";
import { SubmittedActionCard } from "@/components/table/submitted-action-card";
import { ComputeAllocation } from "@/components/compute-allocation";
import { LabAllocationReadOnly } from "@/components/lab-allocation-readonly";

import type { SampleAction } from "@/lib/sample-actions";
import {
  Send,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  EyeOff,
  Lightbulb,
} from "lucide-react";

// ─── Submit phase props ──────────────────────────────────────────────────────

export interface TableSubmitProps {
  game: {
    currentRound: number;
    phase: string;
    labs: { name: string; roleId: string; spec?: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];
  };
  role: Role;
  tableId: Id<"tables">;
  aiDisposition: string | undefined;
  computeStock: number;
  submittedActions: { text: string; priority: number; secret?: boolean; probability?: number; actionStatus?: string }[];
  timerDisplay: string;
  // Form state (local drafts — not yet submitted)
  actionDrafts: ActionDraft[];
  onActionDraftsChange: (drafts: ActionDraft[]) => void;
  computeAllocation: { users: number; capability: number; safety: number };
  onComputeAllocationChange: (alloc: { users: number; capability: number; safety: number }) => void;
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
  enabledRoles: { id: string; name: string }[];
  onSubmitAction: (index: number) => void;
  onEditAction: (actionIndex: number) => void;
  onDeleteAction: (actionIndex: number) => void;
  isExpired?: boolean;
  submitError: string;
  // Suggestions
  shownSuggestions: SampleAction[];
  ideasOpen: boolean;
  onIdeasOpenChange: (open: boolean) => void;
  onSuggestionTap: (suggestion: SampleAction) => void;
}

export function TableSubmit({
  game,
  role,
  tableId,
  aiDisposition,
  computeStock,
  submittedActions,
  timerDisplay,
  actionDrafts,
  onActionDraftsChange,
  computeAllocation,
  onComputeAllocationChange,
  labSpec,
  onLabSpecChange,
  specSaved,
  onSaveSpec,
  enabledRoles,
  isExpired,
  onSubmitAction,
  onEditAction,
  onDeleteAction,
  submitError,
  shownSuggestions,
  ideasOpen,
  onIdeasOpenChange,
  onSuggestionTap,
}: TableSubmitProps) {
  const submittedList = submittedActions.filter(
    (a) => a.actionStatus === "submitted" || (!a.actionStatus && a.text)
  );
  const canEdit = game.phase === "submit" && !isExpired;
  const totalActions = submittedList.length + actionDrafts.filter((a) => a.text.trim()).length;

  return (
    <>
      {/* Phase transition banner */}
      <div className="bg-navy text-white rounded-xl p-3 mb-4 flex items-center gap-2">
        <Send className="w-4 h-4 shrink-0" />
        <span className="text-sm font-bold">Submissions are open!</span>
        <div className="ml-auto flex items-center gap-3">
          {submittedList.length > 0 && (
            <span className="text-xs text-viz-safety font-mono">{submittedList.length} submitted</span>
          )}
          <span className="text-xs text-text-light">{timerDisplay}</span>
        </div>
      </div>

      {/* AI Systems disposition — chooser if not yet picked, badge if locked */}
      {role.tags.includes("ai-system") && !aiDisposition && (
        <DispositionChooser tableId={tableId} onChosen={() => {}} />
      )}
      {role.tags.includes("ai-system") && aiDisposition && (
        <DispositionBadge disposition={aiDisposition} className="mb-4" />
      )}

      {/* Lab Specs — AI Systems player sees all labs */}
      {role.tags.includes("ai-system") && (
        <div className="mb-4">
          <LabSpecsPanel labs={game.labs} />
        </div>
      )}

      {/* Lab spec editor — CEO can write the AI spec */}
      {isLabCeo(role) && (
        <LabSpecEditor
          labSpec={labSpec}
          onLabSpecChange={onLabSpecChange}
          specSaved={specSaved}
          onSaveSpec={onSaveSpec}
        />
      )}

      {/* Compute allocation for lab CEO roles */}
      {isLabCeo(role) && (
        <ComputeAllocation
          allocation={computeAllocation}
          onChange={onComputeAllocationChange}
          isSubmitted={false}
          roleName={role.name}
        />
      )}

      {/* Read-only lab allocation for safety leads */}
      {isLabSafety(role) && role.labId && (
        <LabAllocationReadOnly labId={role.labId} labs={game.labs} />
      )}

      {/* Compute for non-lab roles shown as info */}
      {hasCompute(role) && !isLabCeo(role) && computeStock > 0 && (
        <div className="bg-white rounded-xl border border-border p-4 mb-4">
          <h3 className="text-sm font-bold text-text mb-1">Compute Resources</h3>
          <p className="text-[11px] text-text-muted">
            You have {computeStock}u of compute. Other players can request it via the support request system on their actions.
          </p>
        </div>
      )}

      {/* ─── Submitted actions ─── */}
      {submittedList.length > 0 && (
        <div className="space-y-3 mb-4">
          {submittedList.map((a, i) => (
            <SubmittedActionCard
              key={`submitted-${i}`}
              action={a}
              index={i}
              canEdit={canEdit}
              onEdit={() => onEditAction(i)}
              onDelete={() => onDeleteAction(i)}
            />
          ))}
        </div>
      )}

      {/* ─── Draft actions (local, not yet submitted) ─── */}
      {canEdit && totalActions < 5 && (
        <div className="mb-4">
          <ActionInput
            actions={actionDrafts}
            onChange={onActionDraftsChange}
            roleId={role.id}
            roleName={role.name}
            enabledRoles={enabledRoles}
            isSubmitted={false}
            onSubmitAction={onSubmitAction}
          />

          {/* Nudge if CEO writes allocation changes as actions */}
          {isLabCeo(role) && actionDrafts.some((a) =>
            /\b(compute.*allocat|allocat.*compute|shift.*compute|redirect.*compute|\d+%.*\d+%.*\d+%|users.*capability.*safety)\b/i.test(a.text)
          ) && (
            <div className="flex items-start gap-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-lg p-2.5 mt-2">
              <AlertTriangle className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
              <p className="text-xs text-[#C2410C]">
                It looks like you&apos;re describing a compute allocation change. Use the <strong>sliders above</strong> instead — allocation is a standing decision, not an action that needs to succeed a dice roll.
              </p>
            </div>
          )}

          <SuggestionPanel
            suggestions={shownSuggestions}
            ideasOpen={ideasOpen}
            onIdeasOpenChange={onIdeasOpenChange}
            onSuggestionTap={onSuggestionTap}
          />
        </div>
      )}

      {submitError && <p className="text-xs text-viz-danger mt-2 text-center">{submitError}</p>}
    </>
  );
}

// ─── Suggestion panel ───────────────────────────────────────────────────────

function SuggestionPanel({
  suggestions,
  ideasOpen,
  onIdeasOpenChange,
  onSuggestionTap,
}: {
  suggestions: SampleAction[];
  ideasOpen: boolean;
  onIdeasOpenChange: (open: boolean) => void;
  onSuggestionTap: (s: SampleAction) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl overflow-hidden">
      <button
        onClick={() => onIdeasOpenChange(!ideasOpen)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Lightbulb className="w-4 h-4 text-[#2563EB] shrink-0" />
        <span className="text-sm font-semibold text-[#1D4ED8]">Need ideas?</span>
        {ideasOpen ? (
          <ChevronUp className="w-4 h-4 text-[#2563EB] ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#2563EB] ml-auto" />
        )}
      </button>
      {ideasOpen && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-[#3B82F6]">Tap a suggestion to add it as an action</p>
          {suggestions.map((s, i) => (
            <button
              key={`suggestion-${i}`}
              onClick={() => onSuggestionTap(s)}
              className="w-full text-left bg-white rounded-lg p-3 border border-[#DBEAFE] hover:border-[#93C5FD] transition-colors"
            >
              <p className="text-sm text-text leading-snug">{s.text}</p>
              {s.secret && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-viz-warning font-medium flex items-center gap-0.5">
                    <EyeOff className="w-3 h-3" /> Secret
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lab spec editor sub-component ───────────────────────────────────────────

