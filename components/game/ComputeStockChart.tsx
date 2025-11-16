'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { RoundResult, Company } from '@/lib/types';

interface ComputeStockChartProps {
  roundHistory: RoundResult[];
  companies: Company[];
}

interface ChartDataPoint {
  round: number;
  [companyName: string]: number;
}

// Company colors matching the table
const COMPANY_COLORS: Record<string, string> = {
  'OpenBrain': '#3b82f6',      // blue
  'DeepCent': '#ef4444',       // red
  'Conscienta': '#a855f7',     // purple
  'Other US Labs': '#10b981',  // emerald
  'Rest of World': '#f59e0b',  // amber
};

export default function ComputeStockChart({ roundHistory, companies }: ComputeStockChartProps) {
  // Build chart data: Quarter 0 + each completed quarter
  const chartData: ChartDataPoint[] = [];

  // Track cumulative stock for each company
  const cumulativeStock: Record<string, number> = {};

  // Initialize starting stock for all companies (Quarter 0)
  companies.forEach((company) => {
    // Calculate total acquired across all rounds
    const totalAcquired = roundHistory.reduce((sum, round) => {
      const snapshot = round.companies.find(s => s.companyId === company.id);
      return sum + (snapshot?.computeReceived || 0);
    }, 0);

    // Starting stock = current stock - all acquisitions
    const startingStock = company.computeAllocated - totalAcquired;
    cumulativeStock[company.name] = startingStock;
  });

  // Add Quarter 0 data point
  const round0: ChartDataPoint = { round: 0 };
  companies.forEach((company) => {
    round0[company.name] = cumulativeStock[company.name] / 1_000_000;
  });
  chartData.push(round0);

  // Add data for each completed quarter
  roundHistory.forEach((round) => {
    const dataPoint: ChartDataPoint = { round: round.roundNumber };

    // Update cumulative stock for each company with this quarter's acquisition
    companies.forEach((company) => {
      const snapshot = round.companies.find(s => s.companyId === company.id);
      if (snapshot) {
        cumulativeStock[company.name] += snapshot.computeReceived;
      }
      // Add to data point
      dataPoint[company.name] = cumulativeStock[company.name] / 1_000_000;
    });

    chartData.push(dataPoint);
  });

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="round"
            label={{ value: 'Quarter', position: 'bottom', offset: 0 }}
            tick={{ fill: '#374151', fontSize: 12 }}
          />
          <YAxis
            label={{ value: 'H100e (Millions)', angle: -90, position: 'insideLeft', offset: 10 }}
            tick={{ fill: '#374151', fontSize: 12 }}
            tickFormatter={(value) => `${value}M`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toFixed(1)}M H100e`, name]}
            labelFormatter={(label) => `Quarter ${label}`}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              padding: '8px 12px',
            }}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          {companies.map((company) => (
            <Line
              key={company.id}
              type="monotone"
              dataKey={company.name}
              stroke={COMPANY_COLORS[company.name] || '#6b7280'}
              strokeWidth={2.5}
              dot={{ r: 4, fill: COMPANY_COLORS[company.name] || '#6b7280' }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-500 mt-2 text-center">
        Total compute stock over quarters (in millions of H100e)
      </p>
    </div>
  );
}
