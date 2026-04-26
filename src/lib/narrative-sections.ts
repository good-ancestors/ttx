/**
 * Shared section shapes + detection helpers for the resolve-round narrative.
 *
 * CURRENT NARRATIVE SHAPE (4-bucket):
 * The LLM prompt (`buildResolveNarrativePrompt`) and the NarrativeOutput type in
 * `convex/pipeline.ts` currently emit a 4-bucket format:
 *   labs / geopolitics / publicAndMedia / aiSystems
 * These are stored in round.summary as string arrays and rendered by the
 * facilitator UI via LEGACY_SECTIONS below.
 *
 * FUTURE PROSE SHAPE (reserved — NOT YET EMITTED):
 * A three-paragraph prose shape (outcomes / stateOfPlay / pressures) is defined
 * below as PROSE_SECTIONS. It is NOT emitted by the LLM today.
 * `hasProseNarrative` therefore always returns false in practice.
 * When the prose migration is completed, `buildResolveNarrativePrompt` will be
 * updated to emit prose fields and the reader will switch to the prose path.
 * Until then, do NOT treat PROSE_SECTIONS as the "current" shape.
 */

export interface NarrativeSummary {
  // Future prose shape (reserved — not yet emitted by LLM)
  outcomes?: string;
  stateOfPlay?: string;
  pressures?: string;
  // Optional facilitator notes
  facilitatorNotes?: string;
  // Current 4-bucket shape (what the LLM actually emits today)
  labs?: string[];
  geopolitics?: string[];
  publicAndMedia?: string[];
  aiSystems?: string[];
}

// NOT YET EMITTED — reserved for future narrative shape migration, keep in sync with buildResolveNarrativePrompt.
export const PROSE_SECTIONS: { key: "outcomes" | "stateOfPlay" | "pressures"; label: string }[] = [
  { key: "outcomes", label: "Outcomes" },
  { key: "stateOfPlay", label: "State of Play" },
  { key: "pressures", label: "Pressures" },
];

export const LEGACY_SECTIONS: { key: "labs" | "geopolitics" | "publicAndMedia" | "aiSystems"; label: string }[] = [
  { key: "labs", label: "Labs" },
  { key: "geopolitics", label: "Geopolitics" },
  { key: "publicAndMedia", label: "Public & Media" },
  { key: "aiSystems", label: "AI Systems" },
];

/** True iff at least one prose paragraph carries text.
 *  NOTE: Always returns false today — the LLM emits 4-bucket (LEGACY_SECTIONS),
 *  not prose. This function is retained for the future prose migration. */
export function hasProseNarrative(summary: NarrativeSummary | undefined): boolean {
  return !!(summary?.outcomes || summary?.stateOfPlay || summary?.pressures);
}

/** True iff any legacy bucket has at least one bullet. */
export function hasLegacyNarrative(summary: NarrativeSummary | undefined): boolean {
  return !!summary && LEGACY_SECTIONS.some(({ key }) => (summary[key] ?? []).length > 0);
}

/** True iff the summary has either prose or legacy content — i.e. something
 *  worth rendering beyond the empty shell. Used to gate loading skeletons
 *  vs. real content, and to decide whether to show the "Where things are at"
 *  section in the facilitator view. */
export function hasNarrativeContent(summary: NarrativeSummary | undefined): boolean {
  return hasProseNarrative(summary) || hasLegacyNarrative(summary);
}
