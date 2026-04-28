"use client";

import { Eye } from "lucide-react";

interface Props {
  count: number;
  /** Whether the current user is one of the observers (so they exclude themselves). */
  selfIsObserver?: boolean;
}

export function ObserverCountBadge({ count, selfIsObserver = false }: Props) {
  const visible = selfIsObserver ? count - 1 : count;
  if (visible <= 0) return null;
  return (
    <span
      className="text-[11px] text-text-muted font-mono flex items-center gap-1"
      title={`${visible} observer${visible === 1 ? "" : "s"} watching this table`}
    >
      <Eye className="w-3 h-3" /> +{visible}
    </span>
  );
}
