"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Lab = { id: string; name: string; color: string };

const DEFAULT_LABS: Lab[] = [
  { id: "openbrain", name: "OpenBrain", color: "#22C55E" },
  { id: "deepcent", name: "DeepCent", color: "#3B82F6" },
  { id: "conscentia", name: "Conscentia", color: "#F59E0B" },
];

// Everything up to and including Jan 2028 is fixed history (pregame) — locked,
// non-editable background sketching how the labs crept up before the game. Each
// in-game turn's data point is then plotted at the month *after* the turn ends,
// so the line reaches the boundary of the next period (e.g. Turn 1 ends in March
// → its point sits at Apr 2028).
export const TURN_TIMELINE = [
  { id: "jan-2027", label: "Jan 2027", pregame: true },
  { id: "apr-2027", label: "Apr 2027", pregame: true },
  { id: "jul-2027", label: "Jul 2027", pregame: true },
  { id: "oct-2027", label: "Oct 2027", pregame: true },
  { id: "start", label: "Jan 2028", pregame: true },
  { id: "turn-1", label: "Apr 2028" },
  { id: "turn-2", label: "Jul 2028" },
  { id: "turn-3", label: "Oct 2028" },
  { id: "turn-4", label: "Jan 2029" },
];

const DEFAULT_MULTIPLIERS: Record<string, Record<string, number>> = {
  // Pre-game history (2027): OpenBrain leads, Conscentia second, DeepCent third.
  // DeepCent overtakes Conscentia at the Jan 2028 start — the alleged weight theft.
  "jan-2027": { openbrain: 1.16, deepcent: 1.1,  conscentia: 1.12 },
  "apr-2027": { openbrain: 1.2,  deepcent: 1.11, conscentia: 1.13 },
  "jul-2027": { openbrain: 1.3,  deepcent: 1.12, conscentia: 1.15 },
  "oct-2027": { openbrain: 1.4,  deepcent: 1.15, conscentia: 1.25 },
  start:      { openbrain: 3,    deepcent: 2.5,  conscentia: 2 },
  "turn-1":   { openbrain: 10,   deepcent: 7,    conscentia: 5 },
  "turn-2":   { openbrain: 100,  deepcent: 90,   conscentia: 60 },
  "turn-3":   { openbrain: 1000, deepcent: 700,  conscentia: 500 },
  "turn-4":   { openbrain: 5000, deepcent: 3500, conscentia: 2500 },
};

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "ttx.slides.rd.v1";

type StoredState = {
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
};

/** Read persisted R&D state from localStorage. Returns null if absent or invalid. */
function readStored(): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.labs) &&
      parsed.multipliers &&
      typeof parsed.multipliers === "object"
    ) {
      return parsed as StoredState;
    }
  } catch {
    // Corrupt value — fall back to defaults.
  }
  return null;
}

type RdContextValue = {
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
  /** Set a multiplier, or pass null to clear it (the point vanishes from the graph). */
  setMultiplier: (turnId: string, labId: string, value: number | null) => void;
  addLab: (lab: Lab) => void;
  removeLab: (labId: string) => void;
  /** Clear persisted state and restore the authored defaults. */
  reset: () => void;
};

const RdContext = createContext<RdContextValue>({
  labs: DEFAULT_LABS,
  multipliers: DEFAULT_MULTIPLIERS,
  setMultiplier: () => {},
  addLab: () => {},
  removeLab: () => {},
  reset: () => {},
});

export function RdProvider({ children }: { children: ReactNode }) {
  const [labs, setLabs] = useState<Lab[]>(() => readStored()?.labs ?? DEFAULT_LABS);
  const [multipliers, setMultipliers] = useState(
    () => readStored()?.multipliers ?? DEFAULT_MULTIPLIERS,
  );

  // Persist any change to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ labs, multipliers }));
    } catch {
      // Storage full or unavailable — ignore; in-memory state still works.
    }
  }, [labs, multipliers]);

  const setMultiplier = useCallback((turnId: string, labId: string, value: number | null) => {
    setMultipliers((prev) => {
      const turn = { ...prev[turnId] };
      if (value === null) {
        delete turn[labId];
      } else {
        turn[labId] = value;
      }
      return { ...prev, [turnId]: turn };
    });
  }, []);

  const addLab = useCallback((lab: Lab) => {
    setLabs((prev) => [...prev, lab]);
    setMultipliers((prev) => {
      const next = { ...prev };
      for (const t of TURN_TIMELINE) {
        next[t.id] = { ...next[t.id], [lab.id]: 1 };
      }
      return next;
    });
  }, []);

  const removeLab = useCallback((labId: string) => {
    setLabs((prev) => prev.filter((l) => l.id !== labId));
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    setLabs(DEFAULT_LABS);
    setMultipliers(DEFAULT_MULTIPLIERS);
  }, []);

  return (
    <RdContext.Provider
      value={{ labs, multipliers, setMultiplier, addLab, removeLab, reset }}
    >
      {children}
    </RdContext.Provider>
  );
}

export function useRd() {
  return useContext(RdContext);
}
