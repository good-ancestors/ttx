// Sample actions are loaded from public/sample-actions.json (17 roles × 4 rounds × 6 actions)

import type { StructuredEffect } from "./ai-prompts";

/** Player-submit-time structured intent — mirrors what a human player can pin
 *  via the structured UI (mergeLab / foundLab / computeTargets). Used by NPC
 *  tables to submit realistic pinned actions. */
export type StructuredIntent =
  | { kind: "merger"; absorbedRoleId: string; newName?: string }
  | { kind: "foundLab"; name: string; seedComputePct: number }
  | { kind: "computeTransfer"; toRoleId: string; amount: number };

export interface SampleAction {
  text: string;
  priority: "low" | "medium" | "high";
  secret: boolean;
  endorseHint: string[];
  /** Player-submit-time pinned intent (merger / foundLab / compute send). */
  structured?: StructuredIntent;
  /** Grader-time pre-baked effect. Allows NPC pipelines to skip the grading
   *  LLM and apply a deterministic effect. Magnitude lives in the effect
   *  itself (e.g. computeDestroyed.amount). */
  structuredEffect?: StructuredEffect;
}

export type SampleActionsData = Record<string, Record<number, SampleAction[]>>;

let cached: SampleActionsData | null = null;

export async function loadSampleActions(): Promise<SampleActionsData> {
  if (cached) return cached;
  const res = await fetch("/sample-actions.json");
  cached = (await res.json()) as SampleActionsData;
  return cached;
}

export function getSampleActions(
  data: SampleActionsData,
  roleId: string,
  round: number
): SampleAction[] {
  return data[roleId]?.[round] ?? [];
}

/** Pick n random items from an array (unbiased shuffle) */
export function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

