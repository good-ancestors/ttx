"use client";

import { useState } from "react";
import { ChevronDown, Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";

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
          onClick={() => { if (fullScreen) return; setExpanded(!expanded); }}
          className="flex items-center gap-2"
        >
          {!fullScreen && (
            <ChevronDown className={`w-4 h-4 text-text-light transition-transform ${expanded ? "" : "-rotate-90"}`} />
          )}
          <span className="text-sm font-semibold uppercase tracking-wider text-text-light">
            {title}
          </span>
          {badge}
        </button>
        {fullScreenEnabled && (
          fullScreen ? (
            <button
              onClick={() => setFullScreen(false)}
              className="text-text-light hover:text-white transition-colors p-1"
              title="Close full screen"
            >
              <X className="w-5 h-5" />
            </button>
          ) : expanded ? (
            <button
              onClick={() => setFullScreen(true)}
              className="text-text-light hover:text-white transition-colors p-1"
              title="Expand to full screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          ) : null
        )}
      </div>
      {(expanded || fullScreen) && (
        <div className={fullScreen ? "mt-4 flex-1 overflow-y-auto" : "mt-3"}>
          {children}
        </div>
      )}
    </>
  );

  if (fullScreen && typeof document !== "undefined") {
    return createPortal(
      <div className="fixed inset-0 bg-navy-dark z-[70] flex flex-col p-8 overflow-hidden">
        {content}
      </div>,
      document.body,
    );
  }

  return <div>{content}</div>;
}
