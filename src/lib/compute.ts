// ─── Unified compute distribution logic ─────────────────────────────────────
// Pure functions for computing per-round compute stock changes and starting
// compute allocation. Used by the pipeline, game creation, and tests.

import {
  ROLES,
  NEW_COMPUTE_PER_GAME_ROUND,
  DEFAULT_LABS,
} from "./game-data";
import { calculatePoolShare } from "@convex/gameData";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComputeHolder {
  roleId: string;
  name: string;
  stockBefore: number;          // at submit-phase open (before transfers)
  produced: number;             // new compute from production this round
  transferred: number;          // net player transfers during submit phase
  adjustment: number;           // LLM-driven changes (destruction, seizure, etc.)
  adjustmentReason?: string;    // LLM's explanation
  stockAfter: number;           // computed: stockBefore + produced + transferred + adjustment
  override?: number;            // facilitator's desired stockAfter (replaces computed)
  overrideReason?: string;      // facilitator's explanation
  sharePct: number;             // % of new compute pool this holder received
  status?: "merged" | "created";
}

export interface ComputeHolderInput {
  roleId: string;
  name: string;
  stockAtSubmitOpen: number;
  stockAtResolve: number;
}

export interface NarrativeAdjustment {
  name: string;
  change: number;
  reason?: string;
}

// ─── Starting compute (game creation) ───────────────────────────────────────

/**
 * Calculate starting compute for all enabled roles.
 * Labs get compute from DEFAULT_LABS. Non-lab roles get their startingComputeStock
 * plus a share of pool compute ("Other US Labs", "Rest of World") split among
 * eligible enabled roles.
 */
export function calculateStartingCompute(enabledRoleIds: Set<string>): { roleId: string; name: string; computeStock: number; breakdown?: string }[] {
  const result: { roleId: string; name: string; computeStock: number; breakdown?: string }[] = [];

  const labRoleIds = new Set(DEFAULT_LABS.map((l) => l.roleId));

  // Labs — fixed starting stock from DEFAULT_LABS
  for (const lab of DEFAULT_LABS) {
    if (enabledRoleIds.has(lab.roleId)) {
      result.push({ roleId: lab.roleId, name: lab.name, computeStock: lab.computeStock });
    }
  }

  // Non-lab roles with compute — sovereign stock + pool shares
  for (const role of ROLES) {
    if (!enabledRoleIds.has(role.id)) continue;
    if (labRoleIds.has(role.id)) continue;

    const sovereign = ("startingComputeStock" in role ? role.startingComputeStock : 0) as number;
    const pool = calculatePoolShare(role.id, enabledRoleIds);
    const total = sovereign + pool;
    if (total <= 0) continue;

    const parts: string[] = [];
    if (sovereign > 0) parts.push(`${sovereign} sovereign`);
    if (pool > 0) parts.push(`${pool} pool`);

    result.push({
      roleId: role.id,
      name: role.name,
      computeStock: total,
      breakdown: parts.join(" + "),
    });
  }

  return result;
}

// ─── Per-round compute distribution ─────────────────────────────────────────

/**
 * Build unified compute holders array for a round.
 *
 * Distribution logic:
 * - Default: proportional to current stock (all holders grow with the system)
 * - Override: shareOverrides map (roleId → %) set by facilitator or narrative LLM
 *   based on game events (e.g. "Taiwan invasion → OpenBrain share drops to 10%")
 * - Adjustments: narrative-driven stock changes (destruction, seizure, creation)
 */
export function buildComputeHolders(opts: {
  holders: ComputeHolderInput[];
  roundNumber: number;
  narrativeAdjustments: NarrativeAdjustment[];
  shareOverrides?: Record<string, number>;
}): ComputeHolder[] {
  const { holders, roundNumber, narrativeAdjustments, shareOverrides } = opts;
  const baselineTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;
  const adjustmentByName = new Map(narrativeAdjustments.map((a) => [a.name, a]));

  const totalStockAtOpen = holders.reduce((s, h) => s + h.stockAtSubmitOpen, 0);

  const result: ComputeHolder[] = [];
  let totalProduced = 0;

  for (const h of holders) {
    const transferred = h.stockAtResolve - h.stockAtSubmitOpen;
    const adj = adjustmentByName.get(h.name);
    const adjustment = adj?.change ?? 0;

    // Production: explicit override % if set, otherwise proportional to stock
    let produced: number;
    const overridePct = shareOverrides?.[h.roleId];
    if (overridePct !== undefined) {
      produced = Math.round(baselineTotal * overridePct / 100);
    } else {
      produced = totalStockAtOpen > 0
        ? Math.round(baselineTotal * h.stockAtSubmitOpen / totalStockAtOpen)
        : 0;
    }

    const stockAfter = Math.max(0, h.stockAtResolve + produced + adjustment);
    totalProduced += produced;

    result.push({
      roleId: h.roleId,
      name: h.name,
      stockBefore: h.stockAtSubmitOpen,
      produced,
      transferred,
      adjustment,
      adjustmentReason: adj?.reason,
      stockAfter,
      sharePct: 0,
    });
  }

  for (const holder of result) {
    holder.sharePct = totalProduced > 0 ? Math.round((holder.produced / totalProduced) * 100) : 0;
  }

  return result;
}
