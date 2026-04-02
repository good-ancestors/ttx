"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { getCapabilityDescription } from "@/lib/game-data";
import { NarrativePanel } from "@/components/narrative-panel";
import { WorldStateEditor, NarrativeEditor } from "@/components/manual-controls";
import {
  Loader2,
  Pencil,
  Plus,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { FacilitatorPhaseProps, Round } from "./types";
import type { Id } from "@convex/_generated/dataModel";

// ─── Extracted sub-components ─────────────────────────────────────────────────

function ComputeEditor({ labs, gameId, computeChanges, onClose }: {
  labs: { name: string; roleId: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];
  gameId: Id<"games">;
  computeChanges?: { distribution: { labName: string; baseline: number; modifier: number; newTotal: number }[] };
  onClose: () => void;
}) {
  const updateLabs = useMutation(api.games.updateLabs);
  const [stocks, setStocks] = useState<Record<string, number>>(
    Object.fromEntries(labs.map((l) => [l.name, l.computeStock]))
  );
  const handleSave = async () => {
    const updated = labs.map((l) => ({
      name: l.name, roleId: l.roleId, computeStock: stocks[l.name] ?? l.computeStock,
      rdMultiplier: l.rdMultiplier, allocation: l.allocation,
    }));
    await updateLabs({ gameId, labs: updated });
    onClose();
  };
  return (
    <div>
      <p className="text-xs text-text-light mb-3">Adjust compute stock for each lab. Each unit ≈ 1M H100e.</p>
      <div className="space-y-3">
        {labs.map((lab) => {
          const change = computeChanges?.distribution.find((d) => d.labName === lab.name);
          const before = change ? change.newTotal - change.baseline - change.modifier : null;
          return (
            <div key={lab.name} className="flex items-center gap-3">
              <span className="text-sm text-white min-w-[120px]">{lab.name}</span>
              {before !== null && (
                <span className="text-[10px] text-navy-muted font-mono w-16 text-right">was {before}u</span>
              )}
              {change && (
                <span className={`text-[10px] font-mono ${change.baseline + change.modifier >= 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                  {change.baseline + change.modifier >= 0 ? "+" : ""}{change.baseline + change.modifier}
                </span>
              )}
              <span className="text-navy-muted">→</span>
              <input
                type="number"
                value={stocks[lab.name] ?? lab.computeStock}
                onChange={(e) => setStocks({ ...stocks, [lab.name]: parseInt(e.target.value) || 0 })}
                className="w-20 text-sm bg-navy border border-navy-light rounded px-2 py-1 text-white font-mono text-right focus:outline-none focus:border-text-light"
              />
              <span className="text-[10px] text-navy-muted">units</span>
            </div>
          );
        })}
      </div>
      <button onClick={() => void handleSave()} className="mt-4 text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors">
        Save
      </button>
    </div>
  );
}

interface NarratePhaseProps extends FacilitatorPhaseProps {
  currentRound: Round | undefined;
  resolving: boolean;
  resolveStep: string;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  advanceRound: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  finishGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; computeStock: number; rdMultiplier: number }) => Promise<unknown>;
}

// eslint-disable-next-line complexity
export function NarratePhase({
  gameId,
  game,
  tables,
  isProjector,
  currentRound,
  resolving,
  resolveStep,
  safeAction,
  advanceRound,
  finishGame,
  addLab,
}: NarratePhaseProps) {
  const [editModal, setEditModal] = useState<"narrative" | "dials" | "addlab" | "compute" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"advance" | "end" | null>(null);
  const [newLabName, setNewLabName] = useState("");
  const [newLabRoleId, setNewLabRoleId] = useState("");
  const [newLabCompute, setNewLabCompute] = useState(10);
  const [newLabMultiplier, setNewLabMultiplier] = useState(1);
  const [whereExpanded, setWhereExpanded] = useState(true);
  const enabledTables = tables.filter((t) => t.enabled);

  return (
    <>
      {/* Resolve progress indicator */}
      {resolving && resolveStep && (
        <div className="flex items-center gap-2 py-2 text-sm text-text-light">
          <Loader2 className="w-4 h-4 animate-spin" />
          {resolveStep}
        </div>
      )}

      {/* What Happened — shows loading skeleton while resolving, then narrative */}
      {(resolving || currentRound?.summary) && (
        <NarrativePanel round={currentRound} />
      )}

      {/* Where We Are Now — includes compute update */}
      {currentRound?.summary && (
        <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
          <button
            onClick={() => setWhereExpanded(!whereExpanded)}
            className="flex items-center gap-2 w-full"
          >
            <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${whereExpanded ? "" : "-rotate-90"}`} />
            <span className="text-sm font-semibold uppercase tracking-wider text-text-light">Where We Are Now</span>
            {(() => {
              const alignmentColor = game.worldState.alignment <= 3 ? "#EF4444" : game.worldState.alignment >= 7 ? "#22C55E" : "#F59E0B";
              const trajectory = game.worldState.alignment <= 3 ? "RACE" : game.worldState.alignment >= 6 ? "SLOWDOWN" : "UNCERTAIN";
              return (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto"
                  style={{ backgroundColor: `${alignmentColor}20`, color: alignmentColor }}
                >
                  {trajectory}
                </span>
              );
            })()}
          </button>
          {whereExpanded && (
            <div className="mt-3">
              {(() => {
                const leading = game.labs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b), game.labs[0]);
                const cap = leading ? getCapabilityDescription(leading.rdMultiplier) : null;
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      {game.labs.map((lab) => {
                        const change = currentRound.computeChanges?.distribution.find((d) => d.labName === lab.name);
                        const totalChange = change ? change.baseline + change.modifier : 0;
                        return (
                          <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
                            <div className="text-sm font-bold text-white">{lab.name}</div>
                            <div className="text-xl font-black text-[#06B6D4] font-mono">{lab.rdMultiplier}×</div>
                            <div className="text-xs text-text-light">
                              {lab.computeStock}u
                              {totalChange !== 0 && (
                                <span className={`ml-1 font-mono ${totalChange > 0 ? "text-viz-safety" : "text-viz-danger"}`}>
                                  ({totalChange > 0 ? "+" : ""}{totalChange})
                                </span>
                              )}
                              {" · "}Safety {lab.allocation.safety}%
                            </div>
                            {lab.spec && (
                              <div className="text-[10px] text-text-light/70 mt-1.5 pt-1.5 border-t border-navy-light leading-relaxed line-clamp-3" title={lab.spec}>
                                Spec: {lab.spec}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {cap && (
                      <>
                        <div className="bg-navy rounded-lg p-4 border border-navy-light mb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-white">How Capable is AI?</span>
                            <span className="text-xs text-viz-capability font-mono ml-auto">{cap.agent} · {cap.rdRange}</span>
                          </div>
                          <p className="text-sm text-[#E2E8F0] mb-2">{cap.generalCapability}</p>
                          <div className="space-y-1 mb-2">
                            {cap.specificCapabilities.map((c, i) => (
                              <p key={`cap-${i}`} className="text-sm text-text-light flex items-start gap-1.5">
                                <span className="text-viz-capability mt-0.5">●</span> {c}
                              </p>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-navy-light">
                            <span className="text-base font-bold text-white">{cap.timeCompression}</span>
                          </div>
                        </div>
                        <div className="bg-navy rounded-lg p-3 border border-navy-light">
                          <p className="text-sm text-[#E2E8F0]">{cap.implication}</p>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Edit modal overlay */}
      {!isProjector && editModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={() => setEditModal(null)}>
          <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-white capitalize">{editModal === "addlab" ? "Add Lab" : editModal === "compute" ? "Edit Compute" : editModal === "dials" ? "Edit World State" : "Edit Narrative"}</span>
              <button onClick={() => setEditModal(null)} className="text-text-light hover:text-white text-sm">Close</button>
            </div>
            {editModal === "narrative" && (
              <NarrativeEditor gameId={gameId} roundNumber={game.currentRound} currentSummary={currentRound?.summary ?? undefined} startOpen />
            )}
            {editModal === "dials" && (
              <WorldStateEditor gameId={gameId} worldState={game.worldState} startOpen />
            )}
            {editModal === "addlab" && (
              <div>
                <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
                  <div>
                    <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Lab Name</label>
                    <input type="text" value={newLabName} onChange={(e) => setNewLabName(e.target.value)} placeholder="e.g. Sovereign Compute Centre" className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white placeholder:text-navy-muted focus:outline-none focus:border-text-light" />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Controlled by</label>
                    <select value={newLabRoleId} onChange={(e) => setNewLabRoleId(e.target.value)} className="w-full text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light">
                      <option value="">Select role...</option>
                      {enabledTables.map((t) => (
                        <option key={t.roleId} value={t.roleId}>{t.roleName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Compute</label>
                    <input type="number" value={newLabCompute} onChange={(e) => setNewLabCompute(Number(e.target.value))} className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light" />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-light uppercase tracking-wider block mb-1">Multiplier</label>
                    <input type="number" value={newLabMultiplier} onChange={(e) => setNewLabMultiplier(Number(e.target.value))} step={0.1} className="w-20 text-sm bg-navy-dark border border-navy-light rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-text-light" />
                  </div>
                  <button
                    onClick={async () => {
                      if (!newLabName || !newLabRoleId) return;
                      await addLab({ gameId, name: newLabName, roleId: newLabRoleId, computeStock: newLabCompute, rdMultiplier: newLabMultiplier });
                      setNewLabName(""); setNewLabRoleId(""); setNewLabCompute(10); setNewLabMultiplier(1); setEditModal(null);
                    }}
                    disabled={!newLabName || !newLabRoleId}
                    className="text-sm px-4 py-1.5 bg-white text-navy rounded font-bold hover:bg-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
            {editModal === "compute" && (
              <ComputeEditor labs={game.labs} gameId={gameId} computeChanges={currentRound?.computeChanges ?? undefined} onClose={() => setEditModal(null)} />
            )}
          </div>
        </div>
      )}

      {/* Edit controls — above Advance button */}
      {!isProjector && (
        <div className="flex gap-3 mt-2 mb-4 flex-wrap">
          <button onClick={() => setEditModal("narrative")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit narrative
          </button>
          <button onClick={() => setEditModal("dials")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit dials
          </button>
          <button onClick={() => setEditModal("compute")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit compute
          </button>
          <button onClick={() => setEditModal("addlab")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Lab
          </button>
        </div>
      )}

      {/* Advance / End button */}
      {!isProjector && (
        game.currentRound < 4 ? (
          pendingConfirm === "advance" ? (
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingConfirm(null)} className="flex-1 py-4 bg-navy-light text-text-light rounded-lg font-bold text-base">Cancel</button>
              <button onClick={() => { setPendingConfirm(null); void safeAction("Advance round", () => advanceRound({ gameId }))(); }} className="flex-1 py-4 bg-white text-navy rounded-lg font-extrabold text-base">Confirm Advance</button>
            </div>
          ) : (
            <button
              onClick={() => setPendingConfirm("advance")}
              className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4 hover:bg-off-white transition-colors flex items-center justify-center gap-2"
            >
              Advance to Next Round <ChevronRight className="w-5 h-5" />
            </button>
          )
        ) : (
          pendingConfirm === "end" ? (
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingConfirm(null)} className="flex-1 py-4 bg-navy-light text-text-light rounded-lg font-bold text-base">Cancel</button>
              <button onClick={() => { setPendingConfirm(null); void safeAction("End scenario", () => finishGame({ gameId }))(); }} className="flex-1 py-4 bg-viz-danger text-white rounded-lg font-extrabold text-base">End Scenario</button>
            </div>
          ) : (
            <button
              onClick={() => setPendingConfirm("end")}
              className="w-full py-4 bg-white text-navy rounded-lg font-extrabold text-lg mt-4 hover:bg-off-white transition-colors"
            >
              End Scenario
            </button>
          )
        )
      )}
    </>
  );
}
