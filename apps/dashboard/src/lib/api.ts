const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3100";

async function fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface FunnelStep {
  step: number;
  label: string;
  count: number;
  percentOfTotal: number;
  dropoffRate: number;
}

export interface FunnelResponse {
  totalSessions: number;
  funnel: FunnelStep[];
  filters: { merchantId: string | null; from: string | null; to: string | null };
}

export interface SessionRow {
  id: string;
  cartId: string;
  merchantId: string;
  claritySessionId: string | null;
  currencyCode: string | null;
  cartAmountCents: number | null;
  countryCode: string | null;
  deviceType: string | null;
  shopUrl: string | null;
  firstEventAt: string;
  lastEventAt: string;
  maxStepReached: number;
  maxStepLabel: string;
  isCompleted: boolean;
  createdAt: string;
}

export interface SessionsResponse {
  sessions: SessionRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatsResponse {
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  avgMaxStep: number;
  topDropoffStep: { step: number; label: string; count: number } | null;
}

export interface MerchantRow {
  merchantId: string;
  shopUrl: string | null;
  sessionCount: number;
}

export interface MerchantsResponse {
  merchants: MerchantRow[];
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  eventName: string;
  stepOrder: number;
  metadata: Record<string, unknown> | null;
  clientTimestamp: string;
  createdAt: string;
}

export interface EventsResponse {
  events: SessionEvent[];
}

export function fetchFunnel(params?: Record<string, string>) {
  return fetchJson<FunnelResponse>("/analytics/funnel", params);
}

export function fetchSessions(params?: Record<string, string>) {
  return fetchJson<SessionsResponse>("/analytics/sessions", params);
}

export function fetchSessionEvents(sessionId: string) {
  return fetchJson<EventsResponse>(`/analytics/sessions/${sessionId}/events`);
}

export function fetchStats(params?: Record<string, string>) {
  return fetchJson<StatsResponse>("/analytics/stats", params);
}

export function fetchMerchants() {
  return fetchJson<MerchantsResponse>("/analytics/merchants");
}

export async function deleteSession(sessionId: string): Promise<void> {
  const url = new URL(`/analytics/sessions/${sessionId}`, API_URL);
  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}
