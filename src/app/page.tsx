"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";
import { Plus, Smartphone, Loader2, Trash2, Play, Clock, CheckCircle2 } from "lucide-react";

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SplashPage() {
  const router = useRouter();
  const games = useQuery(api.games.list);
  const createGame = useMutation(api.games.create);
  const removeGame = useMutation(api.games.remove);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [mode, setMode] = useState<"main" | "join">("main");

  const handleCreate = async () => {
    setCreating(true);
    try {
      const gameId = await createGame({ tableCount: 6 });
      router.push(`/game/${gameId}/facilitator`);
    } catch {
      setCreating(false);
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError("Enter the code from your table card.");
      return;
    }
    router.push(`/game/join/${code}`);
  };

  const handleDelete = async (gameId: string) => {
    if (!confirm("Delete this game and all its data?")) return;
    try {
      await removeGame({ gameId: gameId as Parameters<typeof removeGame>[0]["gameId"] });
    } catch (err) {
      console.error("Failed to delete game:", err);
    }
  };

  if (mode === "join") {
    return (
      <div className="min-h-dvh bg-navy flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-10 mx-auto mb-8" />
          <h1 className="text-2xl font-extrabold text-white mb-6">Join a Game</h1>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
            placeholder="Enter join code"
            maxLength={8}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="w-full py-3.5 px-6 bg-navy-light text-white text-center text-xl font-mono
                       font-bold rounded-lg border border-navy-light focus:border-text-light
                       outline-none tracking-widest placeholder:text-navy-muted placeholder:tracking-normal
                       placeholder:text-base placeholder:font-sans mb-3"
          />
          {joinError && <p className="text-xs text-viz-danger mb-2">{joinError}</p>}
          <button
            onClick={handleJoin}
            disabled={!joinCode.trim()}
            className="w-full py-3.5 px-6 bg-white text-navy rounded-lg text-base font-bold
                       hover:bg-off-white transition-colors disabled:opacity-30 mb-3"
          >
            Join Game
          </button>
          <button onClick={() => setMode("main")} className="text-sm text-text-light hover:text-white transition-colors">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-navy flex flex-col items-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-10 mx-auto mb-6" />
          <h1 className="text-3xl font-extrabold text-white mb-1 tracking-tight">The Race to AGI</h1>
          <p className="text-sm text-text-light">A Tabletop Scenario Exercise</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 py-3 px-4 bg-white text-navy rounded-lg font-bold text-sm
                       hover:bg-off-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            New Game
          </button>
          <button
            onClick={() => setMode("join")}
            className="flex-1 py-3 px-4 bg-transparent text-white border border-navy-light
                       rounded-lg font-bold text-sm hover:border-text-light transition-colors
                       flex items-center justify-center gap-2"
          >
            <Smartphone className="w-4 h-4" />
            Join as Player
          </button>
        </div>

        {/* Game list */}
        {games && games.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-light mb-3">
              Games
            </h2>
            <div className="flex flex-col gap-2">
              {games.map((game) => {
                const statusIcon = game.status === "finished"
                  ? <CheckCircle2 className="w-4 h-4 text-viz-safety" />
                  : game.status === "playing"
                    ? <Play className="w-4 h-4 text-viz-capability" />
                    : <Clock className="w-4 h-4 text-text-light" />;

                const statusText = game.status === "finished"
                  ? "Finished"
                  : game.status === "playing"
                    ? `Round ${game.currentRound} · ${game.phase}`
                    : "Lobby";

                return (
                  <div
                    key={game._id}
                    className="bg-navy-dark border border-navy-light rounded-lg p-4 flex items-center gap-3"
                  >
                    {statusIcon}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white capitalize">{statusText}</span>
                        <span className="text-xs text-text-light">
                          {game.enabledCount} tables · {game.connectedCount} connected
                        </span>
                      </div>
                      <span className="text-xs text-navy-muted">
                        {formatTime(game._creationTime)}
                      </span>
                    </div>
                    <button
                      onClick={() => router.push(`/game/${game._id}/facilitator`)}
                      className="text-xs px-3 py-1.5 bg-navy-light text-white rounded font-medium
                                 hover:bg-navy-muted transition-colors"
                    >
                      Open
                    </button>
                    {game.status !== "playing" && (
                      <button
                        onClick={() => handleDelete(game._id)}
                        className="text-xs p-1.5 text-text-light hover:text-viz-danger transition-colors rounded"
                        title="Delete game"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {games && games.length === 0 && (
          <p className="text-center text-text-light text-sm mt-4">
            No games yet. Create one to get started.
          </p>
        )}

        <p className="text-[11px] text-navy-muted mt-10 text-center">
          Good Ancestors Policy Planning
        </p>
      </div>
    </div>
  );
}
