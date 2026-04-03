"use client";

import { useState, useRef, useEffect } from "react";
import { ROLES } from "@/lib/game-data";
import { ChevronDown } from "lucide-react";
import type { Submission, Table } from "./types";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Players panel — replaces the old "Submissions (X/Y)" tracker.
 * Shows each enabled table with a dropdown to change control mode.
 */
export function PlayersPanel({
  tables,
  submissions,
  isProjector,
  onKickToAI,
  onSetControlMode,
}: {
  tables: Table[];
  submissions: Submission[];
  isProjector: boolean;
  onKickToAI?: (tableId: Id<"tables">) => void;
  onSetControlMode?: (tableId: Id<"tables">, mode: "human" | "ai" | "npc") => void;
}) {
  const enabledTables = tables.filter((t) => t.enabled);

  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <span className="text-sm font-semibold uppercase tracking-wider text-text-light mb-3 block">
        Players
      </span>
      <div className="flex flex-col gap-2.5">
        {enabledTables.map((table) => {
          const role = ROLES.find((r) => r.id === table.roleId);
          const sub = submissions.find((s) => s.roleId === table.roleId);
          const allGraded = sub?.actions.every((a) => a.probability != null);
          return (
            <div key={table._id} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role?.color }} />
              <span className="text-base text-white flex-1">
                {table.roleName}
              </span>
              {sub ? (
                <span className={`text-sm font-mono ${allGraded ? "text-viz-safety" : "text-viz-warning"}`}>
                  {sub.actions.length} action{sub.actions.length !== 1 ? "s" : ""}
                  {allGraded ? " \u2713" : " (grading...)"}
                </span>
              ) : (
                <span className="text-sm text-navy-muted">Waiting...</span>
              )}
              {/* Control mode dropdown button — shows current mode, click to change */}
              {!isProjector && onSetControlMode && (
                <ControlModeDropdown
                  table={table}
                  onKickToAI={onKickToAI}
                  onSetControlMode={onSetControlMode}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ControlModeDropdown({
  table,
  onKickToAI,
  onSetControlMode,
}: {
  table: Table;
  onKickToAI?: (tableId: Id<"tables">) => void;
  onSetControlMode: (tableId: Id<"tables">, mode: "human" | "ai" | "npc") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentLabel =
    table.connected && table.controlMode === "human"
      ? "Human"
      : table.controlMode === "ai"
        ? "AI"
        : table.controlMode === "npc"
          ? "NPC"
          : "Human";

  const currentColor =
    table.connected && table.controlMode === "human"
      ? "text-viz-safety"
      : table.controlMode === "ai"
        ? "text-viz-capability"
        : table.controlMode === "npc"
          ? "text-viz-warning"
          : "text-text-light";

  const modes: { mode: "human" | "ai" | "npc"; label: string; color: string }[] = [
    { mode: "human", label: "Human", color: "text-viz-safety" },
    { mode: "ai", label: "AI", color: "text-viz-capability" },
    { mode: "npc", label: "NPC", color: "text-viz-warning" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`text-[11px] px-2 py-0.5 rounded bg-navy-light hover:bg-navy-muted flex items-center gap-1 font-semibold transition-colors ${currentColor}`}
      >
        {currentLabel}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-navy-dark border border-navy-light rounded-lg shadow-xl z-50 min-w-[100px] py-1">
          {modes
            .filter((m) => m.mode !== table.controlMode || (table.connected && m.mode === "human"))
            .map((m) => (
              <button
                key={m.mode}
                onClick={() => {
                  if (m.mode === "ai" && table.connected && table.controlMode === "human") {
                    onKickToAI?.(table._id);
                  } else {
                    onSetControlMode(table._id, m.mode);
                  }
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-navy-light transition-colors ${m.color}`}
              >
                {m.label}
                {m.mode === "ai" && table.connected && table.controlMode === "human" ? " (kick)" : ""}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
