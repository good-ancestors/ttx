"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { Handshake, Send, Check, X, ChevronDown, ChevronUp } from "lucide-react";

/** Hook to get the pending incoming proposal count for a role. */
export function usePendingProposalCount(
  gameId: Id<"games">,
  roundNumber: number,
  roleId: string
) {
  const proposals = useQuery(api.proposals.getByGameAndRound, {
    gameId,
    roundNumber,
  });
  return (proposals ?? []).filter(
    (p) => p.toRoleId === roleId && p.status === "pending"
  ).length;
}

export function ProposalPanel({
  gameId,
  roundNumber,
  roleId,
  roleName,
}: {
  gameId: Id<"games">;
  roundNumber: number;
  roleId: string;
  roleName: string;
}) {
  const proposals = useQuery(api.proposals.getByGameAndRound, {
    gameId,
    roundNumber,
  });
  const sendProposal = useMutation(api.proposals.send);
  const respondToProposal = useMutation(api.proposals.respond);

  // null = user hasn't toggled, so auto-expand based on pending proposals
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [proposalText, setProposalText] = useState("");
  const [sending, setSending] = useState(false);

  const incomingProposals = (proposals ?? []).filter(
    (p) => p.toRoleId === roleId
  );
  const outgoingProposals = (proposals ?? []).filter(
    (p) => p.fromRoleId === roleId
  );
  const pendingCount = incomingProposals.filter(
    (p) => p.status === "pending"
  ).length;

  // If user has explicitly toggled, respect that; otherwise auto-expand when pending
  const expanded = userExpanded ?? pendingCount > 0;

  const otherRoles = ROLES.filter((r) => r.id !== roleId);

  const handleSend = async () => {
    if (!targetRole || !proposalText.trim()) return;
    setSending(true);
    const target = ROLES.find((r) => r.id === targetRole);
    await sendProposal({
      gameId,
      roundNumber,
      fromRoleId: roleId,
      fromRoleName: roleName,
      toRoleId: targetRole,
      toRoleName: target?.name ?? targetRole,
      actionText: proposalText.trim(),
      requestType: "endorsement" as const,
    });
    setProposalText("");
    setSending(false);
  };

  return (
    <div className="bg-white rounded-xl border border-border p-4 mb-4">
      <button
        onClick={() => setUserExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-bold text-text">
            Proposals
          </span>
          {pendingCount > 0 && (
            <span className="text-[10px] bg-viz-warning text-white px-1.5 py-0.5 rounded-full font-bold">
              {pendingCount} new
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {/* Incoming proposals */}
          {incomingProposals.length > 0 && (
            <div className="mb-4">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-2">
                Incoming
              </span>
              {incomingProposals.map((p) => (
                <div
                  key={p._id}
                  className="bg-warm-gray rounded-lg p-3 mb-2 border border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          ROLES.find((r) => r.id === p.fromRoleId)?.color,
                      }}
                    />
                    <span className="text-xs font-bold text-text">
                      {p.fromRoleName}
                    </span>
                    {p.status !== "pending" && (
                      <span
                        className={`text-[10px] font-mono ml-auto ${p.status === "accepted" ? "text-viz-safety" : "text-viz-danger"}`}
                      >
                        {p.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text mb-1">
                    {p.actionText}
                  </p>
                  {(p.requestType || p.computeAmount) && (
                    <p className="text-[11px] text-text-muted mb-2">
                      Requesting: {p.requestType === "compute" ? `${p.computeAmount ?? 0} compute` : p.requestType === "both" ? `endorsement + ${p.computeAmount ?? 0} compute` : "endorsement"}
                    </p>
                  )}
                  {p.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          respondToProposal({
                            proposalId: p._id,
                            status: "accepted",
                          })
                        }
                        className="flex-1 py-2.5 bg-[#ECFDF5] text-[#059669] rounded-lg text-sm font-bold
                                   flex items-center justify-center gap-1.5 hover:bg-[#D1FAE5]"
                      >
                        <Check className="w-4 h-4" /> Accept
                      </button>
                      <button
                        onClick={() =>
                          respondToProposal({
                            proposalId: p._id,
                            status: "declined",
                          })
                        }
                        className="flex-1 py-2.5 bg-[#FEF2F2] text-[#DC2626] rounded-lg text-sm font-bold
                                   flex items-center justify-center gap-1.5 hover:bg-[#FECACA]"
                      >
                        <X className="w-3.5 h-3.5" /> Decline
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Outgoing proposals */}
          {outgoingProposals.length > 0 && (
            <div className="mb-4">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-2">
                Sent
              </span>
              {outgoingProposals.map((p) => (
                <div
                  key={p._id}
                  className="bg-warm-gray rounded-lg p-2 mb-1.5 flex items-center gap-2"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        ROLES.find((r) => r.id === p.toRoleId)?.color,
                    }}
                  />
                  <span className="text-xs text-text flex-1 truncate">
                    → {p.toRoleName}: {p.actionText}
                  </span>
                  <span
                    className={`text-[10px] font-mono shrink-0 ${
                      p.status === "accepted"
                        ? "text-viz-safety"
                        : p.status === "declined"
                          ? "text-viz-danger"
                          : "text-viz-warning"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Send new proposal */}
          <div className="border-t border-border pt-3">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-2">
              Send Proposal
            </span>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="w-full p-2 bg-warm-gray border border-border rounded-lg text-sm text-text mb-2 outline-none"
            >
              <option value="">Select recipient...</option>
              <optgroup label="Labs">
                {otherRoles.filter((r) => r.tags.includes("lab-ceo") || r.tags.includes("lab-safety")).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
              <optgroup label="Governments">
                {otherRoles.filter((r) => r.tags.includes("government")).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
              <optgroup label="Civil Society & Special">
                {otherRoles.filter((r) => !r.tags.includes("lab-ceo") && !r.tags.includes("lab-safety") && !r.tags.includes("government")).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            </select>
            <textarea
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              placeholder="Propose a joint action... e.g. 'We propose merging our labs to pool compute resources'"
              rows={2}
              className="w-full p-2 bg-warm-gray border border-border rounded-lg text-sm text-text
                         resize-none outline-none mb-2"
            />
            <button
              onClick={handleSend}
              disabled={!targetRole || !proposalText.trim() || sending}
              className="w-full py-2 bg-navy text-white rounded-lg text-xs font-bold
                         disabled:opacity-30 flex items-center justify-center gap-1"
            >
              <Send className="w-3.5 h-3.5" /> Send Proposal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
