"use client";

import { useState } from "react";
import { getCapabilityDescription } from "@/lib/game-data";
import { NarrativePanel } from "@/components/narrative-panel";
import { WorldStateEditor, NarrativeEditor } from "@/components/manual-controls";
import {
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import type { FacilitatorPhaseProps, Submission, Round } from "./types";
import type { Id } from "@convex/_generated/dataModel";

// ─── Extracted sub-components ─────────────────────────────────────────────────

function StreamingEventsPanel({ events }: { events: { id: string; description: string; visibility: string; worldImpact?: string }[] }) {
  return (
    <div className="bg-navy rounded-xl border border-navy-light p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">What Happened</span>
        <Loader2 className="w-3.5 h-3.5 text-text-light animate-spin" />
      </div>
      <div className="space-y-2">
        {events.map((event, idx) => (
          <div key={event.id || idx} className="flex items-start gap-2 py-2 border-b border-navy-light/50 last:border-0 animate-fadeIn">
            <span className={`mt-0.5 shrink-0 text-sm ${event.visibility === "covert" ? "text-viz-warning" : "text-viz-safety"}`}>
              {event.visibility === "covert" ? "◐" : "●"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#E2E8F0]">{event.description}</p>
              {event.worldImpact && <p className="text-[10px] text-text-light mt-0.5">{event.worldImpact}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function ResolvedEventsPanel({
  events, isProjector, resolving, revealedSecrets, toggleReveal, onReNarrate,
}: {
  events: { id: string; description: string; visibility: "public" | "covert"; actors: string[]; worldImpact?: string }[];
  isProjector: boolean; resolving: boolean;
  revealedSecrets: Set<string>; toggleReveal: (key: string) => void;
  onReNarrate: () => Promise<void>;
}) {
  return (
    <div className="bg-navy rounded-xl border border-navy-light p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-light">What Happened</span>
        <span className="text-[10px] text-navy-muted">
          {events.filter((e) => e.visibility === "covert").length} covert
        </span>
      </div>
      <div className="space-y-2">
        {events.map((event) => {
          const isCovert = event.visibility === "covert";
          const isRevealed = revealedSecrets.has(`event-${event.id}`);
          return (
            <div
              key={event.id}
              className={`flex items-start gap-2 py-2 border-b border-navy-light/50 last:border-0 ${
                isCovert && !isRevealed ? "opacity-60" : ""
              }`}
            >
              {isCovert ? (
                <button onClick={() => toggleReveal(`event-${event.id}`)} className="mt-0.5 shrink-0" title={isRevealed ? "Click to hide" : "Click to reveal"}>
                  {isRevealed ? <Eye className="w-4 h-4 text-viz-warning" /> : <EyeOff className="w-4 h-4 text-viz-warning" />}
                </button>
              ) : (
                <span className="text-viz-safety mt-0.5 shrink-0 text-sm">●</span>
              )}
              <div className="flex-1 min-w-0">
                {isCovert && !isRevealed ? (
                  <span className="text-sm text-text-light italic cursor-pointer" onClick={() => toggleReveal(`event-${event.id}`)}>
                    [Covert event — click to reveal]
                  </span>
                ) : (
                  <>
                    <p className="text-sm text-[#E2E8F0]">{event.description}</p>
                    {event.worldImpact && <p className="text-[10px] text-text-light mt-0.5">{event.worldImpact}</p>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!isProjector && (
        <button
          onClick={onReNarrate}
          disabled={resolving}
          className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1 mt-3 disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" /> Re-narrate
        </button>
      )}
    </div>
  );
}

interface NarratePhaseProps extends FacilitatorPhaseProps {
  submissions: Submission[];
  currentRound: Round | undefined;
  resolving: boolean;
  resolveStep: string;
  revealedCount: number;
  revealedSecrets: Set<string>;
  toggleReveal: (key: string) => void;
  revealAllSecrets: () => void;
  handleReResolve: () => Promise<void>;
  handleReNarrate: () => Promise<void>;
  rerollAction: (args: { submissionId: Id<"submissions">; actionIndex: number }) => Promise<unknown>;
  overrideProbability: (args: { submissionId: Id<"submissions">; actionIndex: number; probability: number }) => Promise<unknown>;
  safeAction: (label: string, fn: () => Promise<unknown>) => () => Promise<void>;
  advanceRound: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  finishGame: (args: { gameId: Id<"games"> }) => Promise<unknown>;
  addLab: (args: { gameId: Id<"games">; name: string; roleId: string; computeStock: number; rdMultiplier: number }) => Promise<unknown>;
  streamingEvents?: { id: string; description: string; visibility: string; worldImpact?: string }[];
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
  revealedSecrets,
  toggleReveal,
  handleReNarrate,
  safeAction,
  advanceRound,
  finishGame,
  addLab,
  streamingEvents,
}: NarratePhaseProps) {
  const [editModal, setEditModal] = useState<"narrative" | "dials" | "addlab" | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<"advance" | "end" | null>(null);
  const [newLabName, setNewLabName] = useState("");
  const [newLabRoleId, setNewLabRoleId] = useState("");
  const [newLabCompute, setNewLabCompute] = useState(10);
  const [newLabMultiplier, setNewLabMultiplier] = useState(1);
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

      {/* Section 2a: Streaming events — show during resolution before final write */}
      {resolving && streamingEvents && streamingEvents.length > 0 && !currentRound?.resolvedEvents?.length && (
        <StreamingEventsPanel events={streamingEvents} />
      )}

      {/* Section 2b: Resolved Events — show after resolve API returns */}
      {currentRound?.resolvedEvents && currentRound.resolvedEvents.length > 0 && (
        <ResolvedEventsPanel
          events={currentRound.resolvedEvents}
          isProjector={isProjector}
          resolving={resolving}
          revealedSecrets={revealedSecrets}
          toggleReveal={toggleReveal}
          onReNarrate={handleReNarrate}
        />
      )}

      {/* Section 3: The Story — show after narrate API returns */}
      {currentRound?.summary && (
        <>
          <NarrativePanel round={currentRound} />

          {/* Where We Are Now */}
          {(() => {
            const leading = game.labs.reduce((a, b) => (a.rdMultiplier > b.rdMultiplier ? a : b), game.labs[0]);
            const cap = leading ? getCapabilityDescription(leading.rdMultiplier) : null;
            const alignmentColor = game.worldState.alignment <= 3 ? "#EF4444" : game.worldState.alignment >= 7 ? "#22C55E" : "#F59E0B";
            const trajectory = game.worldState.alignment <= 3 ? "RACE" : game.worldState.alignment >= 6 ? "SLOWDOWN" : "UNCERTAIN";
            return (
              <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold uppercase tracking-wider text-text-light">Where We Are Now</span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${alignmentColor  }20`, color: alignmentColor }}
                  >
                    {trajectory}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {game.labs.map((lab) => (
                    <div key={lab.name} className="bg-navy rounded-lg p-3 border border-navy-light">
                      <div className="text-sm font-bold text-white">{lab.name}</div>
                      <div className="text-xl font-black text-[#06B6D4] font-mono">{lab.rdMultiplier}×</div>
                      <div className="text-xs text-text-light">{lab.computeStock}u · Safety {lab.allocation.safety}%</div>
                      {lab.spec && (
                        <div className="text-[10px] text-text-light/70 mt-1.5 pt-1.5 border-t border-navy-light leading-relaxed line-clamp-3" title={lab.spec}>
                          Spec: {lab.spec}
                        </div>
                      )}
                    </div>
                  ))}
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
              </div>
            );
          })()}
        </>
      )}

      {/* Edit controls */}
      {!isProjector && (
        <div className="flex gap-3 mt-2 mb-4 flex-wrap">
          <button onClick={() => setEditModal("narrative")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit narrative
          </button>
          <button onClick={() => setEditModal("dials")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Edit dials
          </button>
          <button onClick={() => setEditModal("addlab")} className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-medium hover:bg-navy-muted transition-colors flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Lab
          </button>
        </div>
      )}

      {/* Edit modal overlay */}
      {!isProjector && editModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={() => setEditModal(null)}>
          <div className="bg-navy-dark border border-navy-light rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-white capitalize">{editModal === "addlab" ? "Add Lab" : editModal === "dials" ? "Edit World State" : "Edit Narrative"}</span>
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
          </div>
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
