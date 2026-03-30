import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { FunnelResponse } from "../lib/api";

interface Props {
  funnel: FunnelResponse | null;
  loading: boolean;
}

const COLORS = [
  "#6366f1", // indigo
  "#818cf8",
  "#a78bfa",
  "#c084fc",
  "#e879f9",
  "#f472b6",
  "#fb7185",
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; count: number; percentOfTotal: number; dropoffRate: number } }> }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl">
      <p className="font-medium text-white">{data.label}</p>
      <p className="text-gray-300 mt-1">
        {data.count.toLocaleString()} sessions ({data.percentOfTotal.toFixed(1)}%)
      </p>
      {data.dropoffRate > 0 && (
        <p className="text-red-400 mt-0.5">
          {data.dropoffRate}% dropped from previous step
        </p>
      )}
    </div>
  );
}

export default function FunnelChart({ funnel, loading }: Props) {
  if (loading || !funnel) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 h-80 animate-pulse" />
    );
  }

  if (funnel.totalSessions === 0) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 h-80 flex items-center justify-center">
        <p className="text-gray-500">No data for the selected filters</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Checkout Funnel</h2>
        <span className="text-sm text-gray-400">
          {funnel.totalSessions.toLocaleString()} total sessions
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={funnel.funnel}
          margin={{ top: 5, right: 20, bottom: 5, left: 20 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {funnel.funnel.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 flex flex-wrap gap-3">
        {funnel.funnel.map((step, idx) => (
          <div
            key={step.step}
            className="flex items-center gap-2 text-xs text-gray-400"
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <span>{step.label}</span>
            {step.dropoffRate > 0 && (
              <span className="text-red-400">-{step.dropoffRate}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
