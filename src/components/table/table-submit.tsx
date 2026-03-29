"use client";

import type { Id } from "@convex/_generated/dataModel";
import { isLabCeo, isLabSafety, hasCompute, getDisposition, type Role } from "@/lib/game-data";
import { type ActionDraft } from "@/components/action-input";
import { ActionInput } from "@/components/action-input";
import { ComputeAllocation } from "@/components/compute-allocation";
import { LabAllocationReadOnly } from "@/components/lab-allocation-readonly";

import type { SampleAction } from "@/lib/sample-actions";
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  EyeOff,
  FileText,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";

// ─── Submitted confirmation ──────────────────────────────────────────────────

function SubmittedView({ actions }: { actions: { text: string; priority: number; secret?: boolean }[] }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-[#ECFDF5] flex items-center justify-center">
          <Send className="w-3.5 h-3.5 text-[#059669]" />
        </div>
        <span className="text-sm font-bold text-text">Submitted</span>
      </div>
      {actions.map((a, i) => (
        <div key={`submitted-${i}`} className="bg-white rounded-lg p-3 border border-border relative mb-2">
          <div className="flex items-start gap-2">
            <span className="text-[11px] bg-warm-gray text-text-muted rounded px-1.5 py-0.5 font-mono font-semibold shrink-0">
              #{i + 1}
            </span>
            {a.secret && (
              <span className="text-[10px] bg-[#FFF7ED] text-viz-warning rounded px-1.5 py-0.5 font-bold shrink-0">
                SECRET
              </span>
            )}
            <p className="text-sm text-text flex-1">{a.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Submit phase props ──────────────────────────────────────────────────────

export interface TableSubmitProps {
  game: {
    currentRound: number;
    labs: { name: string; roleId: string; spec?: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];
  };
  role: Role;
  tableId: Id<"tables">;
  aiDisposition: string | undefined;
  computeStock: number;
  isSubmitted: boolean;
  submittedActions: { text: string; priority: number; secret?: boolean }[];
  timerDisplay: string;
  // Form state
  actionDrafts: ActionDraft[];
  onActionDraftsChange: (drafts: ActionDraft[]) => void;
  computeAllocation: { users: number; capability: number; safety: number };
  onComputeAllocationChange: (alloc: { users: number; capability: number; safety: number }) => void;
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
  enabledRoles: { id: string; name: string }[];
  parsedActions: { text: string; priority: number; secret?: boolean }[];
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
  onSendRequest: (targetRoleId: string, targetRoleName: string, actionText: string) => void;
  onCancelRequest: (targetRoleId: string, actionText: string) => void;
  // Suggestions
  shownSuggestions: SampleAction[];
  ideasOpen: boolean;
  onIdeasOpenChange: (open: boolean) => void;
  onSuggestionTap: (suggestion: SampleAction) => void;
}

export function TableSubmit({
  game,
  role,
  aiDisposition,
  computeStock,
  isSubmitted,
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
  parsedActions,
  onSubmit,
  submitting,
  submitError,
  onSendRequest,
  onCancelRequest,
  shownSuggestions,
  ideasOpen,
  onIdeasOpenChange,
  onSuggestionTap,
}: TableSubmitProps) {
  return (
    <>
      {isSubmitted ? (
        <SubmittedView actions={submittedActions} />
      ) : (
        <>
          {/* Phase transition banner */}
          <div className="bg-navy text-white rounded-xl p-3 mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 shrink-0" />
            <span className="text-sm font-bold">Submissions are open!</span>
            <span className="text-xs text-text-light ml-auto">{timerDisplay} remaining</span>
          </div>

          {/* AI Systems disposition badge */}
          {role.tags.includes("ai-system") && aiDisposition && (
            <div className="bg-[#1E1B4B] text-[#C4B5FD] rounded-lg px-3 py-2 mb-4 flex items-center gap-2 text-sm">
              <EyeOff className="w-3.5 h-3.5" />
              <span className="font-bold text-white">{getDisposition(aiDisposition)?.label}</span>
              <span className="text-xs ml-auto">Secret — locked for game</span>
            </div>
          )}

          {/* Lab Directives — AI Systems player sees all labs */}
          {role.tags.includes("ai-system") && (
            <details className="bg-white rounded-xl border border-border p-4 mb-4">
              <summary className="flex items-center gap-2 cursor-pointer">
                <FileText className="w-4 h-4 text-text" />
                <span className="text-sm font-bold text-text">Lab Directives</span>
              </summary>
              <p className="text-xs text-text-muted mt-2 mb-3">
                These are the current AI directives set by each lab&apos;s CEO. Your behaviour should be informed by these specs (and your secret disposition).
              </p>
              <div className="space-y-2">
                {game.labs.map((lab) => (
                  <div key={lab.name} className="bg-off-white rounded-lg p-3 border border-border">
                    <span className="text-xs font-bold text-text">{lab.name}</span>
                    <p className="text-xs text-text-muted mt-1 whitespace-pre-line">
                      {lab.spec || "No directive set yet."}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Lab spec editor — CEO can write the AI directive */}
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

          {/* Action input */}
          <div className="mb-4">
            <ActionInput
              actions={actionDrafts}
              onChange={onActionDraftsChange}
              roleId={role.id}
              roleName={role.name}
              enabledRoles={enabledRoles}
              isSubmitted={false}
              onSendRequest={onSendRequest}
              onCancelRequest={onCancelRequest}
            />

            {/* Need ideas? collapsible suggestions */}
            {shownSuggestions.length > 0 && (
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
                    {shownSuggestions.map((s, i) => (
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
            )}

            {/* Submit button */}
            {parsedActions.length > 0 && (
              <button
                onClick={onSubmit}
                disabled={submitting || parsedActions.length === 0}
                className="mt-4 w-full py-3.5 bg-navy text-white rounded-lg font-bold text-base
                           disabled:opacity-30 hover:bg-navy-light transition-colors
                           flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Submit Actions
              </button>
            )}
            {submitError && <p className="text-xs text-viz-danger mt-2 text-center">{submitError}</p>}
          </div>
        </>
      )}
    </>
  );
}

// ─── Lab spec editor sub-component ───────────────────────────────────────────

function LabSpecEditor({
  labSpec,
  onLabSpecChange,
  specSaved,
  onSaveSpec,
}: {
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-text" />
        <span className="text-sm font-bold text-text">Your Lab&apos;s AI Directive</span>
      </div>
      <p className="text-xs text-text-muted mb-2">
        What is your AI instructed to do? This is public and affects how faithfully the AI follows your direction.
      </p>
      <textarea
        value={labSpec}
        onChange={(e) => { onLabSpecChange(e.target.value); }}
        placeholder="e.g. 'Maximise capability R&D while maintaining 10% safety budget'"
        rows={2}
        className="w-full p-2 bg-off-white border border-border rounded text-sm text-text resize-none outline-none placeholder:text-text-muted/50"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={onSaveSpec}
          disabled={!labSpec.trim()}
          className="text-xs px-3 py-1.5 bg-navy text-white rounded font-bold hover:bg-navy/90 disabled:opacity-30"
        >
          Save Directive
        </button>
        {specSaved && (
          <span className="text-xs text-[#059669] font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
