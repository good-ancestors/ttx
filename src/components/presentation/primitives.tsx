"use client";

import { createContext } from "react";
import type { ReactNode } from "react";

/**
 * Shared full-screen presentation primitives.
 *
 * Originally written for the standalone `/slides` deck, these are the building
 * blocks of any projector-facing full-screen panel — including the main-game
 * facilitator presenter. Keep them presentation-agnostic: no game/Convex
 * imports here so both surfaces can depend on them without coupling.
 */

// ─── Bullet reveal context ────────────────────────────────────────────────────

type BulletContextValue = { visibleCount: number };

/** Consumed by bullet lists to know how many items to show. Provided by the Slideshow. */
export const BulletContext = createContext<BulletContextValue>({
  visibleCount: Number.MAX_SAFE_INTEGER,
});

// ─── Layout primitives ────────────────────────────────────────────────────────

type Align = "center" | "start";

/** Full-bleed panel container. Centers content and provides projector-safe padding. */
export function SlideShell({
  children,
  align = "center",
  className = "",
}: {
  children: ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex h-full w-full flex-col gap-8 px-12 py-16 md:px-24 md:py-20",
        align === "center" ? "items-center justify-center text-center" : "items-start justify-center text-left",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/** Small uppercase kicker shown above a title. */
export function SlideEyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <p
      className="text-sm font-semibold uppercase tracking-[0.25em] text-text-light md:text-base"
      style={color ? { color } : undefined}
    >
      {children}
    </p>
  );
}

/** Primary panel heading. */
export function SlideTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-balance text-4xl font-bold leading-tight text-off-white md:text-6xl lg:text-7xl">
      {children}
    </h2>
  );
}

/** Supporting line beneath a title. */
export function SlideSubtitle({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-balance text-xl text-text-light md:text-2xl">{children}</p>;
}
