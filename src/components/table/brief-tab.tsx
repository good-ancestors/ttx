"use client";

import { useState } from "react";
import { type Role, isLabCeo, hasCompute, getDisposition } from "@/lib/game-data";
import { HowToPlaySection } from "@/components/table/how-to-play-section";
import { DispositionBadge } from "@/components/table/disposition-badge";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";

export interface BriefTabProps {
  role: Role;
  handoutData: Record<string, string> | null;
  aiDisposition: string | undefined;
  roundNarrative: string | undefined;
  roundLabel: string;
  submissionsOpen: boolean;
}

export function BriefTab({
  role,
  handoutData,
  aiDisposition,
  roundNarrative,
  roundLabel,
  submissionsOpen,
}: BriefTabProps) {
  const [fullBriefOpen, setFullBriefOpen] = useState(false);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const disposition = aiDisposition ? getDisposition(aiDisposition) : null;

  return (
    <div className="space-y-4">
      {/* Role header — character sheet feel */}
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

        {/* AI Systems disposition badge */}
        {role.tags.includes("ai-system") && disposition && (
          <DispositionBadge disposition={aiDisposition!} className="mt-4" />
        )}

        {/* Lab CEO / compute role tips */}
        {isLabCeo(role) && (
          <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
            <span className="text-xs font-bold text-[#0284C7]">Lab CEO</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You control your lab&apos;s compute allocation and AI spec. Use the Lab tab during submissions.
            </p>
          </div>
        )}
        {hasCompute(role) && !isLabCeo(role) && (
          <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
            <span className="text-xs font-bold text-[#0284C7]">Compute Resources</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You have compute resources you can loan to labs for leverage.
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
              {fullBriefOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
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

      {/* Round narrative — "Where Things Stand" */}
      {roundNarrative && (
        <div className="bg-[#FEFCE8] rounded-xl p-4 border border-[#FDE68A]">
          <button
            onClick={() => setNarrativeOpen(!narrativeOpen)}
            className="flex items-center justify-between w-full"
          >
            <span className="text-sm font-bold text-[#92400E]">
              Where Things Stand
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#A16207] font-mono">{roundLabel}</span>
              {narrativeOpen ? (
                <ChevronUp className="w-4 h-4 text-[#A16207]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#A16207]" />
              )}
            </div>
          </button>
          {narrativeOpen && (
            <p className="mt-3 text-sm text-[#78350F] leading-relaxed whitespace-pre-line">
              {roundNarrative}
            </p>
          )}
        </div>
      )}

      {/* How to play */}
      <div className="bg-[#EFF6FF] rounded-xl p-4 border border-[#BFDBFE]">
        <HowToPlaySection role={role} />
      </div>

      {/* Note when submissions aren't open */}
      {!submissionsOpen && (
        <div className="bg-warm-gray rounded-xl p-4 border border-border text-center">
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Zap className="w-4 h-4" />
            <p className="text-sm">
              When the facilitator opens submissions, switch to the{" "}
              <span className="font-bold">Actions</span> tab to submit your moves.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
