import type { StatsResponse } from "../lib/api";

interface Props {
  stats: StatsResponse | null;
  loading: boolean;
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function StatsCards({ stats, loading }: Props) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-gray-900 border border-gray-800 p-5 h-24 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
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
  );
}
