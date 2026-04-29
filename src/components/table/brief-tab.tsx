"use client";

import { useState } from "react";
import { type Role, isLabCeo, hasCompute, getDisposition } from "@/lib/game-data";
import type { HandoutData, RoleHandout } from "@/lib/role-handouts";
import { DispositionBadge } from "@/components/table/disposition-badge";
import { QRCode } from "@/components/qr-codes";
import { ChevronDown, ChevronUp, Zap, Vote, FlaskConical, Send, Dices, BookText, Eye, X } from "lucide-react";

interface BriefTabProps {
  role: Role;
  handoutData: HandoutData | null;
  aiDisposition: string | undefined;
  gameStatus?: "lobby" | "playing" | "finished";
  // When set, renders a "Share with my team" affordance for the driver to
  // invite co-located observers. Undefined for the observer view itself
  // (observers don't invite their own observers).
  observeUrl?: string;
  joinCode?: string;
}

export function BriefTab({
  role,
  handoutData,
  aiDisposition,
  gameStatus,
  observeUrl,
  joinCode,
}: BriefTabProps) {
  const isPlaying = gameStatus === "playing";
  const [howToPlayOpen, setHowToPlayOpen] = useState(!isPlaying);
  const [shareOpen, setShareOpen] = useState(false);
  const disposition = aiDisposition ? getDisposition(aiDisposition) : null;
  const handout = handoutData?.[role.id];

  return (
    <div className="space-y-4">
      {/* ─── Role Card ─── */}
      <div className="bg-white rounded-xl p-5 border border-border">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-text leading-tight">{role.name}</h1>
            <p className="text-sm text-text-muted italic">{role.subtitle}</p>
          </div>
          {observeUrl && (
            <button
              onClick={() => setShareOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] bg-[#DBEAFE] hover:bg-[#BFDBFE] rounded-full px-2 py-1"
              title="Show a QR code so others at your table can watch along"
            >
              <Eye className="w-3 h-3" /> Share
            </button>
          )}
        </div>
        <p className="text-sm text-text leading-relaxed">{role.brief}</p>

        {/* AI Systems: disposition badge */}
        {role.tags.includes("ai-system") && disposition && (
          <DispositionBadge disposition={aiDisposition!} className="mt-4" />
        )}

        {isLabCeo(role) && (
          <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
            <span className="text-xs font-bold text-[#0284C7]">Lab CEO</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You control your lab&apos;s compute allocation and AI directive.
            </p>
          </div>
        )}
        {hasCompute(role) && !isLabCeo(role) && (
          <div className="mt-3 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg p-3">
            <span className="text-xs font-bold text-[#0284C7]">Compute Resources</span>
            <p className="text-xs text-[#0369A1] mt-0.5">
              You hold compute resources that other players may request.
            </p>
          </div>
        )}
      </div>

      {/* ─── Full Handout (or placeholder during lobby) ─── */}
      {handout && (isPlaying ? (
        <HandoutContent handout={handout} />
      ) : (
        <div className="bg-warm-gray rounded-xl border border-border px-5 py-3.5 flex items-center gap-2">
          <BookText className="w-4 h-4 text-text-muted/50 shrink-0" />
          <span className="text-sm text-text-muted">Your full character brief will appear here when the game starts.</span>
        </div>
      ))}

      {/* Share-with-team modal */}
      {shareOpen && observeUrl && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-6 cursor-pointer"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full text-center cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                I&rsquo;m playing {role.name}
              </span>
              <button
                onClick={() => setShareOpen(false)}
                className="text-text-muted hover:text-text"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-text mb-4">
              Scan to watch along — you&rsquo;ll see the brief and incoming requests, and can step in if I drop off.
            </p>
            <div className="flex justify-center mb-3">
              <QRCode value={observeUrl} size={220} />
            </div>
            {joinCode && (
              <p className="text-lg font-mono font-extrabold text-text tracking-[0.3em]">
                {joinCode}
              </p>
            )}
            <p className="text-[11px] text-text-muted mt-3">Tap anywhere to close</p>
          </div>
        </div>
      )}

      {/* ─── How to Play (expanded in lobby, collapsed during game) ─── */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setHowToPlayOpen(!howToPlayOpen)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left"
        >
          <span className="text-sm font-bold text-text flex items-center gap-2">
            <BookText className="w-4 h-4 text-text-muted" /> How to Play
          </span>
          {howToPlayOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
        </button>
        {howToPlayOpen && (
          <div className="px-5 pb-5 border-t border-border pt-4">
            <HowToPlayContent role={role} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── How to Play (shared between lobby and in-game) ─────────────────────────

function HowToPlayContent({ role }: { role: Role }) {
  return (
    <div className="space-y-2.5 text-sm text-text-muted leading-relaxed">
      <p className="flex items-start gap-2">
        <Send className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/60" />
        <span>Each turn, submit <strong className="text-text">actions</strong> your character would take. Be creative — anything your role could plausibly do.</span>
      </p>
      <p className="flex items-start gap-2">
        <Vote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/60" />
        <span><strong className="text-text">Support or oppose</strong> other players&apos; actions to influence their chance of success.</span>
      </p>
      <p className="flex items-start gap-2">
        <Dices className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/60" />
        <span>Actions are <strong className="text-text">graded and dice-rolled</strong> — bolder actions are harder to pull off.</span>
      </p>
      {hasCompute(role) && (
        <p className="flex items-start gap-2">
          <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/60" />
          <span>You can <strong className="text-text">send compute</strong> to other players to support their work.</span>
        </p>
      )}
      {isLabCeo(role) && (
        <p className="flex items-start gap-2">
          <FlaskConical className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/60" />
          <span>Use the <strong className="text-text">Lab tab</strong> to set your AI&apos;s directive and allocate compute between capability, safety, and users.</span>
        </p>
      )}
    </div>
  );
}

// ─── Structured handout renderer ────────────────────────────────────────────

function HandoutContent({ handout }: { handout: RoleHandout }) {
  return (
    <div className="space-y-3">
      {/* Role / Resources / Objective */}
      <div className="bg-warm-gray rounded-lg p-4 border border-border space-y-2">
        <div>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Role</span>
          <p className="text-sm text-text">{handout.role}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Resources</span>
          <p className="text-sm text-text">{handout.resources}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Objective</span>
          <p className="text-sm text-text">{handout.objective}</p>
        </div>
      </div>

      {/* Body paragraph */}
      <p className="text-sm text-text leading-relaxed">{handout.body}</p>

      {/* Role-specific sections */}
      {handout.sections?.map((section, i) => (
        <div key={i} className="bg-warm-gray rounded-lg p-4 border border-border">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">{section.title}</span>
          <p className="text-sm text-text mt-1 whitespace-pre-line leading-relaxed">{section.content}</p>
        </div>
      ))}

      {/* At the start of the exercise */}
      {handout.startOfExercise.length > 0 && (
        <div>
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">At the start of the exercise</span>
          <ul className="mt-1 space-y-1">
            {handout.startOfExercise.map((item, i) => (
              <li key={i} className="text-sm text-text leading-relaxed flex items-start gap-2">
                <span className="text-text-muted mt-0.5 shrink-0">&bull;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Options you may wish to consider */}
      {handout.options.length > 0 && (
        <div>
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Options you may wish to consider</span>
          <ol className="mt-1 space-y-1.5 list-decimal list-inside">
            {handout.options.map((opt, i) => (
              <li key={i} className="text-sm text-text leading-relaxed">{opt}</li>
            ))}
          </ol>
        </div>
      )}

      {/* At the end of each round */}
      {handout.endOfRound && handout.endOfRound.length > 0 && (
        <div>
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">At the end of each round</span>
          <ul className="mt-1 space-y-1">
            {handout.endOfRound.map((item, i) => (
              <li key={i} className="text-sm text-text leading-relaxed flex items-start gap-2">
                <span className="text-text-muted mt-0.5 shrink-0">&bull;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
