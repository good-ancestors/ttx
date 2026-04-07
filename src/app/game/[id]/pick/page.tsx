"use client";

import { use, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ROLE_MAP } from "@/lib/game-data";
import { getStoredPlayerName, setStoredPlayerName, getOrCreateId } from "@/lib/hooks";
import { Loader2, Users, Clock } from "lucide-react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";

// Use localStorage (not sessionStorage) so all tabs share the same session ID.
// This lets claimRole detect and release the player's previous seat.
function getOrCreateSessionId(gameId: string): string {
  if (typeof window === "undefined") return "";
  return getOrCreateId(localStorage, `ttx-pick-session-${gameId}`);
}

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
      // Store session ID under the table-page key so setConnected reuses it
      sessionStorage.setItem(`ttx-session-${result.tableId}`, sessionId);
      router.push(`/game/${gameId}/table/${result.tableId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim role");
      setClaiming(null);
    }
  }, [playerName, claimRole, gameId, sessionId, router]);

  // Loading state
  if (game === undefined || availableRoles === undefined) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy">
        <Loader2 className="w-8 h-8 text-text-light animate-spin" />
      </div>
    );
  }

  // Game not found
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

  // Game already started
  if (game.status !== "lobby") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy p-6">
        <div className="text-center">
          <Clock className="w-10 h-10 text-text-light mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Game In Progress</h2>
          <p className="text-sm text-text-light max-w-xs">
            This game has already started. Ask the facilitator for a direct link to join a specific role.
          </p>
        </div>
      </div>
    );
  }

  const claimedCount = availableRoles.filter((r) => r.connected).length;

  return (
    <InAppBrowserGate>
      <div className="min-h-dvh bg-navy flex flex-col items-center p-6 md:p-8">
        <div className="max-w-3xl w-full">
          {/* Header */}
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
            <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-8 mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-white mb-1 tracking-tight">Choose Your Role</h1>
            <p className="text-sm text-text-light flex items-center justify-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {claimedCount} of {availableRoles.length} roles claimed
            </p>
          </div>

          {/* Name input */}
          <div className="max-w-sm mx-auto mb-6">
            <input
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
              className="w-full py-3 px-4 bg-navy-light text-white text-center text-base
                         rounded-lg border border-navy-light focus:border-text-light
                         outline-none placeholder:text-navy-muted"
            />
            {error && <p className="text-xs text-viz-danger mt-2 text-center">{error}</p>}
          </div>

          {/* Role grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableRoles.map((table) => {
              const role = ROLE_MAP.get(table.roleId);
              if (!role) return null;

              const isClaimed = table.connected && table.controlMode === "human";
              const isClaiming = claiming === table.roleId;
              const isAvailable = !isClaimed && !claiming;

              return (
                <button
                  key={table._id}
                  onClick={() => void handleClaim(table.roleId)}
                  disabled={!isAvailable || isClaiming}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    isClaimed
                      ? "border-navy-light/40 opacity-50 cursor-default"
                      : isClaiming
                        ? "border-text-light bg-navy-light"
                        : "border-navy-light bg-navy hover:bg-navy-light hover:border-text-light cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="text-sm font-bold text-white truncate">{role.name}</span>
                    {isClaiming && <Loader2 className="w-3.5 h-3.5 text-text-light animate-spin ml-auto shrink-0" />}
                    {isClaimed && table.playerName && (
                      <span className="text-xs text-text-light ml-auto shrink-0 truncate max-w-[100px]">
                        {table.playerName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-light leading-relaxed line-clamp-2">
                    {role.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </InAppBrowserGate>
  );
}
