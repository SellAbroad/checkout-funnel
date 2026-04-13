import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  fetchSessionsOverTime,
  type SessionsOverTimePoint,
  type MerchantRow,
} from "../lib/api";
import TodayHourlyChart from "./TodayHourlyChart";
import ProductionTodayChart from "./ProductionTodayChart";
import ProductionCartsTodayChart from "./ProductionCartsTodayChart";
import DynamoTodayChart from "./DynamoTodayChart";

type Timezone = "UTC" | "Asia/Dubai";

interface Props {
  merchants: MerchantRow[];
  from: string;
  to: string;
}

function getMerchantName(merchant: MerchantRow): string {
  return merchant.storeName || merchant.merchantId;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${day}`;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm shadow-xl">
      <p className="font-medium text-white mb-2">{formatDate(label)}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="mt-0.5" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
      {payload.length >= 2 && payload[0].value > 0 && (
        <p className="text-gray-400 mt-1.5 text-xs">
          {((payload[1].value / payload[0].value) * 100).toFixed(1)}% completion
        </p>
      )}
    </div>
  );
}

export default function SessionsTrendChart({ merchants, from, to }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [timezone, setTimezone] = useState<Timezone>("UTC");
  const [data, setData] = useState<SessionsOverTimePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Default selection on first load — top 5 merchants by name/shopUrl match.
  const DEFAULT_SELECTED_NAMES = [
    "fizzy goblet",
    "genetra",
    "zariin",
    "sage by mala",
    "deployed",
  ];

  useEffect(() => {
    if (!initialized.current && merchants.length > 0) {
      const defaultIds = merchants
        .filter((m) => {
          const name = getMerchantName(m).toLowerCase();
          const shopUrl = (m.shopUrl ?? "").toLowerCase();
          // For genetra, match only .io — exclude .co.uk
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
      setData([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        merchant_ids: Array.from(selectedIds).join(","),
        timezone,
      };
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await fetchSessionsOverTime(params);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedIds, from, to, timezone]);

  useEffect(() => {
    if (initialized.current) {
      load();
    }
  }, [load]);

  const toggleMerchant = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(merchants.map((m) => m.merchantId)));
  const deselectAll = () => setSelectedIds(new Set());

  const sortedMerchants = [...merchants].sort((a, b) => {
    const nameA = getMerchantName(a);
    const nameB = getMerchantName(b);
    return nameA.localeCompare(nameB);
  });

  const totalSessions = data.reduce((sum, d) => sum + d.total, 0);
  const totalCompleted = data.reduce((sum, d) => sum + d.completed, 0);
  const selectedIdsArray = Array.from(selectedIds);

  return (
    <div className="flex flex-col gap-4">

      {/* Universal controls — single slim bar */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-3 flex items-center gap-4 flex-wrap">
        {/* Timezone toggle */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setTimezone("UTC")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              timezone === "UTC" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            UTC
          </button>
          <button
            onClick={() => setTimezone("Asia/Dubai")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              timezone === "Asia/Dubai" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Dubai
          </button>
        </div>

        <div className="w-px h-4 bg-gray-700" />

        {/* Merchant count + All/None */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-500">
            {selectedIds.size} / {merchants.length} merchants
          </span>
          <button onClick={selectAll} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">All</button>
          <button onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">None</button>
        </div>

        {/* Merchant chips */}
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto flex-1">
          {sortedMerchants.map((m) => {
            const name = getMerchantName(m);
            const checked = selectedIds.has(m.merchantId);
            return (
              <button
                key={m.merchantId}
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

      {/* 1. Sessions / ATC / Visitors (DynamoDB) */}
      <DynamoTodayChart
        merchants={merchants.map((m) => ({ id: m.merchantId, name: getMerchantName(m) }))}
        timezone={timezone}
        controlledSelectedIds={selectedIdsArray}
      />

      {/* 2. Orders — Today vs. Historical Average (Production DB) */}
      <ProductionTodayChart timezone={timezone} merchantIds={selectedIdsArray} />

      {/* 3. Checkout Sessions Daily Overview (daily line chart) */}
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-lg font-semibold text-white">Checkout Sessions Daily Overview</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedIds.size} merchant{selectedIds.size !== 1 ? "s" : ""} selected &middot; daily totals
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!loading && data.length > 0 && (
                <span className="text-sm text-gray-400">
                  {totalSessions.toLocaleString()} sessions &middot; {totalCompleted.toLocaleString()} completed
                </span>
              )}
            </div>
          </div>
          <div className="mb-5" />

          {loading && (
            <div className="h-80 animate-pulse rounded-lg bg-gray-800" />
          )}

          {!loading && error && (
            <div className="h-80 flex items-center justify-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && data.length === 0 && (
            <div className="h-80 flex items-center justify-center">
              <p className="text-gray-500 text-sm">
                {selectedIds.size === 0 ? "Select at least one merchant" : "No data for the selected filters"}
              </p>
            </div>
          )}

          {!loading && !error && data.length > 0 && (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "13px", color: "#9ca3af", paddingTop: "12px" }} />
                <Line type="monotone" dataKey="total" name="Sessions" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>

      {/* 4. Today vs. Historical Average (checkout funnel sessions hourly) */}
      <TodayHourlyChart selectedIds={selectedIds} timezone={timezone} />

      {/* 5. Carts — Today vs. Historical Average (Production DB) */}
      <ProductionCartsTodayChart timezone={timezone} />
    </div>
  );
}
