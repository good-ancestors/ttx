"use client";

import { Slideshow } from "@/components/slides/slideshow";
import { physicalDeck } from "@/components/slides/slides-data";

export default function PhysicalSlidesPage() {
  return <Slideshow slides={physicalDeck} />;
}
