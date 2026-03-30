"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";
import { Plus, Smartphone, Loader2, Trash2, Play, Clock, CheckCircle2, Pencil } from "lucide-react";

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const FACILITATOR_PASSPHRASE = process.env.NEXT_PUBLIC_FACILITATOR_PASSPHRASE ?? "coral-ember-drift-sage";

export default function SplashPage() {
  const router = useRouter();
  const games = useQuery(api.games.list);
  const createGame = useMutation(api.games.create);
  const removeGame = useMutation(api.games.remove);
  const renameGame = useMutation(api.games.rename);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [mode, setMode] = useState<"main" | "join">("main");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  // Check localStorage on first render
  useState(() => {
    if (typeof window !== "undefined" && localStorage.getItem("ttx-facilitator") === "true") {
      setAuthenticated(true);
    }
  });

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
    if (deleteConfirm !== "DELETE") return;
    try {
      await removeGame({ gameId: gameId as Parameters<typeof removeGame>[0]["gameId"], confirmation: "DELETE" });
      setDeleteId(null);
      setDeleteConfirm("");
    } catch (err) {
      console.error("Failed to delete game:", err);
    }
  };

  const handleRename = async (gameId: string) => {
    try {
      await renameGame({ gameId: gameId as Parameters<typeof renameGame>[0]["gameId"], name: editName });
      setEditingId(null);
      setEditName("");
    } catch (err) {
      console.error("Failed to rename game:", err);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-dvh bg-navy flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-10 mx-auto mb-8" />
          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">The Race to AGI</h1>
          <p className="text-sm text-text-light mb-8">A Tabletop Scenario Exercise</p>
          <input
            type="text"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value.toLowerCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && passphrase.trim() === FACILITATOR_PASSPHRASE) {
                setAuthenticated(true);
                localStorage.setItem("ttx-facilitator", "true");
              }
            }}
            placeholder="Facilitator passphrase"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="w-full py-3.5 px-6 bg-navy-light text-white text-center text-base font-mono
                       rounded-lg border border-navy-light focus:border-text-light
                       outline-none placeholder:text-navy-muted mb-3"
          />
          <button
            onClick={() => {
              if (passphrase.trim() === FACILITATOR_PASSPHRASE) {
                setAuthenticated(true);
                localStorage.setItem("ttx-facilitator", "true");
              }
            }}
            className="w-full py-3.5 px-6 bg-white text-navy rounded-lg text-base font-bold
                       hover:bg-off-white transition-colors mb-4"
          >
            Enter
          </button>
          <button
            onClick={() => setMode("join")}
            className="text-sm text-text-light hover:text-white transition-colors"
          >
            Join as Player instead
          </button>
        </div>
      </div>
    );
  }

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

                const gameName = game.name || "Untitled Game";
                const isEditing = editingId === game._id;
                const isDeleting = deleteId === game._id;

                return (
                  <div
                    key={game._id}
                    className="bg-navy-dark border border-navy-light rounded-lg p-4"
                  >
                    <div className="flex items-center gap-3">
                      {statusIcon}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleRename(game._id);
                                if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                              }}
                              autoFocus
                              spellCheck={false}
                              className="text-sm font-bold text-white bg-navy-light border border-navy-muted rounded px-2 py-1 outline-none focus:border-text-light flex-1"
                              placeholder="Game name"
                            />
                            <button
                              onClick={() => void handleRename(game._id)}
                              className="text-xs px-2 py-1 bg-viz-safety text-navy rounded font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditName(""); }}
                              className="text-xs px-2 py-1 text-text-light rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{gameName}</span>
                            <button
                              onClick={() => { setEditingId(game._id); setEditName(game.name ?? ""); }}
                              className="text-text-light hover:text-white transition-colors p-0.5"
                              title="Rename game"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-light capitalize">{statusText}</span>
                          <span className="text-xs text-navy-muted">·</span>
                          <span className="text-xs text-navy-muted">
                            {game.enabledCount} tables · {game.connectedCount} connected
                          </span>
                          <span className="text-xs text-navy-muted">·</span>
                          <span className="text-xs text-navy-muted">
                            {formatTime(game._creationTime)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/game/${game._id}/facilitator`)}
                        className="text-xs px-3 py-1.5 bg-navy-light text-white rounded font-medium
                                   hover:bg-navy-muted transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => { setDeleteId(game._id); setDeleteConfirm(""); }}
                        className="text-xs p-1.5 text-text-light hover:text-viz-danger transition-colors rounded"
                        title="Delete game"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Delete confirmation */}
                    {isDeleting && (
                      <div className="mt-3 pt-3 border-t border-navy-light">
                        <p className="text-xs text-viz-danger mb-2">
                          This will permanently delete this game and all associated data (tables, submissions, rounds, events).
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={deleteConfirm}
                            onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
                            placeholder='Type "DELETE" to confirm'
                            autoFocus
                            spellCheck={false}
                            autoComplete="off"
                            className="text-xs font-mono text-white bg-navy-light border border-navy-muted rounded px-2 py-1.5 outline-none focus:border-viz-danger flex-1 placeholder:text-navy-muted"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleDelete(game._id);
                              if (e.key === "Escape") { setDeleteId(null); setDeleteConfirm(""); }
                            }}
                          />
                          <button
                            onClick={() => void handleDelete(game._id)}
                            disabled={deleteConfirm !== "DELETE"}
                            className="text-xs px-3 py-1.5 bg-viz-danger text-white rounded font-medium disabled:opacity-30 transition-opacity"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => { setDeleteId(null); setDeleteConfirm(""); }}
                            className="text-xs px-2 py-1.5 text-text-light rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {games?.length === 0 && (
          <p className="text-center text-text-light text-sm mt-4">
            No games yet. Create one to get started.
          </p>
        )}

        <p className="text-[11px] text-navy-muted mt-10 text-center">
          Good Ancestors Policy
        </p>
      </div>
    </div>
  );
}
