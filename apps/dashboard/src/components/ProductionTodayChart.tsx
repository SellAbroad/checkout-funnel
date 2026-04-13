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
import { fetchProductionTodayHourly } from "../lib/api";

interface Props {
  timezone: string;
  merchantIds?: string[] | undefined;
}

interface ChartRow {
  hour: number;
  todayOrders: number | undefined;
  todayGmv: number | undefined;
  avgOrders: number;
  avgGmv: number;
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function statusBadge(
  todayOrders: number,
  avgOrders: number,
  todayGmv: number,
  avgGmv: number,
): { label: string; color: string } | null {
  if (avgGmv === 0 && avgOrders === 0) return null;
  const base = avgGmv > 0 ? avgGmv : avgOrders;
  const current = avgGmv > 0 ? todayGmv : todayOrders;
  const pct = ((current - base) / base) * 100;
  if (pct >= 10) return { label: `+${pct.toFixed(0)}% above avg`, color: "text-emerald-400" };
  if (pct <= -10) return { label: `${pct.toFixed(0)}% below avg`, color: "text-red-400" };
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

  const groups: Record<string, { today?: number; avg?: number; color: string; label: string; isGmv?: boolean }> = {
    orders: { color: "#6366f1", label: "Orders" },
    gmv: { color: "#f59e0b", label: "GMV (USD)" },
  };

  payload.forEach((p) => {
    if (p.name === "Orders today") groups.orders.today = p.value;
    if (p.name === "Avg orders") groups.orders.avg = p.value;
    if (p.name === "GMV today") { groups.gmv.today = p.value; groups.gmv.isGmv = true; }
    if (p.name === "Avg GMV") { groups.gmv.avg = p.value; groups.gmv.isGmv = true; }
  });

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl min-w-[210px]">
      <p className="font-medium text-white mb-2">{formatHour(hour)} — cumulative</p>
      {Object.values(groups).map((g) => (
        <div key={g.label} className="mt-1.5">
          <p className="text-xs text-gray-400 mb-0.5">{g.label}</p>
          <div className="flex gap-3 items-baseline flex-wrap">
            {g.today !== undefined && (
              <span style={{ color: g.color }}>
                Today: <strong>{g.isGmv ? formatUsd(g.today) : g.today}</strong>
              </span>
            )}
            {g.avg !== undefined && (
              <span className="text-gray-400">
                Avg: <strong>{g.isGmv ? formatUsd(g.avg) : g.avg}</strong>
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

export default function ProductionTodayChart({ timezone, merchantIds }: Props) {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [currentHour, setCurrentHour] = useState(0);
  const [todayTotals, setTodayTotals] = useState({ orders: 0, gmv: 0 });
  const [avgTotals, setAvgTotals] = useState({ orders: 0, gmv: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { timezone };
      if (merchantIds && merchantIds.length > 0) {
        params.merchant_ids = merchantIds.join(",");
      }
      const res = await fetchProductionTodayHourly(params);

      setCurrentHour(res.currentHour);

      const todayMap = new Map(res.today.map((d) => [d.hour, d]));
      const avgMap = new Map(res.average.map((d) => [d.hour, d]));

      let cumTodayOrders = 0;
      let cumTodayGmv = 0;
      let cumAvgOrders = 0;
      let cumAvgGmv = 0;
      // Capture avg accumulated up to currentHour for an apples-to-apples summary card.
      let cumAvgOrdersAtNow = 0;
      let cumAvgGmvAtNow = 0;

      const rows: ChartRow[] = Array.from({ length: 24 }, (_, h) => {
        const t = todayMap.get(h);
        const a = avgMap.get(h);

        cumAvgOrders = Math.round((cumAvgOrders + Number(a?.avgOrders ?? 0)) * 100) / 100;
        cumAvgGmv = Math.round((cumAvgGmv + Number(a?.avgGmvUsd ?? 0)) * 100) / 100;

        if (h <= res.currentHour) {
          cumTodayOrders += Number(t?.orders ?? 0);
          cumTodayGmv = Math.round((cumTodayGmv + Number(t?.gmvUsd ?? 0)) * 100) / 100;
          cumAvgOrdersAtNow = cumAvgOrders;
          cumAvgGmvAtNow = cumAvgGmv;
        }

        return {
          hour: h,
          todayOrders: h <= res.currentHour ? cumTodayOrders : undefined,
          todayGmv: h <= res.currentHour ? cumTodayGmv : undefined,
          avgOrders: cumAvgOrders,
          avgGmv: cumAvgGmv,
        };
      });

      setTodayTotals({ orders: cumTodayOrders, gmv: cumTodayGmv });
      // Use avg-at-current-hour so the summary card compares the same time window as today.
      setAvgTotals({ orders: Math.round(cumAvgOrdersAtNow), gmv: Math.round(cumAvgGmvAtNow) });
      setChartData(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load production data");
    } finally {
      setLoading(false);
    }
  }, [timezone, merchantIds]);

  useEffect(() => {
    load();
  }, [load]);

  const badge = statusBadge(todayTotals.orders, avgTotals.orders, todayTotals.gmv, avgTotals.gmv);

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Orders — Today vs. Historical Average</h2>
            <span className="text-xs bg-indigo-900/60 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-md">
              Production
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Cumulative orders &amp; GMV (USD) today vs. 30-day daily average &middot; up to {formatHour(currentHour)}
          </p>
        </div>
        {badge && !loading && (
          <span className={`text-sm font-medium px-3 py-1.5 rounded-lg bg-gray-800 ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>

      {!loading && !error && chartData.length > 0 && (
        <div className="flex gap-6 mt-3 mb-4">
          <div>
            <p className="text-xs text-gray-500">Orders today</p>
            <p className="text-xl font-semibold text-white">{todayTotals.orders}</p>
            <p className="text-xs text-gray-500">avg {avgTotals.orders} by {formatHour(currentHour)}</p>
          </div>
          <div className="border-l border-gray-800 pl-6">
            <p className="text-xs text-gray-500">GMV today</p>
            <p className="text-xl font-semibold text-white">{formatUsd(todayTotals.gmv)}</p>
            <p className="text-xs text-gray-500">avg {formatUsd(avgTotals.gmv)} by {formatHour(currentHour)}</p>
            <p className="text-xs text-gray-600 mt-0.5">converted to USD via locked FX rates</p>
          </div>
        </div>
      )}

      {loading && <div className="h-72 animate-pulse rounded-lg bg-gray-800 mt-4" />}

      {!loading && error && (
        <div className="h-72 flex items-center justify-center mt-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={260}>
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
                yAxisId="orders"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <YAxis
                yAxisId="gmv"
                orientation="right"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={54}
                tickFormatter={formatUsd}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#9ca3af", paddingTop: "12px" }} />

              <ReferenceLine
                yAxisId="orders"
                x={currentHour}
                stroke="#4b5563"
                strokeDasharray="4 2"
                label={{ value: "now", position: "insideTopRight", fill: "#6b7280", fontSize: 11 }}
              />

              <Line
                yAxisId="orders"
                type="monotone"
                dataKey="avgOrders"
                name="Avg orders"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                activeDot={{ r: 3, fill: "#6366f1" }}
              />
              <Line
                yAxisId="gmv"
                type="monotone"
                dataKey="avgGmv"
                name="Avg GMV"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                activeDot={{ r: 3, fill: "#f59e0b" }}
              />
              <Line
                yAxisId="orders"
                type="monotone"
                dataKey="todayOrders"
                name="Orders today"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: "#6366f1" }}
              />
              <Line
                yAxisId="gmv"
                type="monotone"
                dataKey="todayGmv"
                name="GMV today"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: "#f59e0b" }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-3 flex items-center gap-6 text-xs text-gray-500">
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
              <span>Orders (left axis)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span>GMV USD (right axis)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
