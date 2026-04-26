"use client";

import type { Id } from "@convex/_generated/dataModel";
import type { Role, Lab } from "@/lib/game-data";
import { getAiInfluencePower, isResolvingPhase } from "@/lib/game-data";
import { ComputeAllocation } from "@/components/compute-allocation";
import type { ActionDraft } from "@/components/action-input";
import type { SampleAction } from "@/lib/sample-actions";
import type { HandoutData } from "@/lib/role-handouts";
import { TableLobby, DispositionChooser } from "@/components/table/table-lobby";
import { LabSpecEditor } from "@/components/table/lab-spec-editor";
import { TableSubmit } from "@/components/table/table-submit";
import { TableResolving } from "@/components/table/table-resolving";
import { BriefTab } from "@/components/table/brief-tab";
import { RespondTab, RespondResultsTab } from "@/components/table/respond-tab";
import type { PlayerTab } from "@/components/table/player-tabs";
import type { ResultAction } from "@/components/table/result-action-card";
import {
  Zap,
  Vote,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";

type GameStatus = "lobby" | "playing" | "finished";

// ─── Shared prop groups ──────────────────────────────────────────────────────

interface CommonProps {
  activeTab: PlayerTab;
  role: Role;
  tableId: Id<"tables">;
  gameId: Id<"games">;
  gameStatus: GameStatus;
  isAiSystem: boolean;
  aiDisposition: string | undefined;
  handoutData: HandoutData | null;
  hasLabAccess: boolean;
  controlsLab: boolean;
}

interface SubmitProps {
  game: Parameters<typeof TableSubmit>[0]["game"];
  submittedActions: Parameters<typeof TableSubmit>[0]["submittedActions"];
  isExpired: boolean;
  computeStock: number | undefined;
  computeRecipients: { id: string; name: string; computeStock?: number }[];
  actionDrafts: ActionDraft[];
  onActionDraftsChange: (drafts: ActionDraft[]) => void;
  enabledRoles: { id: string; name: string }[];
  onSubmitAction: (index: number) => Promise<void>;
  onEditAction: (index: number) => Promise<void>;
  onDeleteAction: (index: number) => Promise<void>;
  submitError: string;
  sentRequestsByAction: Map<string, { toRoleName: string; requestType: "endorsement" | "compute"; computeAmount?: number; status: "pending" | "accepted" | "declined" }[]> | undefined;
  shownSuggestions: SampleAction[];
  ideasOpen: boolean;
  onIdeasOpenChange: (open: boolean) => void;
  onSuggestionTap: (suggestion: SampleAction) => void;
  currentRound: number;
  allRequests: Parameters<typeof RespondTab>[0]["allRequests"];
}

interface LabProps {
  currentLab: Lab | undefined;
  startingStock: number;
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  specUnsaved: boolean;
  onSaveSpec: () => Promise<void> | void;
  computeAllocation: { deployment: number; research: number; safety: number };
  onComputeAllocationChange: (alloc: { deployment: number; research: number; safety: number }) => void;
  allocationSaved: boolean;
  allocationUnsaved: boolean;
  onSaveAllocation: () => Promise<void> | void;
}

interface ResolveProps {
  round: Parameters<typeof TableResolving>[0]["round"] | undefined;
  sortedResultActions: ResultAction[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TabPlaceholder({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-10 h-10 text-border mb-3" />
      <h3 className="text-base font-bold text-text mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-xs">{description}</p>
    </div>
  );
}

function LabComputeSummary({ lab, startingStock }: { lab: Lab; startingStock: number }) {
  const computeGrowth = lab.computeStock - startingStock;
  return (
    <div className="bg-white rounded-xl p-4 border border-border mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-text">{lab.name} Lab</span>
        <span className="text-xs font-mono text-text-muted flex items-center gap-1">
          <Zap className="w-3.5 h-3.5" /> {lab.computeStock}u
          {computeGrowth !== 0 && (
            <span className={computeGrowth > 0 ? "text-viz-safety" : "text-viz-danger"}>
              ({computeGrowth > 0 ? "+" : ""}{computeGrowth})
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>R&D {lab.rdMultiplier}x</span>
        <span className="text-border">|</span>
        <span>Research {lab.allocation.research}% / Safety {lab.allocation.safety}% / Deployment {lab.allocation.deployment}%</span>
      </div>
    </div>
  );
}

function ReadOnlyLabView({ lab, roleName }: { lab: Lab; roleName: string }) {
  return (
    <>
      <LabSpecEditor
        labSpec={lab.spec ?? ""}
        onLabSpecChange={() => {}}
        specSaved={false}
        onSaveSpec={() => {}}
        readOnly
      />
      <ComputeAllocation
        allocation={lab.allocation}
        onChange={() => {}}
        isSubmitted={true}
        roleName={roleName}
      />
    </>
  );
}

// ─── Lobby phase ─────────────────────────────────────────────────────────────

function LobbyContent({ common, playerName }: { common: CommonProps; playerName: string | undefined }) {
  return (
    <>
      {common.activeTab === "brief" && (
        <TableLobby
          role={common.role}
          tableId={common.tableId}
          gameId={common.gameId}
          handoutData={common.handoutData}
          playerName={playerName}
        />
      )}
      {common.activeTab === "actions" && (
        <TabPlaceholder icon={Zap} title="Actions" description="When the game starts, you'll see your actions here." />
      )}
      {common.activeTab === "respond" && (
        <TabPlaceholder icon={Vote} title="Respond" description="When the game starts, you'll be able to support or oppose other players' actions here." />
      )}
      {common.activeTab === "lab" && common.hasLabAccess && (
        <TabPlaceholder icon={FlaskConical} title="Lab Controls" description="When the game starts, you'll manage your lab here." />
      )}
    </>
  );
}

// ─── Discuss phase ───────────────────────────────────────────────────────────

function DiscussContent({ common }: { common: CommonProps }) {
  return (
    <>
      {common.isAiSystem && !common.aiDisposition && (
        <DispositionChooser tableId={common.tableId} onChosen={() => {}} />
      )}
      {common.activeTab === "brief" && (
        <BriefTab role={common.role} handoutData={common.handoutData} aiDisposition={common.aiDisposition} gameStatus={common.gameStatus} />
      )}
      {common.activeTab === "actions" && (
        <TabPlaceholder icon={Zap} title="Actions" description="When the facilitator opens submissions, you'll draft and submit your actions here." />
      )}
      {common.activeTab === "respond" && (
        <TabPlaceholder icon={Vote} title="Respond" description="When other players submit actions, you'll be able to support or oppose them here." />
      )}
      {common.activeTab === "lab" && common.hasLabAccess && (
        <TabPlaceholder
          icon={FlaskConical}
          title="Lab Controls"
          description={common.controlsLab
            ? "When submissions open, you\u2019ll set your compute allocation and lab spec here."
            : "When submissions open, you\u2019ll be able to view your lab\u2019s data here."}
        />
      )}
    </>
  );
}

// ─── Submit phase ────────────────────────────────────────────────────────────

function SubmitContent({ common, submit, lab, labs }: { common: CommonProps; submit: SubmitProps; lab: LabProps; labs: Lab[] }) {
  return (
    <>
      {common.isAiSystem && !common.aiDisposition && (
        <DispositionChooser tableId={common.tableId} onChosen={() => {}} />
      )}

      {common.activeTab === "brief" && (
        <BriefTab role={common.role} handoutData={common.handoutData} aiDisposition={common.aiDisposition} gameStatus={common.gameStatus} />
      )}

      {common.activeTab === "actions" && (
        <TableSubmit
          game={submit.game}
          role={common.role}
          submittedActions={submit.submittedActions}
          isExpired={submit.isExpired}
          computeStock={submit.computeStock}
          ownedLab={lab.currentLab?.labId ? { labId: lab.currentLab.labId as Id<"labs">, name: lab.currentLab.name } : undefined}
          otherLabs={labs
            .filter((l) => l.labId && l.labId !== lab.currentLab?.labId)
            .map((l) => ({ labId: l.labId as Id<"labs">, name: l.name }))}
          computeRecipients={submit.computeRecipients}
          actionDrafts={submit.actionDrafts}
          onActionDraftsChange={submit.onActionDraftsChange}
          enabledRoles={submit.enabledRoles}
          onSubmitAction={submit.onSubmitAction}
          onEditAction={submit.onEditAction}
          onDeleteAction={submit.onDeleteAction}
          submitError={submit.submitError}
          sentRequestsByAction={submit.sentRequestsByAction}
          shownSuggestions={submit.shownSuggestions}
          ideasOpen={submit.ideasOpen}
          onIdeasOpenChange={submit.onIdeasOpenChange}
          onSuggestionTap={submit.onSuggestionTap}
        />
      )}

      {common.activeTab === "respond" && (
        <RespondTab
          gameId={common.gameId}
          roundNumber={submit.currentRound}
          roleId={common.role.id}
          tableId={common.tableId}
          isAiSystem={common.isAiSystem}
          aiInfluencePower={getAiInfluencePower(labs)}
          allRequests={submit.allRequests}
          allowEdits={common.isAiSystem || !submit.isExpired}
        />
      )}

      {common.activeTab === "lab" && common.hasLabAccess && (
        common.controlsLab && lab.currentLab ? (
          <>
            <LabComputeSummary lab={lab.currentLab} startingStock={lab.startingStock} />
            {submit.isExpired ? (
              <div className="bg-[#FEF2F2] rounded-xl p-4 border border-[#FECACA] mb-3">
                <div className="flex items-center gap-2 text-sm text-[#991B1B]">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-bold">Submissions closed</span>
                </div>
                <p className="text-xs text-[#B91C1C] mt-1">Lab controls are locked until the next submission window.</p>
              </div>
            ) : (
              <>
                <LabSpecEditor
                  labSpec={lab.labSpec}
                  onLabSpecChange={lab.onLabSpecChange}
                  specSaved={lab.specSaved}
                  onSaveSpec={lab.onSaveSpec}
                  unsaved={lab.specUnsaved}
                />
                <ComputeAllocation
                  allocation={lab.computeAllocation}
                  onChange={lab.onComputeAllocationChange}
                  isSubmitted={false}
                  roleName={common.role.name}
                  saved={lab.allocationSaved}
                  unsaved={lab.allocationUnsaved}
                  onSave={lab.onSaveAllocation}
                />
              </>
            )}
          </>
        ) : lab.currentLab ? (
          <>
            <LabComputeSummary lab={lab.currentLab} startingStock={lab.startingStock} />
            <ReadOnlyLabView lab={lab.currentLab} roleName={common.role.name} />
          </>
        ) : null
      )}
    </>
  );
}

// ─── Resolve phase ───────────────────────────────────────────────────────────

function ResolveContent({ common, resolve, submit, lab }: {
  common: CommonProps;
  // "effect-review" is a facilitator-only pause; from the player table view it's
  // indistinguishable from narrate (dice results + narrative waiting to appear),
  // so the prop type includes it and the body reads it as a non-rolling phase.
  resolve: ResolveProps & { phase: "rolling" | "effect-review" | "narrate" };
  submit: Pick<SubmitProps, "currentRound" | "allRequests">;
  lab: Pick<LabProps, "currentLab" | "startingStock">;
}) {
  return (
    <>
      {common.activeTab === "brief" && resolve.round && (
        <TableResolving phase={resolve.phase} round={resolve.round} sortedResultActions={resolve.sortedResultActions} showResults={false} />
      )}
      {common.activeTab === "actions" && resolve.round && (
        <TableResolving phase={resolve.phase} round={resolve.round} sortedResultActions={resolve.sortedResultActions} showNarrative={false} />
      )}
      {common.activeTab === "respond" && (
        <RespondResultsTab
          gameId={common.gameId}
          roundNumber={submit.currentRound}
          roleId={common.role.id}
          isAiSystem={common.isAiSystem}
          allRequests={submit.allRequests ?? []}
        />
      )}
      {common.activeTab === "lab" && common.hasLabAccess && lab.currentLab && (
        <>
          <LabComputeSummary lab={lab.currentLab} startingStock={lab.startingStock} />
          <ReadOnlyLabView lab={lab.currentLab} roleName={common.role.name} />
        </>
      )}
    </>
  );
}

// ─── Top-level dispatcher ────────────────────────────────────────────────────

interface PhaseContentProps {
  common: CommonProps;
  submit: SubmitProps;
  lab: LabProps;
  resolve: ResolveProps;
  labs: Lab[];
  phase: string;
  playerName: string | undefined;
}

export function PhaseContent({ common, submit, lab, resolve, labs, phase, playerName }: PhaseContentProps) {
  if (common.gameStatus === "lobby") {
    return <LobbyContent common={common} playerName={playerName} />;
  }

  if (phase === "discuss" && common.gameStatus === "playing") {
    return <DiscussContent common={common} />;
  }

  if (phase === "submit") {
    return <SubmitContent common={common} submit={submit} lab={lab} labs={labs} />;
  }

  if (isResolvingPhase(phase) && resolve.round) {
    return (
      <ResolveContent
        common={common}
        resolve={{ ...resolve, round: resolve.round, phase }}
        submit={{ currentRound: submit.currentRound, allRequests: submit.allRequests }}
        lab={{ currentLab: lab.currentLab, startingStock: lab.startingStock }}
      />
    );
  }

  return null;
}
