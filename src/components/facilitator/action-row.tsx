"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Lock,
  Dices,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { PROBABILITY_CARDS, getProbabilityCard } from "@/lib/game-data";
import { redactSecretAction } from "@/lib/secret-actions";
import { ProbabilityBadge } from "@/components/action-card";
import { EffectEditor } from "./effect-editor";
import type { StructuredEffect } from "@/lib/ai-prompts";
import type { Submission, Proposal } from "./types";
import type { Id } from "@convex/_generated/dataModel";

/** One row in "What Was Attempted". Rendered in both the flat list (submit/rolling) and the
 *  succeeded/failed split (effect-review/narrate). */
export function ActionRow({
  action,
  actionIndex: i,
  sub,
  role,
  idx,
  isProjector,
  isRollingOrNarrate,
  revealedCount,
  revealedSecrets,
  toggleReveal,
  getEndorsements,
  rerollAction,
  overrideProbability,
  ungradeAction,
  overrideStructuredEffect,
  labs,
  roles,
  allowPregrade,
  needsReview,
}: {
  action: Submission["actions"][number];
  actionIndex: number;
  sub: Submission;
  role: { name: string; color: string } | undefined;
  idx: number;
  isProjector: boolean;
  isRollingOrNarrate: boolean;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  getEndorsements: (roleId: string, actionText: string) => Proposal[];
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  /** Facilitator edit of the grader-emitted effect. Pre-dice this just updates the
   *  submission field; post-dice the facilitator should click Re-resolve to re-apply. */
  overrideStructuredEffect?: (args: {
    submissionId: Id<"submissions">;
    actionIndex: number;
    structuredEffect?: StructuredEffect;
    acknowledge?: boolean;
  }) => Promise<unknown>;
  /** Active labs (names) — for effect editor dropdowns. */
  labs?: { labId: string; name: string }[];
  /** Active roles — for effect editor dropdowns. */
  roles?: { roleId: string; name: string }[];
  allowPregrade: boolean;
  needsReview?: boolean;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const secretKey = `${sub.roleId}-${i}`;
  const isCovert = action.secret && !revealedSecrets.has(secretKey);
  const roleName = role?.name ?? sub.roleId;
  const endorsements = getEndorsements(sub.roleId, action.text);
  const isVisible = !isRollingOrNarrate || idx < revealedCount;

  return (
    <div
      className={`py-2 border-b border-navy-light/50 last:border-0 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: role?.color }} />
        <span className="text-xs font-bold text-white shrink-0">{roleName}</span>
        {action.secret && (
          <button
            aria-label={isCovert ? "Reveal secret action" : "Hide secret action"}
            onClick={() => toggleReveal(secretKey)}
            className="shrink-0 cursor-pointer"
          >
            <Lock className="w-3 h-3 text-viz-warning mt-0.5" />
          </button>
        )}
        {needsReview && (
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-viz-warning/20 text-viz-warning shrink-0"
            title="This action produced structural effects that need review"
          >
            review
          </span>
        )}
        {endorsements.length > 0 && (
          <div className="flex flex-wrap gap-1 ml-1">
            {endorsements.map((p) => (
              <span
                key={p._id}
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  p.status === "accepted"
                    ? "bg-viz-safety/20 text-viz-safety"
                    : "bg-viz-danger/20 text-viz-danger"
                }`}
                title={`${p.toRoleName} ${p.status} ${p.fromRoleName}'s request`}
              >
                {p.toRoleName} <span aria-hidden="true">{p.status === "accepted" ? "\u2713" : "\u2717"}</span><span className="sr-only">{p.status}</span>
              </span>
            ))}
          </div>
        )}
        {/* AI influence is secret — not shown on facilitator view */}
      </div>
      <div className="flex items-center gap-2 mt-0.5 pl-4">
        <span
          className={`text-sm flex-1 min-w-0 ${
            isCovert
              ? "text-text-light italic cursor-pointer hover:text-white transition-colors"
              : action.secret
                ? "text-[#E2E8F0] cursor-pointer hover:text-text-light transition-colors"
                : "text-[#E2E8F0]"
          }`}
          onClick={action.secret ? () => toggleReveal(secretKey) : undefined}
          title={action.secret ? (isCovert ? "Click to reveal" : "Click to re-hide") : undefined}
        >
          {isCovert ? redactSecretAction(roleName, action) : action.text}
        </span>
        <ActionOutcome
          action={action}
          submissionId={sub._id}
          actionIndex={i}
          isProjector={isProjector}
          rerollAction={rerollAction}
          overrideProbability={overrideProbability}
          ungradeAction={ungradeAction}
          allowPregrade={allowPregrade}
        />
      </div>
      {/* Structured effect — grader's mechanical interpretation of this action.
       *  Hidden for ungraded actions (no effect yet emitted). Shown inline
       *  below the action text so the facilitator can scan the effect at the
       *  same height as the probability chip above. */}
      {action.structuredEffect && overrideStructuredEffect && (
        <div className="pl-4 mt-1">
          <EffectEditor
            effect={action.structuredEffect}
            confidence={action.confidence}
            submissionId={sub._id}
            actionIndex={i}
            labs={labs ?? []}
            roles={roles ?? []}
            overrideStructuredEffect={overrideStructuredEffect}
            isProjector={isProjector}
            locked={action.rolled != null}
          />
        </div>
      )}

      {/* Reasoning — facilitator click-to-reveal for inspecting AI grading */}
      {!isProjector && action.reasoning && (
        <div className="pl-4 mt-0.5">
          <button
            onClick={() => setReasoningOpen(!reasoningOpen)}
            aria-expanded={reasoningOpen}
            className="flex items-center gap-1 text-[10px] text-navy-muted hover:text-text-light transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            {reasoningOpen ? "Hide reasoning" : "Show reasoning"}
          </button>
          {reasoningOpen && (
            <p className="text-xs text-text-light/70 mt-1 leading-relaxed">
              {action.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProbabilityDropdown({
  current,
  submissionId,
  actionIndex,
  overrideProbability,
  ungradeAction,
  allowUngrade = true,
}: {
  current: number | null;
  submissionId: Id<"submissions">;
  actionIndex: number;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  allowUngrade?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Portalled so the menu escapes ancestor stacking contexts / overflow clipping.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const card = current == null ? null : getProbabilityCard(current);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    update();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
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

  return (
    <div className="relative shrink-0">
      {card ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="text-[11px] font-bold py-0.5 px-2.5 rounded-full flex items-center gap-1"
          style={{ backgroundColor: card.bgColor, color: card.color }}
        >
          {card.label} ({card.pct}%)
          <ChevronDown className="w-3 h-3" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="shrink-0 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#92400E] hover:bg-[#FDE68A] transition-colors flex items-center gap-1"
        >
          <ChevronRight className="w-3 h-3" /> Grade
        </button>
      )}
      {open && menuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Set probability"
          className="fixed z-[1000] bg-navy-dark border border-navy-light rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: menuPos.top, right: menuPos.right }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }}
        >
          {PROBABILITY_CARDS.map((p) => (
            <button
              key={p.pct}
              role="option"
              aria-selected={p.pct === current}
              onClick={() => {
                void overrideProbability({ submissionId, actionIndex, probability: p.pct });
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-navy-light transition-colors ${
                p.pct === current ? "font-bold" : ""
              }`}
              style={{ color: p.color }}
            >
              <span>{p.label}</span>
              <span className="font-mono">{p.pct}%</span>
            </button>
          ))}
          {allowUngrade && (
            <>
              <div className="border-t border-navy-light my-1" />
              <button
                role="option"
                aria-selected={current === null}
                onClick={() => {
                  void ungradeAction({ submissionId, actionIndex });
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-light hover:bg-navy-light transition-colors"
              >
                Ungraded
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function ActionOutcome({
  action,
  submissionId,
  actionIndex,
  isProjector,
  rerollAction,
  overrideProbability,
  ungradeAction,
  allowPregrade,
}: {
  action: Submission["actions"][number];
  submissionId: Id<"submissions">;
  actionIndex: number;
  isProjector: boolean;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  ungradeAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  allowPregrade: boolean;
}) {
  if (action.rolled != null) {
    if (!isProjector) {
      return (
        <span className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => void rerollAction({ submissionId, actionIndex })}
            className={`text-xs font-mono px-1 rounded hover:bg-navy-light ${action.success ? "text-viz-safety" : "text-viz-danger"}`}
            title="Click to reroll"
          >
            {action.rolled}
          </button>
          <span className={`text-xs ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>/</span>
          <ProbabilityDropdown
            current={action.probability ?? 50}
            submissionId={submissionId}
            actionIndex={actionIndex}
            overrideProbability={overrideProbability}
            ungradeAction={ungradeAction}
            allowUngrade={false}
          />
        </span>
      );
    }
    return (
      <span className={`text-xs font-mono shrink-0 ${action.success ? "text-viz-safety" : "text-viz-danger"}`}>
        {action.rolled}/{action.probability}%
      </span>
    );
  }

  if (action.probability != null) {
    if (!isProjector) {
      return (
        <ProbabilityDropdown
          current={action.probability}
          submissionId={submissionId}
          actionIndex={actionIndex}
          overrideProbability={overrideProbability}
          ungradeAction={ungradeAction}
        />
      );
    }
    return <ProbabilityBadge probability={action.probability} />;
  }

  if (allowPregrade) {
    return (
      <ProbabilityDropdown
        current={null}
        submissionId={submissionId}
        actionIndex={actionIndex}
        overrideProbability={overrideProbability}
        ungradeAction={ungradeAction}
        allowUngrade={false}
      />
    );
  }

  return null;
}

export function InlineRollStatus() {
  const [displayNumber, setDisplayNumber] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 100) + 1);
    }, 90);
    return () => clearInterval(interval);
  }, []);

  return (
    <div aria-live="polite" aria-label="Rolling action dice…" className="mb-2 flex items-center gap-3 rounded-lg border border-navy-light bg-navy-dark px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-light text-white" aria-hidden="true">
        <Dices className="h-4 w-4 animate-pulse" />
      </div>
      <div aria-hidden="true">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-light/70">Rolling</div>
        <div className="font-mono text-lg font-black text-white tabular-nums">{displayNumber}</div>
      </div>
    </div>
  );
}
