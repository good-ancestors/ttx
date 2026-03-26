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
  const table = useQuery(api.tables.getByJoinCode, {
    joinCode: code.toUpperCase(),
  });

  useEffect(() => {
    if (table) {
      router.replace(`/game/${table.gameId}/table/${table._id}`);
    }
  }, [table, router]);

  // table === undefined means still loading, null means not found
  if (table === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white p-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-text mb-2">Code Not Found</h2>
          <p className="text-sm text-text-muted mb-4">
            The join code <span className="font-mono font-bold">{code}</span>{" "}
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
