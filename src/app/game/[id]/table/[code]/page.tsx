"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ROLES, MAX_PRIORITY } from "@/lib/game-data";
import { useCountdown, useKeyboardScroll, parseActionsFromText } from "@/lib/hooks";
import { ActionCard } from "@/components/action-card";
import { ComputeAllocation } from "@/components/compute-allocation";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { ProposalPanel } from "@/components/proposals";
import { Send, Loader2, Clock, FileText } from "lucide-react";

export default function TablePlayerPage({
  params,
}: {
  params: Promise<{ id: string; code: string }>;
}) {
  const { id, code } = use(params);
  const gameId = id as Id<"games">;
  const tableId = code as Id<"tables">;

  const game = useQuery(api.games.get, { gameId });
  const table = useQuery(api.tables.get, { tableId });
  const round = useQuery(api.rounds.getCurrent, { gameId });
  const submission = useQuery(api.submissions.getForTable, {
    tableId,
    roundNumber: game?.currentRound ?? 1,
  });

  const submitActions = useMutation(api.submissions.submit);
  const setConnected = useMutation(api.tables.setConnected);

  const [freeText, setFreeText] = useState("");
  const [parsedActions, setParsedActions] = useState<
    { text: string; priority: number }[]
  >([]);
  const [computeAllocation, setComputeAllocation] = useState({
    users: 50,
    capability: 25,
    safety: 25,
  });
  const [artifact, setArtifact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useKeyboardScroll();

  const { display: timerDisplay } = useCountdown(game?.phaseEndsAt);

  const role = table ? ROLES.find((r) => r.id === table.roleId) : null;
  const isSubmitted = submission?.status !== undefined && submission.status !== "draft";
  const phase = game?.phase ?? "discuss";

  // Set connected on mount
  useEffect(() => {
    if (tableId) {
      void setConnected({ tableId, connected: true });
    }
  }, [tableId, setConnected]);

  // Initialize compute allocation from role defaults
  useEffect(() => {
    if (role?.defaultCompute) {
      setComputeAllocation({ ...role.defaultCompute });
    }
  }, [role?.defaultCompute]);

  const handleParse = useCallback(() => {
    const texts = parseActionsFromText(freeText);
    const actions = texts.map((text) => ({
      text,
      priority: Math.max(1, Math.floor(MAX_PRIORITY / Math.max(texts.length, 1))),
    }));
    setParsedActions(actions);
  }, [freeText]);

  const totalPriorityUsed = parsedActions.reduce((s, a) => s + a.priority, 0);

  const updatePriority = (index: number, val: number) => {
    setParsedActions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], priority: val };
      return next;
    });
  };

  const removeAction = (index: number) => {
    setParsedActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (parsedActions.length === 0 || totalPriorityUsed > MAX_PRIORITY) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitActions({
        tableId,
        gameId,
        roundNumber: game?.currentRound ?? 1,
        roleId: role?.id ?? "",
        actions: parsedActions.map((a) => ({ text: a.text, priority: a.priority })),
        computeAllocation: role?.isLab ? computeAllocation : undefined,
        artifact: artifact.trim() || undefined,
      });
    } catch {
      setSubmitError("Failed to submit. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!game || !table || !round || !role) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-off-white">
        <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
      </div>
    );
  }

  return (
    <InAppBrowserGate>
      <div
        className="min-h-dvh bg-off-white pb-[env(safe-area-inset-bottom)]"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-off-white/95 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
              <span className="text-[15px] font-bold text-text">{role.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {game.phaseEndsAt && (
                <span className="text-xs text-text-muted font-mono flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {timerDisplay}
                </span>
              )}
              <span className="text-[11px] text-text-muted font-mono">
                {round.label} — Turn {round.number}/3
              </span>
              <ConnectionIndicator status="connected" />
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          {/* Round context card */}
          <div
            className="bg-white rounded-xl p-4 border border-border mb-4"
            style={{ borderLeftWidth: "3px", borderLeftColor: role.color }}
          >
            <h3 className="text-lg font-bold text-text mb-1">{round.title}</h3>
            <p className="text-[13px] text-text-muted mb-2 leading-relaxed">{round.narrative}</p>
            <p className="text-[13px] text-text italic">&ldquo;{role.brief}&rdquo;</p>
          </div>

          {/* DISCUSS phase */}
          {phase === "discuss" && (
            <div className="bg-white rounded-xl p-6 border border-border text-center">
              <Clock className="w-10 h-10 text-text-light mx-auto mb-3" />
              <h3 className="text-base font-bold text-text mb-1">Discussion Phase</h3>
              <p className="text-sm text-text-muted">
                Discuss with your table what {role.name} does this quarter. Submissions will open shortly.
              </p>
            </div>
          )}

          {/* SUBMIT phase — proposals always visible */}
          {phase === "submit" && (
            <ProposalPanel
              gameId={gameId}
              roundNumber={game.currentRound}
              roleId={role.id}
              roleName={role.name}
            />
          )}

          {/* SUBMIT phase — not yet submitted */}
          {phase === "submit" && !isSubmitted && (
            <>
              {/* Compute allocation for lab roles */}
              {role.isLab && (
                <ComputeAllocation
                  allocation={computeAllocation}
                  onChange={setComputeAllocation}
                  isSubmitted={false}
                  roleName={role.name}
                />
              )}

              {/* Action input */}
              <div className="bg-white rounded-xl border border-border p-4 mb-4">
                <h3 className="text-sm font-bold text-text mb-1">
                  What does {role.name} do this quarter?
                </h3>
                <p className="text-xs text-text-muted mb-3">
                  Describe your key actions — one per line. For each, state what you do and the intended outcome.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={`e.g.\nUse executive power to compel a merger between Conscentia and OpenBrain — gives us access to more compute\nLaunch a public safety review of Agent-2 — buys time for regulation\nOffer classified AI briefings to allied nations — builds coalition`}
                  rows={5}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full p-3 bg-warm-gray border border-border rounded-lg text-[13px] text-text
                             resize-none outline-none focus:border-navy-light"
                />
                <button
                  onClick={handleParse}
                  disabled={!freeText.trim()}
                  className="mt-2 w-full py-2.5 bg-navy text-white rounded-lg font-bold text-[13px]
                             disabled:opacity-30 hover:bg-navy-light transition-colors"
                >
                  Parse Actions
                </button>
              </div>

              {/* Parsed action cards */}
              {parsedActions.length > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-text">
                      Your Actions ({parsedActions.length})
                    </span>
                    <span
                      className="text-[11px] font-mono"
                      style={{ color: totalPriorityUsed > MAX_PRIORITY ? "#EF4444" : undefined }}
                    >
                      Priority: {totalPriorityUsed}/{MAX_PRIORITY}
                    </span>
                  </div>

                  {totalPriorityUsed > MAX_PRIORITY && (
                    <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-2 mb-2">
                      <p className="text-xs text-viz-danger">
                        Over budget — reduce priority on some actions or remove one.
                      </p>
                    </div>
                  )}

                  {parsedActions.map((action, i) => (
                    <ActionCard
                      key={i}
                      action={action}
                      index={i}
                      onPriorityChange={updatePriority}
                      onRemove={removeAction}
                      totalPriorityUsed={totalPriorityUsed}
                      isSubmitted={false}
                    />
                  ))}

                  {/* Creative artifact */}
                  <div className="bg-white rounded-xl border border-border p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-text-muted" />
                      <span className="text-xs font-bold text-text">Creative Artifact (optional)</span>
                    </div>
                    <p className="text-[11px] text-text-muted mb-2">{role.artifactPrompt}</p>
                    <textarea
                      value={artifact}
                      onChange={(e) => setArtifact(e.target.value)}
                      placeholder="Write your artifact here..."
                      rows={3}
                      spellCheck={false}
                      className="w-full p-3 bg-warm-gray border border-border rounded-lg text-[13px] text-text
                                 resize-none outline-none focus:border-navy-light"
                    />
                  </div>

                  {/* Submit button */}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || parsedActions.length === 0 || totalPriorityUsed > MAX_PRIORITY}
                    className="w-full py-3.5 bg-navy text-white rounded-lg font-bold text-base
                               disabled:opacity-30 hover:bg-navy-light transition-colors
                               flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Submit Actions
                  </button>
                  {submitError && <p className="text-xs text-viz-danger mt-2 text-center">{submitError}</p>}
                </div>
              )}
            </>
          )}

          {/* Submitted state */}
          {isSubmitted && phase === "submit" && (
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-[#ECFDF5] flex items-center justify-center">
                  <Send className="w-3.5 h-3.5 text-[#059669]" />
                </div>
                <span className="text-sm font-bold text-text">Submitted</span>
              </div>
              {submission?.actions.map((a, i) => (
                <ActionCard
                  key={i}
                  action={a}
                  index={i}
                  onPriorityChange={() => {}}
                  onRemove={() => {}}
                  totalPriorityUsed={0}
                  isSubmitted
                />
              ))}
            </div>
          )}

          {/* Rolling / narrate — show results */}
          {(phase === "rolling" || phase === "narrate") && (
            <div className="bg-white rounded-xl border border-border p-4">
              <h3 className="text-sm font-bold text-text mb-3">
                {phase === "rolling" ? "Resolving..." : "Results"}
              </h3>
              {submission?.actions.map((a, i) => (
                <ActionCard
                  key={i}
                  action={a}
                  index={i}
                  onPriorityChange={() => {}}
                  onRemove={() => {}}
                  totalPriorityUsed={0}
                  isSubmitted
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </InAppBrowserGate>
  );
}
