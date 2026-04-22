"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TrendingUp } from "lucide-react";

/**
 * New Compute Acquired — shows each role's acquired compute for this round.
 * Data sourced from computeTransactions via getComputeHolderView (acquired column).
 * Shown as the last section in the facilitator sequential view during narrate phase.
 */
export function NewComputeAcquired({
  gameId,
  roundNumber,
}: {
  gameId: Id<"games">;
  roundNumber: number;
}) {
  const view = useQuery(api.rounds.getComputeHolderView, { gameId, roundNumber });

  if (!view) return null;

  const acquired = view
    .filter((e) => e.acquired > 0)
    .sort((a, b) => b.acquired - a.acquired);

  if (acquired.length === 0) return null;

  const total = acquired.reduce((s, e) => s + e.acquired, 0);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-viz-safety" />
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          New Compute Acquired
        </span>
        <span className="ml-auto text-xs font-mono text-text-light">
          {total}u total
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {acquired.map((e) => {
          const sharePct = total > 0 ? Math.round((e.acquired / total) * 100) : 0;
          return (
            <div
              key={e.roleId}
              className="bg-navy rounded-lg border border-navy-light p-3"
            >
              <div className="text-xs font-bold text-white truncate mb-1" title={e.name}>
                {e.name}
              </div>
              <div className="text-xl font-black font-mono text-viz-safety">
                +{e.acquired}u
              </div>
              <div className="text-[10px] text-text-light mt-0.5">
                {sharePct}% of new
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
