"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ROLE_MAP, AI_SYSTEMS_ROLE_ID, hasCompute } from "@/lib/game-data";
import { QRCode } from "@/components/qr-codes";
import { NumberField } from "@/components/number-field";
import { Play, Lock, QrCode, Zap, X, Eye } from "lucide-react";
import type { FacilitatorPhaseProps } from "./types";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthMutation } from "@/lib/hooks";

interface LobbyPhaseProps extends FacilitatorPhaseProps {
  connectedCount: number;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
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
  startGame,
  toggleEnabled,
  setControlMode,
  kickToAI,
}: LobbyPhaseProps) {
  const [pendingStart, setPendingStart] = useState(false);
  const [qrOverlay, setQrOverlay] = useState<string | null>(null);
  const updateTableCompute = useAuthMutation(api.games.updateTableCompute);
  const observerCounts = useQuery(api.observers.countsByGame, { gameId });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const gameJoinUrl = game.joinCode ? `${origin}/game/join/${game.joinCode}` : null;

  const enabledTables = tables.filter((t) => t.enabled !== false);
  // table.computeStock is the single source of truth for all roles (including lab CEOs)
  const getCompute = (table: (typeof tables)[0]) => table.computeStock ?? 0;
  const computeTotal = enabledTables.reduce((sum, t) => sum + getCompute(t), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* ─── Game Join Code ─── */}
      {gameJoinUrl && (
        <div className="flex flex-col items-center mb-6">
          <div className="bg-navy rounded-xl border border-navy-light p-5 flex flex-col items-center gap-3">
            <p className="text-sm text-text-light">
              Go to <span className="font-mono font-bold text-white">{host}</span> and enter this code
            </p>
            <div className="text-4xl md:text-5xl font-mono font-extrabold text-white tracking-[0.3em]">
              {game.joinCode}
            </div>
            <QRCode value={gameJoinUrl} size={isProjector ? 240 : 160} />
            <p className="text-xs text-text-light">
              {connectedCount}/{enabledTables.length} players joined
            </p>
          </div>
        </div>
      )}

      {/* ─── Compact Role Table ─── */}
      <div className="bg-navy rounded-xl border border-navy-light overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-light/60 text-left text-xs border-b border-navy-light">
              <th className="py-2 px-3 font-semibold">Role</th>
              {!isProjector && <th className="py-2 px-3 font-semibold">Player</th>}
              {!isProjector && <th className="py-2 px-3 font-semibold text-center">Mode</th>}
              {!isProjector && (
                <th className="py-2 px-3 font-semibold text-right">
                  <span className="flex items-center justify-end gap-1">
                    <Zap className="w-3 h-3" /> {computeTotal}u
                  </span>
                </th>
              )}
              {!isProjector && <th className="py-2 px-3 font-semibold">Code</th>}
              <th className="py-2 px-3 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => {
              const role = ROLE_MAP.get(table.roleId);
              const isRequired = role?.required ?? false;
              const isEnabled = table.enabled !== false;
              const isAiSystems = table.roleId === AI_SYSTEMS_ROLE_ID;
              const showJoinCode = isEnabled && table.controlMode === "human" && !table.connected;
              const showCompute = isEnabled && role && hasCompute(role);

              return (
                <tr
                  key={table._id}
                  className={`border-b border-navy-light/30 ${!isEnabled ? "opacity-40" : ""}`}
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: role?.color }}
                      />
                      <span className="font-bold text-white truncate">{table.roleName}</span>
                      {isRequired && <Lock className="w-3 h-3 text-navy-muted shrink-0" />}
                    </div>
                  </td>

{!isProjector && (
                    <td className="py-2 px-3 text-text-light text-xs truncate max-w-[120px]">
                      {table.playerName ?? "—"}
                    </td>
                  )}

{!isProjector && (
                    <td className="py-2 px-3">
                      <div className="flex rounded overflow-hidden border border-navy-light w-fit mx-auto">
                        {(["human", "ai", "npc"] as const).map((mode) => {
                          const isActive = isEnabled && table.controlMode === mode;
                          return (
                            <button
                              key={mode}
                              onClick={() => {
                                if (isActive && !isRequired) {
                                  void toggleEnabled({ tableId: table._id });
                                } else if (!isEnabled) {
                                  void (async () => {
                                    await toggleEnabled({ tableId: table._id });
                                    await setControlMode({ tableId: table._id, controlMode: mode });
                                  })();
                                } else if (table.connected && table.controlMode === "human" && mode === "ai") {
                                  void kickToAI({ tableId: table._id });
                                } else {
                                  void setControlMode({ tableId: table._id, controlMode: mode });
                                }
                              }}
                              className={`text-[10px] px-2 py-1 font-semibold transition-colors ${
                                isActive
                                  ? mode === "human" ? "bg-viz-safety text-navy" : mode === "ai" ? "bg-viz-capability text-navy" : "bg-viz-warning text-navy"
                                  : !isEnabled
                                    ? "bg-navy-light/50 text-text-light/60 hover:text-white"
                                    : "bg-navy-dark text-navy-muted hover:text-text-light"
                              }`}
                            >
                              {mode === "human" ? "H" : mode === "ai" ? "AI" : "NPC"}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}

{!isProjector && (
                    <td className="py-2 px-3 text-right">
                      {showCompute ? (
                        <InlineComputeInput
                          value={getCompute(table)}
                          onChange={(val) => {
                            // All roles (including lab CEOs) update via updateTableCompute which
                            // emits a ledger facilitator row and keeps labs table consistent.
                            void updateTableCompute({ tableId: table._id, computeStock: val });
                          }}
                        />
                      ) : (
                        <span className="text-navy-muted text-xs">—</span>
                      )}
                    </td>
                  )}

{!isProjector && (
                    <td className="py-2 px-3">
                      {showJoinCode ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-text-light tracking-wider">
                            {table.joinCode}
                          </span>
                          <button
                            onClick={() => setQrOverlay(table._id)}
                            className="text-text-light hover:text-white transition-colors p-0.5"
                            title="Show QR code"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-navy-muted text-xs">—</span>
                      )}
                    </td>
                  )}

                  <td className="py-2 px-3 text-right">
                    {table.connected ? (
                      <span className="text-xs text-viz-safety font-mono">Connected</span>
                    ) : isEnabled && table.controlMode === "ai" ? (
                      <span className="text-xs text-viz-capability font-mono">AI</span>
                    ) : isEnabled && table.controlMode === "npc" ? (
                      <span className="text-xs text-viz-warning font-mono">NPC</span>
                    ) : isEnabled ? (
                      <span className="text-xs text-navy-muted font-mono">Waiting</span>
                    ) : (
                      <span className="text-xs text-navy-muted font-mono">Disabled</span>
                    )}
                    {(observerCounts?.[table.roleId] ?? 0) > 0 && (
                      <span
                        className="text-[10px] mt-0.5 ml-2 inline-flex items-center gap-0.5 text-text-light"
                        title={`${observerCounts?.[table.roleId]} observer${observerCounts?.[table.roleId] === 1 ? "" : "s"} watching`}
                      >
                        <Eye className="w-2.5 h-2.5" /> {observerCounts?.[table.roleId]}
                      </span>
                    )}
                    {isAiSystems && isEnabled && (
                      <div className={`text-[10px] mt-0.5 ${table.aiDisposition ? "text-[#A78BFA]" : "text-navy-muted"}`}>
                        {table.aiDisposition ? "Disposition set" : "Disposition pending"}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Start / Lock Buttons ─── */}
      {!isProjector && !pendingStart && (
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setPendingStart(true)}
            className="py-2.5 px-6 bg-white text-navy rounded-lg font-extrabold text-base hover:bg-off-white transition-colors flex items-center gap-2"
          >
            <Play className="w-5 h-5" /> Start Game
          </button>
        </div>
      )}

      {/* ─── Start Confirmation ─── */}
      {!isProjector && pendingStart && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-text-light">
            Review compute allocations above, then confirm.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setPendingStart(false)}
              className="py-2.5 px-5 bg-navy-light text-text-light rounded-lg font-bold text-sm hover:bg-navy-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setPendingStart(false); void safeAction("Start game", () => startGame({ gameId }))(); }}
              className="py-2.5 px-8 bg-white text-navy rounded-lg font-extrabold text-base hover:bg-off-white transition-colors flex items-center gap-2"
            >
              <Play className="w-5 h-5" /> Confirm Start
            </button>
          </div>
        </div>
      )}

      {/* ─── QR Overlay ─── */}
      {qrOverlay && <QrOverlay table={tables.find((t) => t._id === qrOverlay)} origin={origin} gameId={gameId} onClose={() => setQrOverlay(null)} />}
    </div>
  );
}

function QrOverlay({ table, origin, gameId, onClose }: { table: FacilitatorPhaseProps["tables"][number] | undefined; origin: string; gameId: Id<"games">; onClose: () => void }) {
  if (!table) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-navy rounded-2xl p-8 flex flex-col items-center gap-4 max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">{table.roleName}</h3>
        <QRCode value={`${origin}/game/${gameId}/table/${table._id}`} size={280} />
        <span className="text-2xl font-mono text-white tracking-[0.3em]">{table.joinCode}</span>
        <button onClick={onClose} className="mt-2 text-text-light hover:text-white transition-colors flex items-center gap-1.5 text-sm">
          <X className="w-4 h-4" /> Close
        </button>
      </div>
    </div>
  );
}

/** Tiny inline number input for compute stock — click to edit, blur to save. */
function InlineComputeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="font-mono text-xs text-white hover:text-viz-warning transition-colors tabular-nums"
        title="Click to edit"
      >
        {value}u
      </button>
    );
  }

  return (
    <NumberField
      value={value}
      onChange={onChange}
      min={0}
      integer
      autoFocus
      onBlur={() => setEditing(false)}
      onEscape={() => setEditing(false)}
      ariaLabel="Compute stock"
      className="w-14 text-right font-mono text-xs text-white bg-navy-dark border border-navy-light rounded px-1.5 py-0.5 outline-none focus:border-text-light tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}
