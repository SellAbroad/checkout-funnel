import { useState } from "react";
import { useAnalytics } from "./hooks/useAnalytics";
import StatsCards from "./components/StatsCards";
import FunnelChart from "./components/FunnelChart";
import SessionsTable from "./components/SessionsTable";
import Filters from "./components/Filters";
import SessionsTrendChart from "./components/SessionsTrendChart";
import MonthlyGrowthChart from "./components/MonthlyGrowthChart";
import ConfigMenu from "./components/ConfigMenu";

const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID ?? "";

type Tab = "overview" | "trends" | "monthly-growth";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

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
          <div className="flex items-center gap-3">
            <button
              onClick={reload}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Refresh
            </button>
            <ConfigMenu />
          </div>
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

        <div className="flex gap-1 border-b border-gray-800">
          {(["overview", "trends", "monthly-growth"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "overview" ? "Overview" : tab === "trends" ? "Trends" : "Monthly Growth"}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            <StatsCards
              stats={stats}
              sideMetrics={funnel?.sideMetrics ?? null}
              loading={loading}
              paymentErrorFilterActive={filters.hasPaymentError}
              onPaymentErrorClick={() =>
                setFilters((f) => ({ ...f, hasPaymentError: !f.hasPaymentError }))
              }
            />

            <FunnelChart
              funnel={funnel}
              loading={loading}
              onStepClick={(stepNumber) =>
                setFilters((f) => ({ ...f, maxStep: f.maxStep === stepNumber ? undefined : stepNumber }))
              }
            />

            <SessionsTable
              sessions={sessions}
              merchants={merchants?.merchants ?? null}
              loading={loading}
              page={page}
              setPage={setPage}
              clarityProjectId={CLARITY_PROJECT_ID}
              onDeleted={reload}
            />
          </>
        )}

        {activeTab === "trends" && (
          <SessionsTrendChart
            merchants={merchants?.merchants ?? []}
            from={filters.from}
            to={filters.to}
          />
        )}

        {activeTab === "monthly-growth" && <MonthlyGrowthChart merchants={merchants?.merchants ?? []} />}
      </main>
    </div>
  );
}
