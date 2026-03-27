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
