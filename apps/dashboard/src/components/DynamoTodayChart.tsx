import { useState, useEffect, useCallback, useRef } from "react";
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
import { fetchDynamoTodayHourly } from "../lib/api";

interface Merchant {
  id: string;
  name: string;
}

interface Props {
  merchants: Merchant[];
  timezone: string;
  /** When provided by the parent, the internal merchant selector is hidden */
  controlledSelectedIds?: string[];
}

interface ChartRow {
  hour: number;
  todaySessions: number | undefined;
  todayAtc: number | undefined;
  todayVisitors: number | undefined;
  avgSessions: number;
  avgAtc: number;
  avgVisitors: number;
}

const COLORS = {
  sessions: "#6366f1",
  atc: "#f59e0b",
  visitors: "#10b981",
};

const REFRESH_INTERVAL_MS = 60_000;

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
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
    sessions: { color: COLORS.sessions, label: "Sessions" },
    atc: { color: COLORS.atc, label: "Add to Cart" },
    visitors: { color: COLORS.visitors, label: "Visitors" },
  };

  payload.forEach((p) => {
    if (p.name === "Sessions today") groups.sessions.today = p.value;
    if (p.name === "Avg sessions") groups.sessions.avg = p.value;
    if (p.name === "ATC today") groups.atc.today = p.value;
    if (p.name === "Avg ATC") groups.atc.avg = p.value;
    if (p.name === "Visitors today") groups.visitors.today = p.value;
    if (p.name === "Avg visitors") groups.visitors.avg = p.value;
  });

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl min-w-[200px]">
      <p className="font-medium text-white mb-2">{formatHour(hour)} — cumulative</p>
      {Object.values(groups).map((g) => (
        <div key={g.label} className="mt-1.5">
          <p className="text-xs text-gray-400 mb-0.5">{g.label}</p>
          <div className="flex gap-3 items-baseline flex-wrap">
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

export default function DynamoTodayChart({ merchants, timezone, controlledSelectedIds }: Props) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const isControlled = controlledSelectedIds !== undefined;
  const selectedIds = isControlled ? controlledSelectedIds : internalSelectedIds;

  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [currentHour, setCurrentHour] = useState(0);
  const [todayTotals, setTodayTotals] = useState({ sessions: 0, atc: 0, visitors: 0 });
  const [avgTotalsAtNow, setAvgTotalsAtNow] = useState({ sessions: 0, atc: 0, visitors: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize internal state with all merchants (only when not controlled)
  useEffect(() => {
    if (!isControlled && merchants.length > 0 && internalSelectedIds.length === 0) {
      setInternalSelectedIds(merchants.map((m) => m.id));
    }
  }, [merchants, internalSelectedIds.length, isControlled]);

  const load = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDynamoTodayHourly({
        merchant_ids: selectedIds.join(","),
        timezone,
      });

      setCurrentHour(res.currentHour);

      const todayMap = new Map(res.today.map((d) => [d.hour, d]));
      const avgMap = new Map(res.average.map((d) => [d.hour, d]));

      let cumSessions = 0, cumAtc = 0, cumVisitors = 0;
      let cumAvgSessions = 0, cumAvgAtc = 0, cumAvgVisitors = 0;
      let avgAtNowSessions = 0, avgAtNowAtc = 0, avgAtNowVisitors = 0;

      const rows: ChartRow[] = Array.from({ length: 24 }, (_, h) => {
        const t = todayMap.get(h);
        const a = avgMap.get(h);

        cumAvgSessions = Math.round((cumAvgSessions + (a?.avgSessions ?? 0)) * 10) / 10;
        cumAvgAtc = Math.round((cumAvgAtc + (a?.avgAtc ?? 0)) * 10) / 10;
        cumAvgVisitors = Math.round((cumAvgVisitors + (a?.avgVisitors ?? 0)) * 10) / 10;

        if (h <= res.currentHour) {
          cumSessions += t?.sessions ?? 0;
          cumAtc += t?.atc ?? 0;
          cumVisitors += t?.visitors ?? 0;
          avgAtNowSessions = cumAvgSessions;
          avgAtNowAtc = cumAvgAtc;
          avgAtNowVisitors = cumAvgVisitors;
        }

        return {
          hour: h,
          todaySessions: h <= res.currentHour ? cumSessions : undefined,
          todayAtc: h <= res.currentHour ? cumAtc : undefined,
          todayVisitors: h <= res.currentHour ? cumVisitors : undefined,
          avgSessions: cumAvgSessions,
          avgAtc: cumAvgAtc,
          avgVisitors: cumAvgVisitors,
        };
      });

      setTodayTotals({ sessions: cumSessions, atc: cumAtc, visitors: cumVisitors });
      setAvgTotalsAtNow({
        sessions: Math.round(avgAtNowSessions),
        atc: Math.round(avgAtNowAtc),
        visitors: Math.round(avgAtNowVisitors),
      });
      setChartData(rows);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedIds, timezone]);

  // Load on mount and when selection changes
  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    timerRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  function toggleMerchant(id: string) {
    setInternalSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setInternalSelectedIds((prev) =>
      prev.length === merchants.length ? [] : merchants.map((m) => m.id),
    );
  }

  const summaryItems = [
    { label: "Sessions", today: todayTotals.sessions, avg: avgTotalsAtNow.sessions, color: COLORS.sessions },
    { label: "Add to Cart", today: todayTotals.atc, avg: avgTotalsAtNow.atc, color: COLORS.atc },
    { label: "Visitors", today: todayTotals.visitors, avg: avgTotalsAtNow.visitors, color: COLORS.visitors },
  ];

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              Sessions / ATC / Visitors — Today vs. Average
            </h2>
            <span className="text-xs bg-purple-900/60 text-purple-300 border border-purple-800 px-2 py-0.5 rounded-md">
              DynamoDB
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Cumulative today vs. 30-day daily average &middot; up to {formatHour(currentHour)}
            {lastUpdated && (
              <span className="ml-2 text-gray-600">
                · refreshed {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>

        {loading && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            Loading…
          </span>
        )}
      </div>

      {/* Merchant selector — hidden when parent controls selection */}
      {!isControlled && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={toggleAll}
              className="text-xs px-2.5 py-1 rounded-md border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              {selectedIds.length === merchants.length ? "Deselect all" : "Select all"}
            </button>
            {merchants.map((m) => {
              const active = selectedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMerchant(m.id)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    active
                      ? "bg-purple-900/40 border-purple-700 text-purple-200"
                      : "border-gray-700 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary cards */}
      {!loading && !error && chartData.length > 0 && (
        <div className="flex gap-5 mb-4">
          {summaryItems.map((s) => {
            const pct = s.avg > 0 ? ((s.today - s.avg) / s.avg) * 100 : null;
            return (
              <div key={s.label} className="flex-1 bg-gray-800/50 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">{s.label} today</p>
                <p className="text-xl font-semibold" style={{ color: s.color }}>{s.today}</p>
                <p className="text-xs text-gray-500">
                  avg {s.avg} by {formatHour(currentHour)}
                  {pct !== null && (
                    <span className={`ml-1.5 font-medium ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.length === 0 && (
        <div className="h-64 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Select at least one merchant to view data</p>
        </div>
      )}

      {selectedIds.length > 0 && loading && chartData.length === 0 && (
        <div className="h-64 animate-pulse rounded-lg bg-gray-800" />
      )}

      {!loading && error && (
        <div className="h-64 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {selectedIds.length > 0 && chartData.length > 0 && (
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

              {/* Avg dashed lines */}
              <Line type="monotone" dataKey="avgSessions" name="Avg sessions"
                stroke={COLORS.sessions} strokeWidth={1.5} strokeDasharray="5 3"
                dot={false} connectNulls activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="avgAtc" name="Avg ATC"
                stroke={COLORS.atc} strokeWidth={1.5} strokeDasharray="5 3"
                dot={false} connectNulls activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="avgVisitors" name="Avg visitors"
                stroke={COLORS.visitors} strokeWidth={1.5} strokeDasharray="5 3"
                dot={false} connectNulls activeDot={{ r: 3 }} />

              {/* Today solid lines */}
              <Line type="monotone" dataKey="todaySessions" name="Sessions today"
                stroke={COLORS.sessions} strokeWidth={2.5}
                dot={false} connectNulls={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="todayAtc" name="ATC today"
                stroke={COLORS.atc} strokeWidth={2.5}
                dot={false} connectNulls={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="todayVisitors" name="Visitors today"
                stroke={COLORS.visitors} strokeWidth={2.5}
                dot={false} connectNulls={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-5 border-t-2 border-gray-400" />
              <span>Today (solid)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 border-t-[1.5px] border-gray-400 border-dashed" />
              <span>30-day avg (dashed)</span>
            </div>
            {Object.entries(COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="capitalize">{key === "atc" ? "Add to Cart" : key}</span>
              </div>
            ))}
            <span className="ml-auto text-gray-600">auto-refresh every 60s</span>
          </div>
        </>
      )}
    </div>
  );
}
