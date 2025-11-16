'use client';

import { useState } from 'react';
import { DEFAULT_COMPANIES } from '@/lib/constants';

interface GameSetupProps {
  onStart: (gameName: string, selectedCompanies: typeof DEFAULT_COMPANIES) => void;
}

interface CompanySelection {
  name: string;
  compute: number;
  rdAllocation: number;
  safetyAllocation: number;
  selected: boolean;
}

export default function GameSetup({ onStart }: GameSetupProps) {
  const [gameName, setGameName] = useState('AI 2027 TTX Session');
  const [companies, setCompanies] = useState<CompanySelection[]>(
    DEFAULT_COMPANIES.map(c => ({ ...c, selected: true }))
  );

  function handleToggleCompany(index: number) {
    const updated = [...companies];
    updated[index].selected = !updated[index].selected;
    setCompanies(updated);
  }

  function handleComputeChange(index: number, value: number) {
    const updated = [...companies];
    updated[index].compute = value;
    setCompanies(updated);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const selected = companies.filter(c => c.selected);

    if (selected.length < 2) {
      alert('Please select at least 2 companies');
      return;
    }

    onStart(gameName, selected as any);
  }

  const selectedCount = companies.filter(c => c.selected).length;
  const totalCompute = companies
    .filter(c => c.selected)
    .reduce((sum, c) => sum + c.compute, 0);

  return (
    <div className="max-w-3xl w-full bg-white rounded-lg shadow-lg p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        AI 2027 Tabletop Exercise
      </h1>
      <p className="text-gray-600 mb-8">
        Facilitator Dashboard - Configure your game
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="gameName" className="block text-sm font-medium text-gray-700 mb-2">
            Game Name
          </label>
          <input
            id="gameName"
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select AI Companies ({selectedCount} selected)
          </label>
          <div className="space-y-3">
            {companies.map((company, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 transition-all ${
                  company.selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={company.selected}
                    onChange={() => handleToggleCompany(index)}
                    className="mt-1 h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                  />

                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-gray-900">{company.name}</h3>
                      <div className="text-sm text-gray-600">
                        R&D: {(company.rdAllocation * 100).toFixed(0)}% |
                        Safety: {(company.safetyAllocation * 100).toFixed(0)}%
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-600">
                        Starting Compute (H100e):
                      </label>
                      <input
                        type="number"
                        value={company.compute}
                        onChange={(e) => handleComputeChange(index, parseInt(e.target.value) || 0)}
                        disabled={!company.selected}
                        step="1000000"
                        min="0"
                        className="px-3 py-1 border border-gray-300 rounded-md w-32 disabled:bg-gray-100"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        {(company.compute / 1_000_000).toFixed(0)}M
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-900">
                Total Starting Compute:
              </span>
              <span className="text-lg font-bold text-blue-600">
                {(totalCompute / 1_000_000).toFixed(0)}M H100e
              </span>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={selectedCount < 2}
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Start Game with {selectedCount} Companies
          </button>
        </div>
      </form>

      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <p className="text-sm text-blue-900 mb-2">
          <strong>How it works:</strong> Each quarter (~3 months), you'll simulate the dynamics of the AGI race:
        </p>
        <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
          <li><strong>Starting Stock:</strong> Companies begin with the compute you set here (e.g., OpenBrain: 20M H100e)</li>
          <li><strong>Each Quarter:</strong> NEW compute becomes available (50% growth per quarter, reaching 1.5x total)</li>
          <li><strong>Allocation:</strong> You distribute new compute based on market dynamics and strategic decisions</li>
          <li><strong>Strategy:</strong> Each company sets their R&D vs Safety vs Users investment split</li>
        </ul>
      </div>
    </div>
  );
}
