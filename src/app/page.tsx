"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2, Play, Clock, CheckCircle2, Pencil } from "lucide-react";
import { SESSION_TTL_MS, storeFacilitatorToken, useAuthMutation, usePageVisibility } from "@/lib/hooks";

/** Read facilitator auth from localStorage without hydration mismatch. */
function useFacilitatorAuth() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    return () => window.removeEventListener("storage", cb);
  }, []);

  const getSnapshot = useCallback(() => {
    if (localStorage.getItem("ttx-facilitator") !== "true") return false;
    const expiry = parseInt(localStorage.getItem("ttx-facilitator-expiry") ?? "0", 10);
    if (expiry > Date.now()) return true;
    localStorage.removeItem("ttx-facilitator");
    localStorage.removeItem("ttx-facilitator-expiry");
    return false;
  }, []);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

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

function persistFacilitatorAuth(passphrase: string) {
  localStorage.setItem("ttx-facilitator", "true");
  localStorage.setItem("ttx-facilitator-expiry", String(Date.now() + SESSION_TTL_MS));
  storeFacilitatorToken(passphrase);
}

// ─── Main splash page ──────────────────────────────────────────────────────

export default function SplashPage() {
  const storedAuth = useFacilitatorAuth();
  // Support ?p=<passphrase> query param for automated testing / password-manager bypass
  const [localAuth, setLocalAuth] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p && p === FACILITATOR_PASSPHRASE) {
      persistFacilitatorAuth(p);
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    }
    return false;
  });
  const authenticated = storedAuth || localAuth;

  const [mode, setMode] = useState<"player" | "facilitator">("player");

  // Show facilitator dashboard if authenticated
  if (authenticated && mode === "facilitator") {
    return <FacilitatorDashboard />;
  }

  // Show facilitator login if they clicked the link
  if (mode === "facilitator" && !authenticated) {
    return (
      <FacilitatorLogin
        onAuth={() => setLocalAuth(true)}
        onBack={() => setMode("player")}
      />
    );
  }

  // Default: player join screen
  return <PlayerJoinScreen onFacilitator={() => setMode("facilitator")} />;
}

// ─── Player join screen (default, no Convex queries) ────────────────────────

function PlayerJoinScreen({ onFacilitator }: { onFacilitator: () => void }) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError("Enter the code from your table or the game code.");
      return;
    }
    router.push(`/game/join/${code}`);
  };

  return (
    <div className="min-h-dvh bg-navy flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization benefit from next/image */}
        <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-10 mx-auto mb-8" />
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">The Race to AGI</h1>
        <p className="text-sm text-text-light mb-10">A Tabletop Scenario Exercise</p>

        <input
          type="text"
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          placeholder="Enter game code"
          maxLength={8}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          className="w-full py-4 px-6 bg-navy-light text-white text-center text-2xl font-mono
                     font-bold rounded-lg border border-navy-light focus:border-text-light
                     outline-none tracking-[0.3em] placeholder:text-navy-muted placeholder:tracking-normal
                     placeholder:text-base placeholder:font-sans mb-3"
        />
        {joinError && <p className="text-xs text-viz-danger mb-2">{joinError}</p>}
        <button
          onClick={handleJoin}
          disabled={!joinCode.trim()}
          className="w-full py-3.5 px-6 bg-white text-navy rounded-lg text-base font-bold
                     hover:bg-off-white transition-colors disabled:opacity-30 mb-8"
        >
          Join Game
        </button>

        <button
          onClick={onFacilitator}
          className="text-sm text-text-light hover:text-white transition-colors"
        >
          I&apos;m the facilitator &rarr;
        </button>
      </div>
    </div>
  );
}

// ─── Facilitator login ──────────────────────────────────────────────────────

function FacilitatorLogin({ onAuth, onBack }: { onAuth: () => void; onBack: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (passphrase.trim() === FACILITATOR_PASSPHRASE) {
      setError(false);
      persistFacilitatorAuth(passphrase.trim());
      onAuth();
    } else if (passphrase.trim()) {
      setError(true);
    }
  };

  return (
    <div className="min-h-dvh bg-navy flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization benefit from next/image */}
        <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-10 mx-auto mb-8" />
        <h1 className="text-xl font-bold text-white mb-6">Facilitator Login</h1>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value.toLowerCase())}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Password"
          autoFocus
          spellCheck={false}
          autoComplete="new-password"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          className="w-full py-3.5 px-6 bg-navy-light text-white text-center text-base font-mono
                     rounded-lg border border-navy-light focus:border-text-light
                     outline-none placeholder:text-navy-muted mb-3"
        />
        {error && <p className="text-viz-danger text-sm mb-2">Incorrect password</p>}
        <button
          onClick={handleSubmit}
          className="w-full py-3.5 px-6 bg-white text-navy rounded-lg text-base font-bold
                     hover:bg-off-white transition-colors mb-4"
        >
          Enter
        </button>
        <button onClick={onBack} className="text-sm text-text-light hover:text-white transition-colors">
          ← Back to join
        </button>
      </div>
    </div>
  );
}

// ─── Facilitator dashboard (only loaded after auth, subscribes to games.list) ─

function FacilitatorDashboard() {
  const router = useRouter();
  // Gate the dashboard list on visibility — the games doc is hot (every phase
  // tick, pipelineStatus, resolveNonce, phaseEndsAt write re-pushes the top-N
  // entries to every subscriber), so a hidden tab on the dashboard burns
  // bandwidth all day. Refocus re-mounts and gets the latest state.
  const isVisible = usePageVisibility();
  const games = useQuery(api.games.list, isVisible ? {} : "skip");
  const createGame = useAuthMutation(api.games.create);
  const removeGame = useAuthMutation(api.games.remove);
  const renameGame = useAuthMutation(api.games.rename);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    setCreating(true);
    try {
      const gameId = await createGame({ tableCount: 6 });
      router.push(`/game/${gameId}/facilitator`);
    } catch {
      setCreating(false);
    }
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

  return (
    <div className="min-h-dvh bg-navy flex flex-col items-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization benefit from next/image */}
          <img src="/good-ancestors-logo.svg" alt="Good Ancestors" className="h-8 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-white mb-1 tracking-tight">Facilitator Dashboard</h1>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full py-3 px-4 bg-white text-navy rounded-lg font-bold text-sm
                     hover:bg-off-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New Game
        </button>

        {/* Game list — compact table */}
        {games && games.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-light mb-3">Games</h2>
            <div className="flex flex-col gap-2">
              {games.map((game) => {
                const statusIcon = game.status === "finished"
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-viz-safety" />
                  : game.status === "playing"
                    ? <Play className="w-3.5 h-3.5 text-viz-capability" />
                    : <Clock className="w-3.5 h-3.5 text-text-light" />;
                const gameName = game.name || "Untitled Game";
                const isEditing = editingId === game._id;
                const isDeleting = deleteId === game._id;

                return (
                  <div key={game._id} className="bg-navy-dark rounded-lg border border-navy-light p-3">
                    <div className="flex items-center gap-3">
                      {statusIcon}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename(game._id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            className="text-sm text-white bg-navy border border-navy-light rounded px-2 py-0.5 outline-none focus:border-text-light w-full"
                          />
                        ) : (
                          <>
                            <span className="text-sm font-bold text-white">{gameName}</span>
                            <button onClick={() => { setEditingId(game._id); setEditName(gameName); }} className="text-text-light hover:text-white ml-1.5 align-middle">
                              <Pencil className="w-3 h-3 inline" />
                            </button>
                          </>
                        )}
                        <div className="text-xs text-text-light mt-0.5">
                          {game.status === "playing" ? `Round ${game.currentRound} · ${game.phase}` : game.status === "finished" ? "Finished" : "Lobby"}
                          <span className="text-navy-muted ml-2">{formatTime(game._creationTime)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/game/${game._id}/facilitator`)}
                        className="text-xs px-3 py-1.5 bg-navy-light text-white rounded font-medium hover:bg-navy-muted transition-colors shrink-0"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => setDeleteId(isDeleting ? null : game._id)}
                        className="text-navy-muted hover:text-viz-danger transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {isDeleting && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-viz-danger shrink-0">Type DELETE:</span>
                        <input
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
                          placeholder="DELETE"
                          autoFocus
                          autoComplete="off"
                          className="text-xs font-mono text-white bg-navy-light border border-navy-muted rounded px-2 py-1 outline-none focus:border-viz-danger flex-1 placeholder:text-navy-muted"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleDelete(game._id);
                            if (e.key === "Escape") { setDeleteId(null); setDeleteConfirm(""); }
                          }}
                        />
                        <button onClick={() => void handleDelete(game._id)} disabled={deleteConfirm !== "DELETE"} className="text-xs px-2 py-1 bg-viz-danger text-white rounded font-medium disabled:opacity-30">Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {games?.length === 0 && (
          <p className="text-center text-text-light text-sm">No games yet. Create one to get started.</p>
        )}

        <p className="text-[11px] text-navy-muted mt-10 text-center">
          Good Ancestors Policy
        </p>
      </div>
    </div>
  );
}
