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

export interface FunnelSideMetrics {
  shippingEmpty: number;
  shippingEmptyRate: number;
  paymentErrors: number;
  paymentErrorRate: number;
}

export interface FunnelMobileMetrics {
  dropdownOpenRate: number;
}

export interface FunnelResponse {
  totalSessions: number;
  funnel: FunnelStep[];
  sideMetrics: FunnelSideMetrics;
  mobileMetrics: FunnelMobileMetrics | null;
  filters: { merchantId: string | null; from: string | null; to: string | null; deviceType?: string };
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

export interface SessionsOverTimePoint {
  date: string;
  total: number;
  completed: number;
}

export interface SessionsOverTimeResponse {
  data: SessionsOverTimePoint[];
  timezone: string;
}

export function fetchSessionsOverTime(params?: Record<string, string>) {
  return fetchJson<SessionsOverTimeResponse>("/analytics/sessions-over-time", params);
}

export interface TodayHourPoint {
  hour: number;
  total: number;
  completed: number;
}

export interface AvgHourPoint {
  hour: number;
  avgTotal: number;
  avgCompleted: number;
}

export interface TodayHourlyResponse {
  today: TodayHourPoint[];
  average: AvgHourPoint[];
  currentHour: number;
  timezone: string;
}

export function fetchTodayHourly(params?: Record<string, string>) {
  return fetchJson<TodayHourlyResponse>("/analytics/today-hourly", params);
}

export interface ProductionHourPoint {
  hour: number;
  orders: number;
  gmvUsd: number;
}

export interface ProductionAvgHourPoint {
  hour: number;
  avgOrders: number;
  avgGmvUsd: number;
}

export interface ProductionTodayHourlyResponse {
  today: ProductionHourPoint[];
  average: ProductionAvgHourPoint[];
  currentHour: number;
  timezone: string;
}

export function fetchProductionTodayHourly(params?: Record<string, string>) {
  return fetchJson<ProductionTodayHourlyResponse>("/production-analytics/today-hourly", params);
}

export interface ProductionCartHourPoint {
  hour: number;
  total: number;
  completed: number;
}

export interface ProductionCartAvgHourPoint {
  hour: number;
  avgTotal: number;
  avgCompleted: number;
}

export interface ProductionCartsTodayHourlyResponse {
  today: ProductionCartHourPoint[];
  average: ProductionCartAvgHourPoint[];
  currentHour: number;
  timezone: string;
}

export function fetchProductionCartsTodayHourly(params?: Record<string, string>) {
  return fetchJson<ProductionCartsTodayHourlyResponse>("/production-analytics/carts-today-hourly", params);
}

export interface DynamoTodayHourPoint {
  hour: number;
  sessions: number;
  atc: number;
  visitors: number;
}

export interface DynamoAvgHourPoint {
  hour: number;
  avgSessions: number;
  avgAtc: number;
  avgVisitors: number;
}

export interface DynamoTodayHourlyResponse {
  today: DynamoTodayHourPoint[];
  average: DynamoAvgHourPoint[];
  currentHour: number;
  timezone: string;
}

export function fetchDynamoTodayHourly(params?: Record<string, string>) {
  return fetchJson<DynamoTodayHourlyResponse>("/dynamodb-analytics/today-hourly", params);
}

export interface MonthlyGrowthPoint {
  day: number;
  previousMonthCumulative: number | null;
  currentActual: number | null;
  currentForecast: number | null;
}

export interface MonthlyGrowthResponse {
  timezone: string;
  currentMonthLabel: string;
  previousMonthLabel: string;
  todayDayOfMonth: number;
  daysInCurrentMonth: number;
  daysInPreviousMonth: number;
  dailyAvgUsd: number;
  cumulativeToDateUsd: number;
  points: MonthlyGrowthPoint[];
}

export function fetchMonthlyGrowth(params?: Record<string, string>) {
  return fetchJson<MonthlyGrowthResponse>("/production-analytics/monthly-growth", params);
}
