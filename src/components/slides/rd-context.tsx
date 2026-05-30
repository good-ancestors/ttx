"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type Lab = { id: string; name: string; color: string };

const DEFAULT_LABS: Lab[] = [
  { id: "openbrain", name: "OpenBrain", color: "#3B82F6" },
  { id: "deepcent", name: "DeepCent", color: "#D97706" },
  { id: "conscentia", name: "Conscentia", color: "#7C3AED" },
];

export const TURN_TIMELINE = [
  { id: "start", label: "Jan 2028" },
  { id: "turn-1", label: "Mar 2028" },
  { id: "turn-2", label: "Jun 2028" },
  { id: "turn-3", label: "Sep 2028" },
  { id: "turn-4", label: "Dec 2028" },
];

const DEFAULT_MULTIPLIERS: Record<string, Record<string, number>> = {
  start:    { openbrain: 3,    deepcent: 1,    conscentia: 1 },
  "turn-1": { openbrain: 10,   deepcent: 3,    conscentia: 4 },
  "turn-2": { openbrain: 60,   deepcent: 15,   conscentia: 20 },
  "turn-3": { openbrain: 800,  deepcent: 50,   conscentia: 100 },
  "turn-4": { openbrain: 5000, deepcent: 200,  conscentia: 500 },
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
