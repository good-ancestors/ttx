"use client";

import { Slideshow } from "@/components/slides/slideshow";
import { slides } from "@/components/slides/slides-data";

export default function SlidesPage() {
  return <Slideshow slides={slides} />;
}
