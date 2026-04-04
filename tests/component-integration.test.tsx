// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

// ─── Mock convex/react ──────────────────────────────────────────────────────
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => Object.assign(vi.fn(), { withOptimisticUpdate: vi.fn() })),
}));

// ─── Mock lucide-react icons as simple spans ────────────────────────────────
function makeMockIcon(name: string) {
  return function MockIcon(props: Record<string, unknown>) {
    return <span data-icon={name} {...props} />;
  };
}

const iconNames = [
  "ThumbsUp", "ThumbsDown", "EyeOff", "Inbox", "CheckCircle2", "XCircle", "MinusCircle",
  "Lock", "Dices", "RefreshCw", "CheckCircle", "Clock", "ChevronDown", "ChevronRight",
  "Zap", "Vote", "FlaskConical", "BookOpen",
  "ChevronUp", "MessageSquare", "Send", "BookText",
  "Eye", "Handshake", "Trash2", "Plus", "X", "GripVertical",
  "Pencil", "Save", "Minus", "AlertTriangle", "Info", "Check",
  "Loader2", "Undo2", "Wand2", "Maximize2", "Play", "QrCode",
  "Wifi", "WifiOff", "ExternalLink", "Merge", "Bug", "Pause",
  "FileText",
] as const;

const lucideMock: Record<string, unknown> = {};
for (const name of iconNames) {
  lucideMock[name] = makeMockIcon(name);
}
vi.mock("lucide-react", () => lucideMock);

// ─── Mock Convex API references ─────────────────────────────────────────────
vi.mock("@convex/_generated/api", () => ({
  api: {
    requests: { respond: "requests:respond" },
    submissions: {
      getByGameAndRoundRedacted: "submissions:getByGameAndRoundRedacted",
      setActionInfluence: "submissions:setActionInfluence",
    },
  },
}));

// ─── Mock disposition badge (simple rendering) ──────────────────────────────
vi.mock("@/components/table/disposition-badge", () => ({
  DispositionBadge: ({ disposition, className }: { disposition: string; className?: string }) => (
    <span data-testid="disposition-badge" className={className}>
      {disposition}
    </span>
  ),
}));

// ─── Mock action-card (ProbabilityBadge) ────────────────────────────────────
vi.mock("@/components/action-card", () => ({
  ProbabilityBadge: ({ probability }: { probability: number }) => (
    <span data-testid="probability-badge">{probability}%</span>
  ),
}));

// ─── Mock secret-actions ────────────────────────────────────────────────────
vi.mock("@/lib/secret-actions", () => ({
  redactSecretAction: (_name: string, _action: unknown) => "[Redacted secret action]",
}));

afterEach(cleanup);

// ─── Real game-data imports (NOT mocked) ────────────────────────────────────
import {
  isResolvingPhase,
  isSubmittedAction,
  AI_SYSTEMS_ROLE_ID,
} from "@/lib/game-data";

// =============================================================================
// 1. game-data.ts — Pure function tests
// =============================================================================

describe("game-data pure functions", () => {
  describe("isResolvingPhase", () => {
    it("returns true for rolling", () => {
      expect(isResolvingPhase("rolling")).toBe(true);
    });

    it("returns true for narrate", () => {
      expect(isResolvingPhase("narrate")).toBe(true);
    });

    it("returns false for submit", () => {
      expect(isResolvingPhase("submit")).toBe(false);
    });

    it("returns false for discuss", () => {
      expect(isResolvingPhase("discuss")).toBe(false);
    });
  });

  describe("isSubmittedAction", () => {
    it("returns true for submitted actions", () => {
      expect(isSubmittedAction({ actionStatus: "submitted" })).toBe(true);
    });

    it("returns false for draft actions", () => {
      expect(isSubmittedAction({ actionStatus: "draft" })).toBe(false);
    });

    it("returns false when actionStatus is not submitted", () => {
      expect(isSubmittedAction({ actionStatus: "other" })).toBe(false);
    });
  });

  describe("AI_SYSTEMS_ROLE_ID", () => {
    it("equals ai-systems", () => {
      expect(AI_SYSTEMS_ROLE_ID).toBe("ai-systems");
    });
  });
});

// =============================================================================
// 2. buildPlayerTabs — Pure function tests
// =============================================================================

describe("buildPlayerTabs", () => {
  let buildPlayerTabs: typeof import("@/components/table/player-tabs").buildPlayerTabs;

  beforeEach(async () => {
    const mod = await import("@/components/table/player-tabs");
    buildPlayerTabs = mod.buildPlayerTabs;
  });

  it("disables Actions/Respond tabs during discuss phase", () => {
    const tabs = buildPlayerTabs({ tags: [] }, "discuss", 0, false);
    const actionTab = tabs.find((t) => t.id === "actions");
    const respondTab = tabs.find((t) => t.id === "respond");
    expect(actionTab?.disabled).toBe(true);
    expect(respondTab?.disabled).toBe(true);
  });

  it("enables Actions/Respond tabs during submit phase", () => {
    const tabs = buildPlayerTabs({ tags: [] }, "submit", 0, false);
    const actionTab = tabs.find((t) => t.id === "actions");
    const respondTab = tabs.find((t) => t.id === "respond");
    expect(actionTab?.disabled).toBe(false);
    expect(respondTab?.disabled).toBe(false);
  });

  it("enables Actions/Respond tabs during rolling phase (Task #4)", () => {
    const tabs = buildPlayerTabs({ tags: [] }, "rolling", 0, false);
    const actionTab = tabs.find((t) => t.id === "actions");
    const respondTab = tabs.find((t) => t.id === "respond");
    expect(actionTab?.disabled).toBe(false);
    expect(respondTab?.disabled).toBe(false);
  });

  it("enables Actions/Respond tabs during narrate phase", () => {
    const tabs = buildPlayerTabs({ tags: [] }, "narrate", 0, false);
    const actionTab = tabs.find((t) => t.id === "actions");
    const respondTab = tabs.find((t) => t.id === "respond");
    expect(actionTab?.disabled).toBe(false);
    expect(respondTab?.disabled).toBe(false);
  });

  it("shows Lab tab only when hasLabAccess is true", () => {
    const withLab = buildPlayerTabs({ tags: ["lab-ceo"] }, "submit", 0, true);
    const withoutLab = buildPlayerTabs({ tags: [] }, "submit", 0, false);
    expect(withLab.find((t) => t.id === "lab")).toBeDefined();
    expect(withoutLab.find((t) => t.id === "lab")).toBeUndefined();
  });

  it("shows badge with pending count only during submit phase", () => {
    const submitTabs = buildPlayerTabs({ tags: [] }, "submit", 3, false);
    const discussTabs = buildPlayerTabs({ tags: [] }, "discuss", 3, false);
    const submitRespond = submitTabs.find((t) => t.id === "respond");
    const discussRespond = discussTabs.find((t) => t.id === "respond");
    expect(submitRespond?.badge).toBe(3);
    expect(discussRespond?.badge).toBeUndefined();
  });
});

// =============================================================================
// 3. EndorsementRespondTab (via RespondTab) — Component tests
// =============================================================================

describe("EndorsementRespondTab (via RespondTab)", () => {
  let RespondTab: typeof import("@/components/table/respond-tab").RespondTab;
  let mockRespondFn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const convexReact = await import("convex/react");
    mockRespondFn = vi.fn();
    vi.mocked(convexReact.useMutation).mockReturnValue(mockRespondFn);
    vi.mocked(convexReact.useQuery).mockReturnValue(undefined);

    const mod = await import("@/components/table/respond-tab");
    RespondTab = mod.RespondTab;
  });

  function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
      _id: `req-${Math.random()}` as never,
      _creationTime: Date.now(),
      gameId: "game-1" as never,
      roundNumber: 1,
      fromRoleId: "openbrain-ceo",
      fromRoleName: "OpenBrain CEO",
      toRoleId: "us-president",
      toRoleName: "US President",
      actionText: "Develop new AI model",
      requestType: "endorsement" as const,
      status: "pending" as const,
      isSecret: false,
      ...overrides,
    };
  }

  it("Support button calls respond with status 'accepted' (Bug #12)", () => {
    const req = makeRequest({ _id: "req-1" as never, status: "pending" });
    render(
      <RespondTab
        gameId={"game-1" as never}
        roundNumber={1}
        roleId="us-president"
        isAiSystem={false}
        aiInfluencePower={0}
        allRequests={[req] as never}
        allowEdits={true}
      />,
    );

    const supportBtn = screen.getByText("Support").closest("button")!;
    fireEvent.click(supportBtn);
    expect(mockRespondFn).toHaveBeenCalledWith({
      proposalId: "req-1",
      status: "accepted",
    });
  });

  it("Oppose button calls respond with status 'declined' (Bug #12)", () => {
    const req = makeRequest({ _id: "req-2" as never, status: "pending" });
    render(
      <RespondTab
        gameId={"game-1" as never}
        roundNumber={1}
        roleId="us-president"
        isAiSystem={false}
        aiInfluencePower={0}
        allRequests={[req] as never}
        allowEdits={true}
      />,
    );

    const opposeBtn = screen.getByText("Oppose").closest("button")!;
    fireEvent.click(opposeBtn);
    expect(mockRespondFn).toHaveBeenCalledWith({
      proposalId: "req-2",
      status: "declined",
    });
  });

  it("only shows requests TO this role", () => {
    const toMe = makeRequest({ _id: "req-a" as never, toRoleId: "us-president", fromRoleName: "OpenBrain CEO" });
    const notToMe = makeRequest({ _id: "req-b" as never, toRoleId: "china-president", fromRoleName: "DeepCent CEO" });
    render(
      <RespondTab
        gameId={"game-1" as never}
        roundNumber={1}
        roleId="us-president"
        isAiSystem={false}
        aiInfluencePower={0}
        allRequests={[toMe, notToMe] as never}
        allowEdits={true}
      />,
    );

    expect(screen.getByText("OpenBrain CEO")).toBeInTheDocument();
    expect(screen.queryByText("DeepCent CEO")).not.toBeInTheDocument();
  });

  it("shows [Covert action] text for secret requests (server-redacted actionText)", () => {
    // The server redacts secret action text to "[Covert action]" before sending to the responder.
    // The component renders the actionText as-is.
    const secretReq = makeRequest({
      _id: "req-secret" as never,
      isSecret: true,
      actionText: "[Covert action]",
    });
    render(
      <RespondTab
        gameId={"game-1" as never}
        roundNumber={1}
        roleId="us-president"
        isAiSystem={false}
        aiInfluencePower={0}
        allRequests={[secretReq] as never}
        allowEdits={true}
      />,
    );

    expect(screen.getByText("[Covert action]")).toBeInTheDocument();
  });
});

// =============================================================================
// 4. AttemptedPanel — Component tests
// =============================================================================

describe("AttemptedPanel", () => {
  let AttemptedPanel: typeof import("@/components/facilitator/attempted-panel").AttemptedPanel;

  beforeEach(async () => {
    const mod = await import("@/components/facilitator/attempted-panel");
    AttemptedPanel = mod.AttemptedPanel;
  });

  const defaultProps = {
    isProjector: false,
    resolving: false,
    revealedCount: 999,
    revealedSecrets: new Set<string>(),
    toggleReveal: vi.fn(),
    revealAllSecrets: vi.fn(),
    handleReResolve: vi.fn().mockResolvedValue(undefined),
    rerollAction: vi.fn().mockResolvedValue(undefined),
    overrideProbability: vi.fn().mockResolvedValue(undefined),
  };

  function makeSubmission(roleId: string, actions: Record<string, unknown>[] = []) {
    return {
      _id: `sub-${roleId}` as never,
      _creationTime: Date.now(),
      tableId: `table-${roleId}` as never,
      gameId: "game-1" as never,
      roundNumber: 1,
      roleId,
      status: "submitted",
      actions: actions.map((a, i) => ({
        text: `Action ${i + 1}`,
        priority: 5 - i,
        actionStatus: "submitted" as const,
        ...a,
      })),
    };
  }

  function makeProposal(overrides: Record<string, unknown> = {}) {
    return {
      _id: `prop-${Math.random()}` as never,
      _creationTime: Date.now(),
      gameId: "game-1" as never,
      roundNumber: 1,
      fromRoleId: "openbrain-ceo",
      fromRoleName: "OpenBrain CEO",
      toRoleId: "us-president",
      toRoleName: "US President",
      actionText: "Action 1",
      requestType: "endorsement" as const,
      status: "accepted" as const,
      isSecret: false,
      ...overrides,
    };
  }

  function expandPanel() {
    // During submit phase, the panel starts collapsed. Click the header to expand.
    const header = screen.getByText("What Was Attempted");
    fireEvent.click(header);
  }

  it("filters self-endorsements (Bug #14)", () => {
    const sub = makeSubmission("openbrain-ceo", [{ text: "Self action" }]);
    const selfEndorsement = makeProposal({
      fromRoleId: "openbrain-ceo",
      toRoleId: "openbrain-ceo",
      toRoleName: "OpenBrain CEO",
      actionText: "Self action",
      status: "accepted",
    });

    render(
      <AttemptedPanel
        {...defaultProps}
        submissions={[sub] as never}
        proposals={[selfEndorsement] as never}
        phase="submit"
      />,
    );
    expandPanel();

    // Self-endorsement chip should NOT render
    expect(screen.queryByText(/OpenBrain CEO ✓/)).not.toBeInTheDocument();
  });

  it("endorsement chips show endorser name not action owner name (Bug #14)", () => {
    const sub = makeSubmission("openbrain-ceo", [{ text: "Action 1" }]);
    const endorsement = makeProposal({
      fromRoleId: "openbrain-ceo",
      toRoleId: "us-president",
      toRoleName: "US President",
      actionText: "Action 1",
      status: "accepted",
    });

    render(
      <AttemptedPanel
        {...defaultProps}
        submissions={[sub] as never}
        proposals={[endorsement] as never}
        phase="submit"
      />,
    );
    expandPanel();

    // The chip text should be the endorser (toRoleName), not the owner
    expect(screen.getByText("US President ✓")).toBeInTheDocument();
  });

  it("filters AI Systems endorsements", () => {
    const sub = makeSubmission("openbrain-ceo", [{ text: "Action 1" }]);
    const aiEndorsement = makeProposal({
      fromRoleId: "openbrain-ceo",
      toRoleId: "ai-systems",
      toRoleName: "The AIs",
      actionText: "Action 1",
      status: "accepted",
    });

    render(
      <AttemptedPanel
        {...defaultProps}
        submissions={[sub] as never}
        proposals={[aiEndorsement] as never}
        phase="submit"
      />,
    );
    expandPanel();

    expect(screen.queryByText(/The AIs ✓/)).not.toBeInTheDocument();
  });

  it("shows Grade button during submit phase for non-projector (Task #2)", () => {
    const sub = makeSubmission("openbrain-ceo", [
      { text: "Ungraded action", probability: undefined, rolled: undefined },
    ]);

    render(
      <AttemptedPanel
        {...defaultProps}
        submissions={[sub] as never}
        proposals={[]}
        phase="submit"
        isProjector={false}
      />,
    );
    expandPanel();

    expect(screen.getByText("Grade")).toBeInTheDocument();
  });

  it("does NOT show Grade button for projector view", () => {
    const sub = makeSubmission("openbrain-ceo", [
      { text: "Ungraded action", probability: undefined, rolled: undefined },
    ]);

    render(
      <AttemptedPanel
        {...defaultProps}
        submissions={[sub] as never}
        proposals={[]}
        phase="submit"
        isProjector={true}
      />,
    );
    expandPanel();

    expect(screen.queryByText("Grade")).not.toBeInTheDocument();
  });
});

// =============================================================================
// 5. BriefTab — Component tests
// =============================================================================

describe("BriefTab", () => {
  let BriefTab: typeof import("@/components/table/brief-tab").BriefTab;

  beforeEach(async () => {
    const mod = await import("@/components/table/brief-tab");
    BriefTab = mod.BriefTab;
  });

  const baseRole = {
    id: "us-president",
    name: "US President",
    subtitle: "Leader of the Free World",
    color: "#1D4ED8",
    tags: ["government", "military"],
    required: true,
    brief: "You are the US President.",
    artifactPrompt: "",
  };

  it("shows STARTING_SCENARIO with title 'Starting Scenario' when no roundNarrative", () => {
    render(
      <BriefTab
        role={baseRole}
        handoutData={null}
        aiDisposition={undefined}
        roundNarrative={undefined}
        roundLabel="Q1 2028"
        submissionsOpen={true}
      />,
    );

    expect(screen.getByText("Starting Scenario")).toBeInTheDocument();
    expect(screen.getByText(/It's January 2028/)).toBeInTheDocument();
  });

  it("shows roundNarrative with title 'Where Things Stand' when provided (Task #11)", () => {
    render(
      <BriefTab
        role={baseRole}
        handoutData={null}
        aiDisposition={undefined}
        roundNarrative="The world changed dramatically."
        roundLabel="Q2 2028"
        submissionsOpen={true}
      />,
    );

    expect(screen.getByText("Where Things Stand")).toBeInTheDocument();
    expect(screen.getByText("The world changed dramatically.")).toBeInTheDocument();
    expect(screen.queryByText("Starting Scenario")).not.toBeInTheDocument();
  });

  it("shows Lab CEO tip for lab-ceo role", () => {
    const labCeoRole = {
      ...baseRole,
      id: "openbrain-ceo",
      name: "OpenBrain CEO",
      tags: ["lab-ceo", "has-compute"],
    };

    render(
      <BriefTab
        role={labCeoRole}
        handoutData={null}
        aiDisposition={undefined}
        roundNarrative={undefined}
        roundLabel="Q1 2028"
        submissionsOpen={true}
      />,
    );

    expect(screen.getByText("Lab CEO")).toBeInTheDocument();
  });

  it("shows disposition badge for AI Systems role", () => {
    const aiRole = {
      ...baseRole,
      id: "ai-systems",
      name: "The AIs",
      tags: ["ai-system"],
    };

    render(
      <BriefTab
        role={aiRole}
        handoutData={null}
        aiDisposition="the-spec"
        roundNarrative={undefined}
        roundLabel="Q1 2028"
        submissionsOpen={true}
      />,
    );

    expect(screen.getByTestId("disposition-badge")).toBeInTheDocument();
    expect(screen.getByTestId("disposition-badge")).toHaveTextContent("the-spec");
  });

  it("does NOT show disposition badge when aiDisposition is undefined", () => {
    const aiRole = {
      ...baseRole,
      id: "ai-systems",
      name: "The AIs",
      tags: ["ai-system"],
    };

    render(
      <BriefTab
        role={aiRole}
        handoutData={null}
        aiDisposition={undefined}
        roundNarrative={undefined}
        roundLabel="Q1 2028"
        submissionsOpen={true}
      />,
    );

    expect(screen.queryByTestId("disposition-badge")).not.toBeInTheDocument();
  });
});
