"use client";

import { useState } from "react";
import { Send, Pencil, Trash2, EyeOff, Lock, Handshake, Zap } from "lucide-react";

export interface SentRequest {
  toRoleName: string;
  requestType: "endorsement" | "compute";
  computeAmount?: number;
  status: "pending" | "accepted" | "declined";
}

export function SubmittedActionCard({
  action,
  index,
  canEdit,
  onEdit,
  onDelete,
  sentRequests,
}: {
  action: { text: string; priority: number; secret?: boolean; probability?: number };
  index: number;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  sentRequests?: SentRequest[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-[#059669]/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-[#ECFDF5] flex items-center justify-center shrink-0">
          <Send className="w-3 h-3 text-[#059669]" />
        </div>
        <span className="text-[11px] bg-warm-gray text-text-muted rounded px-1.5 py-0.5 font-mono font-semibold">
          #{index + 1}
        </span>
        {action.secret && (
          <span className="text-[10px] bg-[#FFF7ED] text-viz-warning rounded px-1.5 py-0.5 font-bold flex items-center gap-0.5">
            <EyeOff className="w-3 h-3" /> SECRET
          </span>
        )}
        {action.probability != null ? (
          <span className="text-[10px] text-text-muted font-mono ml-auto">
            {action.probability}%
          </span>
        ) : (
          <span className="text-[10px] text-text-muted ml-auto flex items-center gap-1">
            <Lock className="w-3 h-3" /> Submitted
          </span>
        )}
      </div>
      <p className="text-sm text-text mb-3">{action.text}</p>
      {sentRequests && sentRequests.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {sentRequests.map((req, i) => {
            const statusColor = req.status === "accepted"
              ? "bg-[#ECFDF5] text-[#059669]"
              : req.status === "declined"
                ? "bg-[#FEF2F2] text-[#DC2626]"
                : "bg-warm-gray text-text-muted";
            const Icon = req.requestType === "compute" ? Zap : Handshake;
            const label = req.requestType === "compute"
              ? `${req.computeAmount}u from ${req.toRoleName}`
              : `Support from ${req.toRoleName}`;
            return (
              <span
                key={`req-${i}`}
                className={`text-[11px] px-2 py-1 rounded-full font-medium flex items-center gap-1 ${statusColor}`}
              >
                <Icon className="w-3 h-3" />
                {label}
                {req.status !== "pending" && (
                  <span className="font-bold capitalize"> — {req.status}</span>
                )}
              </span>
            );
          })}
        </div>
      )}
      {canEdit && (
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-viz-danger font-medium">Delete this action?</span>
              <button
                onClick={() => setConfirmDelete(false)}
                className="min-h-[44px] min-w-[44px] px-3 rounded-lg text-xs font-medium text-text-muted hover:bg-warm-gray transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmDelete(false); onDelete(); }}
                className="min-h-[44px] min-w-[44px] px-3 rounded-lg text-xs font-bold text-viz-danger hover:bg-[#FEF2F2] transition-colors"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                aria-label={`Edit action ${index + 1}`}
                className="min-h-[44px] min-w-[44px] px-3 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-warm-gray transition-colors flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete action ${index + 1}`}
                className="min-h-[44px] min-w-[44px] px-3 rounded-lg text-xs font-medium text-text-muted hover:text-viz-danger hover:bg-[#FEF2F2] transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
