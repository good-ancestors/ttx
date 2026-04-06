"use client";

import { useState, useMemo } from "react";
import { ROLES, AI_SYSTEMS_ROLE_ID, DEFAULT_LABS } from "@/lib/game-data";
import { calculateStartingCompute } from "@/lib/compute";
import { QRCode } from "@/components/qr-codes";
import { Play, Lock, QrCode, Zap } from "lucide-react";
import type { FacilitatorPhaseProps } from "./types";
import type { Id } from "@convex/_generated/dataModel";

interface LobbyPhaseProps extends FacilitatorPhaseProps {
  connectedCount: number;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  lockGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  startGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  toggleEnabled: (args: { tableId: Id<"tables"> }) => Promise<unknown>;
  setControlMode: (args: { tableId: Id<"tables">; controlMode: "human" | "ai" | "npc" }) => Promise<unknown>;
  kickToAI: (args: { tableId: Id<"tables"> }) => Promise<unknown>;
}

export function LobbyPhase({
  gameId,
  game,
  tables,
  isProjector,
  connectedCount,
  safeAction,
  lockGame,
  startGame,
  toggleEnabled,
  setControlMode,
  kickToAI,
}: LobbyPhaseProps) {

  const [pendingStart, setPendingStart] = useState(false);
  const [showRejoin, setShowRejoin] = useState<Set<string>>(new Set());
  const toggleRejoin = (id: string) => setShowRejoin((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="text-center mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-extrabold mb-2">Waiting for Tables</h2>
        <p className="text-text-light text-sm md:text-base">
          {connectedCount}/{tables.length} tables connected
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {tables.map((table) => {
          const role = ROLES.find((r) => r.id === table.roleId);
          const isRequired = role?.required ?? false;
          return (
            <div
              key={table._id}
              className={`bg-navy rounded-xl border p-3 md:p-4 transition-opacity ${
                table.enabled ? "border-navy-light" : "border-navy-light/40 opacity-60"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role?.color }} />
                <span className="text-sm md:text-base font-bold truncate">{table.roleName}</span>
                {isRequired && (
                  <span title="Required role — cannot be disabled">
                    <Lock className="w-3 h-3 text-navy-muted shrink-0" />
                  </span>
                )}
                {table.connected && (
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-viz-safety font-mono">Connected</span>
                    <button
                      onClick={() => toggleRejoin(table._id)}
                      className="text-text-light hover:text-white transition-colors p-0.5"
                      title="Show QR code for rejoin"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Mode toggle — works for both connected and disconnected players */}
              {!isProjector && (
                <div className="flex rounded overflow-hidden border border-navy-light w-full mb-3">
                  {(["human", "ai", "npc"] as const).map((mode) => {
                    const isActive = table.enabled && table.controlMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => {
                          if (isActive && !isRequired) {
                            void toggleEnabled({ tableId: table._id });
                          } else if (!table.enabled) {
                            void (async () => {
                              await toggleEnabled({ tableId: table._id });
                              await setControlMode({ tableId: table._id, controlMode: mode });
                            })();
                          } else if (table.connected && table.controlMode === "human" && mode === "ai") {
                            // Connected human → kick to AI
                            void kickToAI({ tableId: table._id });
                          } else {
                            void setControlMode({ tableId: table._id, controlMode: mode });
                          }
                        }}
                        className={`text-xs px-3 py-1.5 font-semibold transition-colors flex-1 ${
                          isActive
                            ? mode === "human" ? "bg-viz-safety text-navy" : mode === "ai" ? "bg-viz-capability text-navy" : "bg-viz-warning text-navy"
                            : !table.enabled
                              ? "bg-navy-light/50 text-text-light/60 hover:text-white"
                              : "bg-navy-dark text-navy-muted hover:text-text-light"
                        }`}
                      >
                        {mode === "human" ? "Human" : mode === "ai" ? "AI" : "NPC"}
                      </button>
                    );
                  })}
                </div>
              )}

              {table.enabled && table.controlMode === "human" && (!table.connected || showRejoin.has(table._id)) && (
                <div className="bg-navy-dark rounded-lg p-3 flex flex-col items-center">
                  <QRCode
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/game/${gameId}/table/${table._id}`}
                    size={120}
                  />
                  <span className="text-xs font-mono text-text-light mt-2 tracking-widest">
                    {table.joinCode}
                  </span>
                </div>
              )}
              {table.enabled && table.controlMode === "ai" && !table.connected && (
                <div className="bg-navy-dark rounded-lg p-3 text-center">
                  <span className="text-sm text-text-light">AI-controlled</span>
                </div>
              )}
              {table.enabled && table.controlMode === "npc" && !table.connected && (
                <div className="bg-navy-dark rounded-lg p-3 text-center">
                  <span className="text-sm text-text-light">NPC (sample actions)</span>
                </div>
              )}
              {/* AI Systems disposition status in lobby */}
              {table.roleId === AI_SYSTEMS_ROLE_ID && table.enabled && (
                <div className={`text-xs mt-2 px-2 py-1.5 rounded ${
                  table.aiDisposition
                    ? "bg-[#1E1B4B]/50 text-[#A78BFA]"
                    : "bg-navy-dark text-navy-muted"
                }`}>
                  {table.aiDisposition ? "Disposition: chosen" : "Disposition: pending"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Starting Compute Allocation ─── */}
      {!isProjector && <ComputeAllocationPreview tables={tables} />}

      {!isProjector && (
        <div className="flex justify-center gap-3">
          {!game.locked && (
            <button
              onClick={safeAction("Lock game", () => lockGame({ gameId }))}
              className="py-3 px-6 bg-navy-light text-white rounded-lg font-bold hover:bg-navy-muted transition-colors flex items-center gap-2"
            >
              <Lock className="w-4 h-4" /> Lock Game
            </button>
          )}
          {pendingStart ? (
            <div className="flex gap-2">
              <button
                onClick={() => setPendingStart(false)}
                className="py-3 px-6 bg-navy-light text-text-light rounded-lg font-bold hover:bg-navy-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setPendingStart(false); void safeAction("Start game", () => startGame({ gameId }))(); }}
                className="py-3 px-8 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors flex items-center gap-2"
              >
                <Play className="w-5 h-5" /> Confirm Start
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPendingStart(true)}
              className="py-3 px-8 bg-white text-navy rounded-lg font-extrabold text-lg hover:bg-off-white transition-colors flex items-center gap-2"
            >
              <Play className="w-5 h-5" /> Start Game
            </button>
          )}
          {pendingStart && (
            <p className="text-xs text-text-light mt-2 text-center">Are you sure? All tables will be locked.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ComputeAllocationPreview({ tables }: { tables: FacilitatorPhaseProps["tables"] }) {
  const enabledRoleIds = useMemo(
    () => new Set(tables.filter((t) => t.enabled).map((t) => t.roleId)),
    [tables],
  );
  const allocations = useMemo(() => calculateStartingCompute(enabledRoleIds), [enabledRoleIds]);
  const labTotal = DEFAULT_LABS.reduce((s, l) => s + l.computeStock, 0);
  const nonLabTotal = allocations.filter((a) => !DEFAULT_LABS.some((l) => l.roleId === a.roleId)).reduce((s, a) => s + a.computeStock, 0);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-4 mb-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-text-light" /> Starting Compute
        </span>
        <span className="text-xs font-mono text-text-light">{labTotal + nonLabTotal}u total</span>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-light/60 text-left">
            <th className="pb-1 font-semibold">Entity</th>
            <th className="pb-1 font-semibold text-right">Compute</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((a) => {
            const isLab = DEFAULT_LABS.some((l) => l.roleId === a.roleId);
            return (
              <tr key={a.roleId} className="border-t border-navy-light/30">
                <td className="py-1.5 text-white">
                  {a.name}
                  {isLab && <span className="ml-1 text-text-light/50 text-[10px]">lab</span>}
                </td>
                <td className="py-1.5 text-right font-mono text-white">{a.computeStock}u</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-navy-light">
            <td className="py-1.5 text-text-light font-semibold">Total</td>
            <td className="py-1.5 text-right font-mono text-white font-bold">{labTotal + nonLabTotal}u</td>
          </tr>
        </tfoot>
      </table>

      {nonLabTotal === 0 && (
        <p className="text-[10px] text-text-light/60 mt-2">
          No non-lab compute holders enabled. Enable US President, EU President, or Australia PM to distribute pool compute.
        </p>
      )}
    </div>
  );
}
