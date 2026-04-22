"use client";

import { COMPUTE_CATEGORIES } from "@/lib/game-data";

/** Coloured allocation blocks — 1 block per compute unit (or 20-block preview if no stock).
 *  Blocks are coloured by deploy/research/safety proportion. Used inside
 *  `resolve-sections/lab-state-card.tsx` and a handful of player-facing previews. */
export function ComputeDotsViz({
  allocation,
  computeStock,
}: {
  allocation: { deployment: number; research: number; safety: number };
  computeStock?: number;
}) {
  const total = computeStock != null ? Math.max(1, Math.round(computeStock)) : 20;
  const dots: { color: string; key: string; idx: number }[] = [];
  let idx = 0;
  for (const cat of COMPUTE_CATEGORIES) {
    const count = Math.round((allocation[cat.key] / 100) * total);
    for (let i = 0; i < count && idx < total; i++) {
      dots.push({ color: cat.color, key: cat.key, idx: idx++ });
    }
  }
  while (dots.length < total) {
    const lastCat = COMPUTE_CATEGORIES[COMPUTE_CATEGORIES.length - 1];
    dots.push({ color: lastCat.color, key: lastCat.key, idx: dots.length });
  }

  return (
    <div className="flex flex-wrap gap-[2px] mb-2" style={{ maxWidth: 10 * 12 + 9 * 2 }}>
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
  );
}
