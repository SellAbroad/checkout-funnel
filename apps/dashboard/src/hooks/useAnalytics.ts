import { useState, useEffect, useCallback } from "react";
import {
  fetchFunnel,
  fetchSessions,
  fetchStats,
  fetchMerchants,
  fetchSessionEvents,
  type FunnelResponse,
  type SessionsResponse,
  type StatsResponse,
  type MerchantsResponse,
  type EventsResponse,
} from "../lib/api";

export interface Filters {
  merchantId: string;
  from: string;
  to: string;
  deviceType: string;
  hasPaymentError?: boolean;
  maxStep?: number;
}

function filtersToParams(filters: Filters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.merchantId) params.merchant_id = filters.merchantId;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.deviceType) params.device_type = filters.deviceType;
  if (filters.hasPaymentError) params.has_payment_error = "true";
  if (filters.maxStep !== undefined) params.max_step = String(filters.maxStep);
  return params;
}

export function useAnalytics() {
  const [filters, setFilters] = useState<Filters>({
    merchantId: "",
    from: "",
    to: "",
    deviceType: "mobile",
  });

  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [sessions, setSessions] = useState<SessionsResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [merchants, setMerchants] = useState<MerchantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filtersToParams(filters);
      const [f, se, st] = await Promise.all([
        fetchFunnel(params),
        fetchSessions({ ...params, limit: "50", offset: String(page * 50) }),
        fetchStats(params),
      ]);
      setFunnel(f);
      setSessions(se);
      setStats(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchMerchants().then(setMerchants).catch(() => {});
  }, []);

  return {
    filters,
    setFilters,
    funnel,
    sessions,
    stats,
    merchants,
    loading,
    error,
    page,
    setPage,
    reload: load,
    fetchSessionEvents,
  };
}
