import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import type { DateSelectArg, EventContentArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { BlockingPeriod, Booking } from "../types";

type BlockingPeriodType = "vacation" | "blocked";

interface BlockingPeriodDraft {
  startDate: string;
  endDate: string;
  type: BlockingPeriodType;
}

function getBlockingPeriodLabel(type: BlockingPeriodType) {
  return type === "vacation" ? "Semester" : "Spärrad för bokning";
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInclusiveEndDate(selectInfo: DateSelectArg) {
  const endDate = new Date(selectInfo.end);
  endDate.setDate(endDate.getDate() - 1);
  return toDateInputValue(endDate);
}

export default function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blockingPeriods, setBlockingPeriods] = useState<BlockingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<BlockingPeriodDraft | null>(null);
  const [periodError, setPeriodError] = useState("");
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();

  const formatTime = (value: string) => new Date(value).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const loadCalendarData = async () => {
    const [bookingData, blockingPeriodData] = await Promise.all([
      api.get<Booking[]>("/bookings"),
      api.get<BlockingPeriod[]>("/blocking-periods"),
    ]);

    setBookings(bookingData);
    setBlockingPeriods(blockingPeriodData);
  };

  useEffect(() => {
    loadCalendarData().catch(() => {});
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncViewport = () => setIsMobile(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const unreadChats = bookings
    .filter((booking) => booking.canAccessChat !== false && booking.hasUnread)
    .sort((left, right) => {
      const leftTime = left.latestChatAt ? new Date(left.latestChatAt).getTime() : 0;
      const rightTime = right.latestChatAt ? new Date(right.latestChatAt).getTime() : 0;
      return rightTime - leftTime;
    });

  const events = [
    ...bookings.map((b) => ({
      id: b.id,
      title: b.displayTitle || `${b.client.company || b.client.name} – ${b.customCourse || b.course.name}`,
      start: b.date,
      end: b.endDate || undefined,
      backgroundColor: "#1f1f1f",
      borderColor: "#1f1f1f",
      textColor: "#ffffff",
      extendedProps: {
        eventType: "booking",
        hasUnread: Boolean(b.hasUnread),
        logoUrl: b.client.logoUrl || null,
      },
    })),
    ...blockingPeriods.map((period) => ({
      id: period.id,
      title: getBlockingPeriodLabel(period.type),
      start: period.startDate.split("T")[0],
      end: period.endDate.split("T")[0],
      allDay: true,
      backgroundColor: period.type === "vacation" ? "#1e6b52" : "#9f1239",
      borderColor: period.type === "vacation" ? "#1e6b52" : "#9f1239",
      textColor: "#ffffff",
      display: "block",
      extendedProps: {
        eventType: "blockingPeriod",
        blockingPeriodType: period.type,
      },
    })),
  ];

  const renderEventContent = (info: EventContentArg) => {
    const eventType = info.event.extendedProps.eventType as "booking" | "blockingPeriod" | undefined;
    if (eventType === "blockingPeriod") {
      const blockingPeriodType = info.event.extendedProps.blockingPeriodType as BlockingPeriodType;
      return (
        <div className="truncate font-medium">
          {blockingPeriodType === "vacation" ? "Semester" : "Spärrad för bokning"}
        </div>
      );
    }

    const hasUnread = Boolean(info.event.extendedProps.hasUnread);
    const logoUrl = typeof info.event.extendedProps.logoUrl === "string" ? info.event.extendedProps.logoUrl : null;
    const start = info.event.start ? formatTime(info.event.start.toISOString()) : null;
    const end = info.event.end ? formatTime(info.event.end.toISOString()) : null;
    const timeLabel = start && end ? `${start}-${end}` : null;
    const isMaskedPrivate = info.event.title === "Privat";
    const displayTitle = isMaskedPrivate ? "+Privat händelse" : info.event.title;

    return (
      <div className="flex items-center gap-1 min-w-0">
        {logoUrl && !isMaskedPrivate && (
          <img
            src={logoUrl}
            alt=""
            className="h-4 w-4 rounded-sm object-cover border border-white/30 bg-white shrink-0"
          />
        )}
        {hasUnread && (
          <span className="inline-flex items-center justify-center text-red-500 shrink-0" title="Oläst meddelande">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 7.5v9A2.25 2.25 0 0 1 19.5 18.75h-15A2.25 2.25 0 0 1 2.25 16.5v-9m19.5 0A2.25 2.25 0 0 0 19.5 5.25h-15A2.25 2.25 0 0 0 2.25 7.5m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 9.66A2.25 2.25 0 0 1 2.25 7.743V7.5" />
            </svg>
          </span>
        )}
        <span className={`truncate ${isMaskedPrivate ? "font-serif italic text-[11px]" : ""}`}>
          {timeLabel && !isMaskedPrivate ? `${timeLabel} ${displayTitle}` : displayTitle}
        </span>
      </div>
    );
  };

  const saveBlockingPeriod = async () => {
    if (!selectedPeriod) {
      return;
    }

    setPeriodError("");
    setSavingPeriod(true);

    try {
      await api.post<BlockingPeriod>("/blocking-periods", selectedPeriod);
      setSelectedPeriod(null);
      await loadCalendarData();
    } catch (err) {
      setPeriodError(err instanceof Error ? err.message : "Kunde inte spara perioden");
    } finally {
      setSavingPeriod(false);
    }
  };

  const deleteBlockingPeriod = async (id: string, type: BlockingPeriodType) => {
    const confirmed = window.confirm(`Ta bort ${getBlockingPeriodLabel(type).toLowerCase()}?`);
    if (!confirmed) {
      return;
    }

    await api.delete<{ success: boolean }>(`/blocking-periods/${id}`);
    await loadCalendarData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Bokningskalender</h1>
          <p className="text-sm text-brand-400 mt-1">
            {bookings.length} bokningar och {blockingPeriods.length} spärrperioder totalt
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isAdmin && <div className="text-xs text-brand-400 self-center">Dra i kalendern för att markera en period</div>}
          <button onClick={() => navigate("/bookings/new")} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Ny bokning
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-800">Chattindikering</h2>
            <p className="text-sm text-brand-400 mt-1">
              {unreadChats.length > 0
                ? `${unreadChats.length} olästa chatt${unreadChats.length === 1 ? "" : "ar"}`
                : "Inga olästa chattar just nu"}
            </p>
          </div>
          {unreadChats.length > 0 && (
            <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-red-100 px-2.5 py-1 text-sm font-semibold text-red-600">
              {unreadChats.length}
            </span>
          )}
        </div>

        {unreadChats.length > 0 ? (
          <div className="mt-4 space-y-3">
            {unreadChats.map((booking) => (
              <button
                key={booking.id}
                type="button"
                onClick={() => navigate(`/bookings/${booking.id}#chat`)}
                className="w-full rounded-2xl border border-surface-border bg-white px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-brand-700 truncate">{booking.displayTitle || booking.customCourse || booking.course.name}</p>
                    <p className="text-sm text-brand-400 mt-1">
                      {new Date(booking.date).toLocaleDateString("sv-SE")} · {booking.city}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 7.5v9A2.25 2.25 0 0 1 19.5 18.75h-15A2.25 2.25 0 0 1 2.25 16.5v-9m19.5 0A2.25 2.25 0 0 0 19.5 5.25h-15A2.25 2.25 0 0 0 2.25 7.5m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 9.66A2.25 2.25 0 0 1 2.25 7.743V7.5" />
                    </svg>
                    Oläst
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card p-3 sm:p-5">
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          locale="sv"
          firstDay={1}
          events={events}
          selectable={isAdmin}
          selectMirror={isAdmin}
          selectAllow={(selectionInfo) => selectionInfo.allDay}
          select={(selectionInfo) => {
            selectionInfo.view.calendar.unselect();
            setPeriodError("");
            setSelectedPeriod({
              startDate: selectionInfo.startStr,
              endDate: getInclusiveEndDate(selectionInfo),
              type: "vacation",
            });
          }}
          eventContent={renderEventContent}
          eventClick={(info) => {
            const eventType = info.event.extendedProps.eventType as "booking" | "blockingPeriod" | undefined;
            if (eventType === "blockingPeriod") {
              if (!isAdmin) {
                return;
              }

              void deleteBlockingPeriod(info.event.id, info.event.extendedProps.blockingPeriodType as BlockingPeriodType);
              return;
            }

            navigate(`/bookings/${info.event.id}`);
          }}
          dateClick={(info) => navigate(`/bookings/new?date=${info.dateStr}`)}
          height="auto"
          dayMaxEvents={isMobile ? 2 : 3}
          buttonText={{
            today: "Idag",
            month: "Månad",
            week: "Vecka",
          }}
        />
          </div>
        </div>
      </div>

      {selectedPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-brand-800">Lägg in period</h2>
              <p className="mt-1 text-sm text-brand-400">
                {selectedPeriod.startDate === selectedPeriod.endDate
                  ? `Vald dag: ${selectedPeriod.startDate}`
                  : `Vald period: ${selectedPeriod.startDate} till ${selectedPeriod.endDate}`}
              </p>
            </div>

            {periodError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {periodError}
              </div>
            )}

            <div>
              <label className="label">Typ av period</label>
              <select
                value={selectedPeriod.type}
                onChange={(e) => setSelectedPeriod((current) => current ? { ...current, type: e.target.value as BlockingPeriodType } : current)}
                className="input"
              >
                <option value="vacation">Semester</option>
                <option value="blocked">Spärra för bokningar</option>
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPeriodError("");
                  setSelectedPeriod(null);
                }}
                className="rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={() => void saveBlockingPeriod()}
                disabled={savingPeriod}
                className="btn-primary disabled:opacity-50"
              >
                {savingPeriod ? "Sparar..." : "Spara period"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
