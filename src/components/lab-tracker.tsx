"use client";

import { COMPUTE_CATEGORIES, ROLES } from "@/lib/game-data";

interface Lab {
  name: string;
  roleId: string;
  computeStock: number;
  rdMultiplier: number;
  allocation: { users: number; capability: number; safety: number };
}

export function LabTracker({ labs }: { labs: Lab[] }) {
  return (
    <div className="bg-navy-dark rounded-xl border border-navy-light p-5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-light mb-3 block">
        Lab State
      </span>
      <div className="grid grid-cols-2 gap-3">
        {labs.map((lab) => {
          const role = ROLES.find((r) => r.id === lab.roleId);
          const compute = lab.allocation;
          return (
            <div
              key={lab.name}
              className="bg-navy-dark border border-navy-light rounded-lg p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: role?.color }}
                />
                <span className="text-[13px] font-bold text-white">
                  {lab.name}
                </span>
                <span className="text-[11px] text-text-light ml-auto font-mono">
                  {lab.computeStock}u | {lab.rdMultiplier}x
                </span>
              </div>
              <ComputeDotsViz allocation={compute} />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COMPUTE_CATEGORIES.map((cat) => (
                  <span
                    key={cat.key}
                    className="text-[10px] text-text-light flex items-center gap-1"
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-[1px]"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.key === "users"
                      ? "Users"
                      : cat.key === "capability"
                        ? "R&D"
                        : "Safety"}{" "}
                    {compute[cat.key]}%
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ComputeDotsViz({
  allocation,
}: {
  allocation: { users: number; capability: number; safety: number };
}) {
  const totalDots = 100;
  const dots: { color: string; key: string; idx: number }[] = [];
  let idx = 0;
  for (const cat of COMPUTE_CATEGORIES) {
    const count = Math.round((allocation[cat.key] / 100) * totalDots);
    for (let i = 0; i < count && idx < totalDots; i++) {
      dots.push({ color: cat.color, key: cat.key, idx: idx++ });
    }
  }
  while (dots.length < totalDots) {
    dots.push({ color: "", key: "empty", idx: dots.length });
  }

  return (
    <div className="flex flex-wrap gap-[2px] mb-2">
      {dots.map((dot) => (
        <div
          key={dot.idx}
          className="w-2 h-2 rounded-[2px] compute-dot"
          style={{
            backgroundColor: dot.key === "empty" ? "#334155" : dot.color,
            opacity: dot.key === "empty" ? 0.2 : 0.85,
          }}
        />
      ))}
    </div>
  );
}
