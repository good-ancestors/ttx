'use client';

import { useState, useEffect } from 'react';
import { GameState, Company } from '@/lib/types';
import { calculateRoundResults, formatNumber } from '@/lib/calculations';
import { COMPUTE_GROWTH_RATE } from '@/lib/constants';
import CompanyCard from '@/components/game/CompanyCard';
import CombinedAllocator from '@/components/admin/CombinedAllocator';
import ComputeStockChart from '@/components/game/ComputeStockChart';

interface FacilitatorDashboardProps {
  gameState: GameState;
  onUpdate: (newState: GameState) => void;
  onReset: () => void;
}

export default function FacilitatorDashboard({
  gameState,
  onUpdate,
  onReset,
}: FacilitatorDashboardProps) {
  // Calculate NEW compute available this round
  const newComputeThisRound = gameState.currentRound === 1
    ? gameState.globalCompute // Round 1 has initial compute to allocate
    : Math.round(gameState.globalCompute * (COMPUTE_GROWTH_RATE - 1));

  const [computeAllocations, setComputeAllocations] = useState<Record<string, number>>(() => {
    // Smart default: distribute proportionally based on current total compute
    const totalCurrentCompute = gameState.companies.reduce((sum, c) => sum + c.computeAllocated, 0);

    if (totalCurrentCompute === 0) {
      // Round 1 or companies have no compute yet - distribute evenly
      return Object.fromEntries(
        gameState.companies.map((c) => [
          c.id,
          Math.round(newComputeThisRound / gameState.companies.length)
        ])
      );
    } else {
      // Later rounds: distribute proportionally
      return Object.fromEntries(
        gameState.companies.map((c) => [
          c.id,
          Math.round((c.computeAllocated / totalCurrentCompute) * newComputeThisRound)
        ])
      );
    }
  });

  const [narrative, setNarrative] = useState('');

  // Update allocations when round changes
  useEffect(() => {
    const totalCurrentCompute = gameState.companies.reduce((sum, c) => sum + c.computeAllocated, 0);

    if (totalCurrentCompute === 0) {
      // Round 1 or no existing compute - distribute evenly
      setComputeAllocations(Object.fromEntries(
        gameState.companies.map((c) => [
          c.id,
          Math.round(newComputeThisRound / gameState.companies.length)
        ])
      ));
    } else {
      // Later rounds - distribute proportionally
      setComputeAllocations(Object.fromEntries(
        gameState.companies.map((c) => [
          c.id,
          Math.round((c.computeAllocated / totalCurrentCompute) * newComputeThisRound)
        ])
      ));
    }
  }, [gameState.currentRound, gameState.companies, newComputeThisRound]);

  function handleCalculateRound() {
    // Pass only the NEW compute allocations
    const { updatedCompanies, roundResult } = calculateRoundResults(
      gameState.companies,
      computeAllocations,
      gameState.currentRound,
      narrative
    );

    const newState: GameState = {
      ...gameState,
      companies: updatedCompanies,
      roundHistory: [...gameState.roundHistory, roundResult],
      updatedAt: new Date().toISOString(),
    };

    onUpdate(newState);
    setNarrative('');
  }

  function handleNextRound() {
    if (gameState.currentRound >= gameState.totalRounds) {
      alert('Game completed! All rounds have been played.');
      return;
    }

    const nextGlobalCompute = Math.round(gameState.globalCompute * COMPUTE_GROWTH_RATE);

    const newState: GameState = {
      ...gameState,
      currentRound: gameState.currentRound + 1,
      globalCompute: nextGlobalCompute,
      updatedAt: new Date().toISOString(),
    };

    onUpdate(newState);
  }

  function handleUpdateCompany(company: Company) {
    const updated = gameState.companies.map((c) =>
      c.id === company.id ? company : c
    );

    onUpdate({
      ...gameState,
      companies: updated,
      updatedAt: new Date().toISOString(),
    });
  }

  const isRoundComplete = gameState.roundHistory.length >= gameState.currentRound;
  const totalNewCompute = Object.values(computeAllocations).reduce((sum, val) => sum + val, 0);
  const canCalculate = !isRoundComplete && totalNewCompute <= newComputeThisRound;

  return (
    <div className="max-w-7xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">
            {gameState.name}
          </h1>
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 no-print"
          >
            Reset Game
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="font-semibold">
            Quarter {gameState.currentRound} of {gameState.totalRounds}
          </span>
          <span>•</span>
          <span>{gameState.companies.length} Companies</span>
          <span>•</span>
          <span className="text-green-600 font-semibold">
            Compute to Allocate: {formatNumber(newComputeThisRound)}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {/* Combined Allocator - Full Width */}
        {!isRoundComplete && (
          <div className="bg-white rounded-lg shadow-lg p-6 no-print">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Quarter {gameState.currentRound} Allocation
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {gameState.currentRound === 1
                  ? 'Allocate new compute and set R&D/Safety strategy'
                  : 'Allocate new compute that becomes available this quarter'}
              </p>
            </div>
            <CombinedAllocator
              companies={gameState.companies}
              computeAllocations={computeAllocations}
              totalCompute={newComputeThisRound}
              onComputeUpdate={setComputeAllocations}
              onCompanyUpdate={handleUpdateCompany}
            />
          </div>
        )}

        {/* Controls Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
          {/* Narrative Input */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Quarter Narrative (Optional)
            </h2>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Describe what happened this quarter..."
              className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isRoundComplete}
            />
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Actions
            </h2>
            <div className="space-y-2">
              <button
                onClick={handleCalculateRound}
                disabled={!canCalculate}
                className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isRoundComplete ? 'Quarter Complete' : 'Calculate Quarter'}
              </button>

              {isRoundComplete && gameState.currentRound < gameState.totalRounds && (
                <button
                  onClick={handleNextRound}
                  className="w-full px-4 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700"
                >
                  Next Quarter →
                </button>
              )}

              {gameState.currentRound >= gameState.totalRounds && isRoundComplete && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md text-center">
                  <p className="text-green-800 font-semibold">
                    Game Complete!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Stats
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Compute:</span>
                <span className="font-semibold">{formatNumber(gameState.companies.reduce((sum, c) => sum + c.computeAllocated, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total R&D Points:</span>
                <span className="font-semibold">{formatNumber(gameState.companies.reduce((sum, c) => sum + c.totalRDPoints, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Safety Points:</span>
                <span className="font-semibold">{formatNumber(gameState.companies.reduce((sum, c) => sum + c.totalSafetyPoints, 0))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        {gameState.roundHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Total Compute Stock Over Time
            </h2>
            <ComputeStockChart
              roundHistory={gameState.roundHistory}
              companies={gameState.companies}
            />
          </div>
        )}

        {/* Round History */}
        {gameState.roundHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Quarter History
            </h2>
            <div className="space-y-4">
              {gameState.roundHistory.map((round) => (
                <div
                  key={round.roundNumber}
                  className="border-l-4 border-blue-500 pl-4 py-2"
                >
                  <div className="font-semibold text-gray-900">
                    Quarter {round.roundNumber}
                  </div>
                  {round.narrative && (
                    <p className="text-sm text-gray-600 mt-1">{round.narrative}</p>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Total Compute Distributed: {formatNumber(round.globalCompute)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
