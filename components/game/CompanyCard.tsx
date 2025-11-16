'use client';

import { Company } from '@/lib/types';
import { formatNumber, formatPercentage } from '@/lib/calculations';
import { RISK_COLORS } from '@/lib/constants';

interface CompanyCardProps {
  company: Company;
}

export default function CompanyCard({ company }: CompanyCardProps) {
  const riskColor = RISK_COLORS[company.riskLevel];

  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: company.color }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
        <div
          className="px-3 py-1 rounded-full text-xs font-semibold uppercase"
          style={{
            backgroundColor: `${riskColor}20`,
            color: riskColor,
          }}
        >
          {company.riskLevel}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500 uppercase mb-1">Total R&D</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatNumber(company.totalRDPoints)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 uppercase mb-1">Total Safety</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatNumber(company.totalSafetyPoints)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 uppercase mb-1">Multiplier</div>
          <div className="text-lg font-semibold text-blue-600">
            {company.rdMultiplier.toFixed(2)}x
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 uppercase mb-1">Alignment Gap</div>
          <div className="text-lg font-semibold" style={{ color: riskColor }}>
            {formatNumber(company.alignmentGap)}
          </div>
        </div>
      </div>

      {/* Allocations */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 uppercase mb-2">Current Allocations</div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">R&D:</span>
            <span className="font-medium">{formatPercentage(company.allocationRD)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Safety:</span>
            <span className="font-medium">{formatPercentage(company.allocationSafety)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Users:</span>
            <span className="font-medium">{formatPercentage(company.allocationUsers)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
