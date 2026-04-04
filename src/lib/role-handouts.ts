let cached: Record<string, string> | null = null;

export async function loadRoleHandouts(): Promise<Record<string, string>> {
  if (cached) return cached;
  const res = await fetch("/role-handouts.json");
  cached = (await res.json()) as Record<string, string>;
  return cached;
}

// @ts-expect-error -- kept for future use; not currently imported
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getRoleHandout(data: Record<string, string>, roleId: string): string | undefined {
  return data[roleId];
}
