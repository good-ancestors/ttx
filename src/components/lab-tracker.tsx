"use client";

import { COMPUTE_CATEGORIES } from "@/lib/game-data";

const MAX_BLOCKS = 50;

/** Coloured allocation blocks. 1 block per compute unit at small scales; once stock
 *  exceeds MAX_BLOCKS (50u) each block represents `ceil(stock / MAX_BLOCKS)` units and
 *  a "(×N)" multiplier tag is rendered so the viz stays compact at 200u+.
 *  Used inside `resolve-sections/lab-state-card.tsx` and a handful of player-facing
 *  previews (default 20-block preview when no stock is provided). */
export function ComputeDotsViz({
  allocation,
  computeStock,
}: {
  allocation: { deployment: number; research: number; safety: number };
  computeStock?: number;
}) {
  const stock = computeStock != null ? Math.max(1, Math.round(computeStock)) : 20;
  // Scale: if stock > MAX_BLOCKS, each block represents >1u. Min 1u/block.
  const unitsPerBlock = stock > MAX_BLOCKS ? Math.ceil(stock / MAX_BLOCKS) : 1;
  const blockCount = Math.ceil(stock / unitsPerBlock);

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
      {unitsPerBlock > 1 && (
        <div className="text-[9px] text-text-light/60 mt-1 font-mono">
          ×{unitsPerBlock}u per block
        </div>
      )}
    </div>
  );
}
