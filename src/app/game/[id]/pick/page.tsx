"use client";

import { use, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import {
  ROLE_MAP,
  AI_SYSTEMS_ROLE_ID,
  PHASE_LABELS,
  classifySeat,
  type SeatState,
} from "@/lib/game-data";
import { getStoredPlayerName, setStoredPlayerName, getOrCreateId } from "@/lib/hooks";
import { Loader2, Users, Eye, Cpu } from "lucide-react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";

// Use localStorage (not sessionStorage) so all tabs share the same session ID.
// This lets claimRole detect and release the player's previous seat.
function getOrCreateSessionId(gameId: string): string {
  if (typeof window === "undefined") return "";
  return getOrCreateId(localStorage, `ttx-pick-session-${gameId}`);
}

// Mid-game claimability per seat state. Mirrored server-side in
// `claimRole`; keeping both keyed on `SeatState` prevents the picker from
// offering buttons the server will reject.
const MID_GAME_CLAIMABLE: Record<SeatState, boolean> = {
  "active-human": false,
  "abandoned-human": true,
  ai: true,
  npc: true,
};

export default function RolePickerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const gameId = id as Id<"games">;
  const router = useRouter();

  const game = useQuery(api.games.getForPlayer, { gameId });
  const availableRoles = useQuery(api.tables.getAvailableRoles, { gameId });
  const claimRole = useMutation(api.tables.claimRole);

  const [playerName, setPlayerName] = useState(getStoredPlayerName);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [sessionId] = useState(() => getOrCreateSessionId(id));
  const hasName = playerName.trim().length > 0;

  const handleClaim = useCallback(async (roleId: string) => {
    const name = playerName.trim();
    if (!name) {
      setError("Enter your name first");
      return;
    }
    setClaiming(roleId);
    setError("");
    try {
      setStoredPlayerName(name);
      const result = await claimRole({ gameId, roleId, sessionId, playerName: name });
      sessionStorage.setItem(`ttx-session-${result.tableId}`, sessionId);
      router.push(`/game/${gameId}/table/${result.tableId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim role");
      setClaiming(null);
    }
  }, [playerName, claimRole, gameId, sessionId, router]);

  if (game === undefined || availableRoles === undefined) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy">
        <Loader2 className="w-8 h-8 text-text-light animate-spin" />
      </div>
    );
  }

  if (game === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy p-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Game Not Found</h2>
          <p className="text-sm text-text-light">This game doesn&apos;t exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  const claimedCount = availableRoles.filter((r) => r.connected && r.controlMode === "human").length;
  const gameStarted = game.status !== "lobby";
  const turnLabel = `Turn ${game.currentRound}/4 — ${PHASE_LABELS[game.phase] ?? game.phase}`;

  const handleObserve = (tableId: string) => {
    router.push(`/game/${gameId}/table/${tableId}?observe=1`);
  };

  return (
    <InAppBrowserGate>
      <div className="min-h-dvh bg-navy flex flex-col items-center p-6 md:p-8">
        <div className="max-w-3xl w-full">
          {/* Header */}
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
            <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-8 mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-white mb-1 tracking-tight">
              {gameStarted ? "Pick a role to take over or watch" : "Choose Your Role"}
            </h1>
            {gameStarted ? (
              <p className="text-sm text-text-light flex items-center justify-center gap-2">
                <span className="font-mono px-2 py-0.5 rounded bg-navy-light/60 text-white">{turnLabel}</span>
                <span className="text-text-light/70">·</span>
                <span><Users className="w-3.5 h-3.5 inline mr-1" />{claimedCount} human players</span>
              </p>
            ) : (
              <p className="text-sm text-text-light flex items-center justify-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {claimedCount} of {availableRoles.length} roles claimed
              </p>
            )}
          </div>

          {/* Name input */}
          <div className="max-w-sm mx-auto mb-6">
            <label htmlFor="player-name" className="block text-xs font-bold uppercase tracking-wide text-text-light mb-2 text-center">
              Step 1 — Enter your name
            </label>
            <input
              id="player-name"
              type="text"
              value={playerName}
              onChange={(e) => { setPlayerName(e.target.value); setError(""); }}
              placeholder="Your name"
              maxLength={30}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              className="w-full py-3 px-4 bg-white text-navy text-center text-lg font-semibold
                         rounded-lg border-2 border-text-light focus:border-white
                         outline-none placeholder:text-navy-muted/60 shadow-lg"
            />
            {error && <p className="text-xs text-viz-danger mt-2 text-center">{error}</p>}
          </div>

          {/* Step 2 hint */}
          <p className="text-center text-xs font-bold uppercase tracking-wide text-text-light mb-3">
            Step 2 — {hasName ? "Choose your role" : "Choose your role (enter name first)"}
          </p>

          {/* Role grid */}
          <div
            aria-disabled={!hasName}
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-opacity ${
              hasName ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}
          >
            {availableRoles.map((table) => {
              const role = ROLE_MAP.get(table.roleId);
              if (!role) return null;

              const seatState = classifySeat(table);
              const isClaiming = claiming === table.roleId;
              const isAiSystems = table.roleId === AI_SYSTEMS_ROLE_ID;
              // AI Systems carries the secret-disposition mechanic, so it's
              // only claimable when already abandoned — never directly from
              // active AI mode through the picker.
              const aiSystemsBlock = gameStarted && isAiSystems && seatState !== "abandoned-human";
              const canClaim = !gameStarted
                ? seatState !== "active-human"
                : MID_GAME_CLAIMABLE[seatState] && !aiSystemsBlock;

              const claimLabel = !gameStarted
                ? (seatState === "active-human" ? "Taken" : "Take seat")
                : seatState === "ai" ? "Take over from AI" : "Take seat";

              const stateBadge =
                seatState === "active-human"
                  ? { label: "Driver active", color: "text-viz-safety" }
                  : seatState === "abandoned-human"
                    ? { label: "Empty seat", color: "text-viz-warning" }
                    : seatState === "ai"
                      ? { label: "AI driving", color: "text-viz-capability" }
                      : { label: "Unfilled (NPC)", color: "text-text-light" };

              return (
                <div
                  key={table._id}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    isClaiming
                      ? "border-text-light bg-navy-light"
                      : "border-navy-light bg-navy hover:bg-navy-light/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="text-sm font-bold text-white truncate">{role.name}</span>
                    {isClaiming && <Loader2 className="w-3.5 h-3.5 text-text-light animate-spin ml-auto shrink-0" />}
                  </div>
                  <p className="text-xs text-text-light leading-snug line-clamp-2 mb-2">
                    {role.subtitle}
                  </p>

                  {/* State + occupant */}
                  <div className="flex items-center gap-2 text-[11px] mb-3 min-h-[16px]">
                    <span className={`font-medium ${stateBadge.color}`}>{stateBadge.label}</span>
                    {seatState === "active-human" && table.playerName && (
                      <span className="text-text-light truncate">· {table.playerName}</span>
                    )}
                    {seatState === "ai" && (
                      <Cpu className="w-3 h-3 text-viz-capability/70" aria-hidden="true" />
                    )}
                    {gameStarted && isAiSystems && (seatState === "ai" || seatState === "npc") && (
                      <span className="text-text-light/70 truncate ml-auto" title="The AI Systems role's secret disposition is held by the facilitator. To take over, ask them to release it first.">
                        Facilitator-managed
                      </span>
                    )}
                  </div>

                  {/* Single primary action button + secondary observe link.
                      Active human: watch only. Empty/AI/NPC: take seat as primary. */}
                  <div className="flex items-center gap-2">
                    {canClaim ? (
                      <>
                        <button
                          onClick={() => void handleClaim(table.roleId)}
                          disabled={isClaiming || !hasName}
                          title={!hasName ? "Enter your name first" : undefined}
                          className="flex-1 min-h-[36px] rounded-lg text-xs font-bold bg-text-light text-navy hover:bg-white disabled:opacity-30 disabled:cursor-default"
                        >
                          {claimLabel}
                        </button>
                        <button
                          onClick={() => handleObserve(table._id)}
                          disabled={!hasName}
                          className="min-h-[36px] rounded-lg text-xs font-bold border border-navy-light text-text-light hover:bg-navy-light hover:text-white px-3 inline-flex items-center gap-1 disabled:opacity-30 disabled:cursor-default"
                          title="Watch read-only without claiming the seat"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleObserve(table._id)}
                        disabled={!hasName}
                        title={!hasName ? "Enter your name first" : undefined}
                        className="flex-1 min-h-[36px] rounded-lg text-xs font-bold border border-navy-light text-text-light hover:bg-navy-light hover:text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-default"
                      >
                        <Eye className="w-3.5 h-3.5" /> Watch
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </InAppBrowserGate>
  );
}
