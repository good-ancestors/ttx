"use client";

import { type Role } from "@/lib/game-data";
import { type ActionDraft } from "@/components/action-input";
import { ActionInput } from "@/components/action-input";
import { SubmittedActionCard } from "@/components/table/submitted-action-card";

import type { SampleAction } from "@/lib/sample-actions";
import {
  Send,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Lightbulb,
} from "lucide-react";

// ─── Submit phase props ──────────────────────────────────────────────────────

interface TableSubmitProps {
  game: {
    currentRound: number;
    phase: string;
  };
  role: Role;
  submittedActions: {
    text: string;
    priority: number;
    secret?: boolean;
    probability?: number;
    actionStatus?: string;
  }[];
  isExpired?: boolean;
  // Form state (local drafts — not yet submitted)
  actionDrafts: ActionDraft[];
  onActionDraftsChange: (drafts: ActionDraft[]) => void;
  enabledRoles: { id: string; name: string }[];
  onSubmitAction: (index: number) => void;
  onEditAction: (actionIndex: number) => void;
  onDeleteAction: (actionIndex: number) => void;
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
  submittedActions,
  actionDrafts,
  onActionDraftsChange,
  isExpired,
  enabledRoles,
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
    (a) => a.actionStatus === "submitted" || (!a.actionStatus && a.text),
  );
  const canEdit = game.phase === "submit" && !isExpired;
  const totalActions =
    submittedList.length + actionDrafts.filter((a) => a.text.trim()).length;

  return (
    <>
      {/* Compact status line */}
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-4 h-4 text-navy shrink-0" />
        <span className="text-sm font-bold text-text">
          {isExpired
            ? "Time\u2019s up"
            : `${submittedList.length} of ${totalActions || submittedList.length} submitted`}
        </span>
      </div>

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

          <SuggestionPanel
            suggestions={shownSuggestions}
            ideasOpen={ideasOpen}
            onIdeasOpenChange={onIdeasOpenChange}
            onSuggestionTap={onSuggestionTap}
          />
        </div>
      )}

      {submitError && (
        <p className="text-xs text-viz-danger mt-2 text-center">
          {submitError}
        </p>
      )}
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
        <span className="text-sm font-semibold text-[#1D4ED8]">
          Need ideas?
        </span>
        {ideasOpen ? (
          <ChevronUp className="w-4 h-4 text-[#2563EB] ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#2563EB] ml-auto" />
        )}
      </button>
      {ideasOpen && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-[#3B82F6]">
            Tap a suggestion to add it as an action
          </p>
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
