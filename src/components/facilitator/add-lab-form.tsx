"use client";

import { useState } from "react";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Add Lab form — lab creation is metadata only (name, controller, multiplier).
 * Compute is derived from the controlling role's existing table.computeStock.
 */
export function AddLabForm({
  gameId,
  tables,
  addLab,
  onDone,
}: {
  gameId: Id<"games">;
  tables: { roleId: string; roleName: string; enabled?: boolean; computeStock?: number }[];
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; rdMultiplier: number }) => Promise<unknown>;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [multiplier, setMultiplier] = useState(1);
  const enabledTables = tables.filter((t) => t.enabled !== false);
  const selectedTable = enabledTables.find((t) => t.roleId === roleId);

  return (
    <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
      <div>
        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Lab Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sovereign Compute Centre" className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white placeholder:text-navy-muted focus:outline-none focus:border-text-light" />
      </div>
      <div>
        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Controlled by</label>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light">
          <option value="">Select role...</option>
          {enabledTables.map((t) => (
            <option key={t.roleId} value={t.roleId}>
              {t.roleName}{t.computeStock != null ? ` (${t.computeStock}u)` : ""}
            </option>
          ))}
        </select>
        {selectedTable && (
          <span className="text-[9px] text-text-light/60 mt-0.5 block">
            Lab inherits {selectedTable.computeStock ?? 0}u from this role
          </span>
        )}
      </div>
      <div>
        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">R&D Multiplier</label>
        <input type="number" value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))} step={0.1} className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light" />
      </div>
      <button
        onClick={async () => {
          if (!name || !roleId) return;
          await addLab({ gameId, name, roleId, rdMultiplier: multiplier });
          onDone();
        }}
        disabled={!name || !roleId}
        className="text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add
      </button>
    </div>
  );
}
