import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { StatisticsResponse } from "../types";

type FilterState = {
  fromDate: string;
  toDate: string;
  clientIds: string[];
};

const emptyStatistics: StatisticsResponse = {
  filters: {
    fromDate: null,
    toDate: null,
    clientIds: [],
    statuses: [],
  },
  filterDescription: "",
  options: {
    clients: [],
    statuses: [],
  },
  summary: {
    totalBookings: 0,
    totalParticipants: 0,
    uniqueClients: 0,
    bookingsPerClient: [],
  },
  bookings: [],
};

function toQueryString(filters: FilterState) {
  const params = new URLSearchParams();

  if (filters.fromDate) {
    params.set("fromDate", filters.fromDate);
  }

  if (filters.toDate) {
    params.set("toDate", filters.toDate);
  }

  if (filters.clientIds.length > 0) {
    params.set("clientIds", filters.clientIds.join(","));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default function StatisticsPage() {
  const [filters, setFilters] = useState<FilterState>({
    fromDate: "",
    toDate: "",
    clientIds: [],
  });
  const [statistics, setStatistics] = useState<StatisticsResponse>(emptyStatistics);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const queryString = useMemo(() => toQueryString(filters), [filters]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatistics() {
      setLoading(true);
      setError("");

      try {
        const data = await api.get<StatisticsResponse>(`/admin/statistics${queryString}`);
        if (!cancelled) {
          setStatistics(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kunde inte hämta statistik");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStatistics();

    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const setQuickRange = (mode: "today" | "month" | "year") => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");

    if (mode === "today") {
      const isoDate = `${year}-${month}-${day}`;
      setFilters((current) => ({ ...current, fromDate: isoDate, toDate: isoDate }));
      return;
    }

    if (mode === "month") {
      const firstDay = `${year}-${month}-01`;
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      setFilters((current) => ({ ...current, fromDate: firstDay, toDate: `${year}-${month}-${String(lastDay).padStart(2, "0")}` }));
      return;
    }

    setFilters((current) => ({ ...current, fromDate: `${year}-01-01`, toDate: `${year}-12-31` }));
  };

  const clearFilters = () => {
    setFilters({ fromDate: "", toDate: "", clientIds: [] });
  };

  const updateMultiSelect = (field: "clientIds", event: FormEvent<HTMLSelectElement>) => {
    const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
    setFilters((current) => ({ ...current, [field]: values }));
  };

  const downloadPdf = async () => {
    setExporting(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/statistics/pdf${queryString}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Kunde inte exportera PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `statistik-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte exportera PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Statistik</h1>
          <p className="text-sm text-brand-400 mt-1">Filtrera bokningar, följ deltagarvolym och exportera rapporten som PDF.</p>
        </div>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={exporting || loading}
          className="inline-flex items-center justify-center rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? "Exporterar..." : "Exportera PDF"}
        </button>
      </div>

      <section className="card p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <label className="label">Datum från</label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="label">Datum till</label>
            <input
              type="date"
              value={filters.toDate}
              min={filters.fromDate || undefined}
              onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="label">Uppdragsgivare</label>
            <select multiple value={filters.clientIds} onChange={(event) => updateMultiSelect("clientIds", event)} className="input min-h-36">
              {statistics.options.clients.map((client) => (
                <option key={client.id} value={client.id}>{client.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-brand-400">Håll nere Ctrl eller Cmd för att välja flera.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setQuickRange("today")} className="rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary">Idag</button>
          <button type="button" onClick={() => setQuickRange("month")} className="rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary">Denna månad</button>
          <button type="button" onClick={() => setQuickRange("year")} className="rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary">Detta år</button>
          <button type="button" onClick={clearFilters} className="rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary">Rensa filter</button>
        </div>

        {statistics.filterDescription && (
          <div className="rounded-2xl border border-surface-border bg-surface-secondary/60 px-4 py-3 text-sm text-brand-500">
            {statistics.filterDescription}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="card p-4 sm:p-5">
          <p className="text-sm text-brand-400">Totala bokningar</p>
          <p className="mt-2 text-3xl font-bold text-brand-800">{loading ? "..." : statistics.summary.totalBookings}</p>
        </article>
        <article className="card p-4 sm:p-5">
          <p className="text-sm text-brand-400">Totala deltagare</p>
          <p className="mt-2 text-3xl font-bold text-brand-800">{loading ? "..." : statistics.summary.totalParticipants}</p>
        </article>
        <article className="card p-4 sm:p-5">
          <p className="text-sm text-brand-400">Uppdragsgivare i urvalet</p>
          <p className="mt-2 text-3xl font-bold text-brand-800">{loading ? "..." : statistics.summary.uniqueClients}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-brand-800">Bokningar</h2>
              <p className="text-sm text-brand-400">Alla bokningar som matchar aktuella filter.</p>
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-sm text-brand-400 sm:px-6">Laddar statistik...</div>
          ) : statistics.bookings.length === 0 ? (
            <div className="px-4 py-10 text-sm text-brand-400 sm:px-6">Inga bokningar matchar urvalet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-secondary/70 text-left text-brand-500">
                  <tr>
                    <th className="px-4 py-3 font-medium sm:px-6">Uppdragsgivare</th>
                    <th className="px-4 py-3 font-medium">Datum</th>
                    <th className="px-4 py-3 font-medium">Tid</th>
                    <th className="px-4 py-3 font-medium">Utbildning</th>
                    <th className="px-4 py-3 font-medium">Deltagare</th>
                    <th className="px-4 py-3 font-medium">Skapad av</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-surface-border align-top text-brand-700">
                      <td className="px-4 py-3 sm:px-6">
                        <p className="font-medium text-brand-800">{booking.customer.label}</p>
                        <p className="text-xs text-brand-400">{booking.customer.email}</p>
                        <p className="mt-1 text-xs text-brand-400">{booking.city}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{booking.dateLabel}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{booking.timeLabel}</td>
                      <td className="px-4 py-3 min-w-52">{booking.courseName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{booking.participants}</td>
                      <td className="px-4 py-3">
                        <p>{booking.createdBy.label}</p>
                        <p className="text-xs text-brand-400">{booking.createdAtLabel}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                          {booking.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-brand-800">Per uppdragsgivare</h2>
          <p className="mt-1 text-sm text-brand-400">Summering av bokningar och deltagare för valt urval.</p>

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-brand-400">Laddar...</p>
            ) : statistics.summary.bookingsPerClient.length === 0 ? (
              <p className="text-sm text-brand-400">Ingen sammanställning att visa.</p>
            ) : (
              statistics.summary.bookingsPerClient.map((entry) => (
                <div key={entry.clientId} className="rounded-2xl border border-surface-border bg-surface-secondary/50 px-4 py-3">
                  <p className="font-medium text-brand-800">{entry.label}</p>
                  <p className="mt-1 text-sm text-brand-500">{entry.count} bokningar</p>
                  <p className="text-sm text-brand-500">{entry.participants} deltagare</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}