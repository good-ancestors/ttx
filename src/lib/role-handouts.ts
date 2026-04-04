let cached: Record<string, string> | null = null;

export async function loadRoleHandouts(): Promise<Record<string, string>> {
  if (cached) return cached;
  const res = await fetch("/role-handouts.json");
  cached = (await res.json()) as Record<string, string>;
  return cached;
}
