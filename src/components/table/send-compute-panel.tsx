"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Zap, Send, ChevronDown, ChevronUp, Check } from "lucide-react";

interface SendComputePanelProps {
  gameId: Id<"games">;
  roleId: string;
  computeStock: number;
  /** Eligible recipients: enabled tables with has-compute or lab-ceo tags (excluding self) */
  recipients: { id: string; name: string }[];
  disabled?: boolean;
}

interface TransferLog {
  toName: string;
  amount: number;
  timestamp: number;
}

export function SendComputePanel({
  gameId,
  roleId,
  computeStock,
  recipients,
  disabled,
}: SendComputePanelProps) {
  const directTransfer = useMutation(api.requests.directTransfer);
  const [expanded, setExpanded] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [amount, setAmount] = useState(1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<TransferLog[]>([]);

  const maxAmount = computeStock;

  const handleSend = async () => {
    if (!selectedRecipient || amount <= 0 || amount > maxAmount) return;
    setSending(true);
    setError("");
    try {
      await directTransfer({
        gameId,
        fromRoleId: roleId,
        toRoleId: selectedRecipient,
        amount,
      });
      const recipientName = recipients.find((r) => r.id === selectedRecipient)?.name ?? selectedRecipient;
      setLogs((prev) => [{ toName: recipientName, amount, timestamp: Date.now() }, ...prev]);
      setSelectedRecipient("");
      setAmount(1);
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSending(false);
    }
  };

  if (recipients.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#D97706]" />
          <span className="text-sm font-bold text-text">
            {computeStock}u available
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          disabled={disabled || maxAmount <= 0}
          className="min-h-[44px] px-3 rounded-lg text-xs font-bold text-[#D97706] bg-[#FFF7ED] hover:bg-[#FED7AA] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-default"
        >
          <Send className="w-3.5 h-3.5" />
          Send compute
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          <div>
            <label className="text-[11px] text-text-muted font-semibold block mb-1">
              Send to
            </label>
            <select
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-border bg-warm-gray px-3 text-sm text-text"
            >
              <option value="">Choose recipient...</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-text-muted font-semibold block mb-1">
              Amount (1-{maxAmount}u)
            </label>
            <input
              type="number"
              min={1}
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.min(maxAmount, parseInt(e.target.value) || 1)))}
              className="w-full min-h-[44px] rounded-lg border border-border bg-warm-gray px-3 text-sm text-text font-mono"
            />
          </div>

          <button
            onClick={() => void handleSend()}
            disabled={!selectedRecipient || amount <= 0 || amount > maxAmount || sending || disabled}
            className="w-full min-h-[44px] rounded-lg text-sm font-bold text-white bg-[#D97706] hover:bg-[#B45309] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-default"
          >
            {sending ? "Sending..." : `Send ${amount}u`}
          </button>

          {error && (
            <p className="text-xs text-viz-danger">{error}</p>
          )}
        </div>
      )}

      {/* Transfer log */}
      {logs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-text-muted">
              <Check className="w-3 h-3 text-[#059669]" />
              Sent {log.amount}u to {log.toName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
