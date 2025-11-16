'use client';

import { LineChart } from '@tremor/react';
import { RoundResult, Company, ChartDataPoint } from '@/lib/types';
import { formatNumber } from '@/lib/calculations';

interface AlignmentGapChartProps {
  roundHistory: RoundResult[];
  companies: Company[];
}

export default function AlignmentGapChart({ roundHistory, companies }: AlignmentGapChartProps) {
  // Transform data for Tremor LineChart
  const chartData: ChartDataPoint[] = roundHistory.map((round) => {
    const dataPoint: ChartDataPoint = { round: round.roundNumber };

    round.companies.forEach((company) => {
      dataPoint[company.companyName] = company.alignmentGap / 1_000_000; // Convert to millions
    });

    return dataPoint;
  });

  const categories = companies.map((c) => c.name);
  const colors = companies.map((c) => {
    // Convert hex to Tremor color name (approximate)
    // Tremor supports: blue, cyan, emerald, amber, red, pink, purple, etc.
    const color = c.color || '#6b7280'; // Default to gray if undefined
    if (color.includes('3b82f6')) return 'blue';
    if (color.includes('a855f7')) return 'purple';
    if (color.includes('ef4444')) return 'red';
    if (color.includes('10b981')) return 'emerald';
    if (color.includes('f59e0b')) return 'amber';
    return 'slate';
  });

  return (
    <div>
      <LineChart
        data={chartData}
        index="round"
        categories={categories}
        colors={colors as any}
        valueFormatter={(value) => `${value.toFixed(1)}M`}
        yAxisWidth={60}
        showLegend={true}
        showGridLines={true}
        showAnimation={true}
      />
      <p className="text-xs text-gray-500 mt-2 text-center">
        Alignment Gap over rounds (in millions of points)
      </p>
    </div>
  );
}
