"use client";

import { useRouter } from "next/navigation";
import { Monitor, LayoutGrid } from "lucide-react";
import { physicalDeck, appDeck } from "./slides-data";

const DECKS = [
  {
    id: "app",
    icon: Monitor,
    label: "App version",
    description:
      "Uses the TTX web app to streamline play. Includes app walkthrough slides and a 60-minute format.",
    duration: "60 min · 15 min per round",
    slideCount: appDeck.length,
    color: "var(--color-role-openbrain)",
    href: "/slides/app",
  },
  {
    id: "physical",
    icon: LayoutGrid,
    label: "Physical cards version",
    description:
      "Uses physical character sheets and likelihood cards. Full 3-hour format for conferences and organisations.",
    duration: "3 hours · 30 min per round",
    slideCount: physicalDeck.length,
    color: "var(--color-role-australia)",
    href: "/slides/physical",
  },
] as const;

export function DeckPicker() {
  const router = useRouter();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-12 px-8 py-16 md:px-20">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-text-light md:text-base">
          Good Ancestors
        </p>
        <h1 className="text-4xl font-bold text-off-white md:text-6xl">The Race to AGI</h1>
        <p className="text-xl text-text-muted md:text-2xl">Choose a presentation deck</p>
      </div>

      <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        {DECKS.map((deck) => {
          const Icon = deck.icon;
          return (
            <button
              key={deck.id}
              type="button"
              onClick={() => router.push(deck.href)}
              className="group flex flex-col items-start gap-5 rounded-3xl border border-navy-light bg-navy-dark/60 p-8 text-left transition hover:border-navy-muted hover:bg-navy/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: deck.color }}
            >
              <Icon
                className="h-10 w-10 md:h-12 md:w-12 transition group-hover:scale-105"
                style={{ color: deck.color }}
                aria-hidden
              />
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-off-white md:text-3xl">{deck.label}</h2>
                <p className="text-base leading-relaxed text-text-light md:text-lg">
                  {deck.description}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-text-muted">{deck.duration}</p>
                <p className="text-sm text-text-muted">{deck.slideCount} slides</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
