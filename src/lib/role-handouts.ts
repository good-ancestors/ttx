export interface RoleHandout {
  role: string;
  resources: string;
  objective: string;
  body: string;
  sections?: {
    title: string;
    content: string;
  }[];
  startOfExercise: string[];
  options: string[];
  endOfRound?: string[];
}

export type HandoutData = Record<string, RoleHandout>;

let cached: HandoutData | null = null;

export async function loadRoleHandouts(): Promise<HandoutData> {
  if (cached) return cached;
  const res = await fetch("/role-handouts.json");
  cached = (await res.json()) as HandoutData;
  return cached;
}
