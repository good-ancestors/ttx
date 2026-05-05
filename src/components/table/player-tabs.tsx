"use client";

import { Zap, Vote, FlaskConical, BookOpen } from "lucide-react";

export type PlayerTab = "brief" | "actions" | "respond" | "lab";

interface TabDef {
  id: PlayerTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  disabled?: boolean;
}

export function PlayerTabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabDef[];
  activeTab: PlayerTab;
  onTabChange: (tab: PlayerTab) => void;
}) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-30"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Extra bg strip below the safe-area padding to close any toolbar/dvh gap on iOS Chrome */}
      <div
        aria-hidden
        className="absolute left-0 right-0 bg-white"
        style={{ top: "100%", height: "env(safe-area-inset-bottom, 0px)" }}
      />
      <div className="flex max-w-3xl mx-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.disabled) return;
                onTabChange(tab.id);
              }}
              disabled={tab.disabled}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 min-h-[52px] transition-colors relative ${
                isActive
                  ? "text-navy"
                  : tab.disabled
                    ? "text-text-muted/60"
                    : "text-text-muted hover:text-text"
              }`}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-viz-danger text-white text-[9px] font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-navy rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function buildPlayerTabs(
  _role: { tags: string[] },
  phase: string,
  pendingCount: number,
  hasLabAccess: boolean,
): TabDef[] {
  const tabs: TabDef[] = [
    {
      id: "brief",
      label: "Brief",
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      id: "actions",
      label: "Actions",
      icon: <Zap className="w-5 h-5" />,
    },
    {
      id: "respond",
      label: "Respond",
      icon: <Vote className="w-5 h-5" />,
      badge: phase === "submit" && pendingCount > 0 ? pendingCount : undefined,
    },
  ];
  if (hasLabAccess) {
    tabs.push({
      id: "lab",
      label: "Lab",
      icon: <FlaskConical className="w-5 h-5" />,
    });
  }
  return tabs;
}
