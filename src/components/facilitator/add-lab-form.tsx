"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ROLE_MAP, isLabCeo } from "@/lib/game-data";
import { NumberField } from "@/components/number-field";
import type { Id } from "@convex/_generated/dataModel";

interface AddLabArgs {
  gameId: Id<"games">;
  name: string;
  roleId: string;
  rdMultiplier: number;
  spec?: string;
  allocation?: { deployment: number; research: number; safety: number };
  jurisdiction?: string;
}

/**
 * Add Lab form — name, controller, R&D multiplier, optional spec, allocation,
 * and jurisdiction. Compute is inherited from the controlling role's existing
 * table.computeStock.
 */
export function AddLabForm({
  gameId,
  tables,
  addLab,
  onDone,
}: {
  gameId: Id<"games">;
  tables: { roleId: string; roleName: string; enabled?: boolean; computeStock?: number }[];
  addLab: (args: AddLabArgs) => Promise<unknown>;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [multiplier, setMultiplier] = useState(1);
  const [spec, setSpec] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [deployment, setDeployment] = useState(34);
  const [research, setResearch] = useState(33);
  const [safety, setSafety] = useState(33);
  const [error, setError] = useState<string | null>(null);
  // Only lab-CEO-tagged roles can own a lab; other roles (governments, civil
  // society, AIs, narrative) appear in `tables` but must be filtered out here.
  const enabledTables = tables.filter((t) => {
    if (t.enabled === false) return false;
    const role = ROLE_MAP.get(t.roleId);
    return role ? isLabCeo(role) : false;
  });
  const selectedTable = enabledTables.find((t) => t.roleId === roleId);
  const totalAlloc = deployment + research + safety;
  const allocOK = totalAlloc === 100;

  const submit = async () => {
    if (!name || !roleId) return;
    if (!allocOK) { setError(`Allocation must sum to 100 (currently ${totalAlloc})`); return; }
    setError(null);
    const trimmedSpec = spec.trim();
    const trimmedJurisdiction = jurisdiction.trim();
    await addLab({
      gameId,
      name,
      roleId,
      rdMultiplier: multiplier,
      spec: trimmedSpec || undefined,
      allocation: { deployment, research, safety },
      jurisdiction: trimmedJurisdiction || undefined,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
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
          <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">R&D ×</label>
          <NumberField value={multiplier} onChange={setMultiplier} min={0} step={0.1} ariaLabel="R&D multiplier" className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light" />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Jurisdiction (optional)</label>
        <input type="text" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="e.g. United States, EU, China" className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white placeholder:text-navy-muted focus:outline-none focus:border-text-light" />
      </div>

      <div>
        <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Spec (optional)</label>
        <textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={2} maxLength={2000} placeholder="Lab AI directive / mission" className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white placeholder:text-navy-muted focus:outline-none focus:border-text-light resize-none" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-text-light uppercase tracking-wider">Initial allocation</label>
          <span className={`text-[10px] font-mono ${allocOK ? "text-text-light/60" : "text-viz-danger"}`}>
            {totalAlloc}% {allocOK ? <Check className="inline w-3 h-3" /> : "(must = 100)"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[10px] text-text-light">
            Deploy %
            <input type="number" value={deployment} onChange={(e) => setDeployment(parseInt(e.target.value) || 0)}
              className="text-sm bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-text-light">
            Research %
            <input type="number" value={research} onChange={(e) => setResearch(parseInt(e.target.value) || 0)}
              className="text-sm bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-text-light">
            Safety %
            <input type="number" value={safety} onChange={(e) => setSafety(parseInt(e.target.value) || 0)}
              className="text-sm bg-navy-dark border border-navy-light rounded px-2 py-1 text-white font-mono" />
          </label>
        </div>
      </div>

      {error && <div className="text-[11px] text-viz-danger">{error}</div>}

      <div className="flex justify-end">
        <button
          onClick={() => void submit()}
          disabled={!name || !roleId || !allocOK}
          className="text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add lab
        </button>
      </div>
    </div>
  );
}
