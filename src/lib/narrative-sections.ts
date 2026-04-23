/** Shared section shapes + detection helpers for the resolve-round
 *  narrative. The Convex round.summary field carries two shapes:
 *    - current: three prose paragraphs (outcomes / stateOfPlay / pressures)
 *    - legacy: four bucketed bullet arrays (labs / geopolitics / publicAndMedia / aiSystems)
 *  Readers render prose when present and fall back to legacy buckets. */

export interface NarrativeSummary {
  // Current shape
  outcomes?: string;
  stateOfPlay?: string;
  pressures?: string;
  // Optional facilitator notes
  facilitatorNotes?: string;
  // Legacy shape (older rounds)
  labs?: string[];
  geopolitics?: string[];
  publicAndMedia?: string[];
  aiSystems?: string[];
}

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

/** True iff at least one prose paragraph carries text. */
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
