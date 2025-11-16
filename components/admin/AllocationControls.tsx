'use client';

import { useState } from 'react';
import { Company } from '@/lib/types';
import { validateAllocations, calculateUsersAllocation, formatPercentage } from '@/lib/calculations';

interface AllocationControlsProps {
  companies: Company[];
  onUpdate: (company: Company) => void;
}

export default function AllocationControls({ companies, onUpdate }: AllocationControlsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleAllocationChange(
    company: Company,
    rdAllocation: number,
    safetyAllocation: number
  ) {
    const validation = validateAllocations(rdAllocation, safetyAllocation);

    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    const usersAllocation = calculateUsersAllocation(rdAllocation, safetyAllocation);

    onUpdate({
      ...company,
      allocationRD: rdAllocation,
      allocationSafety: safetyAllocation,
      allocationUsers: usersAllocation,
    });
  }

  return (
    <div className="space-y-2">
      {companies.map((company) => {
        const isExpanded = expandedId === company.id;

        return (
          <div key={company.id} className="border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : company.id)}
              className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">{company.name}</span>
              <span className="text-sm text-gray-600">
                {formatPercentage(company.allocationRD)} R&D • {formatPercentage(company.allocationSafety)} Safety
              </span>
            </button>

            {isExpanded && (
              <div className="p-4 bg-white space-y-3">
                {/* R&D Slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    R&D: {formatPercentage(company.allocationRD)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={company.allocationRD * 100}
                    onChange={(e) =>
                      handleAllocationChange(
                        company,
                        parseInt(e.target.value) / 100,
                        company.allocationSafety
                      )
                    }
                    className="w-full"
                  />
                </div>

                {/* Safety Slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Safety: {formatPercentage(company.allocationSafety)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={company.allocationSafety * 100}
                    onChange={(e) =>
                      handleAllocationChange(
                        company,
                        company.allocationRD,
                        parseInt(e.target.value) / 100
                      )
                    }
                    className="w-full"
                  />
                </div>

                {/* Users (Auto) */}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Users (auto):</span>
                    <span className="font-medium">{formatPercentage(company.allocationUsers)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
