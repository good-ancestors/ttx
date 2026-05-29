import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Reusable layout building blocks for slides.
 *
 * These keep the 10 example slides consistent and make new slides quick to
 * author. They are presentation-only (no client directive) so they can be
 * composed inside interactive, client-rendered slides later on.
 */

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

/** A vertical list of points with accent bullets. */
export function SlideBullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex max-w-3xl flex-col gap-5 text-left">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-4 text-xl text-off-white md:text-3xl">
          <span
            aria-hidden
            className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full md:mt-4 md:h-3 md:w-3"
            style={{ backgroundColor: "var(--color-viz-capability)" }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A grid of stat / fact cards. */
export function SlideStatGrid({
  stats,
}: {
  stats: { label: string; value: ReactNode; color?: string }[];
}) {
  return (
    <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((s, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-2xl border border-navy-light bg-navy-dark/60 p-8 text-left"
        >
          <span
            className="text-5xl font-bold md:text-6xl"
            style={{ color: s.color ?? "var(--color-off-white)" }}
          >
            {s.value}
          </span>
          <span className="text-base uppercase tracking-wide text-text-light md:text-lg">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A dashed, labelled region marking where a live game element will be embedded
 * later (editable R&D graph, compute-distribution animation, round timer, …).
 *
 * Replace the children of this panel with the real interactive component when
 * wiring up game state.
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
