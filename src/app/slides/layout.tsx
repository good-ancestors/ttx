import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Slides — The Race to AGI",
  description: "Full-screen slideshow presentation for the tabletop exercise.",
};

/**
 * Full-screen shell for the slideshow. Uses `fixed inset-0` to escape the root
 * layout's flex column and cover the entire viewport, so slides fill projector
 * displays edge to edge.
 */
export default function SlidesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-navy-dark">
      <div className="slides-bg" aria-hidden />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
