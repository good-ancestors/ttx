"use client";

// Picker + form leaf components used inside ActionCard. Extracted from
// action-input.tsx to keep that file under the max-lines budget — these are
// pure presentational components driven by props and don't share local state
// with the parent beyond what's plumbed through ActionDraft.

import { useEffect, useRef, useState } from "react";
import { Check, FlaskConical, GitMerge, X, Zap } from "lucide-react";
import { DEFAULT_LAB_ALLOCATION } from "@/lib/game-data";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionDraft, LabRef } from "./action-input";

export function EndorsementPicker({
  action,
  otherRoles,
  onUpdate,
  onClose,
}: {
  action: ActionDraft;
  otherRoles: { id: string; name: string }[];
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onClose: () => void;
}) {

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2">Request support from:</p>
      <div className="flex flex-wrap gap-1.5">
        {otherRoles.map((r) => {
          const selected = action.endorseTargets.includes(r.id);
          return (
            <button
              key={r.id}
              onClick={() => {
                if (selected) {
                  onUpdate({ endorseTargets: action.endorseTargets.filter((id) => id !== r.id) });
                } else {
                  onUpdate({ endorseTargets: [...new Set([...action.endorseTargets, r.id])] });
                }
              }}
              className={`text-xs min-h-[44px] px-3 py-1.5 rounded-full font-medium transition-colors duration-200 ${
                selected
                  ? "bg-[#059669] text-white"
                  : "bg-warm-gray text-text-muted hover:bg-border"
              }`}
            >
              {selected && <Check className="w-3 h-3 mr-0.5" />}
              {r.name}
            </button>
          );
        })}
      </div>
      {action.endorseTargets.length > 0 && (
        <button
          onClick={() => {
            onUpdate({ endorseTargets: [] });
            onClose();
          }}
          className="mt-1.5 text-[11px] text-text-muted hover:text-text flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Clear all and unlock text
        </button>
      )}
    </div>
  );
}

export function ComputeRequestPicker({
  action,
  computeRoles,
  onUpdate,
  onClose,
  ownComputeStock,
}: {
  action: ActionDraft;
  computeRoles: { id: string; name: string; computeStock?: number }[];
  onUpdate: (patch: Partial<ActionDraft>) => void;
  onClose: () => void;
  ownComputeStock?: number;
}) {
  const [direction, setDirection] = useState<"send" | "request">("send");
  const [selectedRole, setSelectedRole] = useState("");
  const [amount, setAmount] = useState(1);

  // Cap the input at what's actually available. For send: your own stock.
  // For request: the source role's stock (clamped to the absolute hard-cap of 100u).
  const sourceStock = direction === "send"
    ? ownComputeStock
    : computeRoles.find((r) => r.id === selectedRole)?.computeStock;
  const maxAmount = Math.max(1, Math.min(100, sourceStock ?? 100));

  const addTarget = () => {
    if (!selectedRole || amount <= 0) return;
    const capped = Math.min(amount, maxAmount);
    const existing = action.computeTargets.filter((t) => t.roleId !== selectedRole);
    onUpdate({ computeTargets: [...existing, { roleId: selectedRole, amount: capped, direction }] });
    setSelectedRole("");
    setAmount(1);
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      {/* Direction toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden mb-2">
        <button
          onClick={() => setDirection("send")}
          className={`flex-1 min-h-[36px] text-xs font-bold transition-colors ${
            direction === "send"
              ? "bg-[#D97706] text-white"
              : "bg-warm-gray text-text-muted hover:bg-border"
          }`}
        >
          Send compute
        </button>
        <button
          onClick={() => setDirection("request")}
          className={`flex-1 min-h-[36px] text-xs font-bold transition-colors ${
            direction === "request"
              ? "bg-[#7C3AED] text-white"
              : "bg-warm-gray text-text-muted hover:bg-border"
          }`}
        >
          Request compute
        </button>
      </div>
      <p className="text-[11px] text-text-muted mb-2">
        {direction === "send"
          ? "Send your compute to another player. Deducted now, transferred on success, refunded on failure."
          : "Request compute from another player. They can accept or decline. Transferred on action success."}
      </p>

      {/* Existing targets */}
      {action.computeTargets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {action.computeTargets.map((target) => {
            const role = computeRoles.find((r) => r.id === target.roleId);
            const isSend = target.direction === "send";
            return (
              <span
                key={target.roleId}
                className={`text-xs px-2.5 py-1.5 rounded-full font-medium text-white flex items-center gap-1 ${
                  isSend ? "bg-[#D97706]" : "bg-[#7C3AED]"
                }`}
              >
                <Zap className="w-3 h-3" />
                {isSend ? "Send" : "Request"} {target.amount}u {isSend ? "to" : "from"} {role?.name ?? target.roleId}
                <button
                  onClick={() => onUpdate({ computeTargets: action.computeTargets.filter((t) => t.roleId !== target.roleId) })}
                  className="ml-0.5 hover:bg-white/20 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Add new target */}
      <div className="flex items-center gap-2">
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="flex-1 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text"
        >
          <option value="">{direction === "send" ? "Choose recipient..." : "Choose source..."}</option>
          {computeRoles
            .filter((r) => !action.computeTargets.some((t) => t.roleId === r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.computeStock != null ? ` (${r.computeStock}u)` : ""}</option>
            ))}
        </select>
        <input
          type="number"
          min={1}
          max={maxAmount}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.min(maxAmount, parseInt(e.target.value) || 1)))}
          className="w-16 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text font-mono text-center"
          placeholder="u"
        />
        <button
          onClick={addTarget}
          disabled={!selectedRole}
          className={`min-h-[44px] px-3 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-default ${
            direction === "send"
              ? "bg-[#D97706] hover:bg-[#B45309]"
              : "bg-[#7C3AED] hover:bg-[#6D28D9]"
          }`}
        >
          Add
        </button>
      </div>

      {action.computeTargets.length > 0 && (
        <button
          onClick={() => { onUpdate({ computeTargets: [] }); onClose(); }}
          className="mt-1.5 text-[11px] text-text-muted hover:text-text flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Clear all
        </button>
      )}
    </div>
  );
}

export function FoundLabForm({
  foundLab,
  ownComputeStock,
  onUpdate,
}: {
  foundLab: NonNullable<ActionDraft["foundLab"]>;
  ownComputeStock: number;
  onUpdate: (fl: NonNullable<ActionDraft["foundLab"]>) => void;
}) {
  // The founder always stakes their full current compute pool. Keep the form's
  // seedCompute synced to the current stock so the value reflects anything that
  // changes between toggling and submitting.
  const foundLabRef = useRef(foundLab);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { foundLabRef.current = foundLab; });
  useEffect(() => { onUpdateRef.current = onUpdate; });
  useEffect(() => {
    if (ownComputeStock > 0 && foundLabRef.current.seedCompute !== ownComputeStock) {
      onUpdateRef.current({ ...foundLabRef.current, seedCompute: ownComputeStock });
    }
  }, [ownComputeStock]);

  const alloc = foundLab.allocation ?? { ...DEFAULT_LAB_ALLOCATION };
  const setAlloc = (patch: Partial<typeof alloc>) => {
    onUpdate({ ...foundLab, allocation: { ...alloc, ...patch } });
  };
  const total = alloc.deployment + alloc.research + alloc.safety;

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2 flex items-center gap-1">
        <FlaskConical className="w-3 h-3 text-[#7C3AED]" />
        New lab staked with your full compute pool ({ownComputeStock}u). Refunded on failure.
      </p>
      <input
        type="text"
        value={foundLab.name}
        onChange={(e) => onUpdate({ ...foundLab, name: e.target.value })}
        placeholder="Lab name"
        maxLength={60}
        className="w-full min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text mb-2"
      />
      <textarea
        value={foundLab.spec ?? ""}
        onChange={(e) => onUpdate({ ...foundLab, spec: e.target.value || undefined })}
        placeholder="Lab spec / mission (optional)"
        maxLength={500}
        rows={2}
        className="w-full rounded-lg border border-border bg-warm-gray px-2 py-1 text-xs text-text resize-none mb-2"
      />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-muted">Initial allocation</span>
        <span className={`text-[10px] font-mono ${total === 100 ? "text-text-muted" : "text-viz-danger"}`}>
          {total}% {total !== 100 ? "(must total 100)" : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {(["deployment", "research", "safety"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <label className="text-[11px] text-text-muted capitalize w-20 shrink-0">{k}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={alloc[k]}
              onChange={(e) => setAlloc({ [k]: parseInt(e.target.value) || 0 })}
              className="flex-1"
            />
            <span className="text-[11px] font-mono w-10 text-right">{alloc[k]}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MergeLabForm({
  mergeLab,
  ownedLab,
  otherLabs,
  onUpdate,
}: {
  mergeLab: NonNullable<ActionDraft["mergeLab"]>;
  ownedLab: LabRef;
  otherLabs: LabRef[];
  onUpdate: (ml: ActionDraft["mergeLab"]) => void;
}) {
  const counterpartyId = mergeLab.absorbedLabId === ownedLab.labId
    ? mergeLab.survivorLabId
    : mergeLab.absorbedLabId;
  const submitterIsSurvivor = mergeLab.survivorLabId === ownedLab.labId;

  const setCounterparty = (newLabId: Id<"labs">) => {
    onUpdate({
      ...mergeLab,
      absorbedLabId: submitterIsSurvivor ? newLabId : ownedLab.labId,
      survivorLabId: submitterIsSurvivor ? ownedLab.labId : newLabId,
    });
  };

  const setSurvivor = (side: "mine" | "theirs") => {
    const theirId = counterpartyId;
    onUpdate({
      ...mergeLab,
      absorbedLabId: side === "mine" ? theirId : ownedLab.labId,
      survivorLabId: side === "mine" ? ownedLab.labId : theirId,
    });
  };

  return (
    <div className="mt-2 pt-2 border-t border-border">
      <p className="text-[11px] text-text-muted mb-2 flex items-center gap-1">
        <GitMerge className="w-3 h-3 text-[#0369A1]" />
        Merger: the absorbed lab is decommissioned and its compute flows to the survivor owner.
      </p>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-text-muted shrink-0 w-24">Other lab:</label>
        <select
          value={counterpartyId}
          onChange={(e) => setCounterparty(e.target.value as Id<"labs">)}
          className="flex-1 min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text"
        >
          {otherLabs.map((l) => (
            <option key={l.labId} value={l.labId}>{l.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-text-muted shrink-0 w-24">Survivor:</label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setSurvivor("mine")}
            className={`min-h-[36px] px-3 text-xs font-bold transition-colors ${
              submitterIsSurvivor ? "bg-[#0369A1] text-white" : "bg-warm-gray text-text-muted hover:bg-border"
            }`}
          >
            My lab ({ownedLab.name})
          </button>
          <button
            onClick={() => setSurvivor("theirs")}
            className={`min-h-[36px] px-3 text-xs font-bold transition-colors ${
              !submitterIsSurvivor ? "bg-[#0369A1] text-white" : "bg-warm-gray text-text-muted hover:bg-border"
            }`}
          >
            Their lab
          </button>
        </div>
      </div>
      <input
        type="text"
        value={mergeLab.newName ?? ""}
        onChange={(e) => onUpdate({ ...mergeLab, newName: e.target.value || undefined })}
        placeholder="New name for the merged lab (optional)"
        maxLength={60}
        className="w-full min-h-[44px] rounded-lg border border-border bg-warm-gray px-2 text-xs text-text mb-2"
      />
      <textarea
        value={mergeLab.newSpec ?? ""}
        onChange={(e) => onUpdate({ ...mergeLab, newSpec: e.target.value || undefined })}
        placeholder="New AI directive / spec for the merged lab (optional)"
        maxLength={500}
        rows={2}
        className="w-full rounded-lg border border-border bg-warm-gray px-2 py-1 text-xs text-text resize-none"
      />
    </div>
  );
}
