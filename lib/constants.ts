/**
 * Default values and constants for AI 2027 TTX
 */

import { Company } from './types';

/**
 * Company color palette for charts
 */
export const COMPANY_COLORS = {
  OpenBrain: '#3b82f6',         // Blue
  Conscienta: '#a855f7',        // Purple
  DeepCent: '#ef4444',          // Red
  'Other US Labs': '#10b981',   // Green
  'Rest of World': '#f59e0b',   // Amber
} as const;

/**
 * Default company names and starting compute (H100e)
 */
export const DEFAULT_COMPANIES = [
  { name: 'OpenBrain', compute: 20_000_000, rdAllocation: 0.40, safetyAllocation: 0.03 },
  { name: 'DeepCent', compute: 15_000_000, rdAllocation: 0.45, safetyAllocation: 0.02 },
  { name: 'Conscienta', compute: 13_000_000, rdAllocation: 0.35, safetyAllocation: 0.05 },
  { name: 'Other US Labs', compute: 10_000_000, rdAllocation: 0.30, safetyAllocation: 0.10 },
  { name: 'Rest of World', compute: 14_000_000, rdAllocation: 0.25, safetyAllocation: 0.15 },
] as const;

/**
 * Game configuration defaults
 */
export const INITIAL_GLOBAL_COMPUTE = DEFAULT_COMPANIES.reduce((sum, c) => sum + c.compute, 0);
export const COMPUTE_GROWTH_RATE = 1.5;    // Multiplier per round
export const TOTAL_ROUNDS = 4;

/**
 * Starting R&D multipliers by company (January 2028 scenario start)
 * Based on AI 2027 research:
 * - OpenBrain: 3x (has Agent-2)
 * - Conscienta/DeepCent: 2x (3 months behind - October 2027 level)
 * - Other US Labs/Rest of World: 1.5x (6 months behind - July 2027 level)
 */
export const STARTING_RD_MULTIPLIERS = {
  'OpenBrain': 3.0,      // Leading with Agent-2
  'Conscienta': 2.0,     // 3 months behind
  'DeepCent': 2.0,       // Has stolen Agent-2 but still catching up
  'Other US Labs': 1.5,  // 6 months behind
  'Rest of World': 1.5,  // 6 months behind
} as const;

// Default multiplier for custom companies
export const DEFAULT_RD_MULTIPLIER = 2.0;

/**
 * Risk level thresholds (alignment gap in points)
 */
export const RISK_THRESHOLDS = {
  critical: 10_000_000,  // > 10M points
  high: 5_000_000,       // > 5M points
  elevated: 2_000_000,   // > 2M points
  ok: 0,                 // <= 2M points
} as const;

/**
 * Risk level colors for UI
 */
export const RISK_COLORS = {
  ok: '#10b981',       // Green
  elevated: '#f59e0b', // Amber/Yellow
  high: '#f97316',     // Orange
  critical: '#ef4444', // Red
} as const;

/**
 * Get starting R&D multiplier for a company based on its name
 */
export function getStartingMultiplier(companyName: string): number {
  const multiplierKey = companyName as keyof typeof STARTING_RD_MULTIPLIERS;
  return STARTING_RD_MULTIPLIERS[multiplierKey] || DEFAULT_RD_MULTIPLIER;
}

/**
 * Create a new company with default values
 */
export function createCompany(
  name: string,
  compute: number = 10_000_000,
  rdAllocation: number = 0.30,
  safetyAllocation: number = 0.10
): Company {
  const colorKey = name as keyof typeof COMPANY_COLORS;
  const color = COMPANY_COLORS[colorKey] || '#6b7280'; // Default gray if not found
  const usersAllocation = Math.max(0, 1.0 - rdAllocation - safetyAllocation);
  const startingMultiplier = getStartingMultiplier(name);

  return {
    id: `company-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    color,
    allocationRD: rdAllocation,
    allocationSafety: safetyAllocation,
    allocationUsers: usersAllocation,
    computeAllocated: compute,
    totalRDPoints: 0,
    totalSafetyPoints: 0,
    baseMultiplier: startingMultiplier,
    rdMultiplier: startingMultiplier,
    alignmentGap: 0,
    riskLevel: 'ok',
  };
}

/**
 * LocalStorage key for game state
 */
export const STORAGE_KEY = 'ttx-game-state';
