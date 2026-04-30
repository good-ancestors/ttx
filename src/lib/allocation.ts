// Helpers for keeping a set of integer percentages summed to 100. Used by
// every "split this pie three ways" UI (compute allocation, found-a-lab,
// facilitator lab edit). Hand math is annoying — these do it for the user.

/**
 * Adjust the other keys proportionally so the whole map sums to `total`
 * (default 100), pinning `pinnedKey` to its current value. Distributes the
 * remainder using largest-remainder rounding so the result is integer and
 * sums exactly to `total`.
 */
export function balanceAllocation<T extends Record<string, number>>(
  alloc: T,
  pinnedKey: keyof T,
  total = 100,
): T {
  const keys = (Object.keys(alloc) as Array<keyof T>).filter((k) => k !== pinnedKey);
  const pinned = Math.max(0, Math.min(total, alloc[pinnedKey]));
  const remaining = total - pinned;

  const otherSum = keys.reduce((s, k) => s + Math.max(0, alloc[k]), 0);
  // Build a mutable copy keyed by the same shape; cast to the public T at return.
  const next: Record<keyof T, number> = { ...alloc };
  next[pinnedKey] = pinned;

  if (keys.length === 0) return next as T;

  if (otherSum <= 0) {
    // Nothing to redistribute proportionally — split evenly.
    const base = Math.floor(remaining / keys.length);
    let extra = remaining - base * keys.length;
    for (const k of keys) {
      next[k] = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
    }
    return next as T;
  }

  // Largest-remainder method: floor the proportional share, then hand out
  // the leftover one-by-one to the rows with the largest fractional parts.
  const floored = keys.map((k) => {
    const exact = (Math.max(0, alloc[k]) / otherSum) * remaining;
    const floor = Math.floor(exact);
    return { key: k, floor, frac: exact - floor };
  });
  const used = floored.reduce((s, r) => s + r.floor, 0);
  let leftover = remaining - used;
  const ranked = [...floored].sort((a, b) => b.frac - a.frac);
  for (const r of ranked) {
    if (leftover <= 0) break;
    r.floor += 1;
    leftover -= 1;
  }
  for (const r of floored) next[r.key] = r.floor;
  return next as T;
}
