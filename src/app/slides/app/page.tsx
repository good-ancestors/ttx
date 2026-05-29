"use client";

import { Slideshow } from "@/components/slides/slideshow";
import { appDeck } from "@/components/slides/slides-data";

export default function AppSlidesPage() {
  return <Slideshow slides={appDeck} />;
}
