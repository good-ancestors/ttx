"use client";

import type { ReactNode } from "react";

/**
 * Full-screen presenter frame for the main-game facilitator view.
 *
 * This is the first step of the "make the main game look like /slides" work:
 * it wraps the existing per-phase content in the slideshow's ambient
 * background, adds a phase-progress rail, and pins a facilitator "what to do
 * next" prompt to the bottom. Per-phase content is still today's panels —
 * richer full-screen content (dice walkthrough, state-at-a-glance) lands in
 * later PRs (§3, §4) and drops straight into this frame.
 */

const PHASE_SEQUENCE = ["discuss", "submit", "rolling", "effect-review", "narrate"] as const;
type Phase = (typeof PHASE_SEQUENCE)[number];

const PHASE_LABELS: Record<Phase, string> = {
  discuss: "Discuss",
  submit: "Submit",
  rolling: "Roll",
  "effect-review": "Review",
  narrate: "Narrate",
};

/** Small "what to say / do next" cue for the facilitator, per phase. */
const PHASE_PROMPTS: Record<Phase, string> = {
  discuss: "Tables are talking it through. Set a duration, then open submissions when the room is ready.",
  submit: "Each table locks in one action. Watch the timer — grade and roll once everyone is in.",
  rolling: "Walk the room through each action and its dice roll, one at a time.",
  "effect-review": "Check what landed. Re-resolve if something looks off, then continue to the recap.",
  narrate: "Read out what happened, then distribute compute and advance to the next turn.",
};

function isPhase(phase: string): phase is Phase {
  return (PHASE_SEQUENCE as readonly string[]).includes(phase);
}

/** Horizontal phase-progress rail — mirrors the slideshow's progress dots. */
export function PhaseRail({ phase }: { phase: string }) {
  const activeIndex = isPhase(phase) ? PHASE_SEQUENCE.indexOf(phase) : -1;
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-3" role="list" aria-label="Turn phases">
      {PHASE_SEQUENCE.map((p, i) => {
        const done = activeIndex > i;
        const active = activeIndex === i;
        return (
          <div key={p} role="listitem" className="flex items-center gap-3">
            <span
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors"
              style={{ color: active ? "var(--color-viz-capability)" : done ? "var(--color-text-light)" : "var(--color-navy-light)" }}
              aria-current={active ? "step" : undefined}
            >
              <span
                className="h-2 rounded-full transition-all"
                style={{
                  width: active ? "1.5rem" : "0.5rem",
                  backgroundColor: active
                    ? "var(--color-viz-capability)"
                    : done
                      ? "var(--color-text-light)"
                      : "var(--color-navy-light)",
                }}
              />
              {PHASE_LABELS[p]}
            </span>
            {i < PHASE_SEQUENCE.length - 1 && (
              <span className="h-px w-6 bg-navy-light" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Bottom-pinned facilitator cue. Guidance only — advance controls live inline in the phase content. */
function PresenterPrompt({ phase }: { phase: string }) {
  const prompt = isPhase(phase) ? PHASE_PROMPTS[phase] : null;
  if (!prompt) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-6 pb-4">
      <p className="pointer-events-auto max-w-3xl rounded-full bg-navy-light/70 px-5 py-2 text-center text-sm text-text-light backdrop-blur">
        {prompt}
      </p>
    </div>
  );
}

/**
 * Page-level wrapper for the playing-phase facilitator view: ambient slideshow
 * background + a bottom-pinned facilitator prompt. The caller composes the nav,
 * {@link PhaseRail}, and per-phase content as children so it controls ordering.
 */
export function PresenterFrame({ phase, children }: { phase: string; children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-navy-dark text-white">
      {/* Ambient slideshow background, fixed behind the scrolling content. */}
      <div className="fixed inset-0 z-0" aria-hidden>
        <div className="slides-bg" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col pb-24">{children}</div>
      <PresenterPrompt phase={phase} />
    </div>
  );
}
