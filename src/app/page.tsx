"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";
import { Presentation, Smartphone, Loader2 } from "lucide-react";

export default function SplashPage() {
  const router = useRouter();
  const createGame = useMutation(api.games.create);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [mode, setMode] = useState<"splash" | "join">("splash");

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

  return (
    <div className="min-h-dvh bg-navy flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md w-full">
        {/* Good Ancestors logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/good-ancestors-logo.svg"
          alt="Good Ancestors"
          className="h-10 mx-auto mb-8"
        />

        <h1 className="text-3xl font-extrabold text-white mb-1 tracking-tight">
          The Race to AGI
        </h1>
        <p className="text-sm text-text-light mb-1">
          A Tabletop Scenario Exercise
        </p>
        <p className="text-xs text-navy-muted mb-10">
          Small Giants Wisdom &amp; Action Forum — May 2026
        </p>

        {mode === "splash" ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3.5 px-6 bg-white text-navy rounded-lg text-base font-bold
                         hover:bg-off-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Presentation className="w-5 h-5" />
              )}
              Facilitator Dashboard
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full py-3.5 px-6 bg-transparent text-white border border-navy-light
                         rounded-lg text-base font-bold hover:border-text-light transition-colors
                         flex items-center justify-center gap-2"
            >
              <Smartphone className="w-5 h-5" />
              Table Player View
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinError("");
              }}
              placeholder="Enter join code"
              maxLength={8}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="w-full py-3.5 px-6 bg-navy-light text-white text-center text-xl font-mono
                         font-bold rounded-lg border border-navy-light focus:border-text-light
                         outline-none tracking-widest placeholder:text-navy-muted placeholder:tracking-normal
                         placeholder:text-base placeholder:font-sans"
            />
            {joinError && (
              <p className="text-xs text-viz-danger">{joinError}</p>
            )}
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="w-full py-3.5 px-6 bg-white text-navy rounded-lg text-base font-bold
                         hover:bg-off-white transition-colors disabled:opacity-30"
            >
              Join Game
            </button>
            <button
              onClick={() => setMode("splash")}
              className="text-sm text-text-light hover:text-white transition-colors"
            >
              Back
            </button>
          </div>
        )}

        <p className="text-[11px] text-navy-muted mt-10">
          Good Ancestors Policy Planning
        </p>
      </div>
    </div>
  );
}
