"use client";

import { Send, Pencil, Trash2, EyeOff, Lock } from "lucide-react";

/**
 * Displays a single submitted (locked-in) action with edit and delete controls.
 * Used in the per-action submit flow on the player table page.
 */
export function SubmittedActionCard({
  action,
  index,
  canEdit,
  onEdit,
  onDelete,
}: {
  action: { text: string; priority: number; secret?: boolean; probability?: number };
  index: number;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        {action.probability != null && (
          <span className="text-[10px] text-text-muted font-mono ml-auto">
            {action.probability}%
          </span>
        )}
        {action.probability == null && (
          <span className="text-[10px] text-text-muted ml-auto flex items-center gap-1">
            <Lock className="w-3 h-3" /> Submitted
          </span>
        )}
      </div>
      <p className="text-sm text-text mb-3">{action.text}</p>
      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="min-h-[36px] px-3 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-warm-gray transition-colors flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={onDelete}
            className="min-h-[36px] px-3 rounded-lg text-xs font-medium text-text-muted hover:text-viz-danger hover:bg-[#FEF2F2] transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
