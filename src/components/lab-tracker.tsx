"use client";

import { COMPUTE_CATEGORIES } from "@/lib/game-data";

/** Coloured allocation blocks — one block per compute unit. Used inside
 *  `resolve-sections/lab-state-card.tsx` and a handful of player-facing previews
 *  (default 20-block preview when no stock is provided). */
export function ComputeDotsViz({
  allocation,
  computeStock,
}: {
  allocation: { deployment: number; research: number; safety: number };
  computeStock?: number;
}) {
  const blockCount = computeStock != null ? Math.max(1, Math.round(computeStock)) : 20;

  const dots: { color: string; key: string; idx: number }[] = [];
  let idx = 0;
  for (const cat of COMPUTE_CATEGORIES) {
    const count = Math.round((allocation[cat.key] / 100) * blockCount);
    for (let i = 0; i < count && idx < blockCount; i++) {
      dots.push({ color: cat.color, key: cat.key, idx: idx++ });
    }
  }
  // Fill any remainder (rounding error) with the last category so block totals match.
  while (dots.length < blockCount) {
    const lastCat = COMPUTE_CATEGORIES[COMPUTE_CATEGORIES.length - 1];
    dots.push({ color: lastCat.color, key: lastCat.key, idx: dots.length });
  }

  return (
    <div className="mb-2">
      <div className="flex flex-wrap gap-[2px]" style={{ maxWidth: 10 * 12 + 9 * 2 }}>
        {dots.map((dot) => (
          <div
            key={dot.idx}
            className="rounded-[2px] compute-dot"
            style={{
              width: 10,
              height: 10,
              backgroundColor: dot.color,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
    </div>
  );
}
