/**
 * Type definitions for AI 2027 TTX
 * All game state, company data, and round result interfaces
 */

export type RiskLevel = 'ok' | 'elevated' | 'high' | 'critical';

/**
 * Company represents an AI lab in the simulation
 */
export interface Company {
  id: string;
  name: string;
  color: string; // Hex color for chart visualization

  // Current round allocations (percentages as decimals 0-1)
  allocationRD: number;      // % allocated to R&D
  allocationSafety: number;  // % allocated to Safety
  allocationUsers: number;   // % allocated to Users (auto-calculated)

  // Current round compute
  computeAllocated: number;  // H100e allocated this round

  // Accumulated totals (never reset, only increase)
  totalRDPoints: number;
  totalSafetyPoints: number;

  // Derived metrics
  baseMultiplier: number;    // Starting multiplier based on company position (1.5, 2.0, or 3.0)
  rdMultiplier: number;      // baseMultiplier + (totalRDPoints × 0.000002)
  alignmentGap: number;      // totalRDPoints - totalSafetyPoints
  riskLevel: RiskLevel;
}

/**
 * Snapshot of a company's state at the end of a round
 */
export interface CompanySnapshot {
  companyId: string;
  companyName: string;
  color: string;

  // Round inputs
  computeReceived: number;
  percentRD: number;
  percentSafety: number;

  // Points gained this round
  newRDPoints: number;
  newSafetyPoints: number;

  // Ending state after round
  totalRDPoints: number;
  totalSafetyPoints: number;
  rdMultiplier: number;
  alignmentGap: number;
  riskLevel: RiskLevel;
}

/**
 * Results from a completed round
 */
export interface RoundResult {
  roundNumber: number;
  globalCompute: number;
  narrative: string;
  companies: CompanySnapshot[];
  timestamp: string;
}

/**
 * Complete game state (stored in localStorage)
 */
export interface GameState {
  id: string;
  name: string;
  currentRound: number;
  totalRounds: number;
  globalCompute: number;

  companies: Company[];
  roundHistory: RoundResult[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Chart data format for Tremor LineChart
 */
export interface ChartDataPoint {
  round: number;
  [companyName: string]: number; // Dynamic keys for each company
}
