"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { COPILOT_APPLY_SIGNAL } from "@/lib/game-data";
import { Wand2, Loader2, Check, Undo2, Send } from "lucide-react";

export interface Snapshot {
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

export function CopilotChat({
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
                <div key={`mini-msg-${i}`} className={`text-[12px] ${msg.role === "user" ? "text-text-light" : "text-[#E2E8F0]"}`}>
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
          <div key={`msg-${i}`} className={`text-sm ${msg.role === "user" ? "text-text-light" : "text-[#E2E8F0]"}`}>
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
