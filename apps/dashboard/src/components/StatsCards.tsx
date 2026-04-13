import type { StatsResponse, FunnelSideMetrics } from "../lib/api";

interface Props {
  stats: StatsResponse | null;
  sideMetrics: FunnelSideMetrics | null;
  loading: boolean;
  paymentErrorFilterActive?: boolean;
  onPaymentErrorClick?: () => void;
}

function Card({
  label,
  value,
  sub,
  alert,
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-5 transition-all ${
        active
          ? "bg-red-900/60 border-red-600 ring-1 ring-red-500"
          : alert
          ? "bg-red-950/40 border-red-900/60"
          : "bg-gray-900 border-gray-800"
      } ${clickable ? "cursor-pointer hover:brightness-110" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm mb-1 ${alert || active ? "text-red-400" : "text-gray-400"}`}>{label}</p>
        {active && (
          <span className="text-xs bg-red-700 text-red-100 px-1.5 py-0.5 rounded shrink-0">
            Filtered
          </span>
        )}
      </div>
      <p className={`text-2xl font-semibold ${alert || active ? "text-red-300" : "text-white"}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${alert || active ? "text-red-500" : "text-gray-500"}`}>{sub}</p>}
      {clickable && !active && (
        <p className="text-xs text-gray-600 mt-1">Click to filter sessions</p>
      )}
      {active && (
        <p className="text-xs text-red-600 mt-1">Click to clear filter</p>
      )}
    </div>
  );
}

export default function StatsCards({ stats, sideMetrics, loading, paymentErrorFilterActive, onPaymentErrorClick }: Props) {
  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl bg-gray-900 border border-gray-800 p-5 h-24 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const shippingAlert = (sideMetrics?.shippingEmptyRate ?? 0) > 5;
  const paymentAlert  = (sideMetrics?.paymentErrorRate  ?? 0) > 5;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total Sessions" value={stats.totalSessions.toLocaleString()} />
        <Card
          label="Completed"
          value={stats.completedSessions.toLocaleString()}
          sub={`${stats.completionRate}% completion rate`}
        />
        <Card label="Avg Step Reached" value={String(stats.avgMaxStep)} />
        <Card
          label="Top Drop-off"
          value={stats.topDropoffStep?.label ?? "N/A"}
          sub={
            stats.topDropoffStep
              ? `${stats.topDropoffStep.count} sessions stopped here`
              : undefined
          }
        />
      </div>

      {sideMetrics && (
        <div className="grid grid-cols-2 gap-4">
          <Card
            label="Shipping Issues (no rates available)"
            value={`${sideMetrics.shippingEmptyRate}%`}
            sub={`${sideMetrics.shippingEmpty.toLocaleString()} sessions with no shipping options`}
            alert={shippingAlert}
          />
          <Card
            label="Payment Errors"
            value={`${sideMetrics.paymentErrorRate}%`}
            sub={`${sideMetrics.paymentErrors.toLocaleString()} sessions with a payment error`}
            alert={paymentAlert}
            onClick={onPaymentErrorClick}
            active={paymentErrorFilterActive}
          />
        </div>
      )}
    </div>
  );
}
