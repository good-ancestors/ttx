"use client";

import { use, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";

export default function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const normalizedCode = code.toUpperCase();

  // Check game-level code first (Jackbox-style → role picker)
  const game = useQuery(api.games.getByJoinCode, { joinCode: normalizedCode });
  // Fall back to per-table code only if game code didn't match. The query
  // inlines gameStatus so we don't need a third subscription to api.games.get
  // (which churns on every pipeline tick during resolve).
  const table = useQuery(api.tables.getByJoinCode, game === null ? { joinCode: normalizedCode } : "skip");

  useEffect(() => {
    if (game) {
      router.replace(`/game/${game._id}/pick`);
      return;
    }
    // Mid-game per-table joins land in observer mode rather than silently
    // taking over the seat. The role picker is the path for "I want to drive."
    if (game === null && table) {
      const suffix = table.gameStatus === "lobby" ? "" : "?observe=1";
      router.replace(`/game/${table.gameId}/table/${table._id}${suffix}`);
    }
  }, [game, table, router]);

  // Both queries resolved to null — code not found
  // (table query only runs after game resolves to null, so both being null means both checked)
  if (game === null && table === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white p-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-text mb-2">Code Not Found</h2>
          <p className="text-sm text-text-muted mb-4">
            The code <span className="font-mono font-bold">{code}</span>{" "}
            doesn&apos;t match any active game.
          </p>
          <Link
            href="/"
            className="text-sm font-medium text-role-openbrain hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <InAppBrowserGate>
      <div className="min-h-dvh flex items-center justify-center bg-off-white">
        <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
      </div>
    </InAppBrowserGate>
  );
}
