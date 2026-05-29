import { Activity, Cpu, Timer } from "lucide-react";
import type { SlideDefinition } from "./types";
import {
  SlideShell,
  SlideEyebrow,
  SlideTitle,
  SlideSubtitle,
  SlideBullets,
  SlideStatGrid,
  SlidePlaceholder,
} from "./slide-primitives";

/**
 * Example slide deck — 10 slides demonstrating the available layouts.
 *
 * This is intentionally a flat, editable array. Add, remove, or reorder slides
 * here; the {@link Slideshow} handles navigation, progress, and deep linking
 * automatically. Slides 6–8 are placeholders showing where live game elements
 * (editable R&D graph, compute-distribution animation, round timer) will plug in.
 */

// The six TTX roles, reused on the "players" slide. Colours come from globals.css.
const ROLES = [
  { name: "OpenBrain", color: "var(--color-role-openbrain)" },
  { name: "United States", color: "var(--color-role-us)" },
  { name: "China", color: "var(--color-role-china)" },
  { name: "Australia", color: "var(--color-role-australia)" },
  { name: "AI Safety", color: "var(--color-role-safety)" },
  { name: "The AI", color: "var(--color-role-ai)" },
];

function TitleSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>Good Ancestors · Tabletop Exercise</SlideEyebrow>
      <SlideTitle>The Race to AGI</SlideTitle>
      <SlideSubtitle>
        A real-time scenario exploring the choices, incentives, and risks on the path to artificial
        general intelligence.
      </SlideSubtitle>
    </SlideShell>
  );
}

function AgendaSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Today</SlideEyebrow>
      <SlideTitle>What we&apos;ll do</SlideTitle>
      <SlideBullets
        items={[
          "Set the scene — where we are on the road to AGI",
          "Meet the players and their hidden incentives",
          "Run several rounds of decisions under uncertainty",
          "Watch capability and safety race against each other",
          "Debrief: what would you do differently?",
        ]}
      />
    </SlideShell>
  );
}

function SectionPlayersSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-role-us)">Part One</SlideEyebrow>
      <SlideTitle>The Players</SlideTitle>
      <SlideSubtitle>Six actors. Competing goals. One shared future.</SlideSubtitle>
    </SlideShell>
  );
}

function RolesSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>The table</SlideEyebrow>
      <SlideTitle>Who&apos;s in the room</SlideTitle>
      <div className="grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((role) => (
          <div
            key={role.name}
            className="flex items-center gap-4 rounded-2xl border border-navy-light bg-navy-dark/60 p-6"
          >
            <span
              aria-hidden
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundColor: role.color }}
            />
            <span className="text-2xl font-semibold text-off-white md:text-3xl">{role.name}</span>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function HowItWorksSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Mechanics</SlideEyebrow>
      <SlideTitle>How a round works</SlideTitle>
      <SlideBullets
        items={[
          "Each team plans an action and allocates its compute",
          "Actions resolve against the dice — outcomes are uncertain",
          "Capability and safety scores shift across the board",
          "New compute is acquired; the next round begins",
        ]}
      />
    </SlideShell>
  );
}

function RdGraphSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-viz-capability)">Live element · coming soon</SlideEyebrow>
      <SlideTitle>R&amp;D progress</SlideTitle>
      {/* TODO: replace placeholder with the editable R&D graph component. */}
      <SlidePlaceholder
        icon={Activity}
        label="Editable R&D graph"
        description="Capability vs. safety over time — will become an interactive, editable chart driven by live game state."
        color="var(--color-viz-capability)"
      >
        <div className="mt-4 flex h-40 w-full max-w-2xl items-end gap-3">
          {[20, 32, 28, 45, 52, 60, 58, 74, 82, 90].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md"
              style={{
                height: `${h}%`,
                backgroundColor: i % 2 ? "var(--color-viz-safety)" : "var(--color-viz-capability)",
                opacity: 0.55,
              }}
            />
          ))}
        </div>
      </SlidePlaceholder>
    </SlideShell>
  );
}

function ComputeSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-role-china)">Live element · coming soon</SlideEyebrow>
      <SlideTitle>Compute distribution</SlideTitle>
      {/* TODO: replace placeholder with the compute-distribution animation. */}
      <SlidePlaceholder
        icon={Cpu}
        label="Compute distribution animation"
        description="How compute flows between the labs each round — will animate from live allocations."
        color="var(--color-role-china)"
      >
        <div className="mt-4 flex h-8 w-full max-w-3xl overflow-hidden rounded-full">
          {ROLES.slice(0, 4).map((role, i) => (
            <div
              key={role.name}
              style={{ backgroundColor: role.color, width: `${[40, 25, 20, 15][i]}%`, opacity: 0.7 }}
            />
          ))}
        </div>
      </SlidePlaceholder>
    </SlideShell>
  );
}

function TimerSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-viz-warning)">Live element · coming soon</SlideEyebrow>
      <SlideTitle>Round timer</SlideTitle>
      {/* TODO: replace placeholder with the server-authoritative countdown timer. */}
      <SlidePlaceholder
        icon={Timer}
        label="Round timer"
        description="A server-authoritative countdown that drives the pace of each round."
        color="var(--color-viz-warning)"
      >
        <span
          className="mt-4 font-mono text-7xl font-bold tabular-nums md:text-8xl"
          style={{ color: "var(--color-viz-warning)" }}
        >
          05:00
        </span>
      </SlidePlaceholder>
    </SlideShell>
  );
}

function StakesSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>Why it matters</SlideEyebrow>
      <SlideTitle>The stakes</SlideTitle>
      <SlideStatGrid
        stats={[
          { label: "Teams at the table", value: "6", color: "var(--color-role-openbrain)" },
          { label: "Rounds of decisions", value: "8", color: "var(--color-viz-capability)" },
          { label: "Possible endings", value: "∞", color: "var(--color-role-ai)" },
        ]}
      />
    </SlideShell>
  );
}

function ClosingSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-role-australia)">Ready?</SlideEyebrow>
      <SlideTitle>Let&apos;s begin</SlideTitle>
      <SlideSubtitle>Find your seat, read your brief, and trust no one entirely.</SlideSubtitle>
    </SlideShell>
  );
}

export const slides: SlideDefinition[] = [
  { id: "title", title: "The Race to AGI", Component: TitleSlide },
  { id: "agenda", title: "What we'll do", Component: AgendaSlide },
  { id: "section-players", title: "The Players", Component: SectionPlayersSlide },
  { id: "roles", title: "Who's in the room", Component: RolesSlide },
  { id: "how-it-works", title: "How a round works", Component: HowItWorksSlide },
  { id: "rd-graph", title: "R&D progress", Component: RdGraphSlide },
  { id: "compute", title: "Compute distribution", Component: ComputeSlide },
  { id: "timer", title: "Round timer", Component: TimerSlide },
  { id: "stakes", title: "The stakes", Component: StakesSlide },
  { id: "closing", title: "Let's begin", Component: ClosingSlide },
];
