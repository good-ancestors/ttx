"use client";

import { useInAppBrowserDetection } from "@/lib/hooks";
import { ExternalLink } from "lucide-react";
import { type ReactNode } from "react";

export function InAppBrowserGate({ children }: { children: ReactNode }) {
  const isInApp = useInAppBrowserDetection();

  if (isInApp) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white p-6">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 bg-navy rounded-xl flex items-center justify-center mx-auto mb-4">
            <ExternalLink className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-text mb-2">
            Open in Your Browser
          </h2>
          <p className="text-sm text-text-muted mb-6 leading-relaxed">
            This app works best in Safari or Chrome. Tap the menu icon (
            <span className="font-mono">⋯</span>) and select{" "}
            <strong>&quot;Open in Safari&quot;</strong> or{" "}
            <strong>&quot;Open in Chrome&quot;</strong>.
          </p>
          <p className="text-xs text-text-light">
            In-app browsers can have connection issues during the exercise.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
