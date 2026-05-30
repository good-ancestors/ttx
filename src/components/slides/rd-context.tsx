"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type Lab = { id: string; name: string; color: string };

const DEFAULT_LABS: Lab[] = [
  { id: "openbrain", name: "OpenBrain", color: "#3B82F6" },
  { id: "deepcent", name: "DeepCent", color: "#D97706" },
  { id: "conscentia", name: "Conscentia", color: "#7C3AED" },
];

// The first two points pre-date the game: R&D multipliers sit near zero (0.1×)
// from mid-2027 and stay flat until the jump at Jan 2028. Each turn's data point
// is then plotted at the month *after* the turn ends, so the line reaches the
// boundary of the next period (e.g. Turn 1 ends in March → its point sits at
// Apr 2028).
export const TURN_TIMELINE = [
  { id: "jul-2027", label: "Jul 2027", pregame: true },
  { id: "dec-2027", label: "Dec 2027", pregame: true },
  { id: "start", label: "Jan 2028" },
  { id: "turn-1", label: "Apr 2028" },
  { id: "turn-2", label: "Jul 2028" },
  { id: "turn-3", label: "Oct 2028" },
  { id: "turn-4", label: "Jan 2029" },
];

const DEFAULT_MULTIPLIERS: Record<string, Record<string, number>> = {
  // Pre-game history: OpenBrain leads, Conscentia slightly behind, DeepCent furthest back.
  // DeepCent overtakes Conscentia at the Jan 2028 start — the alleged weight theft.
  "jul-2027": { openbrain: 1.4, deepcent: 1.2, conscentia: 1.3 },
  "dec-2027": { openbrain: 1.4, deepcent: 1.2, conscentia: 1.3 },
  start:      { openbrain: 3,   deepcent: 2,   conscentia: 1 },
  "turn-1":   { openbrain: 10,  deepcent: 3,   conscentia: 4 },
  "turn-2":   { openbrain: 60,   deepcent: 15,   conscentia: 20 },
  "turn-3":   { openbrain: 800,  deepcent: 50,   conscentia: 100 },
  "turn-4":   { openbrain: 5000, deepcent: 200,  conscentia: 500 },
};

type RdContextValue = {
  labs: Lab[];
  multipliers: Record<string, Record<string, number>>;
  setMultiplier: (turnId: string, labId: string, value: number) => void;
  addLab: (lab: Lab) => void;
  removeLab: (labId: string) => void;
};

const RdContext = createContext<RdContextValue>({
  labs: DEFAULT_LABS,
  multipliers: DEFAULT_MULTIPLIERS,
  setMultiplier: () => {},
  addLab: () => {},
  removeLab: () => {},
});

export function RdProvider({ children }: { children: ReactNode }) {
  const [labs, setLabs] = useState<Lab[]>(DEFAULT_LABS);
  const [multipliers, setMultipliers] = useState(DEFAULT_MULTIPLIERS);

  const setMultiplier = useCallback((turnId: string, labId: string, value: number) => {
    setMultipliers((prev) => ({
      ...prev,
      [turnId]: { ...prev[turnId], [labId]: value },
    }));
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

  return (
    <RdContext.Provider value={{ labs, multipliers, setMultiplier, addLab, removeLab }}>
      {children}
    </RdContext.Provider>
  );
}

export function useRd() {
  return useContext(RdContext);
}
