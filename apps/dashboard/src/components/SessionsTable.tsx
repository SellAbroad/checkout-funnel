import { useState } from "react";
import { format } from "date-fns";
import type { SessionsResponse, SessionEvent } from "../lib/api";
import { fetchSessionEvents, deleteSession } from "../lib/api";

interface Props {
  sessions: SessionsResponse | null;
  loading: boolean;
  page: number;
  setPage: (p: number) => void;
  clarityProjectId?: string;
  onDeleted?: () => void;
}

function formatAmount(cents: number | null, currency: string | null): string {
  if (cents == null) return "-";
  const divisor = ["KWD", "BHD", "OMR", "JOD", "TND"].includes(
    currency?.toUpperCase() ?? "",
  )
    ? 1000
    : 100;
  return `${(cents / divisor).toFixed(2)} ${currency?.toUpperCase() ?? ""}`;
}

function SessionEventsPanel({ sessionId }: { sessionId: string }) {
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async () => {
    if (!open && !events) {
      const res = await fetchSessionEvents(sessionId);
      setEvents(res.events);
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        onClick={toggle}
        className="text-indigo-400 hover:text-indigo-300 text-xs underline"
      >
        {open ? "Hide" : "Events"}
      </button>
      {open && events && (
        <div className="mt-2 space-y-1">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-2 text-xs text-gray-400"
            >
              <span className="text-gray-600">
                {format(new Date(ev.clientTimestamp), "HH:mm:ss")}
              </span>
              <span
                className={
                  ev.eventName.includes("error") || ev.eventName.includes("failed")
                    ? "text-red-400"
                    : ev.eventName.includes("completed")
                      ? "text-green-400"
                      : "text-gray-300"
                }
              >
                {ev.eventName.replace("sa_checkout_", "")}
              </span>
              {!!ev.metadata?.error_message && (
                <span className="text-red-300 italic truncate max-w-[240px]" title={String(ev.metadata.error_message)}>
                  {String(ev.metadata.error_message)}
                </span>
              )}
              {!!ev.metadata?.sentry_event_id && (
                <a
                  href={`https://sentry.io/organizations/sellabroad/issues/?query=id:${ev.metadata.sentry_event_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 underline"
                  title="View error in Sentry"
                >
                  Sentry
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default function SessionsTable({
  sessions,
  loading,
  page,
  setPage,
  clarityProjectId,
  onDeleted,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (sessionId: string) => {
    if (!confirm("Delete this session and all its events?")) return;
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      onDeleted?.();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || !sessions) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 h-64 animate-pulse" />
    );
  }

  const totalPages = Math.ceil(sessions.total / sessions.limit);

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white">Sessions</h2>
        <span className="text-sm text-gray-400">
          {sessions.total.toLocaleString()} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Cart ID</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Last Step</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Clarity</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sessions.sessions.map((s) => (
              <tr
                key={s.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                  {format(new Date(s.createdAt), "MMM dd, HH:mm")}
                </td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                  {s.cartId.substring(0, 16)}...
                </td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                  {formatAmount(s.cartAmountCents, s.currencyCode)}
                </td>
                <td className="px-4 py-3 text-gray-400">{s.countryCode ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        s.maxStepReached >= 8
                          ? "bg-green-500"
                          : s.maxStepReached >= 6
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                    />
                    <span className="text-gray-300">{s.maxStepLabel}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  {s.isCompleted ? (
                    <span className="text-green-400 text-xs font-medium">Completed</span>
                  ) : (
                    <span className="text-red-400 text-xs font-medium">Abandoned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {clarityProjectId ? (
                    <a
                      href={`https://clarity.microsoft.com/projects/view/${clarityProjectId}/impressions?URL=2%3B2%3B${s.cartId}&date=Last%2060%20days`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 text-xs underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-gray-600 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <SessionEventsPanel sessionId={s.id} />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Delete session"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
            {sessions.sessions.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No sessions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
            className="text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
