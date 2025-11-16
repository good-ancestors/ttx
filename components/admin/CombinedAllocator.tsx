'use client';

import { Company } from '@/lib/types';
import { formatNumber } from '@/lib/calculations';

interface CombinedAllocatorProps {
  companies: Company[];
  computeAllocations: Record<string, number>;
  totalCompute: number;
  onComputeUpdate: (allocations: Record<string, number>) => void;
  onCompanyUpdate: (company: Company) => void;
}

export default function CombinedAllocator({
  companies,
  computeAllocations,
  totalCompute,
  onComputeUpdate,
  onCompanyUpdate,
}: CombinedAllocatorProps) {
  const totalAllocated = Object.values(computeAllocations).reduce((sum, val) => sum + val, 0);
  const remaining = totalCompute - totalAllocated;
  const isOverAllocated = remaining < 0;

  function handleComputeChange(companyId: string, value: number) {
    onComputeUpdate({
      ...computeAllocations,
      [companyId]: value,
    });
  }

  function handleAllocationChange(
    company: Company,
    field: 'allocationRD' | 'allocationSafety',
    value: number
  ) {
    const newValue = Math.max(0, Math.min(1, value));
    const otherField = field === 'allocationRD' ? 'allocationSafety' : 'allocationRD';
    const otherValue = company[otherField];

    // Ensure total doesn't exceed 1.0
    if (newValue + otherValue > 1.0) {
      return;
    }

    const usersAllocation = Math.max(0, 1.0 - newValue - otherValue);

    onCompanyUpdate({
      ...company,
      [field]: newValue,
      allocationUsers: usersAllocation,
    });
  }

  function handleDistributeEvenly() {
    const perCompany = Math.floor(totalCompute / companies.length);
    const newAllocations = Object.fromEntries(
      companies.map((c) => [c.id, perCompany])
    );
    onComputeUpdate(newAllocations);
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
        <div className="text-xs uppercase tracking-wide text-gray-600 mb-2">
          New Compute Available This Quarter
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-gray-700">Total Available:</span>
          <span className="text-2xl font-bold text-green-700">{formatNumber(totalCompute)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-green-200">
          <div className="text-sm">
            <span className="text-gray-600">Allocated:</span>
            <span className="ml-2 font-semibold">{formatNumber(totalAllocated)}</span>
          </div>
          <div className="text-sm text-right">
            <span className="text-gray-600">Remaining:</span>
            <span className={`ml-2 font-semibold ${isOverAllocated ? 'text-red-600' : 'text-green-600'}`}>
              {formatNumber(remaining)}
            </span>
          </div>
        </div>
      </div>

      {isOverAllocated && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          ⚠️ Over-allocated! Reduce compute to proceed.
        </div>
      )}

      {/* Combined Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Company
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Stock
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Acquired
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                R&D %
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Safety %
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Users %
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                R&D Multiplier
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Total R&D
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Total Safety
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Alignment Gap
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Risk
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {companies.map((company) => {
              const acquired = computeAllocations[company.id] || 0;
              const endTotal = company.computeAllocated + acquired;

              const riskColors = {
                ok: 'bg-green-100 text-green-800',
                elevated: 'bg-yellow-100 text-yellow-800',
                high: 'bg-orange-100 text-orange-800',
                critical: 'bg-red-100 text-red-800',
              };

              return (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: company.color }}
                      />
                      <div>
                        <div className="font-medium text-gray-900">{company.name}</div>
                        <div className="text-xs text-gray-500">
                          End: {formatNumber(endTotal)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-sm font-medium text-gray-700">
                      {formatNumber(company.computeAllocated)}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      value={acquired}
                      onChange={(e) => handleComputeChange(company.id, parseInt(e.target.value) || 0)}
                      min="0"
                      max={totalCompute}
                      step="1000000"
                      className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent text-center text-sm font-semibold"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      value={(company.allocationRD * 100).toFixed(0)}
                      onChange={(e) => handleAllocationChange(company, 'allocationRD', parseFloat(e.target.value) / 100 || 0)}
                      min="0"
                      max="100"
                      step="5"
                      className="w-16 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-sm"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      value={(company.allocationSafety * 100).toFixed(0)}
                      onChange={(e) => handleAllocationChange(company, 'allocationSafety', parseFloat(e.target.value) / 100 || 0)}
                      min="0"
                      max="100"
                      step="5"
                      className="w-16 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-sm"
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="text-sm font-medium text-gray-700">
                      {(company.allocationUsers * 100).toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-sm font-semibold text-blue-600">
                      {company.rdMultiplier.toFixed(2)}x
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-sm text-gray-700">
                      {formatNumber(company.totalRDPoints)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-sm text-gray-700">
                      {formatNumber(company.totalSafetyPoints)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatNumber(company.alignmentGap)}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full uppercase ${riskColors[company.riskLevel]}`}>
                      {company.riskLevel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quick Actions */}
      <button
        onClick={handleDistributeEvenly}
        className="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
      >
        Distribute Evenly
      </button>
    </div>
  );
}
