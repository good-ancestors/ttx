"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuthMutation } from "@/lib/hooks";
import { NumberField } from "@/components/number-field";
import { scaleAllocation } from "@/lib/allocation";
import { TOTAL_ROUNDS } from "@/lib/game-data";
import type { Id } from "@convex/_generated/dataModel";
import { TrendingUp, Pencil, Save, X, Check } from "lucide-react";

/**
 * New Compute Acquired — previews each role's acquired compute for this round.
 *
 * Reads `round.pendingAcquired` (via `api.rounds.getPendingAcquired`) — the amounts
 * computed at `continueFromEffectReview` time but not yet materialised into the ledger.
 * The compute actually arrives in players' tables when the facilitator clicks Advance
 * (see `games.advanceRound` → materialisePendingAcquired). During narrate the
 * facilitator can edit the amounts; edits overwrite `pendingAcquired` directly, so
 * whatever is shown is exactly what lands at Advance.
 *
 * Falls back to committed `acquired` ledger rows for legacy rounds resolved before
 * the deferral landed — that fallback is transparent to the UI.
 */
export function NewComputeAcquired({
  gameId,
  roundNumber,
  isProjector,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  isProjector?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const isFinalRound = roundNumber >= TOTAL_ROUNDS;
  // No next round to flow into on the final round — acquisition is moot, panel hides.
  const rows = useQuery(
    api.rounds.getPendingAcquired,
    isFinalRound ? "skip" : { gameId, roundNumber },
  );

  if (isFinalRound) return null;
  if (!rows) return null;
  const acquired = rows
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (acquired.length === 0) return null;

  const total = acquired.reduce((s, e) => s + e.amount, 0);
  const isPending = rows.some((r) => r.pending);
  const canEdit = !isProjector && isPending;

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
        {!editing && canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="text-[0.625rem] p-1 rounded bg-navy-light text-text-light hover:bg-navy-muted"
            aria-label="Edit acquired amounts"
            title="Edit acquired amounts"
          >
            <Pencil className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="text-[0.6875rem] text-text-light/70 mb-3">
        {isPending
          ? "Applied at start of next round — players gain access when the facilitator advances."
          : "Already applied this round (legacy — pre-deferral)."}
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
            const sharePct = total > 0 ? Math.round((e.amount / total) * 100) : 0;
            return (
              <div
                key={e.roleId}
                className="bg-navy rounded-lg border border-navy-light p-3"
              >
                <div className="text-xs font-bold text-white truncate mb-1" title={e.name}>
                  {e.name}
                </div>
                <div className="text-xl font-black font-mono text-viz-safety">
                  +{e.amount}u
                </div>
                <div className="text-[0.625rem] text-text-light mt-0.5">
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
  amount: number;
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
  const enabledRoles = useQuery(api.tables.getEnabledRoleNames, { gameId });
  // Merge: include every active player so the facilitator can grant compute to
  // someone the model didn't allocate any to, AND include any role already in
  // `acquired` even if it's no longer enabled — otherwise an existing pending
  // allocation would be silently dropped on save.
  const entries = useMemo<AcquiredEntry[]>(() => {
    const amountByRole = new Map(acquired.map((a) => [a.roleId, a.amount]));
    const nameByRole = new Map(acquired.map((a) => [a.roleId, a.name]));
    const merged: AcquiredEntry[] = [];
    const seen = new Set<string>();
    if (enabledRoles) {
      for (const r of enabledRoles) {
        merged.push({
          roleId: r.roleId,
          name: nameByRole.get(r.roleId) ?? r.roleName,
          amount: amountByRole.get(r.roleId) ?? 0,
        });
        seen.add(r.roleId);
      }
    }
    for (const a of acquired) {
      if (!seen.has(a.roleId)) merged.push(a);
    }
    return merged.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  }, [enabledRoles, acquired]);

  const currentTotal = entries.reduce((s, e) => s + e.amount, 0);
  const [totalTarget, setTotalTarget] = useState(currentTotal);
  const [sharePcts, setSharePcts] = useState<Record<string, number>>(() => {
    const pcts: Record<string, number> = {};
    for (const e of acquired) {
      pcts[e.roleId] = currentTotal > 0 ? (e.amount / currentTotal) * 100 : 0;
    }
    return pcts;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updatePending = useAuthMutation(api.rounds.updatePendingAcquired);

  const totalPct = entries.reduce((s, e) => s + (sharePcts[e.roleId] ?? 0), 0);
  const pctOK = Math.abs(totalPct - 100) < 0.5;

  const previewAmounts = entries.map((e) => ({
    ...e,
    newAmount: Math.round((sharePcts[e.roleId] ?? 0) / 100 * totalTarget),
  }));

  const save = async () => {
    if (!pctOK) { setError(`Shares must sum to 100% (currently ${totalPct.toFixed(1)}%)`); return; }
    setSaving(true);
    setError(null);
    try {
      await updatePending({
        gameId,
        roundNumber,
        amounts: previewAmounts.map((p) => ({ roleId: p.roleId, amount: p.newAmount })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[0.6875rem] text-text-light">
        <span className="w-24">Total (u)</span>
        <NumberField
          value={totalTarget}
          onChange={setTotalTarget}
          min={0}
          integer
          ariaLabel="Total compute"
          className="flex-1 bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono"
        />
      </label>
      <div className="space-y-1.5">
        {entries.map((e) => {
          const pct = sharePcts[e.roleId] ?? 0;
          const amount = Math.round(pct / 100 * totalTarget);
          return (
            <div key={e.roleId} className="flex items-center gap-2 text-[0.6875rem]">
              <span className="w-28 truncate text-text-light" title={e.name}>{e.name}</span>
              <NumberField
                value={pct}
                onChange={(v) => setSharePcts((prev) => ({ ...prev, [e.roleId]: v }))}
                min={0}
                max={100}
                step={0.1}
                decimals={1}
                ariaLabel={`${e.name} share percentage`}
                className="w-16 bg-navy-dark border border-navy-light rounded px-1.5 py-1 text-white font-mono text-right"
              />
              <span className="text-text-light/60">%</span>
              <span className="font-mono text-viz-safety text-right w-14">+{amount}u</span>
            </div>
          );
        })}
      </div>
      <div className={`flex items-center gap-1 text-[0.625rem] ${pctOK ? "text-text-light/60" : "text-viz-danger"}`}>
        <span>Share total: {totalPct.toFixed(1)}%</span>
        {pctOK ? (
          <Check className="w-3 h-3" />
        ) : (
          <>
            <span>(must = 100)</span>
            <button
              type="button"
              onClick={() => {
                // Scale all shares to sum to 100, preserving relative proportions.
                // Round to 1 decimal place to match the displayed precision.
                const scaled = scaleAllocation(sharePcts, 100);
                const next: Record<string, number> = {};
                for (const [k, v] of Object.entries(scaled)) {
                  next[k] = Number(v.toFixed(1));
                }
                setSharePcts(next);
              }}
              className="ml-auto text-[0.625rem] px-1.5 py-0.5 rounded bg-navy-dark border border-navy-light text-text-light hover:bg-navy"
            >
              Auto-balance
            </button>
          </>
        )}
      </div>
      {error && (
        <div className="text-[0.6875rem] text-viz-danger">{error}</div>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={() => void save()}
          disabled={saving || !pctOK}
          className="flex-1 text-[0.6875rem] px-2 py-1 bg-white text-navy rounded font-bold hover:bg-off-white disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onClose}
          className="flex-1 text-[0.6875rem] px-2 py-1 bg-navy-light text-text-light rounded hover:bg-navy-muted flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
