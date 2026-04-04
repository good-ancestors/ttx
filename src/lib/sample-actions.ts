// Sample actions are loaded from public/sample-actions.json (306 actions, 17 roles × 3 rounds × 6 each)

export interface SampleAction {
  text: string;
  priority: "low" | "medium" | "high";
  secret: boolean;
  endorseHint: string[];
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

