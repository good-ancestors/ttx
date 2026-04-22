"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuthMutation } from "@/lib/hooks";
import type { Id } from "@convex/_generated/dataModel";
import { TrendingUp, Pencil, Save, X } from "lucide-react";

/**
 * New Compute Acquired — shows each role's acquired compute for this round.
 * Labelled "Applied at start of next round" because players gain access at the
 * round-transition (advance) click. Editable: facilitator can tweak total and
 * per-role % — edits write a `facilitator` ledger row per role for the delta.
 */
export function NewComputeAcquired({
  gameId,
  roundNumber,
}: {
  gameId: Id<"games">;
  roundNumber: number;
}) {
  const [editing, setEditing] = useState(false);
  const view = useQuery(api.rounds.getComputeHolderView, { gameId, roundNumber });

  if (!view) return null;

  const acquired = view
    .filter((e) => e.acquired > 0)
    .sort((a, b) => b.acquired - a.acquired);

  if (acquired.length === 0) return null;

  const total = acquired.reduce((s, e) => s + e.acquired, 0);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-viz-safety" />
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
          New Compute Acquired
        </span>
        <span className="ml-auto text-xs font-mono text-text-light">
          {total}u total
        </span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] p-1 rounded bg-navy-light text-text-light hover:bg-navy-muted"
            title="Edit acquired amounts"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="text-[11px] text-text-light/70 mb-3">
        Applied at start of next round — players gain access when the facilitator advances.
      </div>

      {editing ? (
        <AcquiredEditor
          gameId={gameId}
          roundNumber={roundNumber}
          acquired={acquired}
          onClose={() => setEditing(false)}
        />
      ) : (
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
      )}
    </div>
  );
}

interface AcquiredEntry {
  roleId: string;
  name: string;
  acquired: number;
}

function AcquiredEditor({
  gameId,
  roundNumber,
  acquired,
  onClose,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  acquired: AcquiredEntry[];
  onClose: () => void;
}) {
  const currentTotal = acquired.reduce((s, e) => s + e.acquired, 0);
  const [totalTarget, setTotalTarget] = useState(currentTotal);
  const [sharePcts, setSharePcts] = useState<Record<string, number>>(() => {
    const pcts: Record<string, number> = {};
    for (const e of acquired) {
      pcts[e.roleId] = currentTotal > 0 ? (e.acquired / currentTotal) * 100 : 0;
    }
    return pcts;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adjustCompute = useAuthMutation(api.computeMutations.adjustHolderCompute);

  const totalPct = Object.values(sharePcts).reduce((s, p) => s + p, 0);
  const pctOK = Math.abs(totalPct - 100) < 0.5;

  const previewAmounts = acquired.map((e) => ({
    ...e,
    newAmount: Math.round((sharePcts[e.roleId] ?? 0) / 100 * totalTarget),
  }));

  const save = async () => {
    if (!pctOK) { setError(`Shares must sum to 100% (currently ${totalPct.toFixed(1)}%)`); return; }
    setSaving(true);
    setError(null);
    try {
      await Promise.all(previewAmounts.map((p) => {
        const delta = p.newAmount - p.acquired;
        if (delta === 0) return Promise.resolve();
        return adjustCompute({
          gameId,
          roundNumber,
          roleId: p.roleId,
          delta,
          reason: "Facilitator adjusted new-compute acquisition",
        });
      }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[11px] text-text-light">
        <span className="w-24">Total (u)</span>
        <input
          type="number"
          value={totalTarget}
          onChange={(e) => setTotalTarget(Math.max(0, parseInt(e.target.value) || 0))}
          className="flex-1 bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono"
        />
      </label>
      <div className="space-y-1.5">
        {acquired.map((e) => {
          const pct = sharePcts[e.roleId] ?? 0;
          const amount = Math.round(pct / 100 * totalTarget);
          return (
            <div key={e.roleId} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate text-text-light" title={e.name}>{e.name}</span>
              <input
                type="number"
                step="0.1"
                value={pct.toFixed(1)}
                onChange={(ev) => {
                  const v = Math.max(0, Math.min(100, parseFloat(ev.target.value) || 0));
                  setSharePcts((prev) => ({ ...prev, [e.roleId]: v }));
                }}
                className="w-16 bg-navy-dark border border-navy-light rounded px-1.5 py-1 text-white font-mono text-right"
              />
              <span className="text-text-light/60">%</span>
              <span className="font-mono text-viz-safety text-right w-14">+{amount}u</span>
            </div>
          );
        })}
      </div>
      <div className={`text-[10px] ${pctOK ? "text-text-light/60" : "text-viz-danger"}`}>
        Share total: {totalPct.toFixed(1)}% {pctOK ? "✓" : "(must = 100)"}
      </div>
      {error && (
        <div className="text-[11px] text-viz-danger">{error}</div>
      )}
      <div className="text-[10px] text-text-light/60 italic">
        Note: editing adjusts this round&apos;s facilitator override. Full acquisition-deferral
        (so edits apply at the next advance click) is a follow-up — see NEXT-SESSION.md #6.
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => void save()}
          disabled={saving || !pctOK}
          className="flex-1 text-[11px] px-2 py-1 bg-white text-navy rounded font-bold hover:bg-off-white disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onClose}
          className="flex-1 text-[11px] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
