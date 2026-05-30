"use client";

import { Slideshow } from "@/components/slides/slideshow";
import { slides } from "@/components/slides/slides-data";
import { RdProvider } from "@/components/slides/rd-context";

export default function SlidesPage() {
  return (
    <RdProvider>
      <Slideshow slides={slides} />
    </RdProvider>
  );
}
