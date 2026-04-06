import { useAnalytics } from "./hooks/useAnalytics";
import StatsCards from "./components/StatsCards";
import FunnelChart from "./components/FunnelChart";
import SessionsTable from "./components/SessionsTable";
import Filters from "./components/Filters";

const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID ?? "";

export default function App() {
  const {
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
    reload,
  } = useAnalytics();

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Checkout Funnel</h1>
            <p className="text-sm text-gray-500">SellAbroad checkout analytics</p>
          </div>
          <button
            onClick={reload}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-950/50 border border-red-900 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <Filters
          filters={filters}
          setFilters={setFilters}
          merchants={merchants}
          onReload={reload}
        />

        <StatsCards stats={stats} sideMetrics={funnel?.sideMetrics ?? null} loading={loading} />

        <FunnelChart funnel={funnel} loading={loading} />

        <SessionsTable
          sessions={sessions}
          loading={loading}
          page={page}
          setPage={setPage}
          clarityProjectId={CLARITY_PROJECT_ID}
          onDeleted={reload}
        />
      </main>
    </div>
  );
}
