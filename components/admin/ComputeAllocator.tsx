'use client';

import { Company } from '@/lib/types';
import { formatNumber } from '@/lib/calculations';

interface ComputeAllocatorProps {
  companies: Company[];
  allocations: Record<string, number>;
  totalCompute: number;
  onUpdate: (allocations: Record<string, number>) => void;
}

export default function ComputeAllocator({
  companies,
  allocations,
  totalCompute,
  onUpdate,
}: ComputeAllocatorProps) {
  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  const remaining = totalCompute - totalAllocated;
  const isOverAllocated = remaining < 0;

  function handleAllocationChange(companyId: string, value: number) {
    onUpdate({
      ...allocations,
      [companyId]: value,
    });
  }

  function handleDistributeEvenly() {
    const perCompany = Math.floor(totalCompute / companies.length);
    const newAllocations = Object.fromEntries(
      companies.map((c) => [c.id, perCompany])
    );
    onUpdate(newAllocations);
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
        <div className="text-xs uppercase tracking-wide text-gray-600 mb-2">
          Compute Available to Allocate
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

      {/* Company Allocations Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Company
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Stock
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Acquired
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {companies.map((company) => {
              const acquired = allocations[company.id] || 0;
              const endTotal = company.computeAllocated + acquired;

              return (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{company.name}</div>
                    <div className="text-xs text-gray-500">
                      End: {formatNumber(endTotal)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-sm font-medium text-gray-700">
                      {formatNumber(company.computeAllocated)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={acquired}
                      onChange={(e) => handleAllocationChange(company.id, parseInt(e.target.value) || 0)}
                      min="0"
                      max={totalCompute}
                      step="1000000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent text-center font-semibold"
                      placeholder="0"
                    />
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
