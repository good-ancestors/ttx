"use client";

import { useState } from "react";
import { type Role, isLabCeo, hasCompute, getDisposition, STARTING_SCENARIO } from "@/lib/game-data";
import { DispositionBadge } from "@/components/table/disposition-badge";
import { ChevronDown, ChevronUp, Zap, Vote, FlaskConical, MessageSquare, Send, Dices, BookText } from "lucide-react";

interface BriefTabProps {
  role: Role;
  handoutData: Record<string, string> | null;
  aiDisposition: string | undefined;
  roundNarrative: string | undefined;
  roundLabel: string;
  submissionsOpen: boolean;
  labs?: { name: string; spec?: string }[];
}

export function BriefTab({
  role,
  handoutData,
  aiDisposition,
  roundNarrative,
  roundLabel,
  submissionsOpen,
  labs,
}: BriefTabProps) {
  const [fullBriefOpen, setFullBriefOpen] = useState(false);
  const disposition = aiDisposition ? getDisposition(aiDisposition) : null;

  return (
    <div className="space-y-4">
      {/* ─── Role Card ─── */}
      <div className="bg-white rounded-xl p-5 border border-border">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: role.color }}
          />
          <div>
            <h1 className="text-lg font-bold text-text leading-tight">{role.name}</h1>
            <p className="text-sm text-text-muted italic">{role.subtitle}</p>
          </div>
        </div>

        <p className="text-sm text-text leading-relaxed">{role.brief}</p>

        {/* AI Systems: disposition + lab specs */}
        {role.tags.includes("ai-system") && disposition && (
          <DispositionBadge disposition={aiDisposition!} className="mt-4" />
        )}
        {role.tags.includes("ai-system") && labs && labs.length > 0 && (
          <div className="mt-4 space-y-2">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Lab Specs</span>
            {labs.map((lab) => (
              <div key={lab.name} className="bg-warm-gray rounded-lg p-3 border border-border">
                <span className="text-xs font-bold text-text">{lab.name}</span>
                <p className="text-xs text-text-muted mt-0.5">{lab.spec || "No spec set yet"}</p>
              </div>
            ))}
          </div>
        )}

        {/* Lab CEO tip */}
        {isLabCeo(role) && (
          <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
            <span className="text-xs font-bold text-[#0284C7]">Lab CEO</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You control your lab&apos;s compute allocation and AI directive. Use the <FlaskConical className="w-3 h-3 inline" /> Lab tab during submissions.
            </p>
          </div>
        )}
        {hasCompute(role) && !isLabCeo(role) && (
          <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
            <span className="text-xs font-bold text-[#0284C7]">Compute Resources</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You have compute resources other players may request for their actions.
            </p>
          </div>
        )}

        {/* Full brief — expandable */}
        {handoutData?.[role.id] && (
          <div className="mt-4">
            <button
              onClick={() => setFullBriefOpen(!fullBriefOpen)}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text transition-colors"
            >
              Full Brief
              {fullBriefOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {fullBriefOpen && (
              <div className="mt-2 bg-warm-gray rounded-lg p-4 border border-border">
                <div className="text-sm text-text whitespace-pre-line leading-relaxed">
                  {handoutData[role.id]}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Where Things Stand ─── */}
      {(roundNarrative != null) ? (
        <ScenarioCard title="Where Things Stand" label={roundLabel}>
          <p className="text-sm text-[#78350F] leading-relaxed">{roundNarrative}</p>
        </ScenarioCard>
      ) : (
        <ScenarioCard title="Starting Scenario" label={roundLabel}>
          <p className="text-sm text-[#78350F] leading-relaxed">{STARTING_SCENARIO}</p>
        </ScenarioCard>
      )}

      {/* ─── How to Play ─── */}
      <div className="bg-[#EFF6FF] rounded-xl p-5 border border-[#BFDBFE]">
        <h2 className="text-sm font-bold text-[#1D4ED8] mb-3">How to Play</h2>

        <p className="text-sm text-[#1E40AF] mb-4">
          Your goal is not to win, but to explore a plausible future. Simulate your role as best you can &mdash; what would your character really do?
        </p>

        <div className="space-y-2.5 mb-4">
          <div className="flex items-start gap-2.5">
            <MessageSquare className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-bold text-[#1E40AF]">Discuss</span>
              <p className="text-xs text-[#3B82F6]">Talk to other players. Form alliances, negotiate deals, gather intelligence.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Send className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-bold text-[#1E40AF]">Submit</span>
              <span className="text-xs text-[#3B82F6] ml-1">(</span><Zap className="w-3 h-3 text-[#3B82F6] inline" /><span className="text-xs text-[#3B82F6]"> Actions tab)</span>
              <p className="text-xs text-[#3B82F6]">Write 1&ndash;5 actions describing what you do and what you intend to achieve.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Vote className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-bold text-[#1E40AF]">Respond</span>
              <span className="text-xs text-[#3B82F6] ml-1">(</span><Vote className="w-3 h-3 text-[#3B82F6] inline" /><span className="text-xs text-[#3B82F6]"> Respond tab)</span>
              <p className="text-xs text-[#3B82F6]">Support or oppose other players&apos; actions to influence their odds.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Dices className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-bold text-[#1E40AF]">Resolve</span>
              <p className="text-xs text-[#3B82F6]">Each action&apos;s probability is evaluated, then dice decide what succeeds.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <BookText className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-bold text-[#1E40AF]">Narrate</span>
              <p className="text-xs text-[#3B82F6]">A narrative of what happened is generated. The world updates and the next round begins.</p>
            </div>
          </div>
        </div>

        <div className="bg-white/60 rounded-lg p-3 border border-[#BFDBFE]/50">
          <span className="text-xs font-bold text-[#1E40AF]">Writing Actions</span>
          <div className="mt-1.5 space-y-1">
            <p className="text-xs text-[#3B82F6]"><span className="font-semibold">Format:</span> &ldquo;I do [action] so that [intended outcome]&rdquo;</p>
            <p className="text-xs text-[#3B82F6]"><span className="font-semibold">Priority:</span> Action #1 gets the most priority, #2 less, and so on.</p>
            <p className="text-xs text-[#3B82F6]"><span className="font-semibold">Secret:</span> Toggle the secret switch to hide an action from others. It&apos;s still resolved normally.</p>
            <p className="text-xs text-[#3B82F6]"><span className="font-semibold">Support:</span> Request endorsement from other players &mdash; accepted support boosts your probability.</p>
          </div>
        </div>
      </div>

      {/* Note when submissions aren't open */}
      {!submissionsOpen && (

        <div className="bg-warm-gray rounded-xl p-4 border border-border text-center">
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Zap className="w-4 h-4" />
            <p className="text-sm">
              When the facilitator opens submissions, the <span className="font-bold">Actions</span> tab will activate.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#FEFCE8] rounded-xl p-4 border border-[#FDE68A]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-[#92400E]">{title}</span>
        <span className="text-[11px] text-[#A16207] font-mono">{label}</span>
      </div>
      {children}
    </div>
  );
}
