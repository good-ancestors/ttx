"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { WORLD_STATE_INDICATORS, COPILOT_APPLY_SIGNAL } from "@/lib/game-data";
import { Pencil, Save, Minus, Plus, AlertTriangle, Wand2, Loader2, Check, Undo2, Send } from "lucide-react";

// Manual world state editor — facilitator can tweak dials directly
export function WorldStateEditor({
  gameId,
  worldState,
}: {
  gameId: Id<"games">;
  worldState: Record<string, number>;
}) {
  const updateWorldState = useMutation(api.games.updateWorldState);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(worldState);

  const handleSave = async () => {
    await updateWorldState({
      gameId,
      worldState: local as {
        capability: number;
        alignment: number;
        tension: number;
        awareness: number;
        regulation: number;
        australia: number;
      },
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setLocal({ ...worldState });
          setEditing(true);
        }}
        className="text-[11px] text-text-light hover:text-white flex items-center gap-1 mt-2 transition-colors"
      >
        <Pencil className="w-3 h-3" /> Edit dials
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-navy rounded-lg border border-navy-light">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-viz-warning uppercase tracking-wider">
          Manual Override
        </span>
        <button
          onClick={handleSave}
          className="text-xs text-viz-safety hover:text-white flex items-center gap-1 font-bold"
        >
          <Save className="w-3 h-3" /> Save
        </button>
      </div>
      {WORLD_STATE_INDICATORS.map((ind) => (
        <div key={ind.key} className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-text-light flex-1">{ind.label}</span>
          <button
            onClick={() =>
              setLocal((prev) => ({ ...prev, [ind.key]: Math.max(0, (prev[ind.key] ?? 0) - 1) }))
            }
            className="w-6 h-6 rounded bg-navy-light flex items-center justify-center text-text-light hover:text-white"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-xs font-mono text-white w-6 text-center">
            {local[ind.key]}
          </span>
          <button
            onClick={() =>
              setLocal((prev) => ({ ...prev, [ind.key]: Math.min(10, (prev[ind.key] ?? 0) + 1) }))
            }
            className="w-6 h-6 rounded bg-navy-light flex items-center justify-center text-text-light hover:text-white"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Manual narrative editor — facilitator can type/edit narrative
export function NarrativeEditor({
  gameId,
  roundNumber,
  currentSummary,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  currentSummary?: {
    narrative?: string;
    geopoliticalEvents: string[];
    aiStateOfPlay: string[];
    headlines: string[];
    facilitatorNotes?: string;
  };
}) {
  const applySummary = useMutation(api.rounds.applySummary);
  const [editing, setEditing] = useState(false);
  // Derive current narrative from summary, updating when summary changes reactively
  const existingNarrative = currentSummary?.narrative
    ?? (currentSummary ? [...currentSummary.geopoliticalEvents, ...currentSummary.aiStateOfPlay].join("\n") : "");
  const [narrative, setNarrative] = useState(existingNarrative);
  // Sync state when summary updates (e.g., AI generates narrative after editor was opened)
  const [lastSynced, setLastSynced] = useState(existingNarrative);
  if (existingNarrative !== lastSynced) {
    setNarrative(existingNarrative);
    setLastSynced(existingNarrative);
  }

  const handleSave = async () => {
    await applySummary({
      gameId,
      roundNumber,
      summary: {
        narrative: narrative || undefined,
        geopoliticalEvents: [],
        aiStateOfPlay: [],
        headlines: [],
      },
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[11px] text-text-light hover:text-white flex items-center gap-1 mt-2 transition-colors"
      >
        <Pencil className="w-3 h-3" /> {currentSummary ? "Edit narrative" : "Write narrative manually"}
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 bg-navy rounded-xl border border-navy-light">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-viz-warning" />
          <span className="text-xs font-semibold text-viz-warning uppercase tracking-wider">
            Manual Narrative
          </span>
        </div>
        <button
          onClick={handleSave}
          className="text-xs text-viz-safety hover:text-white flex items-center gap-1 font-bold"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>

      <label className="text-[11px] text-text-light block mb-1">Narrative (the story read aloud)</label>
      <textarea
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        rows={8}
        className="w-full p-2 bg-navy-dark border border-navy-light rounded text-sm text-white resize-none outline-none"
        placeholder="Enter the narrative for this round..."
      />
    </div>
  );
}

// ─── Facilitator AI Copilot ─────────────────────────────────────────────────
// Conversational assistant that can query game state, propose changes, and
// wait for confirmation before applying them.

interface Snapshot {
  worldState: { capability: number; alignment: number; tension: number; awareness: number; regulation: number; australia: number };
  labs: { name: string; roleId: string; computeStock: number; rdMultiplier: number; allocation: { users: number; capability: number; safety: number } }[];
}

interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
  // If the assistant proposes changes, they're stored here until confirmed
  pendingAction?: boolean;
  applied?: boolean;
  reverted?: boolean;
}

/** Modal version — for use inside edit modals */
export function FacilitatorAdjust({
  gameId,
  currentWorldState,
  currentLabs,
}: {
  gameId: Id<"games">;
  currentWorldState: Snapshot["worldState"];
  currentLabs: Snapshot["labs"];
}) {
  return (
    <CopilotChat gameId={gameId} currentWorldState={currentWorldState} currentLabs={currentLabs} variant="modal" />
  );
}

/** Persistent copilot — always visible during gameplay */
export function FacilitatorCopilot({
  gameId,
  currentWorldState,
  currentLabs,
}: {
  gameId: Id<"games">;
  currentWorldState: Snapshot["worldState"];
  currentLabs: Snapshot["labs"];
}) {
  return (
    <CopilotChat gameId={gameId} currentWorldState={currentWorldState} currentLabs={currentLabs} variant="bar" />
  );
}

function CopilotChat({
  gameId,
  currentWorldState,
  currentLabs,
  variant,
}: {
  gameId: Id<"games">;
  currentWorldState: Snapshot["worldState"];
  currentLabs: Snapshot["labs"];
  variant: "modal" | "bar";
}) {
  const updateWorldState = useMutation(api.games.updateWorldState);
  const updateLabs = useMutation(api.games.updateLabs);

  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(variant === "modal");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string, apply = false) => {
    if (!text.trim() && !apply) return;

    const userMsg: CopilotMessage = { role: "user", content: apply ? "Yes, apply those changes." : text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Build conversation history for the API (last 10 messages for context)
    const history = newMessages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/facilitator-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          instruction: apply ? COPILOT_APPLY_SIGNAL : text.trim(),
          conversationHistory: history,
          dryRun: !apply,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const assistantMsg: CopilotMessage = {
          role: "assistant",
          content: data.explanation,
          pendingAction: !apply && data.hasChanges,
          applied: apply,
        };
        setMessages([...newMessages, assistantMsg]);

        if (!apply && data.hasChanges) {
          // Take snapshot before any changes are applied
          setSnapshot({
            worldState: { ...currentWorldState },
            labs: currentLabs.map((l) => ({ ...l, allocation: { ...l.allocation } })),
          });
        }
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.error ?? "Something went wrong." }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Network error — try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => void sendMessage("", true);

  const handleRevert = async () => {
    if (!snapshot) return;
    await updateWorldState({ gameId, worldState: snapshot.worldState });
    await updateLabs({ gameId, labs: snapshot.labs });
    setSnapshot(null);
    // Mark the last applied message as reverted
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy.findLast((m) => m.applied);
      if (last) last.reverted = true;
      return copy;
    });
    setMessages((prev) => [...prev, { role: "assistant", content: "Changes reverted." }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setSnapshot(null);
  };

  // Last message with pending action (needs confirmation)
  const pendingMsg = messages.findLast((m) => m.pendingAction && !m.applied);
  // Last message that was applied (can be undone)
  const lastApplied = messages.findLast((m) => m.applied && !m.reverted);

  // Bar variant: collapsible inline chat
  if (variant === "bar") {
    return (
      <div className="bg-navy rounded-xl border border-navy-light">
        {/* Input bar — always visible */}
        <div className="flex items-center gap-2 p-3">
          <Wand2 className="w-4 h-4 text-viz-capability shrink-0" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setExpanded(true)}
            placeholder="Ask or adjust anything... &quot;Merge OpenBrain and Conscienta&quot; or &quot;What did China do this round?&quot;"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-navy-muted disabled:opacity-50"
          />
          {loading ? (
            <Loader2 className="w-4 h-4 text-viz-capability animate-spin shrink-0" />
          ) : (
            <button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim()}
              className="shrink-0 p-1.5 text-viz-capability disabled:opacity-30 hover:opacity-80 transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => { setExpanded(!expanded); }}
              className="text-[10px] text-text-light hover:text-white shrink-0"
            >
              {expanded ? "Hide" : `${messages.length} msg`}
            </button>
          )}
        </div>

        {/* Chat history — expandable */}
        {expanded && messages.length > 0 && (
          <div className="border-t border-navy-light">
            <div ref={scrollRef} className="max-h-48 overflow-y-auto px-3 py-2 space-y-2">
              {messages.map((msg, i) => (
                <div key={i} className={`text-[12px] ${msg.role === "user" ? "text-text-light" : "text-[#E2E8F0]"}`}>
                  <span className="font-bold text-[10px] uppercase tracking-wider mr-1.5" style={{ color: msg.role === "user" ? "#94A3B8" : "#06B6D4" }}>
                    {msg.role === "user" ? "You" : "Copilot"}
                  </span>
                  {msg.content}
                  {msg.applied && !msg.reverted && <span className="text-viz-safety ml-1 text-[10px]">Applied</span>}
                  {msg.reverted && <span className="text-viz-warning ml-1 text-[10px]">Reverted</span>}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-navy-light/50">
              {pendingMsg && (
                <button
                  onClick={handleApply}
                  disabled={loading}
                  className="text-[11px] px-3 py-1.5 bg-viz-safety text-navy rounded font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Apply changes
                </button>
              )}
              {lastApplied && snapshot && (
                <button
                  onClick={handleRevert}
                  className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-bold hover:bg-navy-muted transition-colors flex items-center gap-1"
                >
                  <Undo2 className="w-3 h-3" /> Undo
                </button>
              )}
              <button
                onClick={clearHistory}
                className="text-[10px] text-navy-muted hover:text-text-light ml-auto transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Modal variant — full chat view
  return (
    <div className="flex flex-col" style={{ height: "min(60vh, 500px)" }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3">
        {messages.length === 0 && (
          <p className="text-[11px] text-text-light">
            Ask questions about game state, propose changes, or give instructions. Changes are previewed before applying.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`text-sm ${msg.role === "user" ? "text-text-light" : "text-[#E2E8F0]"}`}>
            <span className="font-bold text-[10px] uppercase tracking-wider mr-1.5 block mb-0.5" style={{ color: msg.role === "user" ? "#94A3B8" : "#06B6D4" }}>
              {msg.role === "user" ? "You" : "Copilot"}
            </span>
            {msg.content}
            {msg.applied && !msg.reverted && <span className="text-viz-safety ml-1 text-[10px]">Applied</span>}
            {msg.reverted && <span className="text-viz-warning ml-1 text-[10px]">Reverted</span>}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-text-light">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </div>
        )}
      </div>

      {/* Action buttons */}
      {(pendingMsg || (lastApplied && snapshot)) && (
        <div className="flex items-center gap-2 mb-2">
          {pendingMsg && (
            <button
              onClick={handleApply}
              disabled={loading}
              className="text-[11px] px-3 py-1.5 bg-viz-safety text-navy rounded font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Apply changes
            </button>
          )}
          {lastApplied && snapshot && (
            <button
              onClick={handleRevert}
              className="text-[11px] px-3 py-1.5 bg-navy-light text-text-light rounded font-bold hover:bg-navy-muted transition-colors flex items-center gap-1"
            >
              <Undo2 className="w-3 h-3" /> Undo last
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "What if we merge OpenBrain and Conscienta?" or "Set tension to 7"'
          disabled={loading}
          className="flex-1 bg-navy-dark border border-navy-light rounded px-3 py-2 text-sm text-white outline-none placeholder:text-navy-muted disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage(input)}
          disabled={loading || !input.trim()}
          className="px-3 py-2 bg-viz-capability text-navy rounded font-bold text-xs disabled:opacity-30 hover:opacity-90 transition-opacity"
        >
          Send
        </button>
      </div>
    </div>
  );
}
