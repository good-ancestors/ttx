"use client";

import { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { Wifi, WifiOff } from "lucide-react";

export function ConnectionIndicator() {
  const convex = useConvex();
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    // Poll Convex connection state every 3 seconds
    const check = () => {
      // ConvexReactClient exposes connectionState() in newer versions
      // Fallback: try a lightweight query and see if it responds
      setConnected(navigator.onLine);
    };

    check();
    const interval = setInterval(check, 3000);

    const handleOnline = () => setConnected(true);
    const handleOffline = () => setConnected(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Also detect visibility change — reconnect on return
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Give Convex a moment to reconnect
        setTimeout(check, 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Listen to Convex client events if available
    try {
      const client = convex as unknown as { onTransition?: (cb: () => void) => () => void };
      if (client.onTransition) {
        const unsub = client.onTransition(() => setConnected(true));
        return () => {
          clearInterval(interval);
          window.removeEventListener("online", handleOnline);
          window.removeEventListener("offline", handleOffline);
          document.removeEventListener("visibilitychange", handleVisibility);
          unsub();
        };
      }
    } catch {
      // onTransition not available — fall back to polling
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [convex]);

  return (
    <div className="flex items-center gap-1" title={connected ? "Connected" : "Connection lost"}>
      {connected ? (
        <Wifi className="w-3.5 h-3.5 text-viz-safety" />
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5 text-viz-danger animate-pulse" />
          <span className="text-[11px] text-viz-danger">Offline</span>
        </>
      )}
    </div>
  );
}
