/**
 * Core game calculations for AI 2027 TTX
 * All functions are pure - no side effects
 */

import { Company, CompanySnapshot, RiskLevel, RoundResult } from './types';
import { RISK_THRESHOLDS } from './constants';

/**
 * Calculate R&D multiplier based on total accumulated R&D points
 * Formula: baseMultiplier + (totalRD × 0.000002)
 * Base multiplier varies by company based on their starting position in the AI race
 */
export function calculateMultiplier(totalRDPoints: number, baseMultiplier: number): number {
  return baseMultiplier + (totalRDPoints * 0.000002);
}

/**
 * Determine risk level based on alignment gap
 */
export function calculateRiskLevel(alignmentGap: number): RiskLevel {
  if (alignmentGap > RISK_THRESHOLDS.critical) return 'critical';
  if (alignmentGap > RISK_THRESHOLDS.high) return 'high';
  if (alignmentGap > RISK_THRESHOLDS.elevated) return 'elevated';
  return 'ok';
}

/**
 * Calculate new points gained in a round
 */
export function calculateRoundPoints(
  computeAllocated: number,
  rdAllocation: number,
  safetyAllocation: number,
  currentMultiplier: number
): { newRDPoints: number; newSafetyPoints: number } {
  const rdCompute = computeAllocated * rdAllocation;
  const safetyCompute = computeAllocated * safetyAllocation;

  return {
    newRDPoints: rdCompute * currentMultiplier,
    newSafetyPoints: safetyCompute * 1.0, // Safety has no multiplier
  };
}

/**
 * Update a company's state after a round
 * Returns a new Company object (immutable)
 */
export function calculateCompanyUpdate(
  company: Company,
  computeAllocated: number
): Company {
  const currentMultiplier = calculateMultiplier(company.totalRDPoints, company.baseMultiplier);

  const { newRDPoints, newSafetyPoints } = calculateRoundPoints(
    computeAllocated,
    company.allocationRD,
    company.allocationSafety,
    currentMultiplier
  );

  const totalRDPoints = company.totalRDPoints + newRDPoints;
  const totalSafetyPoints = company.totalSafetyPoints + newSafetyPoints;
  const alignmentGap = totalRDPoints - totalSafetyPoints;
  const newMultiplier = calculateMultiplier(totalRDPoints, company.baseMultiplier);

  return {
    ...company,
    computeAllocated,
    totalRDPoints,
    totalSafetyPoints,
    rdMultiplier: newMultiplier,
    alignmentGap,
    riskLevel: calculateRiskLevel(alignmentGap),
  };
}

/**
 * Create a snapshot of a company's state for round results
 */
export function createCompanySnapshot(
  company: Company,
  computeReceived: number,
  newRDPoints: number,
  newSafetyPoints: number
): CompanySnapshot {
  return {
    companyId: company.id,
    companyName: company.name,
    color: company.color,
    computeReceived,
    percentRD: company.allocationRD,
    percentSafety: company.allocationSafety,
    newRDPoints,
    newSafetyPoints,
    totalRDPoints: company.totalRDPoints,
    totalSafetyPoints: company.totalSafetyPoints,
    rdMultiplier: company.rdMultiplier,
    alignmentGap: company.alignmentGap,
    riskLevel: company.riskLevel,
  };
}

/**
 * Calculate complete round results for all companies
 */
export function calculateRoundResults(
  companies: Company[],
  computeAllocations: Record<string, number>,
  roundNumber: number,
  narrative: string
): { updatedCompanies: Company[]; roundResult: RoundResult } {
  const snapshots: CompanySnapshot[] = [];
  const updatedCompanies: Company[] = [];

  companies.forEach((company) => {
    const newComputeReceived = computeAllocations[company.id] || 0;
    const totalStock = company.computeAllocated + newComputeReceived;
    const currentMultiplier = calculateMultiplier(company.totalRDPoints, company.baseMultiplier);

    const { newRDPoints, newSafetyPoints } = calculateRoundPoints(
      totalStock,
      company.allocationRD,
      company.allocationSafety,
      currentMultiplier
    );

    const updatedCompany = calculateCompanyUpdate(company, totalStock);
    updatedCompanies.push(updatedCompany);

    snapshots.push(
      createCompanySnapshot(updatedCompany, newComputeReceived, newRDPoints, newSafetyPoints)
    );
  });

  const roundResult: RoundResult = {
    roundNumber,
    globalCompute: Object.values(computeAllocations).reduce((sum, val) => sum + val, 0),
    narrative,
    companies: snapshots,
    timestamp: new Date().toISOString(),
  };

  return { updatedCompanies, roundResult };
}

/**
 * Validate that allocations sum to <= 1.0
 */
export function validateAllocations(
  rdAllocation: number,
  safetyAllocation: number
): { valid: boolean; error?: string } {
  const total = rdAllocation + safetyAllocation;

  if (rdAllocation < 0 || safetyAllocation < 0) {
    return { valid: false, error: 'Allocations cannot be negative' };
  }

  if (total > 1.0) {
    return { valid: false, error: 'R&D + Safety cannot exceed 100%' };
  }

  return { valid: true };
}

/**
 * Calculate Users allocation (auto-calculated)
 */
export function calculateUsersAllocation(
  rdAllocation: number,
  safetyAllocation: number
): number {
  return Math.max(0, 1.0 - rdAllocation - safetyAllocation);
}

/**
 * Format large numbers for display (e.g., 10000000 => "10.0M")
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

/**
 * Format percentage (decimal to percentage string)
 */
export function formatPercentage(decimal: number): string {
  return `${(decimal * 100).toFixed(0)}%`;
}
