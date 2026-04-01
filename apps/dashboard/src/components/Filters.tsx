import type { Filters as FiltersType } from "../hooks/useAnalytics";
import type { MerchantsResponse } from "../lib/api";
import { getMerchantName } from "../lib/merchants-map";

interface Props {
  filters: FiltersType;
  setFilters: (f: FiltersType) => void;
  merchants: MerchantsResponse | null;
  onReload: () => void;
}

export default function Filters({ filters, setFilters, merchants, onReload }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Merchant</label>
        <select
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px]"
          value={filters.merchantId}
          onChange={(e) => setFilters({ ...filters, merchantId: e.target.value })}
        >
          <option value="">All Merchants</option>
          {merchants?.merchants.map((m) => (
            <option key={m.merchantId} value={m.merchantId}>
              {getMerchantName(m.merchantId, m.shopUrl)} ({m.sessionCount})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">From</label>
        <input
          type="date"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">To</label>
        <input
          type="date"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
      </div>

      <button
        onClick={onReload}
        className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      >
        Apply
      </button>
    </div>
  );
}
