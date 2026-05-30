"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Minimize } from "lucide-react";
import type { SlideDefinition } from "./types";
import { BulletContext } from "./slide-primitives";

/** Clamp a number into the [min, max] range. */
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Read a 1-based slide index from the URL hash (e.g. "#3"), if present. */
function indexFromHash(count: number): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace("#", "");
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return clamp(n - 1, 0, count - 1);
}

/**
 * Full-screen slideshow with keyboard navigation, on-screen controls, a progress
 * bar, and URL-hash deep linking so a refresh keeps your place.
 *
 * Navigation:
 *  - Next: → · Space · PageDown · l  (reveals next bullet if any, then advances)
 *  - Prev: ← · Backspace · PageUp · h  (un-reveals last bullet if any, then retreats)
 *  - First / last: Home / End
 *  - Fullscreen: f
 *
 * On slides with a bulletCount, pressing "next" reveals one bullet at a time before
 * advancing to the next slide. Pressing "prev" un-reveals, or retreats to the
 * previous slide showing all its bullets.
 */
export function Slideshow({ slides }: { slides: SlideDefinition[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(() => indexFromHash(count) ?? 0);
  const [visibleCount, setVisibleCount] = useState(Number.MAX_SAFE_INTEGER);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const current = slides[index];
  const bulletCount = current.bulletCount ?? 0;

  const next = useCallback(() => {
    if (bulletCount > 0 && visibleCount < bulletCount) {
      setVisibleCount((v) => v + 1);
    } else {
      setIndex((i) => clamp(i + 1, 0, count - 1));
      setVisibleCount(1);
    }
  }, [bulletCount, visibleCount, count]);

  const prev = useCallback(() => {
    // Only decrement if we're mid-reveal (not when visibleCount > bulletCount,
    // which happens when arriving backward — MAX_SAFE_INTEGER would loop forever).
    if (bulletCount > 0 && visibleCount > 1 && visibleCount <= bulletCount) {
      setVisibleCount((v) => v - 1);
    } else {
      setIndex((i) => clamp(i - 1, 0, count - 1));
      setVisibleCount(Number.MAX_SAFE_INTEGER);
    }
  }, [bulletCount, visibleCount, count]);

  const goTo = useCallback(
    (n: number) => {
      setIndex(clamp(n, 0, count - 1));
      setVisibleCount(Number.MAX_SAFE_INTEGER);
    },
    [count],
  );

  // Keep the URL hash in sync with the current slide.
  useEffect(() => {
    const target = `#${index + 1}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [index]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Global keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
        case "l":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
        case "Backspace":
        case "h":
          e.preventDefault();
          prev();
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(count - 1);
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, goTo, count, toggleFullscreen]);

  // Mirror the prev() condition: disabled when prev() would not decrement.
  const atStart = index === 0 && !(bulletCount > 0 && visibleCount > 1 && visibleCount <= bulletCount);
  const atEnd = index === count - 1 && (bulletCount === 0 || visibleCount >= bulletCount);

  return (
    <BulletContext.Provider value={{ visibleCount }}>
      <div className="relative flex h-full w-full flex-col bg-navy-dark text-off-white">
        {/* Progress bar */}
        <div className="absolute inset-x-0 top-0 z-20 h-1.5 bg-navy-light/40">
          <div
            className="h-full bg-viz-capability transition-[width] duration-300 ease-out"
            style={{ width: `${((index + 1) / count) * 100}%` }}
          />
        </div>

        {/* Active slide */}
        <main className="flex-1 overflow-hidden">
          <current.Component key={current.id} />
        </main>

        {/* Control bar */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 px-6 py-4 md:px-10">
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            aria-label="Previous slide"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-light/60 text-off-white transition hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-2.5" role="tablist" aria-label="Slides">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1}: ${slide.title}`}
                onClick={() => goTo(i)}
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: i === index ? "1.75rem" : "0.625rem",
                  backgroundColor:
                    i === index ? "var(--color-viz-capability)" : "var(--color-navy-light)",
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-sm text-text-light tabular-nums sm:inline">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-light/60 text-off-white transition hover:bg-navy-light"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" aria-hidden />
              ) : (
                <Maximize className="h-5 w-5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={atEnd}
              aria-label="Next slide"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-light/60 text-off-white transition hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </BulletContext.Provider>
  );
}
