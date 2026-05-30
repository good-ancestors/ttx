import type { ComponentType } from "react";

/**
 * A single slide in the slideshow.
 *
 * `Component` is rendered full-screen inside the {@link Slideshow} frame. Slides
 * are plain React components, so future slides can use hooks (Convex queries,
 * timers, animations) to embed live game elements — an editable R&D graph,
 * compute-distribution animation, round timer, etc.
 */
export type SlideDefinition = {
  /** Stable identifier. Also used as the URL fragment so deep links survive refresh. */
  id: string;
  /** Short human label surfaced in the slide counter / overview. */
  title: string;
  /** The slide body, rendered inside the full-screen frame. */
  Component: ComponentType;
  /**
   * Number of bullet points to progressively disclose on this slide.
   * If set, each "next" press reveals one more bullet before advancing.
   * Omit (or set 0) for slides with no progressive content.
   */
  bulletCount?: number;
};
