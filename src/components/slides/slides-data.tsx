import { Fragment } from "react";
import { Cpu, HelpCircle } from "lucide-react";
import type { SlideDefinition } from "./types";
import {
  SlideShell,
  SlideEyebrow,
  SlideTitle,
  SlideSubtitle,
  SlideBullets,
  SlidePlaceholder,
} from "./slide-primitives";

// ─── Scenario setup ───────────────────────────────────────────────────────────

function ScenarioHeaderSlide() {
  return (
    <SlideShell>
      <SlideTitle>Scenario</SlideTitle>
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

// ─── Turn title factory ────────────────────────────────────────────────────────

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

const StartTurn1Slide = makeTurnSlide("Start of Turn 1", "January 2028");
const ReadHelpSheetsSlide = makeTurnSlide("Read your help sheets");
const Turn1Slide = makeTurnSlide("Turn 1", "January – March 2028");
const EndTurn1TitleSlide = makeTurnSlide("End of Turn 1", "March 2028");
const Turn2Slide = makeTurnSlide("Turn 2", "April – June 2028");
const EndTurn2TitleSlide = makeTurnSlide("End of Turn 2", "June 2028");
const Turn3Slide = makeTurnSlide("Turn 3", "July – September 2028");
const EndTurn3TitleSlide = makeTurnSlide("End of Turn 3", "September 2028");
const Turn4Slide = makeTurnSlide("Turn 4", "October – December 2028");

// ─── Turn wrap-up (identical content for all turns) ───────────────────────────

function TurnWrapUpSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Turn wrap-up</SlideEyebrow>
      <SlideTitle>Turn wrap up</SlideTitle>
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <div>
          <p className="mb-2 text-2xl font-semibold text-off-white md:text-3xl">
            What key action did you take?
          </p>
          <p className="text-xl text-text-light md:text-2xl">
            Clearly outline what the action was.
          </p>
          <p className="mt-2 text-xl italic text-text-muted md:text-2xl">
            &ldquo;I use the executive power of the US presidency to compel a merger between
            Conscentia and OpenBrain.&rdquo;
          </p>
        </div>
        <div>
          <p className="mb-2 text-2xl font-semibold text-off-white md:text-3xl">
            What was the intent of that action?
          </p>
          <p className="text-xl text-text-light md:text-2xl">
            Explain what you hope the action achieves in terms of the scenario.
          </p>
          <p className="mt-2 text-xl italic text-text-muted md:text-2xl">
            &ldquo;By merging the major labs, we have much more access to computing power.&rdquo;
          </p>
        </div>
        <p className="text-lg text-text-light">
          Be respectful of other players with the length of your brief.
        </p>
      </div>
    </SlideShell>
  );
}

// ─── End-of-turn capability slides ────────────────────────────────────────────

function EndTurn1CapabilitiesSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>End of Turn 1 · March 2028</SlideEyebrow>
      <SlideTitle>How capable is AI?</SlideTitle>
      <SlideBullets
        items={[
          "Can complete tasks like the best remote worker",
          "As persuasive as the most persuasive humans",
          "Significant progress on robotics — skillfully control robots",
          '"AI CEOs" perform like human CEOs',
          <Fragment key="t1-multiplier">
            Agent-3&apos;s R&D multiplier is{" "}
            <span className="font-bold" style={{ color: "var(--color-viz-capability)" }}>
              10×
            </span>{" "}
            — the kind of AI progress expected in 3 years now happens in 3 months
          </Fragment>,
          "The majority of AI progress is now driven by compute, not talent",
        ]}
      />
    </SlideShell>
  );
}

function EndTurn2CapabilitiesSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>End of Turn 2 · June 2028</SlideEyebrow>
      <SlideTitle>How capable is AI?</SlideTitle>
      <SlideBullets
        items={[
          "Superhuman persuasion — more persuasive than any human",
          "Significant progress on robotics — skillfully control robots",
          '"AI CEOs" perform like human CEOs',
          <Fragment key="t2-multiplier">
            Agent-3&apos;s R&D multiplier is{" "}
            <span className="font-bold" style={{ color: "var(--color-viz-warning)" }}>
              60×
            </span>{" "}
            — AI progress expected in 15 years now happens in 3 months
          </Fragment>,
          "Almost all AI progress is now driven by compute, not talent",
        ]}
      />
    </SlideShell>
  );
}

function EndTurn3CapabilitiesSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>End of Turn 3 · September 2028</SlideEyebrow>
      <SlideTitle>How capable is AI?</SlideTitle>
      <SlideBullets
        items={[
          "Superhuman persuasion",
          "Advanced robotics",
          "Superhuman strategy",
          "Cyber dominance",
          <Fragment key="t3-multiplier">
            Agent-3&apos;s R&D multiplier is{" "}
            <span className="font-bold" style={{ color: "var(--color-viz-danger)" }}>
              800×
            </span>{" "}
            — AI progress expected in 200 years now happens in 3 months
          </Fragment>,
          "Talent is largely irrelevant — essentially all AI progress is driven by compute",
        ]}
      />
    </SlideShell>
  );
}

// ─── Wrap-up slides ────────────────────────────────────────────────────────────

function WrapUpHeaderSlide() {
  return (
    <SlideShell>
      <SlideTitle>Wrap-up</SlideTitle>
    </SlideShell>
  );
}

function OtherScenariosSlide() {
  const scenarios = [
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
  return (
    <SlideShell align="start">
      <SlideEyebrow>Wrap-up</SlideEyebrow>
      <SlideTitle>How did other scenarios turn out?</SlideTitle>
      <div className="flex w-full max-w-6xl flex-col gap-5">
        {scenarios.map((s, i) => (
          <div
            key={i}
            className="rounded-2xl border bg-navy-dark/60 p-6"
            style={{ borderColor: `${s.color}55` }}
          >
            <p className="text-xl leading-relaxed text-off-white md:text-2xl">{s.summary}</p>
          </div>
        ))}
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

// ─── Deck ─────────────────────────────────────────────────────────────────────

export const slides: SlideDefinition[] = [
  { id: "scenario-header", title: "Scenario", Component: ScenarioHeaderSlide },
  { id: "turn-1-scenario", title: "January 2028", Component: Turn1ScenarioSlide },
  { id: "qa-capabilities", title: "How capable is AI?", Component: QaCapabilitiesSlide },
  { id: "qa-china", title: "Isn't China too far behind?", Component: QaChinaSlide },
  { id: "new-chips", title: "New chips", Component: NewChipsSlide },
  { id: "questions", title: "Questions", Component: QuestionsSlide },
  { id: "start-turn-1", title: "Start of Turn 1", Component: StartTurn1Slide },
  { id: "read-help-sheets", title: "Read your help sheets", Component: ReadHelpSheetsSlide },
  { id: "turn-1-playing", title: "Turn 1", Component: Turn1Slide },
  { id: "turn-1-wrap-up", title: "Turn wrap up", Component: TurnWrapUpSlide },
  { id: "end-turn-1-title", title: "End of Turn 1", Component: EndTurn1TitleSlide },
  { id: "end-turn-1-capabilities", title: "AI capabilities — Turn 1", Component: EndTurn1CapabilitiesSlide },
  { id: "turn-2-playing", title: "Turn 2", Component: Turn2Slide },
  { id: "turn-2-wrap-up", title: "Turn wrap up", Component: TurnWrapUpSlide },
  { id: "end-turn-2-title", title: "End of Turn 2", Component: EndTurn2TitleSlide },
  { id: "end-turn-2-capabilities", title: "AI capabilities — Turn 2", Component: EndTurn2CapabilitiesSlide },
  { id: "turn-3-playing", title: "Turn 3", Component: Turn3Slide },
  { id: "turn-3-wrap-up", title: "Turn wrap up", Component: TurnWrapUpSlide },
  { id: "end-turn-3-title", title: "End of Turn 3", Component: EndTurn3TitleSlide },
  { id: "end-turn-3-capabilities", title: "AI capabilities — Turn 3", Component: EndTurn3CapabilitiesSlide },
  { id: "turn-4-playing", title: "Turn 4", Component: Turn4Slide },
  { id: "wrap-up-header", title: "Wrap-up", Component: WrapUpHeaderSlide },
  { id: "other-scenarios", title: "Other scenarios", Component: OtherScenariosSlide },
  { id: "reflection", title: "Reflection", Component: ReflectionSlide },
];
