// ─── Unified compute distribution logic ─────────────────────────────────────
// Pure functions for computing per-round compute stock changes and starting
// compute allocation. Used by the pipeline, game creation, and tests.
//
// Source model: 80u total starting compute across 5 entities.
// 3 labs (22+17+14=53u) + 2 pools (11+16=27u) = 80u.
// New compute each round distributed via DEFAULT_COMPUTE_SHARES.

import {
  ROLES,
  NEW_COMPUTE_PER_GAME_ROUND,
  DEFAULT_LABS,
} from "./game-data";
import {
  calculatePoolAllocations,
  calculatePoolNewCompute,
} from "@convex/gameData";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComputeHolder {
  roleId: string;
  name: string;
  stockBefore: number;
  produced: number;
  transferred: number;
  adjustment: number;
  adjustmentReason?: string;
  stockAfter: number;
  override?: number;
  overrideReason?: string;
  sharePct: number;
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
 * Labs get compute from DEFAULT_LABS (53u).
 * Non-lab roles get compute from pool allocation (27u).
 * Total always = 80u.
 */
export function calculateStartingCompute(enabledRoleIds: Set<string>): {
  roleId: string;
  name: string;
  computeStock: number;

}[] {
  const result: { roleId: string; name: string; computeStock: number; pool?: string }[] = [];

  // Labs — fixed starting stock
  for (const lab of DEFAULT_LABS) {
    if (enabledRoleIds.has(lab.roleId)) {
      result.push({ roleId: lab.roleId, name: lab.name, computeStock: lab.computeStock });
    }
  }

  // Non-lab roles — pool allocations
  const poolAllocations = calculatePoolAllocations(enabledRoleIds);
  for (const [roleId, stock] of poolAllocations) {
    if (stock <= 0) continue;
    const role = ROLES.find((r) => r.id === roleId);
    if (!role) continue;
    result.push({ roleId, name: role.name, computeStock: stock });
  }

  return result;
}

// ─── Per-round compute distribution ─────────────────────────────────────────

/**
 * Build unified compute holders array for a round.
 *
 * Distribution:
 * - Labs: handled by computeLabGrowth (R&D dynamics), not this function
 * - Non-lab pool holders: get their pool's share from DEFAULT_COMPUTE_SHARES
 * - Share overrides: facilitator/narrative can override specific roles
 * - Adjustments: narrative-driven stock changes (destruction, seizure)
 */
export function buildComputeHolders(opts: {
  holders: ComputeHolderInput[];
  roundNumber: number;
  narrativeAdjustments: NarrativeAdjustment[];
  enabledRoleIds: Set<string>;
  shareOverrides?: Record<string, number>;
}): ComputeHolder[] {
  const { holders, roundNumber, narrativeAdjustments, enabledRoleIds, shareOverrides } = opts;
  const baselineTotal = NEW_COMPUTE_PER_GAME_ROUND[roundNumber] ?? 0;
  const adjustmentByName = new Map(narrativeAdjustments.map((a) => [a.name, a]));

  const result: ComputeHolder[] = [];
  let totalProduced = 0;

  for (const h of holders) {
    const transferred = h.stockAtResolve - h.stockAtSubmitOpen;
    const adj = adjustmentByName.get(h.name);
    const adjustment = adj?.change ?? 0;

    // Production: explicit override %, or pool share from DEFAULT_COMPUTE_SHARES
    let produced: number;
    const overridePct = shareOverrides?.[h.roleId];
    if (overridePct !== undefined) {
      produced = Math.round(baselineTotal * overridePct / 100);
    } else {
      produced = calculatePoolNewCompute(h.roleId, roundNumber, enabledRoleIds);
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
