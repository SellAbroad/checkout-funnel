import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { fetchTodayHourly } from "../lib/api";

interface Props {
  selectedIds: Set<string>;
  timezone: string;
}

interface ChartRow {
  hour: number;
  todayTotal: number | undefined;
  todayCompleted: number | undefined;
  avgTotal: number;
  avgCompleted: number;
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function statusBadge(
  currentHour: number,
  today: { hour: number; total: number }[],
  avg: { hour: number; avgTotal: number }[],
): { label: string; color: string } | null {
  if (today.length === 0 || avg.length === 0) return null;

  const todayTotal = today.reduce((s, d) => s + d.total, 0);
  const avgTotal = avg
    .filter((d) => d.hour <= currentHour)
    .reduce((s, d) => s + d.avgTotal, 0);

  if (avgTotal === 0) return null;

  const pct = ((todayTotal - avgTotal) / avgTotal) * 100;
  if (pct >= 10) return { label: `+${pct.toFixed(0)}% above average`, color: "text-emerald-400" };
  if (pct <= -10) return { label: `${pct.toFixed(0)}% below average`, color: "text-red-400" };
  return { label: "On track", color: "text-gray-400" };
}

interface TooltipEntry {
  name: string;
  value: number | undefined;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length || label === undefined) return null;
  const hour = typeof label === "number" ? label : parseInt(String(label), 10);

  const groups: Record<string, { today?: number; avg?: number; color: string; label: string }> = {
    sessions: { color: "#6366f1", label: "Sessions" },
    completed: { color: "#10b981", label: "Completed" },
  };

  payload.forEach((p) => {
    if (p.name === "Sessions today") groups.sessions.today = p.value;
    if (p.name === "Avg sessions") groups.sessions.avg = p.value;
    if (p.name === "Completed today") groups.completed.today = p.value;
    if (p.name === "Avg completed") groups.completed.avg = p.value;
  });

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl min-w-[190px]">
      <p className="font-medium text-white mb-2">{formatHour(hour)} — cumulative</p>
      {Object.values(groups).map((g) => (
        <div key={g.label} className="mt-1.5">
          <p className="text-xs text-gray-400 mb-0.5">{g.label}</p>
          <div className="flex gap-4 items-baseline">
            {g.today !== undefined && (
              <span style={{ color: g.color }}>
                Today: <strong>{g.today}</strong>
              </span>
            )}
            {g.avg !== undefined && (
              <span className="text-gray-400">
                Avg: <strong>{g.avg}</strong>
              </span>
            )}
            {g.today !== undefined && g.avg !== undefined && g.avg > 0 && (
              <span className={g.today >= g.avg ? "text-emerald-400" : "text-red-400"}>
                {g.today >= g.avg ? "+" : ""}
                {(((g.today - g.avg) / g.avg) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TodayHourlyChart({ selectedIds, timezone }: Props) {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [currentHour, setCurrentHour] = useState(0);
  const [todayRaw, setTodayRaw] = useState<{ hour: number; total: number }[]>([]);
  const [avgRaw, setAvgRaw] = useState<{ hour: number; avgTotal: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (selectedIds.size === 0) {
      setChartData([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        merchant_ids: Array.from(selectedIds).join(","),
        timezone,
      };
      const res = await fetchTodayHourly(params);

      setCurrentHour(res.currentHour);
      setTodayRaw(res.today);
      setAvgRaw(res.average);

      const todayMap = new Map(res.today.map((d) => [d.hour, d]));
      const avgMap = new Map(res.average.map((d) => [d.hour, d]));

      let cumTodayTotal = 0;
      let cumTodayCompleted = 0;
      let cumAvgTotal = 0;
      let cumAvgCompleted = 0;

      const rows: ChartRow[] = Array.from({ length: 24 }, (_, h) => {
        const t = todayMap.get(h);
        const a = avgMap.get(h);

        cumAvgTotal = Math.round((cumAvgTotal + Number(a?.avgTotal ?? 0)) * 10) / 10;
        cumAvgCompleted = Math.round((cumAvgCompleted + Number(a?.avgCompleted ?? 0)) * 10) / 10;

        if (h <= res.currentHour) {
          cumTodayTotal += Number(t?.total ?? 0);
          cumTodayCompleted += Number(t?.completed ?? 0);
        }

        return {
          hour: h,
          todayTotal: h <= res.currentHour ? cumTodayTotal : undefined,
          todayCompleted: h <= res.currentHour ? cumTodayCompleted : undefined,
          avgTotal: cumAvgTotal,
          avgCompleted: cumAvgCompleted,
        };
      });

      setChartData(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedIds, timezone]);

  useEffect(() => {
    load();
  }, [load]);

  const badge = statusBadge(currentHour, todayRaw, avgRaw);

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Today vs. Historical Average</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cumulative sessions today vs. 30-day daily average &middot; up to {formatHour(currentHour)}
          </p>
        </div>
        {badge && !loading && (
          <span className={`text-sm font-medium px-3 py-1.5 rounded-lg bg-gray-800 ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>

      {loading && <div className="h-72 animate-pulse rounded-lg bg-gray-800" />}

      {!loading && error && (
        <div className="h-72 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div className="h-72 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Select at least one merchant</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#9ca3af", paddingTop: "12px" }} />

              <ReferenceLine
                x={currentHour}
                stroke="#4b5563"
                strokeDasharray="4 2"
                label={{ value: "now", position: "insideTopRight", fill: "#6b7280", fontSize: 11 }}
              />

              <Line
                type="monotone"
                dataKey="avgTotal"
                name="Avg sessions"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                activeDot={{ r: 3, fill: "#6366f1" }}
              />
              <Line
                type="monotone"
                dataKey="avgCompleted"
                name="Avg completed"
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                activeDot={{ r: 3, fill: "#10b981" }}
              />
              <Line
                type="monotone"
                dataKey="todayTotal"
                name="Sessions today"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: "#6366f1" }}
              />
              <Line
                type="monotone"
                dataKey="todayCompleted"
                name="Completed today"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: "#10b981" }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-5 border-t-2 border-indigo-500" />
              <span>Today (solid)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 border-t-[1.5px] border-indigo-500 border-dashed" />
              <span>30-day avg (dashed)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span>Sessions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span>Completed</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
