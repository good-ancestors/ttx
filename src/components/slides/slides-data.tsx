import { Fragment } from "react";
import {
  TrendingUp,
  RefreshCw,
  BarChart2,
  Monitor,
  Newspaper,
  Cpu,
  Wifi,
  HelpCircle,
} from "lucide-react";
import type { SlideDefinition } from "./types";
import {
  SlideShell,
  SlideEyebrow,
  SlideTitle,
  SlideSubtitle,
  SlideBullets,
  SlidePlaceholder,
} from "./slide-primitives";

// ─── Intro slides (both decks) ────────────────────────────────────────────────

function WelcomeSlide() {
  return (
    <SlideShell>
      <p className="text-lg font-semibold uppercase tracking-[0.3em] text-text-light md:text-xl">
        Good Ancestors
      </p>
      <SlideTitle>The Race to AGI</SlideTitle>
      <SlideSubtitle>AI Tabletop Exercise</SlideSubtitle>
    </SlideShell>
  );
}

function AgendaSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Today</SlideEyebrow>
      <SlideTitle>AI Tabletop Exercise</SlideTitle>
      <SlideBullets
        items={[
          "What are we exercising and why?",
          "The AI Futures Project scenario",
          "TTX rules and logistics",
          "Questions",
          "Exercise",
        ]}
      />
    </SlideShell>
  );
}

function RisksFromAiSlide() {
  const domains = [
    "Discrimination & Toxicity",
    "Privacy & Security",
    "Misinformation",
    "Malicious actors & Misuse",
    "Human-Computer Interaction",
    "Socioeconomic & Environmental Harms",
    "AI system safety, failures & limitations",
  ];
  return (
    <SlideShell align="start">
      <SlideEyebrow>airisk.mit.edu</SlideEyebrow>
      <SlideTitle>Risks from AI</SlideTitle>
      <div className="grid w-full max-w-5xl gap-3 sm:grid-cols-2">
        {domains.map((d, i) => (
          <div
            key={d}
            className="flex items-center gap-4 rounded-xl border border-navy-light bg-navy-dark/60 px-6 py-4"
          >
            <span
              className="shrink-0 text-2xl font-bold tabular-nums md:text-3xl"
              style={{ color: "var(--color-viz-capability)" }}
            >
              {i + 1}
            </span>
            <span className="text-lg font-medium text-off-white md:text-xl">{d}</span>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function AiArmsRaceSlide() {
  return (
    <SlideShell>
      <SlideTitle>The AI Arms Race</SlideTitle>
      <SlidePlaceholder
        icon={TrendingUp}
        label="AI arms race — investment & capability"
        description="Charts showing the rapid escalation of AI investment by US labs, Chinese state programs, and global compute acquisition from 2022 onward."
        color="var(--color-viz-danger)"
      />
    </SlideShell>
  );
}

function AltmanQuoteSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>January 2025</SlideEyebrow>
      <blockquote className="max-w-4xl text-balance text-3xl font-semibold leading-snug text-off-white md:text-5xl">
        &ldquo;We are now confident we know how to build AGI as we have traditionally understood
        it.&rdquo;
      </blockquote>
      <p className="text-xl text-text-light md:text-2xl">
        Sam Altman &mdash; <span className="text-text-muted">OpenAI CEO</span>
      </p>
      <p
        className="text-lg font-semibold uppercase tracking-widest md:text-xl"
        style={{ color: "var(--color-viz-warning)" }}
      >
        What&apos;s the plan?
      </p>
    </SlideShell>
  );
}

function AschenbrennerQuoteSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>Situational Awareness · June 2024</SlideEyebrow>
      <blockquote className="max-w-4xl text-balance text-2xl font-semibold leading-snug text-off-white md:text-3xl lg:text-4xl">
        &ldquo;AI progress won&apos;t stop at human-level. Hundreds of millions of AGIs could
        automate AI research, compressing a decade of algorithmic progress into &le;1 year. We would
        rapidly go from human-level to vastly superhuman AI systems.&rdquo;
      </blockquote>
      <p className="text-xl text-text-light md:text-2xl">
        Leopold Aschenbrenner &mdash;{" "}
        <span className="text-text-muted">Former OpenAI safety researcher</span>
      </p>
      <p
        className="text-lg font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-viz-capability)" }}
      >
        The Automated AI Researcher?
      </p>
    </SlideShell>
  );
}

function AutomatedResearcherSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-viz-warning)">October 2025</SlideEyebrow>
      <SlideTitle>The Automated AI Researcher?</SlideTitle>
      <SlidePlaceholder
        icon={Newspaper}
        label="October 2025 — AI self-improvement milestone"
        description="News or research paper showing AI systems autonomously conducting AI research and making measurable progress."
        color="var(--color-viz-warning)"
      />
    </SlideShell>
  );
}

function RecursiveImprovementSlide() {
  return (
    <SlideShell>
      <SlideTitle>Recursive self-improvement?</SlideTitle>
      <SlidePlaceholder
        icon={RefreshCw}
        label="Self-improvement feedback loop"
        description="Diagram: AI improves AI → more capable AI improves AI faster → acceleration curve."
        color="var(--color-viz-capability)"
      />
    </SlideShell>
  );
}

function FedReserveSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>Economic context</SlideEyebrow>
      <SlideTitle>Federal Reserve · Bank of Dallas</SlideTitle>
      <SlidePlaceholder
        icon={BarChart2}
        label="Federal Reserve / Bank of Dallas — AI economic data"
        description="Economic charts on AI's impact on labour markets, productivity, and GDP from Federal Reserve research."
        color="var(--color-viz-neutral)"
      />
    </SlideShell>
  );
}

function IsntThisSillySlide() {
  return (
    <SlideShell>
      <SlideTitle>
        Isn&apos;t this a bit silly?{" "}
        <span className="font-normal text-text-light">
          This has never happened before — why would it happen now?
        </span>
      </SlideTitle>
      <blockquote className="max-w-4xl text-balance text-2xl font-semibold leading-snug text-off-white md:text-3xl">
        &ldquo;While AGI seemed sci-fi only a few years ago, it&apos;s now the subject of hundreds
        of billions of dollars of annual investment and an explicit &lsquo;race&rsquo; between US
        and China. We can&apos;t be too surprised by the possibility that someone might win.&rdquo;
      </blockquote>
      <p className="text-xl text-text-light">
        Luke Freeman &mdash;{" "}
        <span className="text-text-muted">ASPI The Strategist, 2025</span>
      </p>
    </SlideShell>
  );
}

function AiFuturesProjectSlide() {
  return (
    <SlideShell>
      <SlideEyebrow>ai-2027.com</SlideEyebrow>
      <SlideTitle>The AI Futures Project</SlideTitle>
    </SlideShell>
  );
}

function Ai2027Slide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>The AI Futures Project</SlideEyebrow>
      <SlideTitle>AI 2027 Scenario</SlideTitle>
      <SlideBullets
        items={[
          <Fragment key="best-guess">
            <span className="font-semibold text-off-white">Their &ldquo;best guess&rdquo;</span>{" "}
            about what might happen &mdash; not necessarily the most likely scenario, but a{" "}
            <em>possible</em> one
          </Fragment>,
          "Countries and companies are trying to build automated AI scientists today",
          "Self-improving AI systems have already made progress on real-world problems",
          'Whenever we hit the inflection point, this kind of scenario may play out — "timelines" matter less than the shape of the transition',
          "Australia is largely unaware of, and unprepared for, this possibility",
        ]}
      />
    </SlideShell>
  );
}

function EndorsementsSlide() {
  const endorsements = [
    {
      quote:
        "It's a well rendered technically-astute narrative of the next few years of AI development and paints a picture of how today's AI systems might turn into superintelligences that upend the order of the world. It's very, very good, and likely much of it will come true.",
      name: "Jack Clark",
      role: "Anthropic co-founder",
    },
    {
      quote:
        "I highly recommend reading this scenario-type prediction on how AI could transform the world in just a few years. This type of content can help notice important questions and illustrate the potential impact of emerging risks.",
      name: "Yoshua Bengio",
      role: "World's most-cited living computer scientist · Lead author, International AI Safety Report",
    },
    {
      quote:
        "It is essential to model AI trajectories with alacrity and rigor. This is precisely what AI 2027 has done. Even where my own views differ from those of the authors, I found the experience of engaging with their forecast to be intrinsically enriching.",
      name: "Dean W. Ball",
      role: "Senior Policy Advisor on AI, White House OSTP",
    },
  ];
  return (
    <SlideShell align="start">
      <SlideEyebrow>Select endorsements of AI Futures Project</SlideEyebrow>
      <div className="flex w-full max-w-6xl flex-col gap-5">
        {endorsements.map((e) => (
          <div
            key={e.name}
            className="rounded-2xl border border-navy-light bg-navy-dark/60 p-6"
          >
            <p className="mb-3 text-lg leading-relaxed text-off-white md:text-xl">
              &ldquo;{e.quote}&rdquo;
            </p>
            <p className="text-base font-semibold text-text-light">
              {e.name}{" "}
              <span className="font-normal text-text-muted">&mdash; {e.role}</span>
            </p>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function HowToPlayHeaderSlide() {
  return (
    <SlideShell>
      <SlideTitle>How to play</SlideTitle>
    </SlideShell>
  );
}

// ─── Physical-deck–only slides ────────────────────────────────────────────────

function PhysicalHowWePlaySlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-role-australia)">Physical version</SlideEyebrow>
      <SlideTitle>How we usually play</SlideTitle>
    </SlideShell>
  );
}

function PhysicalFormatSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Format</SlideEyebrow>
      <SlideTitle>AI 2027 Scenario</SlideTitle>
      <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-navy-light bg-navy-dark/60 p-8">
          <p className="mb-1 text-5xl font-bold text-off-white">8–20</p>
          <p className="text-text-light uppercase tracking-wide">Players</p>
        </div>
        <div className="rounded-2xl border border-navy-light bg-navy-dark/60 p-8">
          <p className="mb-1 text-5xl font-bold text-off-white">3~</p>
          <p className="text-text-light uppercase tracking-wide">Hours play time</p>
        </div>
      </div>
      <SlideBullets
        items={[
          "Working together to paint a plausible picture of how people, companies and countries might act",
          "Each player simulates one actor — their incentives, constraints, and relationships",
          "Run in conferences and organisations across Melbourne, Sydney, Canberra and New Zealand",
        ]}
      />
    </SlideShell>
  );
}

function PhysicalRulesSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Physical version · How to play</SlideEyebrow>
      <SlideTitle>AI 2027 Scenario</SlideTitle>
      <SlideBullets
        items={[
          "3~ hours · 30 minutes per round",
          "You're simulating one actor — ask yourself: what are their incentives and goals?",
          "What knowledge do they have? What internal friction might they face?",
          "What actions are within their power? Who in the room are their natural allies?",
          <Fragment key="dont-fight">
            <span className="font-semibold text-viz-warning">Don&apos;t fight the scenario</span>{" "}
            &mdash; we&apos;re playing to learn, not to win
          </Fragment>,
        ]}
      />
    </SlideShell>
  );
}

function PhysicalHelpTurnsSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Physical version</SlideEyebrow>
      <SlideTitle>Each turn</SlideTitle>
      <SlideBullets
        items={[
          'Read your "help sheet" carefully — ask the facilitator if you\'re stuck',
          "Preparing (10 min) — think about your 3-month plan, negotiate with others",
          "Resolving (15 min) — explain your action and intended effect, figure out what happens",
          "Turns alternate: Jan–Mar 2028, Apr–Jun 2028, Jul–Sep 2028, …",
        ]}
      />
    </SlideShell>
  );
}

function LikelihoodCardsSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>Physical version · Resolving actions</SlideEyebrow>
      <SlideTitle>Using the likelihood cards</SlideTitle>
      <SlideBullets
        items={[
          "The cards help the group decide together how actions resolve",
          "During resolve, you quickly explain your proposed action to the group",
          <Fragment key="pm-quote">
            <em>
              &ldquo;As Prime Minister I&apos;m going to use executive power to nationalise my
              country&apos;s AI industry.&rdquo;
            </em>
          </Fragment>,
          "If the action is uncertain, players hold up cards to show their best assessment of the likelihood",
          "The facilitator rolls a dice based on that assessment and tells the group the outcome",
          "Play subsequent turns as if the outcome succeeded or failed",
        ]}
      />
    </SlideShell>
  );
}

// ─── App-deck–only slides ─────────────────────────────────────────────────────

function AppFormatSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow color="var(--color-role-openbrain)">App version</SlideEyebrow>
      <SlideTitle>Today&apos;s exercise</SlideTitle>
      <SlideBullets
        items={[
          "60 minutes of play time · 15 minutes per round",
          "Using the app to streamline play",
          "You're simulating one actor — their incentives, constraints, and relationships",
          "What actions are within their power? Who in the room are their natural allies?",
          <Fragment key="dont-fight-app">
            <span className="font-semibold text-viz-warning">Don&apos;t fight the scenario</span>{" "}
            &mdash; we&apos;re playing to learn, not to win
          </Fragment>,
        ]}
      />
    </SlideShell>
  );
}

function AppJoinSlide() {
  return (
    <SlideShell>
      <SlideEyebrow color="var(--color-role-openbrain)">App version</SlideEyebrow>
      <SlideTitle>While you wait: join the game</SlideTitle>
      <div className="flex w-full max-w-3xl flex-col items-center gap-8 rounded-3xl border-2 border-navy-light bg-navy-dark/60 py-10 px-12">
        <div className="flex items-center gap-4" style={{ color: "var(--color-viz-capability)" }}>
          <Wifi className="h-10 w-10" aria-hidden />
          <span
            className="font-mono text-3xl font-bold tracking-wide md:text-4xl"
            style={{ color: "var(--color-off-white)" }}
          >
            ttx.goodancestors.org.au
          </span>
        </div>
        <p className="text-xl text-text-light">or scan a QR code provided by the facilitator</p>
      </div>
      <SlideSubtitle>Form up into 8–9 groups (roughly 1–5 people per group)</SlideSubtitle>
    </SlideShell>
  );
}

function AppBriefSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>App version · Getting started</SlideEyebrow>
      <SlideTitle>Your brief &amp; navigation</SlideTitle>
      <SlideBullets
        items={[
          'Press "share" to get a code — give it to the person next to you so they can play along',
          "Once you've selected a player and the game is underway, you'll have a Brief tab",
          "The brief gives background on who you're playing and what your goals are",
          "Use the tab bar to switch between Brief, Actions, and Respond at any time",
          "If you control an AI company, you also get a Compute tab to manage your lab",
        ]}
      />
      <SlidePlaceholder
        icon={Monitor}
        label="App screenshot: brief page"
        description="Screenshot showing the Brief tab with role name, background, and goals."
        color="var(--color-role-openbrain)"
      />
    </SlideShell>
  );
}

function AppActionsSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>App version · Taking action</SlideEyebrow>
      <SlideTitle>The Actions page</SlideTitle>
      <SlideBullets
        items={[
          "The Actions tab is the most important — this is where you plan your move",
          "Start typing in the box to describe your action, then add more details",
          "You can make your action secret (hidden from other players until resolve)",
          "You can request support from other players",
          "You can offer or request computing power from others",
          "Some players can suggest corporate mergers",
          "You'll get more specific options depending on your role",
        ]}
      />
    </SlideShell>
  );
}

function AppRespondSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>App version · Diplomacy</SlideEyebrow>
      <SlideTitle>Responding to other players</SlideTitle>
      <SlideBullets
        items={[
          "You can respond to the actions of other players from the Respond tab",
          "Endorse their proposals",
          "Agree to their requests",
        ]}
      />
      <SlidePlaceholder
        icon={Monitor}
        label="App screenshot: respond tab"
        description="Screenshot showing the Respond tab with other players' proposed actions and response options."
        color="var(--color-role-safety)"
      />
    </SlideShell>
  );
}

function AppComputeSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>App version · Lab CEOs only</SlideEyebrow>
      <SlideTitle>Allocating your compute</SlideTitle>
      <SlideBullets
        items={[
          "Lab CEOs get to decide each turn how to allocate their compute across three areas:",
          <Fragment key="deployment">
            <span className="font-semibold" style={{ color: "var(--color-role-openbrain)" }}>
              Deployment
            </span>{" "}
            — compute for users. Keep the public and investors happy.
          </Fragment>,
          <Fragment key="research">
            <span className="font-semibold" style={{ color: "var(--color-viz-danger)" }}>
              Research
            </span>{" "}
            — try to win the race. Push the frontier.
          </Fragment>,
          <Fragment key="safety">
            <span className="font-semibold" style={{ color: "var(--color-role-safety)" }}>
              Safety
            </span>{" "}
            — learn how to make AI safe and controllable.
          </Fragment>,
        ]}
      />
    </SlideShell>
  );
}

function AppEndTurnSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow>App version · End of turn</SlideEyebrow>
      <SlideTitle>At the end of each turn</SlideTitle>
      <SlideBullets
        items={[
          "The facilitator resolves the round — you'll see what actions each player attempted",
          "Calculate if actions succeeded",
          "See how the CEOs of each lab allocated their compute",
          "Calculate what that means for who is winning the race and how capable AI is becoming",
          "Your choices feed in as the starting state for the next turn",
        ]}
      />
    </SlideShell>
  );
}

function AppFaqSlide() {
  return (
    <SlideShell align="start">
      <SlideEyebrow color="var(--color-viz-warning)">App version · FAQ</SlideEyebrow>
      <SlideTitle>Game FAQ</SlideTitle>
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <div>
          <p className="mb-2 text-2xl font-semibold text-off-white md:text-3xl">
            What does &ldquo;22u&rdquo; or &ldquo;11u&rdquo; mean?
          </p>
          <p className="text-xl text-text-light md:text-2xl">
            &ldquo;u&rdquo; means units of compute &mdash; roughly B200 AI chips in data centres.
            At the start of the game, 1u ≈ 2% of all AI compute globally. More compute comes online
            as the game progresses, mostly from Taiwan.
          </p>
        </div>
        <div>
          <p className="mb-2 text-2xl font-semibold text-off-white md:text-3xl">
            What is the &ldquo;spec&rdquo; of the AI?
          </p>
          <p className="text-xl text-text-light md:text-2xl">
            AI companies must define how their AI behaves &mdash; sometimes called a spec or
            constitution. It has real-world consequences (think: the difference between xAI and
            Claude). As the CEO of a lab, you make the final call.
          </p>
        </div>
      </div>
    </SlideShell>
  );
}

// ─── Scenario & turn slides (both decks) ──────────────────────────────────────

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

// ─── Turn wrap-up (reused for all three turns) ─────────────────────────────────

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

// ─── Deck compositions ────────────────────────────────────────────────────────

const introSlides: SlideDefinition[] = [
  { id: "welcome", title: "Good Ancestors", Component: WelcomeSlide },
  { id: "agenda", title: "Today's agenda", Component: AgendaSlide },
  { id: "risks-from-ai", title: "Risks from AI", Component: RisksFromAiSlide },
  { id: "ai-arms-race", title: "The AI Arms Race", Component: AiArmsRaceSlide },
  { id: "altman-quote", title: "Sam Altman", Component: AltmanQuoteSlide },
  { id: "aschenbrenner-quote", title: "Automated AI Researcher", Component: AschenbrennerQuoteSlide },
  { id: "automated-researcher", title: "October 2025", Component: AutomatedResearcherSlide },
  { id: "recursive-improvement", title: "Recursive self-improvement", Component: RecursiveImprovementSlide },
  { id: "fed-reserve", title: "Federal Reserve", Component: FedReserveSlide },
  { id: "isnt-this-silly", title: "Isn't this silly?", Component: IsntThisSillySlide },
  { id: "ai-futures-project", title: "The AI Futures Project", Component: AiFuturesProjectSlide },
  { id: "ai-2027", title: "AI 2027 Scenario", Component: Ai2027Slide },
  { id: "endorsements", title: "Endorsements", Component: EndorsementsSlide },
  { id: "how-to-play-header", title: "How to play", Component: HowToPlayHeaderSlide },
];

const physicalOnlySlides: SlideDefinition[] = [
  { id: "physical-how-we-play", title: "How we usually play", Component: PhysicalHowWePlaySlide },
  { id: "physical-format", title: "Format", Component: PhysicalFormatSlide },
  { id: "physical-rules", title: "Rules", Component: PhysicalRulesSlide },
  { id: "physical-help-turns", title: "Each turn", Component: PhysicalHelpTurnsSlide },
  { id: "likelihood-cards", title: "Likelihood cards", Component: LikelihoodCardsSlide },
];

const appOnlySlides: SlideDefinition[] = [
  { id: "app-format", title: "Today's exercise", Component: AppFormatSlide },
  { id: "app-join", title: "Join the game", Component: AppJoinSlide },
  { id: "app-brief", title: "Your brief", Component: AppBriefSlide },
  { id: "app-actions", title: "Actions page", Component: AppActionsSlide },
  { id: "app-respond", title: "Responding to players", Component: AppRespondSlide },
  { id: "app-compute", title: "Compute allocation", Component: AppComputeSlide },
  { id: "app-end-turn", title: "End of turn", Component: AppEndTurnSlide },
  { id: "app-faq", title: "FAQ", Component: AppFaqSlide },
];

const scenarioAndTurnSlides: SlideDefinition[] = [
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

export const physicalDeck: SlideDefinition[] = [
  ...introSlides,
  ...physicalOnlySlides,
  ...scenarioAndTurnSlides,
];

export const appDeck: SlideDefinition[] = [
  ...introSlides,
  ...appOnlySlides,
  ...scenarioAndTurnSlides,
];
