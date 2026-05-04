"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import {
  Clock,
  AlertTriangle,
  Zap,
  Eye,
  LogOut,
} from "lucide-react";

import { useCountdown, usePageVisibility, useSessionExpiry, useSessionId, getStoredPlayerName } from "@/lib/hooks";
import {
  ROLE_MAP,
  hasCompute,
  isResolvingPhase,
  DEFAULT_ROUND_LABEL,
  DEFAULT_LABS,
  DEFAULT_LAB_ALLOCATION,
  isSubmittedAction,
} from "@/lib/game-data";
import { PlayerTabBar, buildPlayerTabs, type PlayerTab } from "@/components/table/player-tabs";
import { PhaseContent } from "@/components/table/phase-content";
import { TableLoader } from "@/components/table/table-loader";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { TakeoverBanner } from "@/components/table/takeover-banner";
import { ObserverCountBadge } from "@/components/table/observer-count-badge";
import type { ResultAction } from "@/components/table/result-action-card";


interface Props {
  gameId: Id<"games">;
  tableId: Id<"tables">;
}

export function ObserverView({ gameId, tableId }: Props) {
  const router = useRouter();
  const isVisible = usePageVisibility();
  useSessionExpiry(`ttx-observer-expiry-${tableId}`, "/");

  // Same query surface as the driver page — observers are read-only consumers.
  const game = useQuery(api.games.getForPlayer, isVisible ? { gameId } : "skip");
  const table = useQuery(api.tables.get, isVisible ? { tableId } : "skip");
  const round = useQuery(
    api.rounds.getForPlayer,
    isVisible && game ? { gameId, roundNumber: game.currentRound } : "skip",
  );
  // Observer query strips draft actions; submitted-only.
  const submission = useQuery(
    api.submissions.getForObserver,
    isVisible ? { tableId, roundNumber: game?.currentRound ?? 1 } : "skip",
  );
  const allRequests = useQuery(
    api.requests.getForRole,
    isVisible && game?.status === "playing" && table
      ? { gameId, roundNumber: game?.currentRound ?? 1, roleId: table.roleId }
      : "skip",
  );
  const observerList = useQuery(
    api.observers.listByRole,
    isVisible && table ? { gameId, roleId: table.roleId } : "skip",
  );
  // Subscribe to presence (driverLastSeenAt) separately from the table doc so
  // heartbeat invalidations don't fan out to every tables-reading query.
  const presence = useQuery(
    api.tables.getPresence,
    isVisible ? { tableId } : "skip",
  );

  const joinAsObserver = useMutation(api.observers.joinAsObserver);
  const leaveObserver = useMutation(api.observers.leaveObserver);

  const [activeTab, setActiveTab] = useState<PlayerTab>("brief");
  const [observerName] = useState(() => {
    const stored = getStoredPlayerName();
    return stored || "Observer";
  });

  // Stable per-tab observer session — separate from driver sessionStorage key
  // so a same-browser take-over doesn't collide with the driver flow.
  const sessionId = useSessionId(tableId, "observer");

  // Idempotent join — same sessionId reuses the existing observer row.
  const joinedRef = useRef(false);
  useEffect(() => {
    if (!table || !sessionId) return;
    if (joinedRef.current) return;
    joinedRef.current = true;
    void joinAsObserver({
      gameId,
      roleId: table.roleId,
      sessionId,
      observerName,
    }).catch((err) => {
      console.error("[ObserverView] joinAsObserver failed", err);
    });
  }, [table, sessionId, gameId, observerName, joinAsObserver]);

  // Leave on unload.
  useEffect(() => {
    if (!table || !sessionId) return;
    const roleId = table.roleId;
    const onUnload = () => {
      void leaveObserver({ gameId, roleId, sessionId });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [table, sessionId, gameId, leaveObserver]);

  const role = table ? ROLE_MAP.get(table.roleId) ?? null : null;
  const phase = game?.phase ?? "discuss";
  const { display: timerDisplay, isUrgent, isExpired } = useCountdown(game?.phaseEndsAt);

  const isAiSystem = role?.tags.includes("ai-system") ?? false;
  const currentLab = game?.labs.find((lab) => lab.roleId === role?.id)
    ?? (role?.labId ? game?.labs.find((lab) => lab.name.toLowerCase() === role.labId) : undefined);
  const controlsLab = !!game?.labs.some((l) => l.roleId === role?.id);
  const hasLabAccess = controlsLab || (
    !!role?.labId && !!game?.labs.some((l) => l.name.toLowerCase() === role.labId)
  );
  const pendingProposalCount = (allRequests ?? []).filter(
    (p) => p.toRoleId === role?.id && p.status === "pending",
  ).length;

  // Auto-switch tabs to mirror driver page behaviour (so observers see the
  // active context without manual taps). Uses the React-blessed "derive state
  // from a prop change" pattern (setState during render, gated on a state
  // comparison) — avoids the cascading-renders warning that an effect-based
  // setState would trip.
  const [lastPhase, setLastPhase] = useState(phase);
  if (lastPhase !== phase) {
    setLastPhase(phase);
    if (phase === "submit" || isResolvingPhase(phase)) {
      setActiveTab("actions");
    }
  }

  const notFound = game === null || table === null || round === null;
  if (notFound) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-off-white gap-3 px-6 text-center">
        <AlertTriangle className="w-10 h-10 text-text-muted" />
        <h1 className="text-lg font-bold text-text">Table not found</h1>
        <p className="text-sm text-text-muted max-w-xs">
          This table no longer exists or you no longer have access.
        </p>
      </div>
    );
  }
  if (!game || !table || !role || (game.status === "playing" && !round)) {
    return <TableLoader />;
  }

  const sortedResultActions: ResultAction[] = submission?.actions
    ? [...submission.actions]
        .filter((action) => isSubmittedAction(action))
        .sort((a, b) => {
          if (a.success === true && b.success !== true) return -1;
          if (a.success !== true && b.success === true) return 1;
          if (a.success === false && b.success == null) return -1;
          if (a.success == null && b.success === false) return 1;
          return 0;
        })
    : [];

  const tabs = buildPlayerTabs(role, phase, pendingProposalCount, hasLabAccess);
  const showTabs = game.status === "playing" || game.status === "lobby";

  const handleStopObserving = () => {
    void leaveObserver({ gameId, roleId: table.roleId, sessionId });
    router.push(`/game/${gameId}/pick`);
  };

  return (
    <InAppBrowserGate>
      <div
        className={`min-h-dvh bg-off-white overflow-x-hidden ${showTabs ? "pb-16" : ""}`}
        style={{ paddingBottom: showTabs ? "max(64px, calc(64px + env(safe-area-inset-bottom)))" : "max(env(safe-area-inset-bottom), 20px)" }}
      >
        <div className="fixed top-0 left-0 right-0 z-10 bg-off-white/95 backdrop-blur-sm border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
              <span className="text-[15px] font-bold text-text truncate">{role.name}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8] bg-[#DBEAFE] rounded px-1.5 py-0.5 shrink-0">
                <Eye className="w-3 h-3" /> Observer
              </span>
            </div>
            <div className="flex items-center gap-3 overflow-hidden">
              {hasCompute(role) && table.computeStock != null && (
                <span className="text-xs font-mono text-text-muted flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" /> {table.computeStock ?? 0}u
                </span>
              )}
              {game.phaseEndsAt && !isExpired && (
                <span
                  className={`text-xs font-mono tabular-nums flex items-center gap-1 ${isUrgent ? "text-viz-danger font-bold" : "text-text-muted"}`}
                  role="timer"
                  aria-label={`${timerDisplay} remaining`}
                >
                  <Clock className={`w-3.5 h-3.5 ${isUrgent ? "animate-pulse" : ""}`} aria-hidden="true" /> {timerDisplay}
                </span>
              )}
              <ObserverCountBadge count={observerList?.length ?? 0} selfIsObserver />
              <button
                onClick={handleStopObserving}
                className="text-[11px] text-text-muted hover:text-viz-danger transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" /> Leave
              </button>
              {game.status !== "lobby" && (
                <span className="text-[11px] text-text-muted font-mono">
                  {round?.label ?? DEFAULT_ROUND_LABEL} — Turn {round?.number ?? 1}/4
                </span>
              )}
              <ConnectionIndicator />
            </div>
          </div>
        </div>

        <div className="px-4 pt-16">
          <TakeoverBanner
            gameId={gameId}
            roleId={table.roleId}
            tableId={tableId}
            driverLastSeenAt={presence?.driverLastSeenAt}
            driverLeftAt={presence?.driverLeftAt}
            controlMode={table.controlMode}
            observerSessionId={sessionId}
          />

          <PhaseContent
            phase={phase}
            playerName={table.playerName}
            labs={game.labs}
            observerView
            common={{
              activeTab,
              role,
              tableId,
              gameId,
              gameStatus: game.status,
              isAiSystem,
              aiDisposition: table.aiDisposition,
              handoutData: null,
              hasLabAccess,
              controlsLab,
            }}
            submit={{
              game,
              submittedActions: submission?.actions ?? [],
              isExpired,
              computeStock: table.computeStock ?? undefined,
              computeRecipients: [],
              actionDrafts: [],
              onActionDraftsChange: () => {},
              enabledRoles: [],
              onSubmitAction: () => Promise.resolve(),
              onEditAction: () => Promise.resolve(),
              onDeleteAction: () => Promise.resolve(),
              submitError: "",
              sentRequestsByAction: undefined,
              shownSuggestions: [],
              ideasOpen: false,
              onIdeasOpenChange: () => {},
              onSuggestionTap: () => {},
              currentRound: game.currentRound,
              allRequests,
            }}
            lab={{
              currentLab,
              startingStock: DEFAULT_LABS.find((l) => l.name === currentLab?.name)?.computeStock ?? 0,
              labSpec: currentLab?.spec ?? "",
              onLabSpecChange: () => {},
              specSaved: false,
              specUnsaved: false,
              onSaveSpec: () => {},
              computeAllocation: currentLab?.allocation ?? DEFAULT_LAB_ALLOCATION,
              onComputeAllocationChange: () => {},
              allocationSaved: false,
              allocationUnsaved: false,
              onSaveAllocation: () => {},
            }}
            resolve={{
              round: round ?? undefined,
              sortedResultActions,
            }}
          />
        </div>

        {showTabs && (
          <PlayerTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        )}
      </div>
    </InAppBrowserGate>
  );
}
