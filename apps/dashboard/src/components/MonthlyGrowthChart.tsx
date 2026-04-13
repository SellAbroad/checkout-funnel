import { useState, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { fetchMonthlyGrowth, type MerchantRow, type MonthlyGrowthResponse } from "../lib/api";
import { getMerchantName } from "../lib/merchants-map";

type Timezone = "UTC" | "Asia/Dubai";

interface Props {
  merchants: MerchantRow[];
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

interface ChartRow {
  day: number;
  previous: number | null;
  currentActual: number | null;
  currentForecast: number | null;
}

function buildChartRows(res: MonthlyGrowthResponse): ChartRow[] {
  const { points, cumulativeToDateUsd, todayDayOfMonth } = res;
  return points.map((p) => ({
    day: p.day,
    previous: p.previousMonthCumulative,
    currentActual: p.currentActual,
    currentForecast:
      p.day < todayDayOfMonth
        ? null
        : p.day === todayDayOfMonth
          ? cumulativeToDateUsd
          : p.currentForecast,
  }));
}

export default function MonthlyGrowthChart({ merchants }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [timezone, setTimezone] = useState<Timezone>("UTC");
  const [data, setData] = useState<MonthlyGrowthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const DEFAULT_SELECTED_NAMES = ["fizzy goblet", "genetra", "zariin", "sage by mala", "deployed"];

  useEffect(() => {
    if (!initialized.current && merchants.length > 0) {
      const defaultIds = merchants
        .filter((m) => {
          const name = getMerchantName(m.merchantId, m.shopUrl).toLowerCase();
          const shopUrl = (m.shopUrl ?? "").toLowerCase();
          if (shopUrl.includes("genetra")) return shopUrl.includes("genetra.io");
          return DEFAULT_SELECTED_NAMES.some((n) => name.includes(n) || shopUrl.includes(n));
        })
        .map((m) => m.merchantId);
      setSelectedIds(new Set(defaultIds.length > 0 ? defaultIds : merchants.map((m) => m.merchantId)));
      initialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchants]);

  const load = useCallback(async () => {
    if (selectedIds.size === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMonthlyGrowth({
        merchant_ids: Array.from(selectedIds).join(","),
        timezone,
      });
      setData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load monthly growth";
      setError(msg.includes("503") ? "Production database not configured (PRODUCTION_DATABASE_URL)" : msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedIds, timezone]);

  useEffect(() => {
    if (initialized.current) {
      load();
    }
  }, [load]);

  const toggleMerchant = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(merchants.map((m) => m.merchantId)));
  const deselectAll = () => setSelectedIds(new Set());

  const sortedMerchants = [...merchants].sort((a, b) =>
    getMerchantName(a.merchantId, a.shopUrl).localeCompare(getMerchantName(b.merchantId, b.shopUrl)),
  );

  const chartRows = data ? buildChartRows(data) : [];
  const todayDom = data?.todayDayOfMonth ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTimezone("UTC")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              timezone === "UTC" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            UTC
          </button>
          <button
            type="button"
            onClick={() => setTimezone("Asia/Dubai")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              timezone === "Asia/Dubai" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Dubai
          </button>
        </div>

        <div className="w-px h-4 bg-gray-700" />

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500">
            {selectedIds.size} / {merchants.length} merchants
          </span>
          <button type="button" onClick={selectAll} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            All
          </button>
          <button type="button" onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            None
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto flex-1">
          {sortedMerchants.map((m) => {
            const name = getMerchantName(m.merchantId, m.shopUrl);
            const checked = selectedIds.has(m.merchantId);
            return (
              <button
                key={m.merchantId}
                type="button"
                onClick={() => toggleMerchant(m.merchantId)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  checked
                    ? "bg-indigo-900/40 border-indigo-700 text-indigo-200"
                    : "border-gray-700 text-gray-600 hover:text-gray-400"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white">Monthly GMV growth (cumulative USD)</h2>
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                Production
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl">
              Same GMV rules as Orders chart (locked FX). Solid line = month-to-date; dashed = projected run-rate (
              <span className="text-gray-400">daily avg = cumulative ÷ day of month</span>) through month end.
            </p>
            {data && (
              <p className="text-xs text-gray-400 mt-2">
                Run-rate: <span className="text-amber-400">{formatUsd(data.dailyAvgUsd)}</span>/day &middot; MTD:{" "}
                <span className="text-white">{formatUsd(data.cumulativeToDateUsd)}</span> &middot; Today (DOM): {data.todayDayOfMonth}
              </p>
            )}
          </div>
        </div>

        {loading && <div className="h-96 animate-pulse rounded-lg bg-gray-800" />}

        {!loading && error && (
          <div className="h-96 flex items-center justify-center">
            <p className="text-red-400 text-sm text-center px-4">{error}</p>
          </div>
        )}

        {!loading && !error && selectedIds.size === 0 && (
          <div className="h-96 flex items-center justify-center text-gray-500 text-sm">Select at least one merchant</div>
        )}

        {!loading && !error && selectedIds.size > 0 && data && chartRows.length > 0 && (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartRows} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="day"
                type="number"
                domain={[1, "dataMax"]}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={false}
                label={{ value: "Day of month", position: "insideBottom", offset: -4, fill: "#6b7280", fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v) => formatUsd(Number(v))}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const day = label as number;
                  return (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl min-w-[200px]">
                      <p className="font-medium text-white mb-2">Day {day}</p>
                      {payload.map((entry) => (
                        <p key={String(entry.name)} className="text-xs mt-1" style={{ color: entry.color }}>
                          {String(entry.name)}: {entry.value != null ? formatUsd(Number(entry.value)) : "—"}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#9ca3af", paddingTop: "12px" }} />
              {todayDom > 0 && (
                <ReferenceLine
                  x={todayDom}
                  stroke="#6b7280"
                  strokeDasharray="4 4"
                  label={{ value: "Today", fill: "#9ca3af", fontSize: 10, position: "top" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="previous"
                name={data.previousMonthLabel}
                stroke="#94a3b8"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="currentActual"
                name={`${data.currentMonthLabel} (actual)`}
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="currentForecast"
                name={`${data.currentMonthLabel} (forecast)`}
                stroke="#a78bfa"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
