"use client";

import { useState } from "react";
import { ChevronDown, Maximize2 } from "lucide-react";
import { FullScreenOverlay } from "@/components/full-screen-overlay";

/**
 * Reusable expandable section with optional full-screen expand.
 */
export function ExpandableSection({
  title,
  defaultOpen = false,
  badge,
  children,
  fullScreenEnabled = false,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  fullScreenEnabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [fullScreen, setFullScreen] = useState(false);

  const content = (
    <>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2"
        >
          <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${expanded ? "" : "-rotate-90"}`} />
          <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
            {title}
          </span>
          {badge}
        </button>
        {fullScreenEnabled && expanded && (
          <button
            onClick={() => setFullScreen(true)}
            className="text-text-light hover:text-white transition-colors p-1"
            title="Expand to full screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </>
  );

  if (fullScreen) {
    return (
      <FullScreenOverlay title={title} onClose={() => setFullScreen(false)}>
        {children}
      </FullScreenOverlay>
    );
  }

  return <div>{content}</div>;
}
