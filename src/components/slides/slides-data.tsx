"use client";

import { useContext, useState } from "react";
import type { ReactNode } from "react";
import { HelpCircle, RotateCcw, Check } from "lucide-react";
import type { SlideDefinition } from "./types";
import {
  SlideShell,
  SlideEyebrow,
  SlideTitle,
  SlideSubtitle,
  SlideBullets,
  BulletContext,
} from "./slide-primitives";
import { makeDiscussSlide } from "./discuss-slide";
import { makeRdSlide, RdChart } from "./rd-graph-slide";
import { useRd, TURN_TIMELINE } from "./rd-context";

// ─── Nested-bullet helpers ───────────────────────────────────────────────────

function L1({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-5 text-2xl text-off-white md:text-3xl lg:text-4xl">
      <span
        aria-hidden
        className="mt-3 h-3 w-3 shrink-0 rounded-full md:mt-4 md:h-4 md:w-4"
        style={{ backgroundColor: "var(--color-viz-capability)" }}
      />
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function L2({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-4 text-xl text-text-light md:text-2xl lg:text-3xl">
      <span aria-hidden className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-text-light md:mt-3" />
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function L3({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-lg text-text-light md:text-xl lg:text-2xl">
      <span aria-hidden className="mt-2 h-2 w-2 shrink-0 bg-text-light md:mt-2.5" />
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function S1({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-4 text-xl text-off-white md:text-2xl lg:text-3xl">
      <span
        aria-hidden
        className="mt-2.5 h-3 w-3 shrink-0 rounded-full md:mt-3 md:h-3.5 md:w-3.5"
        style={{ backgroundColor: "var(--color-viz-capability)" }}
      />
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function S2({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-lg text-text-light md:text-xl lg:text-2xl">
      <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-text-light md:mt-2.5" />
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function RevealGroup({
  children,
  index,
  visibleCount,
}: {
  children: ReactNode;
  index: number;
  visibleCount: number;
}) {
  const isVisible = index < visibleCount;
  const isNew = index === visibleCount - 1 && isVisible;
  return (
    <div className={`${isNew ? "animate-bullet-reveal" : ""}${!isVisible ? " opacity-0" : ""}`}>
      {children}
    </div>
  );
}

// ─── Scenario setup ───────────────────────────────────────────────────────────

function ScenarioHeaderSlide() {
  return (
    <SlideShell>
      <p className="text-2xl font-semibold uppercase tracking-[0.25em] text-text-light md:text-4xl lg:text-5xl">
        The Race to ASI
      </p>
      <h2 className="text-balance text-7xl font-bold leading-tight text-off-white md:text-9xl lg:text-[12rem]">
        AI 2027 Scenario
      </h2>
    </SlideShell>
  );
}

function Turn1ScenarioSlide() {
  const { visibleCount } = useContext(BulletContext);

  return (
    <SlideShell align="start">
      <SlideEyebrow>Start of Turn 1</SlideEyebrow>
      <SlideTitle>Jan 2028</SlideTitle>
      <ul className="flex w-full flex-col gap-5 text-left">
        <RevealGroup index={0} visibleCount={visibleCount}>
          <L1>It&apos;s January 2028.</L1>
          <ul className="ml-8 mt-2 flex flex-col gap-2 md:ml-10">
            <L2>
              AI has not had massive effects on jobs, the economy, etc.
              <ul className="ml-6 mt-2 flex flex-col gap-2 md:ml-8">
                <L3>Many people use AI agents to help with tasks.</L3>
              </ul>
            </L2>
          </ul>
        </RevealGroup>

        <RevealGroup index={1} visibleCount={visibleCount}>
          <L1>
            OpenBrain has just invented{" "}
            <span className="font-semibold">&ldquo;Agent-2&rdquo;</span>
          </L1>
          <ul className="ml-8 mt-2 flex flex-col gap-2 md:ml-10">
            <L2>
              Agent-2 is best suited for AI research, but is a form of weak AGI and can be used for
              other purposes.
              <ul className="ml-6 mt-2 flex flex-col gap-2 md:ml-8">
                <L3>
                  <span className="font-semibold text-off-white underline">
                    Agent-2 speeds up AI R&amp;D by 3x
                  </span>
                </L3>
              </ul>
            </L2>
            <L2>
              OpenBrain&apos;s CEO says ASI is achievable by December with continued investment.
            </L2>
            <L2>Other AI labs are 3-6 months behind.</L2>
          </ul>
        </RevealGroup>

        <RevealGroup index={2} visibleCount={visibleCount}>
          <L1>OpenBrain has demonstrated Agent-2 to the US government.</L1>
          <ul className="ml-8 mt-2 flex flex-col gap-2 md:ml-10">
            <L2>
              Government was impressed by its{" "}
              <span className="font-semibold text-off-white underline">
                cyber offence / defence capability
              </span>
              .
            </L2>
          </ul>
        </RevealGroup>

        <RevealGroup index={3} visibleCount={visibleCount}>
          <L1>
            China has centralised all of its AI talent and compute resources into DeepCent.
          </L1>
          <ul className="ml-8 mt-2 flex flex-col gap-2 md:ml-10">
            <L2>
              Media reports rumours that China has hacked OpenBrain and stolen Agent-2&apos;s
              weights. Is this true, or misinformation to drive a wedge between the powers?
            </L2>
          </ul>
        </RevealGroup>
      </ul>
    </SlideShell>
  );
}

function QaGraphLayout({ children }: { children: ReactNode }) {
  const { labs, multipliers } = useRd();
  const startIdx = TURN_TIMELINE.findIndex((t) => t.id === "start");
  const visibleTurns = TURN_TIMELINE.slice(0, startIdx + 1);

  return (
    <div className="flex h-full w-full bg-navy-dark">
      {/* Left: R&D chart */}
      <div className="flex w-1/2 flex-col p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-2">
          {labs.map((lab) => (
            <span
              key={lab.id}
              className="flex items-center gap-2.5 text-2xl font-bold md:text-3xl"
              style={{ color: lab.color }}
            >
              <span
                className="h-4 w-4 rounded-full md:h-5 md:w-5"
                style={{ backgroundColor: lab.color }}
              />
              {lab.name}
            </span>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center">
          <RdChart visibleTurns={visibleTurns} labs={labs} multipliers={multipliers} />
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-navy-light" />

      {/* Right: content */}
      <div className="flex w-1/2 flex-col justify-center gap-6 px-10 py-10 lg:px-14">
        {children}
      </div>
    </div>
  );
}

function QaCapabilitiesSlide() {
  const { visibleCount } = useContext(BulletContext);

  return (
    <QaGraphLayout>
      <p className="text-base font-semibold uppercase tracking-[0.2em] text-text-light md:text-lg">
        Scenario implications, Q&amp;A
      </p>
      <p className="text-xl font-bold text-off-white md:text-2xl lg:text-3xl">
        How capable is AI as of Jan 2028?
      </p>
      <ul className="flex flex-col gap-3">
        <RevealGroup index={0} visibleCount={visibleCount}>
          <S1>
            Public AI agents are helpful, but not having dramatic effects on jobs or the economy
          </S1>
        </RevealGroup>
        <RevealGroup index={1} visibleCount={visibleCount}>
          <S1>
            Agent 2 is:
            <ul className="ml-6 mt-2 flex flex-col gap-2 md:ml-8">
              <S2>A chemical, biological and nuclear weapon expert</S2>
              <S2>An autonomous cyber agent</S2>
              <S2>An autonomous coding agent</S2>
              <S2>A capable AI scientist</S2>
            </ul>
          </S1>
        </RevealGroup>
      </ul>
    </QaGraphLayout>
  );
}

function QaRdMultiplierSlide() {
  const { visibleCount } = useContext(BulletContext);

  return (
    <QaGraphLayout>
      <p className="text-base font-semibold uppercase tracking-[0.2em] text-text-light md:text-lg">
        Scenario implications, Q&amp;A
      </p>
      <p className="text-xl font-bold text-off-white md:text-2xl lg:text-3xl">
        Agent-2&apos;s R&amp;D multiplier is <span className="underline">3x</span>, that means:
      </p>
      <ul className="flex flex-col gap-3">
        <RevealGroup index={0} visibleCount={visibleCount}>
          <S1>
            Labs are running <em>millions</em> of these agents attempting to make better agents.
            <ul className="ml-6 mt-2 flex flex-col gap-2 md:ml-8">
              <S2>
                Labs hope that a future &ldquo;agent 3&rdquo; will accelerate AI research even
                more.
              </S2>
              <S2>
                <span className="font-bold text-off-white">
                  The kind of AI progress we currently expect to happen in 9 months now happens in
                  3 months.
                </span>
              </S2>
            </ul>
          </S1>
        </RevealGroup>
        <RevealGroup index={1} visibleCount={visibleCount}>
          <S1>As agents get better, talent becomes less relevant.</S1>
        </RevealGroup>
        <RevealGroup index={2} visibleCount={visibleCount}>
          <S1>AI research is increasingly driven by access to compute, not just talent.</S1>
        </RevealGroup>
      </ul>
    </QaGraphLayout>
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

// ─── Compute Breakdown pie chart slides ──────────────────────────────────────

type PieSegment = { label: string; pct: number; color: string };

function describeSlice(cx: number, cy: number, r: number, start: number, end: number): string {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  return `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
}

function PieChart({ segments }: { segments: PieSegment[] }) {
  const cx = 180, cy = 180, r = 168;
  const slices = segments.reduce<Array<{ seg: PieSegment; start: number; end: number; mid: number }>>(
    (acc, seg) => {
      const start = acc.length > 0 ? acc[acc.length - 1].end : -Math.PI / 2;
      const sweep = (seg.pct / 100) * 2 * Math.PI;
      const end = start + sweep;
      return [...acc, { seg, start, end, mid: start + sweep / 2 }];
    },
    [],
  );

  return (
    <svg viewBox="0 0 360 360" className="w-full" aria-hidden>
      {slices.map(({ seg, start, end, mid }) => {
        const lx = cx + r * 0.64 * Math.cos(mid);
        const ly = cy + r * 0.64 * Math.sin(mid);
        return (
          <g key={seg.label}>
            <path d={describeSlice(cx, cy, r, start, end)} fill={seg.color} stroke="#0F172A" strokeWidth="2" />
            {seg.pct >= 7 && (
              <text
                x={lx.toFixed(1)}
                y={ly.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize="22"
                fontWeight="700"
              >
                {seg.pct}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ComputePieLayout({ subtitle, segments }: { subtitle: string; segments: PieSegment[] }) {
  return (
    <SlideShell>
      <SlideTitle>New chips are coming online quickly&hellip;</SlideTitle>
      <p className="text-balance text-3xl font-semibold text-text-light md:text-4xl lg:text-5xl">
        {subtitle}
      </p>
      <div className="flex w-full max-w-7xl flex-1 items-center gap-12 md:gap-20">
        <div className="w-1/2 shrink-0">
          <PieChart segments={segments} />
        </div>
        <ul className="flex flex-col gap-7">
          {segments.map((seg) => (
            <li key={seg.label} className="flex items-start gap-5">
              <div
                className="mt-2 h-7 w-7 shrink-0 rounded-sm md:mt-3 md:h-8 md:w-8"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-3xl text-off-white md:text-4xl lg:text-5xl">
                <span className="font-bold">{seg.pct}%</span>&ensp;{seg.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SlideShell>
  );
}

const COMPUTE_BREAKDOWN_SEGMENTS: PieSegment[] = [
  { label: "OpenBrain",     pct: 27.8, color: "#3B82F6" },
  { label: "DeepCent",      pct: 20.8, color: "#D97706" },
  { label: "Conscienta",    pct: 18.1, color: "#7C3AED" },
  { label: "Other US Labs", pct: 13.9, color: "#93C5FD" },
  { label: "Rest of world", pct: 19.4, color: "#22C55E" },
];

const COMPUTE_WITH_PRODUCTION_SEGMENTS: PieSegment[] = [
  { label: "Annual production", pct: 60.0, color: "#06B6D4" },
  { label: "OpenBrain",         pct: 11.1, color: "#3B82F6" },
  { label: "DeepCent",          pct:  8.3, color: "#D97706" },
  { label: "Conscienta",        pct:  7.2, color: "#7C3AED" },
  { label: "Other US Labs",     pct:  5.6, color: "#93C5FD" },
  { label: "Rest of world",     pct:  7.8, color: "#22C55E" },
];

function ComputeBreakdownSlide() {
  return <ComputePieLayout subtitle="Compute Breakdown" segments={COMPUTE_BREAKDOWN_SEGMENTS} />;
}

function ComputeBreakdownWithProductionSlide() {
  return (
    <ComputePieLayout
      subtitle="Compute Breakdown (including annual production)"
      segments={COMPUTE_WITH_PRODUCTION_SEGMENTS}
    />
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
        <SlideEyebrow>The Race to ASI · AI 2027 Scenario</SlideEyebrow>
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
  { id: "turn-1-scenario", title: "Jan 2028", Component: Turn1ScenarioSlide, bulletCount: 4 },
  { id: "qa-capabilities", title: "How capable is AI?", Component: QaCapabilitiesSlide, bulletCount: 2 },
  { id: "qa-rd-multiplier", title: "R&D multiplier", Component: QaRdMultiplierSlide, bulletCount: 3 },
  { id: "qa-china", title: "Isn't China too far behind?", Component: QaChinaSlide, bulletCount: 5 },
  { id: "new-chips-1", title: "Compute Breakdown", Component: ComputeBreakdownSlide },
  { id: "new-chips-2", title: "Compute Breakdown (with production)", Component: ComputeBreakdownWithProductionSlide },
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
