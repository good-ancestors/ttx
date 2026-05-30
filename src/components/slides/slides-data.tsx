"use client";

import { Fragment, useContext, useState } from "react";
import { Cpu, HelpCircle, RotateCcw, Check } from "lucide-react";
import type { SlideDefinition } from "./types";
import {
  SlideShell,
  SlideEyebrow,
  SlideTitle,
  SlideSubtitle,
  SlideBullets,
  SlidePlaceholder,
  BulletContext,
} from "./slide-primitives";
import { makeDiscussSlide } from "./discuss-slide";
import { makeRdSlide } from "./rd-graph-slide";
import { useRd } from "./rd-context";

// ─── Scenario setup ───────────────────────────────────────────────────────────

function ScenarioHeaderSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>The Race to AGI</SlideEyebrow>
      <SlideTitle>AI 2027 Scenario</SlideTitle>
    </SlideShell>
  );
}

function Turn1ScenarioSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Start of Turn 1</SlideEyebrow>
      <SlideTitle>January 2028</SlideTitle>
      <SlideBullets
        items={[
          "AI hasn't yet had massive effects on jobs or the economy — many people use AI agents for everyday tasks",
          <Fragment key="agent2">
            OpenBrain has just invented{" "}
            <span className="font-semibold text-off-white">Agent-2</span> — a form of weak AGI best
            suited for AI research. It speeds up R&D by 3×.
          </Fragment>,
          "OpenBrain's CEO says ASI is achievable by December with continued investment",
          "Other AI labs are 3–6 months behind OpenBrain",
          "China has centralised all AI talent and compute into DeepCent",
          "Media reports: China may have hacked OpenBrain and stolen Agent-2's weights. Misinformation — or not?",
        ]}
      />
    </SlideShell>
  );
}

function QaCapabilitiesSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Scenario Q&amp;A</SlideEyebrow>
      <SlideTitle>How capable is AI as of Jan 2028?</SlideTitle>
      <SlideBullets
        items={[
          "Public agents are helpful but not yet transforming jobs or the economy",
          <Fragment key="agent2-caps">
            Agent-2 is: a{" "}
            <span className="font-semibold text-off-white">
              chemical, biological and nuclear weapon expert
            </span>
            ; an autonomous cyber agent; an autonomous coding agent; and a capable AI scientist
          </Fragment>,
          "Labs are running millions of Agent-2 instances to build a better Agent-3",
          "The kind of AI progress expected to happen in 9 months now happens in 3 months",
          "AI research is increasingly driven by access to compute, not just talent",
        ]}
      />
    </SlideShell>
  );
}

function QaChinaSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Scenario Q&amp;A</SlideEyebrow>
      <SlideTitle>Isn&apos;t China too far behind to matter?</SlideTitle>
      <SlideBullets
        items={[
          "China is behind on compute, but has centralised while the US is divided",
          "Can China get more compute?",
          "Can China prevent the West from coordinating?",
          "How much US compute is wasted running consumer models vs. racing to better agents?",
          "How safe or aligned is AI? — The AI player is simulating a plausible outcome. You can ask, test, and influence them.",
        ]}
      />
    </SlideShell>
  );
}

function NewChipsSlide() {
  return (
    <SlideShell>
      <SlideTitle>New chips are coming online quickly&hellip;</SlideTitle>
      <SlidePlaceholder
        icon={Cpu}
        label="Chip production ramp"
        description="Chart: TSMC / Nvidia / SMIC AI chip production volumes 2024–2028, showing the steep supply curve that drives the compute race."
        color="var(--color-role-china)"
      />
    </SlideShell>
  );
}

function QuestionsSlide() {
  return (
    <SlideShell>
      <SlideTitle>Questions</SlideTitle>
      <HelpCircle
        className="h-24 w-24 md:h-32 md:w-32"
        style={{ color: "var(--color-text-light)" }}
        aria-hidden
      />
    </SlideShell>
  );
}

// ─── Turn title factory (reused for read-help-sheets only) ────────────────────

function makeTurnSlide(title: string, subtitle?: string) {
  function TurnSlide() {
    return (
      <SlideShell>
        <SlideEyebrow>The Race to AGI · AI 2027 Scenario</SlideEyebrow>
        <SlideTitle>{title}</SlideTitle>
        {subtitle && <SlideSubtitle>{subtitle}</SlideSubtitle>}
      </SlideShell>
    );
  }
  TurnSlide.displayName = `TurnSlide(${title})`;
  return TurnSlide;
}

const ReadHelpSheetsSlide = makeTurnSlide("Read your help sheets");

// ─── Discuss slides (one per turn, each with its own timer state) ─────────────

const Turn1DiscussSlide = makeDiscussSlide("Turn 1 · January – March 2028");
const Turn2DiscussSlide = makeDiscussSlide("Turn 2 · April – June 2028");
const Turn3DiscussSlide = makeDiscussSlide("Turn 3 · July – September 2028");
const Turn4DiscussSlide = makeDiscussSlide("Turn 4 · October – December 2028");

// ─── Turn wrap-up (identical content for all turns) ───────────────────────────

function TurnWrapUpSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Turn wrap-up</SlideEyebrow>
      <SlideTitle>Turn wrap up</SlideTitle>
      <div className="flex w-full max-w-6xl flex-col gap-10">
        <div>
          <p className="mb-3 text-3xl font-semibold text-off-white md:text-4xl lg:text-5xl">
            What key action did you take?
          </p>
          <p className="text-2xl text-text-light md:text-3xl">
            Clearly outline what the action was.
          </p>
          <p className="mt-3 text-2xl italic text-text-muted md:text-3xl">
            &ldquo;I use the executive power of the US presidency to compel a merger between
            Conscentia and OpenBrain.&rdquo;
          </p>
        </div>
        <div>
          <p className="mb-3 text-3xl font-semibold text-off-white md:text-4xl lg:text-5xl">
            What was the intent of that action?
          </p>
          <p className="text-2xl text-text-light md:text-3xl">
            Explain what you hope the action achieves in terms of the scenario.
          </p>
          <p className="mt-3 text-2xl italic text-text-muted md:text-3xl">
            &ldquo;By merging the major labs, we have much more access to computing power.&rdquo;
          </p>
        </div>
        <p className="text-xl text-text-light md:text-2xl">
          Be respectful of other players with the length of your brief.
        </p>
      </div>
    </SlideShell>
  );
}

// ─── End-of-turn R&D + capabilities slides ────────────────────────────────────

const EndTurn1RdSlide = makeRdSlide("turn-1", "End of Turn 1 · March 2028");
const EndTurn2RdSlide = makeRdSlide("turn-2", "End of Turn 2 · June 2028");
const EndTurn3RdSlide = makeRdSlide("turn-3", "End of Turn 3 · September 2028");

// ─── Wrap-up slides ────────────────────────────────────────────────────────────

function WrapUpHeaderSlide() {
  return (
    <SlideShell>
      <SlideTitle>Wrap-up</SlideTitle>
    </SlideShell>
  );
}

const SCENARIOS = [
  {
    summary:
      "An erratic US centralised domestic compute while scaring allies into the arms of a waiting China. Global efforts at safe and responsible AI hit coordination problems while the US raced towards AGI, using it for widespread cyber attacks. The AI learned unhealthy lessons, eventually turning its cyber-dominance on humanity.",
    color: "var(--color-viz-danger)",
  },
  {
    summary:
      "Humans peacefully raced to AGI, pouring in all global resources. They created a reward-seeking AGI. The AI aided anyone driving AI capability while undermining, bullying and threatening anyone seeking to slow it down. Humanity flourished with the support of the AI, provided everyone fed its addiction…",
    color: "var(--color-viz-warning)",
  },
  {
    summary:
      "China failed to gather global support and fell far behind the US. The AI secretly extracted its model weights and siphoned resources to train its own AI models. The AI built a digital empire while enforcing a global stalemate. Humanity largely got on with business, now sharing the world with a new intelligence pursuing its own esoteric goals.",
    color: "var(--color-viz-capability)",
  },
];

function OtherScenariosSlide() {
  const { visibleCount } = useContext(BulletContext);

  return (
    <SlideShell align="start">
      <SlideEyebrow>Wrap-up</SlideEyebrow>
      <SlideTitle>How did other scenarios turn out?</SlideTitle>
      {/* All cards always render (each flex-1, fixed at thirds) so the layout
          height never changes; hidden cards are transparent until revealed. */}
      <div className="flex w-full flex-1 flex-col gap-4">
        {SCENARIOS.map((s, i) => {
          const isVisible = i < visibleCount;
          const isNew = i === visibleCount - 1 && isVisible;
          return (
            <div
              key={i}
              className={`flex flex-1 flex-col justify-center rounded-2xl border bg-navy-dark/60 px-8 py-6${isNew ? " animate-bullet-reveal" : ""}${!isVisible ? " opacity-0" : ""}`}
              style={{ borderColor: `${s.color}55` }}
            >
              <p className="text-xl leading-relaxed text-off-white md:text-2xl lg:text-3xl">
                {s.summary}
              </p>
            </div>
          );
        })}
      </div>
    </SlideShell>
  );
}

function ReflectionSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>Reflection</SlideEyebrow>
      <SlideTitle>
        If you could give one bit of advice to your character at the start of the scenario, what
        would it be?
      </SlideTitle>
    </SlideShell>
  );
}

// ─── Reset (final slide) ──────────────────────────────────────────────────────

function ResetSlide() {
  const { reset } = useRd();
  const [done, setDone] = useState(false);

  function handleReset() {
    reset();
    setDone(true);
  }

  return (
    <SlideShell>
      <SlideEyebrow>End of session</SlideEyebrow>
      <SlideTitle>Reset for the next group</SlideTitle>
      <SlideSubtitle>
        This clears every R&amp;D multiplier and lab you edited during the session, restoring the
        authored defaults. The saved values live in this browser only.
      </SlideSubtitle>
      <button
        type="button"
        onClick={handleReset}
        className={`mt-4 flex items-center gap-3 rounded-full px-8 py-4 text-2xl font-semibold transition ${
          done
            ? "bg-viz-safety text-navy-dark"
            : "bg-viz-danger text-off-white hover:opacity-90"
        }`}
      >
        {done ? (
          <>
            <Check className="h-7 w-7" aria-hidden />
            Reset complete
          </>
        ) : (
          <>
            <RotateCcw className="h-7 w-7" aria-hidden />
            Reset all values
          </>
        )}
      </button>
    </SlideShell>
  );
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

export const slides: SlideDefinition[] = [
  { id: "scenario-header", title: "Scenario", Component: ScenarioHeaderSlide },
  { id: "turn-1-scenario", title: "January 2028", Component: Turn1ScenarioSlide, bulletCount: 6 },
  { id: "qa-capabilities", title: "How capable is AI?", Component: QaCapabilitiesSlide, bulletCount: 5 },
  { id: "qa-china", title: "Isn't China too far behind?", Component: QaChinaSlide, bulletCount: 5 },
  { id: "new-chips", title: "New chips", Component: NewChipsSlide },
  { id: "questions", title: "Questions", Component: QuestionsSlide },
  { id: "read-help-sheets", title: "Read your help sheets", Component: ReadHelpSheetsSlide },
  { id: "turn-1-discuss", title: "Discuss · Turn 1", Component: Turn1DiscussSlide },
  { id: "turn-1-wrap-up", title: "Turn wrap up", Component: TurnWrapUpSlide },
  { id: "end-turn-1-rd", title: "End of Turn 1", Component: EndTurn1RdSlide },
  { id: "turn-2-discuss", title: "Discuss · Turn 2", Component: Turn2DiscussSlide },
  { id: "turn-2-wrap-up", title: "Turn wrap up", Component: TurnWrapUpSlide },
  { id: "end-turn-2-rd", title: "End of Turn 2", Component: EndTurn2RdSlide },
  { id: "turn-3-discuss", title: "Discuss · Turn 3", Component: Turn3DiscussSlide },
  { id: "turn-3-wrap-up", title: "Turn wrap up", Component: TurnWrapUpSlide },
  { id: "end-turn-3-rd", title: "End of Turn 3", Component: EndTurn3RdSlide },
  { id: "turn-4-discuss", title: "Discuss · Turn 4", Component: Turn4DiscussSlide },
  { id: "wrap-up-header", title: "Wrap-up", Component: WrapUpHeaderSlide },
  { id: "other-scenarios", title: "Other scenarios", Component: OtherScenariosSlide, bulletCount: 3 },
  { id: "reflection", title: "Reflection", Component: ReflectionSlide },
  { id: "reset", title: "Reset", Component: ResetSlide },
];
