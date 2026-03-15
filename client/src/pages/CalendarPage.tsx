import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import type { EventContentArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { api } from "../lib/api";
import type { Booking } from "../types";

export default function CalendarPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const navigate = useNavigate();

  const formatTime = (value: string) => new Date(value).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    api.get<Booking[]>("/bookings").then(setBookings);
  }, []);

  const events = bookings.map((b) => ({
    id: b.id,
    title: b.displayTitle || `${b.client.company || b.client.name} – ${b.customCourse || b.course.name}`,
    start: b.date,
    end: b.endDate || undefined,
    backgroundColor: "#1f1f1f",
    borderColor: "#1f1f1f",
    textColor: "#ffffff",
    extendedProps: {
      hasUnread: Boolean(b.hasUnread),
    },
  }));

  const renderEventContent = (info: EventContentArg) => {
    const hasUnread = Boolean(info.event.extendedProps.hasUnread);
    const start = info.event.start ? formatTime(info.event.start.toISOString()) : null;
    const end = info.event.end ? formatTime(info.event.end.toISOString()) : null;
    const timeLabel = start && end ? `${start}-${end}` : null;
    const isMaskedPrivate = info.event.title === "Privat";
    const displayTitle = isMaskedPrivate ? "+Privat händelse" : info.event.title;

    return (
      <div className="flex items-center gap-1 min-w-0">
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Bokningskalender</h1>
          <p className="text-sm text-brand-400 mt-1">{bookings.length} bokningar totalt</p>
        </div>
        <button onClick={() => navigate("/bookings/new")} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ny bokning
        </button>
      </div>

      {/* Calendar */}
      <div className="card p-5">
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
          eventContent={renderEventContent}
          eventClick={(info) => navigate(`/bookings/${info.event.id}`)}
          dateClick={(info) => navigate(`/bookings/new?date=${info.dateStr}`)}
          height="auto"
          dayMaxEvents={3}
          buttonText={{
            today: "Idag",
            month: "Månad",
            week: "Vecka",
          }}
        />
      </div>
    </div>
  );
}
