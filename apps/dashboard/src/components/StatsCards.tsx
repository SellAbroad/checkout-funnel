import type { StatsResponse, FunnelSideMetrics } from "../lib/api";

interface Props {
  stats: StatsResponse | null;
  sideMetrics: FunnelSideMetrics | null;
  loading: boolean;
}

function Card({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${alert ? "bg-red-950/40 border-red-900/60" : "bg-gray-900 border-gray-800"}`}>
      <p className={`text-sm mb-1 ${alert ? "text-red-400" : "text-gray-400"}`}>{label}</p>
      <p className={`text-2xl font-semibold ${alert ? "text-red-300" : "text-white"}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${alert ? "text-red-500" : "text-gray-500"}`}>{sub}</p>}
    </div>
  );
}

export default function StatsCards({ stats, sideMetrics, loading }: Props) {
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
          />
        </div>
      )}
    </div>
  );
}
