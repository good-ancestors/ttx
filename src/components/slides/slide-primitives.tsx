"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Reusable layout building blocks for slides.
 */

// ─── Bullet reveal context ────────────────────────────────────────────────────

type BulletContextValue = { visibleCount: number };

/** Consumed by SlideBullets to know how many items to show. Provided by Slideshow. */
export const BulletContext = createContext<BulletContextValue>({
  visibleCount: Number.MAX_SAFE_INTEGER,
});

// ─── Layout primitives ────────────────────────────────────────────────────────

type Align = "center" | "start";

/** Full-bleed slide container. Centers content and provides projector-safe padding. */
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

/** Primary slide heading. */
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

/**
 * A vertical list of bullet points with progressive disclosure.
 * Reads visibleCount from BulletContext — Slideshow controls how many are shown.
 * The most-recently revealed item animates in.
 */
export function SlideBullets({ items }: { items: ReactNode[] }) {
  const { visibleCount } = useContext(BulletContext);

  return (
    <ul className="flex w-full flex-col gap-6 text-left md:gap-8">
      {items.map((item, i) => {
        if (i >= visibleCount) return null;
        const isNew = i === visibleCount - 1;
        return (
          <li
            key={i}
            className={`flex items-start gap-5 text-2xl text-off-white md:text-3xl lg:text-4xl${isNew ? " animate-bullet-reveal" : ""}`}
          >
            <span
              aria-hidden
              className="mt-3 h-3 w-3 shrink-0 rounded-full md:mt-4 md:h-4 md:w-4"
              style={{ backgroundColor: "var(--color-viz-capability)" }}
            />
            <span className="leading-snug">{item}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A dashed, labelled region marking where a live game element will be embedded
 * later (editable R&D graph, compute-distribution animation, round timer, …).
 */
export function SlidePlaceholder({
  icon: Icon,
  label,
  description,
  color = "var(--color-viz-capability)",
  children,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  color?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-navy-light bg-navy-dark/40 p-10"
      style={{ minHeight: "40vh" }}
    >
      <div className="flex items-center gap-3" style={{ color }}>
        <Icon className="h-10 w-10 md:h-12 md:w-12" aria-hidden />
        <span className="text-2xl font-semibold md:text-3xl">{label}</span>
      </div>
      {description && (
        <p className="max-w-2xl text-center text-base text-text-light md:text-xl">{description}</p>
      )}
      {children}
    </div>
  );
}
