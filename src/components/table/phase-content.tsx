"use client";

import type { Id } from "@convex/_generated/dataModel";
import type { Role, Lab } from "@/lib/game-data";
import { getAiInfluencePower, isResolvingPhase } from "@/lib/game-data";
import { ComputeAllocation } from "@/components/compute-allocation";
import type { ActionDraft } from "@/components/action-input";
import type { SampleAction } from "@/lib/sample-actions";
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

// ─── Shared placeholder for inactive tabs ────────────────────────────────────

function TabPlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-10 h-10 text-border mb-3" />
      <p className="text-sm font-bold text-text mb-1">{title}</p>
      <p className="text-xs text-text-muted max-w-xs">{description}</p>
    </div>
  );
}

// ─── Lab helpers (used by submit and resolve) ────────────────────────────────

type LabData = Lab;

interface LabComputeSummaryProps {
  lab: LabData;
  startingStock: number;
}

function LabComputeSummary({ lab, startingStock }: LabComputeSummaryProps) {
  const delta = lab.computeStock - startingStock;
  return (
    <div className="bg-white rounded-xl border border-border p-3 mb-4">
      <p className="text-sm font-bold text-text">
        Lab Compute: {lab.computeStock}u
      </p>
      {delta !== 0 && (
        <p className="text-xs text-text-muted mt-0.5">
          (base {startingStock}u {delta > 0 ? "+" : ""}{delta}u {delta > 0 ? "loaned" : "spent"})
        </p>
      )}
    </div>
  );
}

function ReadOnlyLabView({ lab, roleName }: { lab: LabData; roleName: string }) {
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

interface LobbyContentProps {
  activeTab: PlayerTab;
  role: Role;
  tableId: Id<"tables">;
  aiDisposition: string | undefined;
  handoutData: Record<string, string> | null;
  hasLabAccess: boolean;
}

function LobbyContent({
  activeTab,
  role,
  tableId,
  aiDisposition,
  handoutData,
  hasLabAccess,
}: LobbyContentProps) {
  return (
    <>
      {activeTab === "brief" && (
        <TableLobby
          role={role}
          tableId={tableId}
          aiDisposition={aiDisposition}
          handoutData={handoutData}
        />
      )}
      {activeTab === "actions" && (
        <TabPlaceholder
          icon={Zap}
          title="Actions"
          description="When the game starts, you'll see your actions here."
        />
      )}
      {activeTab === "respond" && (
        <TabPlaceholder
          icon={Vote}
          title="Respond"
          description="When the game starts, you'll be able to support or oppose other players' actions here."
        />
      )}
      {activeTab === "lab" && hasLabAccess && (
        <TabPlaceholder
          icon={FlaskConical}
          title="Lab Controls"
          description="When the game starts, you'll manage your lab here."
        />
      )}
    </>
  );
}

// ─── Discuss phase ───────────────────────────────────────────────────────────

interface DiscussContentProps {
  activeTab: PlayerTab;
  role: Role;
  tableId: Id<"tables">;
  isAiSystem: boolean;
  aiDisposition: string | undefined;
  handoutData: Record<string, string> | null;
  roundNarrative: string | undefined;
  roundLabel: string;
  labs: LabData[];
  computeOverview: { roles: { roleId: string; roleName: string; computeStock: number }[] } | undefined;
  gameStatus: string;
  hasLabAccess: boolean;
  controlsLab: boolean;
}

function DiscussContent({
  activeTab,
  role,
  tableId,
  isAiSystem,
  aiDisposition,
  handoutData,
  roundNarrative,
  roundLabel,
  labs,
  computeOverview,
  gameStatus,
  hasLabAccess,
  controlsLab,
}: DiscussContentProps) {
  return (
    <>
      {isAiSystem && !aiDisposition && (
        <DispositionChooser tableId={tableId} onChosen={() => {}} />
      )}
      {activeTab === "brief" && (
        <BriefTab
          role={role}
          handoutData={handoutData}
          aiDisposition={aiDisposition}
          roundNarrative={roundNarrative}
          roundLabel={roundLabel}
          submissionsOpen={false}
          labs={labs}
          computeOverview={computeOverview}
          gameStatus={gameStatus}
        />
      )}
      {activeTab === "actions" && (
        <TabPlaceholder
          icon={Zap}
          title="Actions"
          description="When the facilitator opens submissions, you'll draft and submit your actions here."
        />
      )}
      {activeTab === "respond" && (
        <TabPlaceholder
          icon={Vote}
          title="Respond"
          description="When other players submit actions, you'll be able to support or oppose them here."
        />
      )}
      {activeTab === "lab" && hasLabAccess && (
        <TabPlaceholder
          icon={FlaskConical}
          title="Lab Controls"
          description={
            controlsLab
              ? "When submissions open, you\u2019ll set your compute allocation and lab spec here."
              : "When submissions open, you\u2019ll be able to view your lab\u2019s data here."
          }
        />
      )}
    </>
  );
}

// ─── Submit phase ────────────────────────────────────────────────────────────

interface SubmitContentProps {
  activeTab: PlayerTab;
  role: Role;
  tableId: Id<"tables">;
  gameId: Id<"games">;
  isAiSystem: boolean;
  aiDisposition: string | undefined;
  handoutData: Record<string, string> | null;
  roundNarrative: string | undefined;
  roundLabel: string;
  labs: LabData[];
  computeOverview: { roles: { roleId: string; roleName: string; computeStock: number }[] } | undefined;
  gameStatus: string;
  // Actions tab
  game: Parameters<typeof TableSubmit>[0]["game"];
  submittedActions: Parameters<typeof TableSubmit>[0]["submittedActions"];
  isExpired: boolean;
  computeStock: number | undefined;
  computeRecipients: { id: string; name: string }[];
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
  // Respond tab
  currentRound: number;
  allRequests: Parameters<typeof RespondTab>[0]["allRequests"];
  // Lab tab
  controlsLab: boolean;
  hasLabAccess: boolean;
  currentLab: LabData | undefined;
  startingStock: number;
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
  specSaveError: string;
  computeAllocation: { users: number; capability: number; safety: number };
  onComputeAllocationChange: (alloc: { users: number; capability: number; safety: number }) => void;
}

function SubmitContent({
  activeTab,
  role,
  tableId,
  gameId,
  isAiSystem,
  aiDisposition,
  handoutData,
  roundNarrative,
  roundLabel,
  labs,
  computeOverview,
  gameStatus,
  game,
  submittedActions,
  isExpired,
  computeStock,
  computeRecipients,
  actionDrafts,
  onActionDraftsChange,
  enabledRoles,
  onSubmitAction,
  onEditAction,
  onDeleteAction,
  submitError,
  sentRequestsByAction,
  shownSuggestions,
  ideasOpen,
  onIdeasOpenChange,
  onSuggestionTap,
  currentRound,
  allRequests,
  controlsLab,
  hasLabAccess,
  currentLab,
  startingStock,
  labSpec,
  onLabSpecChange,
  specSaved,
  onSaveSpec,
  specSaveError,
  computeAllocation,
  onComputeAllocationChange,
}: SubmitContentProps) {
  return (
    <>
      {isAiSystem && !aiDisposition && (
        <DispositionChooser tableId={tableId} onChosen={() => {}} />
      )}

      {activeTab === "brief" && (
        <BriefTab
          role={role}
          handoutData={handoutData}
          aiDisposition={aiDisposition}
          roundNarrative={roundNarrative}
          roundLabel={roundLabel}
          submissionsOpen={true}
          labs={labs}
          computeOverview={computeOverview}
          gameStatus={gameStatus}
        />
      )}

      {activeTab === "actions" && (
        <TableSubmit
          game={game}
          gameId={gameId}
          tableId={tableId}
          role={role}
          submittedActions={submittedActions}
          isExpired={isExpired}
          computeStock={computeStock}
          computeRecipients={computeRecipients}
          actionDrafts={actionDrafts}
          onActionDraftsChange={onActionDraftsChange}
          enabledRoles={enabledRoles}
          onSubmitAction={onSubmitAction}
          onEditAction={onEditAction}
          onDeleteAction={onDeleteAction}
          submitError={submitError}
          sentRequestsByAction={sentRequestsByAction}
          shownSuggestions={shownSuggestions}
          ideasOpen={ideasOpen}
          onIdeasOpenChange={onIdeasOpenChange}
          onSuggestionTap={onSuggestionTap}
        />
      )}

      {activeTab === "respond" && (
        <RespondTab
          gameId={gameId}
          roundNumber={currentRound}
          roleId={role.id}
          isAiSystem={isAiSystem}
          aiInfluencePower={getAiInfluencePower(labs)}
          allRequests={allRequests}
          allowEdits={isAiSystem || !isExpired}
        />
      )}

      {activeTab === "lab" && controlsLab && currentLab && (
        <>
          <LabComputeSummary lab={currentLab} startingStock={startingStock} />
          <LabSpecEditor
            labSpec={labSpec}
            onLabSpecChange={onLabSpecChange}
            specSaved={specSaved}
            onSaveSpec={onSaveSpec}
          />
          {specSaveError && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-2.5 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span className="text-xs text-[#991B1B] font-medium">{specSaveError}</span>
            </div>
          )}
          <ComputeAllocation
            allocation={computeAllocation}
            onChange={onComputeAllocationChange}
            isSubmitted={false}
            roleName={role.name}
          />
        </>
      )}
      {activeTab === "lab" && !controlsLab && hasLabAccess && currentLab && (
        <>
          <LabComputeSummary lab={currentLab} startingStock={startingStock} />
          <ReadOnlyLabView lab={currentLab} roleName={role.name} />
        </>
      )}
    </>
  );
}

// ─── Resolve phase (rolling / narrate) ───────────────────────────────────────

interface ResolveContentProps {
  activeTab: PlayerTab;
  phase: "rolling" | "narrate";
  round: Parameters<typeof TableResolving>[0]["round"];
  sortedResultActions: ResultAction[];
  gameId: Id<"games">;
  currentRound: number;
  roleId: string;
  roleName: string;
  isAiSystem: boolean;
  allRequests: Parameters<typeof RespondResultsTab>[0]["allRequests"];
  hasLabAccess: boolean;
  currentLab: LabData | undefined;
  startingStock: number;
}

function ResolveContent({
  activeTab,
  phase,
  round,
  sortedResultActions,
  gameId,
  currentRound,
  roleId,
  roleName,
  isAiSystem,
  allRequests,
  hasLabAccess,
  currentLab,
  startingStock,
}: ResolveContentProps) {
  return (
    <>
      {activeTab === "brief" && (
        <TableResolving
          phase={phase}
          round={round}
          sortedResultActions={sortedResultActions}
          showResults={false}
        />
      )}

      {activeTab === "actions" && (
        <TableResolving
          phase={phase}
          round={round}
          sortedResultActions={sortedResultActions}
          showNarrative={false}
        />
      )}

      {activeTab === "respond" && (
        <RespondResultsTab
          gameId={gameId}
          roundNumber={currentRound}
          roleId={roleId}
          isAiSystem={isAiSystem}
          allRequests={allRequests}
        />
      )}

      {activeTab === "lab" && hasLabAccess && currentLab && (
        <>
          <LabComputeSummary lab={currentLab} startingStock={startingStock} />
          <ReadOnlyLabView lab={currentLab} roleName={roleName} />
        </>
      )}
    </>
  );
}

// ─── Top-level dispatcher ────────────────────────────────────────────────────

interface PhaseContentProps {
  gameStatus: string;
  phase: string;
  activeTab: PlayerTab;
  role: Role;
  tableId: Id<"tables">;
  gameId: Id<"games">;
  isAiSystem: boolean;
  aiDisposition: string | undefined;
  handoutData: Record<string, string> | null;
  roundNarrative: string | undefined;
  roundLabel: string;
  labs: LabData[];
  computeOverview: { roles: { roleId: string; roleName: string; computeStock: number }[] } | undefined;
  controlsLab: boolean;
  hasLabAccess: boolean;
  currentLab: LabData | undefined;
  startingStock: number;
  // Submit-specific
  game: Parameters<typeof TableSubmit>[0]["game"];
  submittedActions: Parameters<typeof TableSubmit>[0]["submittedActions"];
  isExpired: boolean;
  computeStock: number | undefined;
  computeRecipients: { id: string; name: string }[];
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
  // Lab editor
  labSpec: string;
  onLabSpecChange: (spec: string) => void;
  specSaved: boolean;
  onSaveSpec: () => void;
  specSaveError: string;
  computeAllocation: { users: number; capability: number; safety: number };
  onComputeAllocationChange: (alloc: { users: number; capability: number; safety: number }) => void;
  // Resolve-specific
  round: Parameters<typeof TableResolving>[0]["round"] | undefined;
  sortedResultActions: ResultAction[];
}

export function PhaseContent(props: PhaseContentProps) {
  const { gameStatus, phase } = props;

  if (gameStatus === "lobby") {
    return (
      <LobbyContent
        activeTab={props.activeTab}
        role={props.role}
        tableId={props.tableId}
        aiDisposition={props.aiDisposition}
        handoutData={props.handoutData}
        hasLabAccess={props.hasLabAccess}
      />
    );
  }

  if (phase === "discuss" && gameStatus === "playing") {
    return (
      <DiscussContent
        activeTab={props.activeTab}
        role={props.role}
        tableId={props.tableId}
        isAiSystem={props.isAiSystem}
        aiDisposition={props.aiDisposition}
        handoutData={props.handoutData}
        roundNarrative={props.roundNarrative}
        roundLabel={props.roundLabel}
        labs={props.labs}
        computeOverview={props.computeOverview}
        gameStatus={props.gameStatus}
        hasLabAccess={props.hasLabAccess}
        controlsLab={props.controlsLab}
      />
    );
  }

  if (phase === "submit") {
    return (
      <SubmitContent
        activeTab={props.activeTab}
        role={props.role}
        tableId={props.tableId}
        gameId={props.gameId}
        isAiSystem={props.isAiSystem}
        aiDisposition={props.aiDisposition}
        handoutData={props.handoutData}
        roundNarrative={props.roundNarrative}
        roundLabel={props.roundLabel}
        labs={props.labs}
        computeOverview={props.computeOverview}
        gameStatus={props.gameStatus}
        game={props.game}
        submittedActions={props.submittedActions}
        isExpired={props.isExpired}
        computeStock={props.computeStock}
        computeRecipients={props.computeRecipients}
        actionDrafts={props.actionDrafts}
        onActionDraftsChange={props.onActionDraftsChange}
        enabledRoles={props.enabledRoles}
        onSubmitAction={props.onSubmitAction}
        onEditAction={props.onEditAction}
        onDeleteAction={props.onDeleteAction}
        submitError={props.submitError}
        sentRequestsByAction={props.sentRequestsByAction}
        shownSuggestions={props.shownSuggestions}
        ideasOpen={props.ideasOpen}
        onIdeasOpenChange={props.onIdeasOpenChange}
        onSuggestionTap={props.onSuggestionTap}
        currentRound={props.currentRound}
        allRequests={props.allRequests}
        controlsLab={props.controlsLab}
        hasLabAccess={props.hasLabAccess}
        currentLab={props.currentLab}
        startingStock={props.startingStock}
        labSpec={props.labSpec}
        onLabSpecChange={props.onLabSpecChange}
        specSaved={props.specSaved}
        onSaveSpec={props.onSaveSpec}
        specSaveError={props.specSaveError}
        computeAllocation={props.computeAllocation}
        onComputeAllocationChange={props.onComputeAllocationChange}
      />
    );
  }

  if (isResolvingPhase(phase) && props.round) {
    return (
      <ResolveContent
        activeTab={props.activeTab}
        phase={phase}
        round={props.round}
        sortedResultActions={props.sortedResultActions}
        gameId={props.gameId}
        currentRound={props.currentRound}
        roleId={props.role.id}
        roleName={props.role.name}
        isAiSystem={props.isAiSystem}
        allRequests={props.allRequests ?? []}
        hasLabAccess={props.hasLabAccess}
        currentLab={props.currentLab}
        startingStock={props.startingStock}
      />
    );
  }

  return null;
}
