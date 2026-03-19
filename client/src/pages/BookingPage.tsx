import { useState, useEffect, FormEvent, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Booking, ChatMessage, Course } from "../types";

const PRIVATE_OPTION = "__private__";
const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const PRIVATE_ATTACHMENTS_MARKER = "<!--PRIVATE_ATTACHMENTS:";
const PRIVATE_ATTACHMENTS_SUFFIX = "-->";
const MAX_PRIVATE_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_PRIVATE_ATTACHMENTS_TOTAL_SIZE = 3 * 1024 * 1024;

type BookingUpdateResponse = Booking & { distanceWarning?: string | null };

type PrivateAttachment = {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  kind: "image" | "file";
};

type BookingFormState = {
  date: string;
  startTime: string;
  endTime: string;
  participants: string;
  city: string;
  isPrivate: boolean;
  courseId: string;
  customCourse: string;
  sharedNotes: string;
  privateNotes: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInput(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const formatted = date.toLocaleTimeString("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (formatted === "00:00") return "";
  return formatted;
}

function formatStockholmDate(value: string) {
  return new Date(value).toLocaleDateString("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatStockholmShortDate(value: string) {
  return new Date(value).toLocaleDateString("sv-SE", {
    timeZone: STOCKHOLM_TIME_ZONE,
  });
}

function formatTimeRange(dateValue: string, endDateValue: string | null) {
  const start = toTimeInput(dateValue);
  const end = toTimeInput(endDateValue);
  if (!start || !end) return null;
  return `${start}–${end}`;
}

function parsePrivateNotes(value: string | null | undefined) {
  const source = value || "";
  const markerIndex = source.indexOf(PRIVATE_ATTACHMENTS_MARKER);
  if (markerIndex === -1) {
    return { text: source, attachments: [] as PrivateAttachment[] };
  }

  const markerEndIndex = source.indexOf(PRIVATE_ATTACHMENTS_SUFFIX, markerIndex);
  if (markerEndIndex === -1) {
    return { text: source, attachments: [] as PrivateAttachment[] };
  }

  const text = source.slice(0, markerIndex).trimEnd();
  const encodedPayload = source.slice(markerIndex + PRIVATE_ATTACHMENTS_MARKER.length, markerEndIndex);

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedPayload));
    if (!Array.isArray(parsed)) {
      return { text, attachments: [] as PrivateAttachment[] };
    }

    const attachments = parsed.filter((item): item is PrivateAttachment => (
      item
      && typeof item.name === "string"
      && typeof item.url === "string"
      && typeof item.mimeType === "string"
      && typeof item.size === "number"
      && (item.kind === "image" || item.kind === "file")
    ));

    return { text, attachments };
  } catch {
    return { text: source, attachments: [] as PrivateAttachment[] };
  }
}

function buildPrivateNotesPayload(text: string, attachments: PrivateAttachment[]) {
  const trimmedText = text.trimEnd();
  if (attachments.length === 0) {
    return trimmedText;
  }

  const encodedAttachments = encodeURIComponent(JSON.stringify(attachments));
  const separator = trimmedText ? "\n\n" : "";
  return `${trimmedText}${separator}${PRIVATE_ATTACHMENTS_MARKER}${encodedAttachments}${PRIVATE_ATTACHMENTS_SUFFIX}`;
}

function estimateAttachmentBytes(attachments: PrivateAttachment[]) {
  return attachments.reduce((sum, attachment) => sum + attachment.size, 0);
}

function toFormState(booking: Booking): BookingFormState {
  const parsedPrivateNotes = parsePrivateNotes(booking.privateNotes);
  return {
    date: toDateInput(booking.date),
    startTime: toTimeInput(booking.date) || "08:00",
    endTime: toTimeInput(booking.endDate) || "16:00",
    participants: String(booking.participants ?? 1),
    city: booking.city,
    isPrivate: Boolean(booking.isPrivate),
    courseId: booking.courseId,
    customCourse: booking.customCourse || "",
    sharedNotes: booking.sharedNotes,
    privateNotes: parsedPrivateNotes.text,
  };
}

function toDisplayBooking(booking: Booking) {
  const parsedPrivateNotes = parsePrivateNotes(booking.privateNotes);
  return {
    booking: {
      ...booking,
      privateNotes: parsedPrivateNotes.text,
    },
    attachments: parsedPrivateNotes.attachments,
  };
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [form, setForm] = useState<BookingFormState>({
    date: "",
    startTime: "08:00",
    endTime: "16:00",
    participants: "1",
    city: "",
    isPrivate: false,
    courseId: "",
    customCourse: "",
    sharedNotes: "",
    privateNotes: "",
  });
  const [editMode, setEditMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [useCustomCourse, setUseCustomCourse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [privateAttachments, setPrivateAttachments] = useState<PrivateAttachment[]>([]);
  const [savedPrivateAttachments, setSavedPrivateAttachments] = useState<PrivateAttachment[]>([]);
  const isOwner = booking?.clientId === user?.id;
  const canDirectlySaveNotes = isAdmin;
  const canViewBookingContent = booking?.canViewBookingContent !== false;
  const moveBookingHelpText = booking?.moveBookingMessage || "Du kan omboka denna bokning en gång så länge det är mer än 14 dagar kvar till kursstart.";

  useEffect(() => {
    const locationState = location.state as { distanceWarning?: string } | null;
    if (locationState?.distanceWarning) {
      setWarning(locationState.distanceWarning);
    }
  }, [location.state]);

  useEffect(() => {
    if (!id) return;
    api.get<Booking>(`/bookings/${id}`).then((b) => {
      const normalized = toDisplayBooking(b);
      setBooking(normalized.booking);
      setForm(toFormState(normalized.booking));
      setMoveDate(toDateInput(normalized.booking.date));
      setUseCustomCourse(Boolean(normalized.booking.customCourse));
      setPrivateAttachments(normalized.attachments);
      setSavedPrivateAttachments(normalized.attachments);
    });
    if (isAdmin) {
      api.get<Course[]>("/courses").then(setCourses);
    }
  }, [id, isAdmin]);

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
    reader.readAsDataURL(file);
  });

  const handlePrivateAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    setError("");
    setSaved(false);

    try {
      let currentTotalSize = estimateAttachmentBytes(privateAttachments);
      const nextAttachments: PrivateAttachment[] = [];

      for (const file of selectedFiles) {
        if (file.size > MAX_PRIVATE_ATTACHMENT_SIZE) {
          throw new Error(`Filen ${file.name} är för stor. Max 2 MB per fil.`);
        }

        currentTotalSize += file.size;
        if (currentTotalSize > MAX_PRIVATE_ATTACHMENTS_TOTAL_SIZE) {
          throw new Error("Totalt uppladdat innehåll i privata anteckningar får vara högst 3 MB.");
        }

        const url = await readFileAsDataUrl(file);
        nextAttachments.push({
          name: file.name,
          url,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          kind: file.type.startsWith("image/") ? "image" : "file",
        });
      }

      setPrivateAttachments((current) => [...current, ...nextAttachments]);
      event.target.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp filen");
      event.target.value = "";
    }
  };

  const removePrivateAttachment = (indexToRemove: number) => {
    setPrivateAttachments((current) => current.filter((_, index) => index !== indexToRemove));
    setSaved(false);
  };

  useEffect(() => {
    if (!id) return;
    if (booking?.canAccessChat === false) {
      setMessages([]);
      return;
    }
    api.get<ChatMessage[]>(`/chat/${id}`).then(setMessages).catch(() => setMessages([]));
  }, [id, booking?.canAccessChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (location.hash === "#chat" && booking?.canAccessChat !== false) {
      chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash, booking?.canAccessChat]);

  const saveNotes = async () => {
    if (!id) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const data: Record<string, string> = { sharedNotes: form.sharedNotes };
      if (isAdmin) data.privateNotes = buildPrivateNotesPayload(form.privateNotes, privateAttachments);
      const updated = await api.put<Booking>(`/bookings/${id}`, data);
      const normalized = toDisplayBooking(updated);
      setBooking(normalized.booking);
      setForm(toFormState(normalized.booking));
      setPrivateAttachments(normalized.attachments);
      setSavedPrivateAttachments(normalized.attachments);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara anteckningar");
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field: keyof BookingFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setError("");
    setWarning("");
  };

  const saveBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setSaved(false);
    setError("");
    setWarning("");

    try {
      const updated = await api.put<BookingUpdateResponse>(`/bookings/${id}`, {
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        city: form.city,
        isPrivate: form.isPrivate,
        courseId: useCustomCourse ? booking?.courseId : form.courseId,
        customCourse: useCustomCourse ? form.customCourse : "",
        sharedNotes: form.sharedNotes,
        privateNotes: buildPrivateNotesPayload(form.privateNotes, privateAttachments),
      });

      const normalized = toDisplayBooking(updated);
      setBooking(normalized.booking);
      setForm(toFormState(normalized.booking));
      setUseCustomCourse(Boolean(normalized.booking.customCourse));
      setPrivateAttachments(normalized.attachments);
      setSavedPrivateAttachments(normalized.attachments);
      setEditMode(false);
      setSaved(true);
      if (updated.distanceWarning) {
        setWarning(updated.distanceWarning);
      }
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera bokningen");
    } finally {
      setSaving(false);
    }
  };

  const saveClientEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSaving(true);
    setSaved(false);
    setError("");
    setWarning("");

    try {
      const updated = await api.put<Booking>(`/bookings/${id}/edit`, {
        startTime: form.startTime,
        endTime: form.endTime,
        participants: Number(form.participants),
        notes: form.sharedNotes,
      });

      const normalized = toDisplayBooking(updated);
      setBooking(normalized.booking);
      setForm(toFormState(normalized.booking));
      setPrivateAttachments(normalized.attachments);
      setSavedPrivateAttachments(normalized.attachments);
      setEditMode(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera bokningen");
    } finally {
      setSaving(false);
    }
  };

  const submitMoveBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSaving(true);
    setSaved(false);
    setError("");
    setWarning("");

    try {
      const updated = await api.put<Booking>(`/bookings/${id}/move`, { date: moveDate });
      const normalized = toDisplayBooking(updated);
      setBooking(normalized.booking);
      setForm(toFormState(normalized.booking));
      setMoveDate(toDateInput(normalized.booking.date));
      setPrivateAttachments(normalized.attachments);
      setSavedPrivateAttachments(normalized.attachments);
      setMoveMode(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte flytta bokningen");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    if (!booking) return;
    setForm(toFormState(booking));
    setMoveDate(toDateInput(booking.date));
    setUseCustomCourse(Boolean(booking.customCourse));
    setPrivateAttachments(savedPrivateAttachments);
    setEditMode(false);
    setMoveMode(false);
    setError("");
    setWarning("");
  };

  const deleteBooking = async () => {
    if (!id || !isAdmin || !booking) return;

    const confirmed = window.confirm(`Ta bort bokningen \"${booking.displayTitle || booking.customCourse || booking.course.name}\"?`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await api.delete<{ success: boolean }>(`/bookings/${id}`);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort bokningen");
      setDeleting(false);
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !id) return;
    const msg = await api.post<ChatMessage>(`/chat/${id}`, { content: chatInput });
    setMessages((prev) => [...prev, msg]);
    setChatInput("");
  };

  if (!booking) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-brand-300 border-t-brand-700 rounded-full" />
      </div>
    );
  }

  const renderPrivateAttachments = (editable: boolean) => (
    <div className="mt-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-brand-300">Ladda upp bilder eller filer till privata anteckningar. Max 2 MB per fil, 3 MB totalt.</p>
        {editable && (
          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-surface-secondary">
            Ladda upp filer
            <input type="file" multiple onChange={handlePrivateAttachmentUpload} className="hidden" />
          </label>
        )}
      </div>

      {privateAttachments.length > 0 && (
        <div className="space-y-3">
          {privateAttachments.map((attachment, index) => (
            <div key={`${attachment.name}-${index}`} className="rounded-2xl border border-surface-border bg-surface-secondary/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand-700">{attachment.name}</p>
                  <p className="text-xs text-brand-300">{Math.max(1, Math.round(attachment.size / 1024))} KB</p>
                </div>
                <div className="flex items-center gap-2">
                  <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:text-brand-800">
                    Öppna
                  </a>
                  {editable && (
                    <button type="button" onClick={() => removePrivateAttachment(index)} className="text-sm font-medium text-red-600 hover:text-red-700">
                      Ta bort
                    </button>
                  )}
                </div>
              </div>
              {attachment.kind === "image" && (
                <img src={attachment.url} alt={attachment.name} className="mt-3 max-h-64 rounded-xl border border-surface-border bg-white object-contain" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate("/")} className="text-sm text-brand-400 hover:text-brand-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Tillbaka till kalendern
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-800">{booking.displayTitle || booking.customCourse || booking.course.name}</h1>
            <p className="text-brand-400 text-sm mt-1">
              {formatStockholmDate(booking.date)}
              {formatTimeRange(booking.date, booking.endDate) ? ` · ${formatTimeRange(booking.date, booking.endDate)}` : ""}
              {" · "}{booking.city}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 self-start w-full sm:w-auto">
            {booking.client.logoUrl && (
              <div className="h-12 w-12 rounded-xl border border-surface-border bg-white overflow-hidden shrink-0">
                <img src={booking.client.logoUrl} alt={booking.client.company || booking.client.name || "Logotyp"} className="h-full w-full object-contain" />
              </div>
            )}
            <span className="badge badge-info self-start max-w-full">
              {booking.client.company || booking.client.name}
            </span>
            {isAdmin && !editMode && !moveMode && (
              <div className="flex flex-col gap-2 self-start w-full sm:w-auto">
                <button onClick={() => setEditMode(true)} className="btn-primary w-full sm:w-auto">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  Redigera bokning
                </button>
                <button
                  type="button"
                  onClick={() => void deleteBooking()}
                  disabled={deleting}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.327L4.772 5.79m14.456 0A48.108 48.108 0 0 0 15.75 5.25m3.478.54a48.11 48.11 0 0 1-7.5 0m7.5 0V4.875c0-1.026-.79-1.891-1.816-1.966A52.816 52.816 0 0 0 12 2.25c-1.159 0-2.312.04-3.462.118-1.026.075-1.816.94-1.816 1.966v.915m7.5 0a48.667 48.667 0 0 1-7.5 0" />
                  </svg>
                  {deleting ? "Tar bort..." : "Ta bort bokningen"}
                </button>
              </div>
            )}
            {!isAdmin && isOwner && !editMode && !moveMode && (
              <div className="flex flex-col gap-2 self-start w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  disabled={!booking.canEditBookingFields}
                  className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit Booking
                </button>
                <button
                  type="button"
                  onClick={() => setMoveMode(true)}
                  disabled={!booking.canMoveBooking}
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-2xl border border-surface-border px-4 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Omboka datum
                </button>
                <p className="text-xs text-brand-400">{moveBookingHelpText}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {warning && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-sm">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div>
            <p className="font-medium">Geografisk varning</p>
            <p>{warning}</p>
          </div>
        </div>
      )}

      {!canViewBookingContent && (
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700 p-3 rounded-xl text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 9h1.5m-.75 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Innehållet i denna bokning är dolt eftersom den tillhör en annan e-postdomän.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Details + Notes */}
        <div className="lg:col-span-2 space-y-6">

          {/* Booking Details */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide mb-4">
              {editMode ? "Redigera bokning" : "Bokningsdetaljer"}
            </h2>

            {editMode && isAdmin ? (
              <form onSubmit={saveBooking} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Datum</label>
                    <input type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} required className="input" />
                  </div>
                  <div>
                    <label className="label">Ort</label>
                    <input type="text" value={form.city} onChange={(e) => updateForm("city", e.target.value)} required className="input" placeholder="T.ex. Stockholm, Göteborg..." />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Starttid</label>
                    <input type="time" value={form.startTime} onChange={(e) => updateForm("startTime", e.target.value)} required className="input" />
                  </div>
                  <div>
                    <label className="label">Sluttid</label>
                    <input type="time" value={form.endTime} onChange={(e) => updateForm("endTime", e.target.value)} required className="input" />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-brand-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isPrivate}
                    onChange={(e) => setForm((current) => ({ ...current, isPrivate: e.target.checked }))}
                    className="rounded border-brand-300 text-brand-700 focus:ring-brand-400"
                  />
                  Privat adminhändelse
                </label>

                <div>
                  <label className="label">Utbildning</label>
                  {!useCustomCourse ? (
                    <select
                      value={form.isPrivate ? PRIVATE_OPTION : form.courseId}
                      onChange={(e) => {
                        if (e.target.value === PRIVATE_OPTION) {
                          setForm((current) => ({ ...current, isPrivate: true }));
                          return;
                        }
                        setForm((current) => ({ ...current, isPrivate: false, courseId: e.target.value }));
                        setSaved(false);
                        setError("");
                        setWarning("");
                      }}
                      required
                      className="input"
                    >
                      <option value="">Välj utbildning...</option>
                      <option value={PRIVATE_OPTION}>*Privat*</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={form.customCourse} onChange={(e) => updateForm("customCourse", e.target.value)} className="input" placeholder="Ange kursnamn..." required />
                  )}
                  <label className="flex items-center gap-2 mt-2.5 text-sm text-brand-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomCourse}
                      onChange={(e) => {
                        setUseCustomCourse(e.target.checked);
                        setSaved(false);
                        setError("");
                        setWarning("");
                      }}
                      className="rounded border-brand-300 text-brand-700 focus:ring-brand-400"
                    />
                    Ange egen kurs (finns ej i listan)
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm pt-1">
                  <div>
                    <p className="text-brand-400 text-xs mb-0.5">Företag</p>
                    <p className="font-medium text-brand-700">{booking.client.company || "–"}</p>
                  </div>
                  <div>
                    <p className="text-brand-400 text-xs mb-0.5">Bokad av</p>
                    <p className="font-medium text-brand-700">{booking.client.name} · {booking.client.email}</p>
                  </div>
                </div>

                <div>
                  <label className="label">Delade anteckningar</label>
                  <textarea value={form.sharedNotes} onChange={(e) => updateForm("sharedNotes", e.target.value)} rows={3} className="input resize-none" />
                </div>

                <div>
                  <label className="label">Privata anteckningar</label>
                  <textarea value={form.privateNotes} onChange={(e) => updateForm("privateNotes", e.target.value)} rows={3} className="input resize-none" />
                  {renderPrivateAttachments(true)}
                </div>

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                    {saving ? "Sparar..." : "Spara ändringar"}
                  </button>
                  <button type="button" onClick={cancelEditing} className="px-4 py-2 rounded-xl border border-surface-border text-brand-500 hover:text-brand-700 hover:border-brand-200 transition-colors">
                    Avbryt
                  </button>
                  {saved && (
                    <span className="text-sm text-accent-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Sparat
                    </span>
                  )}
                </div>
              </form>
            ) : editMode && isOwner ? (
              <form onSubmit={saveClientEdit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Start time</label>
                    <input type="time" value={form.startTime} onChange={(e) => updateForm("startTime", e.target.value)} required className="input" />
                  </div>
                  <div>
                    <label className="label">End time</label>
                    <input type="time" value={form.endTime} onChange={(e) => updateForm("endTime", e.target.value)} required className="input" />
                  </div>
                </div>

                <div>
                  <label className="label">Participants</label>
                  <input
                    type="number"
                    min="1"
                    value={form.participants}
                    onChange={(e) => updateForm("participants", e.target.value)}
                    required
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea value={form.sharedNotes} onChange={(e) => updateForm("sharedNotes", e.target.value)} rows={3} className="input resize-none" />
                </div>

                <div className="rounded-2xl border border-surface-border bg-surface-secondary/60 px-4 py-3 text-sm text-brand-500">
                  Bookings can only be edited within 4 hours after creation.
                </div>

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                    {saving ? "Saving..." : "Save Booking"}
                  </button>
                  <button type="button" onClick={cancelEditing} className="px-4 py-2 rounded-xl border border-surface-border text-brand-500 hover:text-brand-700 hover:border-brand-200 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            ) : moveMode && isOwner ? (
              <form onSubmit={submitMoveBooking} className="space-y-5">
                <div>
                  <label className="label">Nytt datum</label>
                  <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} required className="input" />
                </div>

                <div className="rounded-2xl border border-surface-border bg-surface-secondary/60 px-4 py-3 text-sm text-brand-500">
                  {moveBookingHelpText}
                </div>

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                    {saving ? "Ombokar..." : "Spara nytt datum"}
                  </button>
                  <button type="button" onClick={cancelEditing} className="px-4 py-2 rounded-xl border border-surface-border text-brand-500 hover:text-brand-700 hover:border-brand-200 transition-colors">
                    Avbryt
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Booking ID</p>
                  <p className="font-medium text-brand-700 break-all">{booking.id}</p>
                </div>
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Datum</p>
                  <p className="font-medium text-brand-700">{formatStockholmShortDate(booking.date)}</p>
                </div>
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Tid</p>
                  <p className="font-medium text-brand-700">{formatTimeRange(booking.date, booking.endDate) || "Ej angiven"}</p>
                </div>
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Ort</p>
                  <p className="font-medium text-brand-700">{booking.city}</p>
                </div>
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Participants</p>
                  <p className="font-medium text-brand-700">{booking.participants}</p>
                </div>
                {booking.isPrivate && isAdmin && (
                  <div>
                    <p className="text-brand-400 text-xs mb-0.5">Synlighet</p>
                    <p className="font-medium text-brand-700">Privat för vanliga användare</p>
                  </div>
                )}
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Utbildning</p>
                  <p className="font-medium text-brand-700">{booking.customCourse || booking.course.name}</p>
                </div>
                <div>
                  <p className="text-brand-400 text-xs mb-0.5">Företag</p>
                  <p className="font-medium text-brand-700">{booking.client.company || "–"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-brand-400 text-xs mb-0.5">Bokad av</p>
                  <p className="font-medium text-brand-700">{booking.client.name} · {booking.client.email}</p>
                </div>
              </div>
            )}
          </div>

          {/* Shared Notes */}
          <div className={`card p-6 ${((editMode && isAdmin) || moveMode) ? "hidden" : ""}`}>
            <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide mb-4">Anteckningar</h2>
            <div>
              <label className="label">Delade anteckningar (synliga för båda)</label>
              <textarea
                value={form.sharedNotes}
                onChange={(e) => updateForm("sharedNotes", e.target.value)}
                rows={3}
                placeholder="Skriv anteckningar här..."
                className="input resize-none"
                readOnly={!canDirectlySaveNotes}
              />
            </div>

            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-surface-border">
                <label className="label flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  Privata anteckningar (bara du ser dessa)
                </label>
                <p className="text-xs text-brand-300 mb-2">Hotell, tåg, flyg, reseanteckningar m.m.</p>
                <textarea
                  value={form.privateNotes}
                  onChange={(e) => updateForm("privateNotes", e.target.value)}
                  rows={3}
                  placeholder="Privata anteckningar..."
                  className="input resize-none"
                />
                {renderPrivateAttachments(true)}
              </div>
            )}

            {canDirectlySaveNotes ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
                <button onClick={saveNotes} disabled={saving} className="btn-primary w-full sm:w-auto disabled:opacity-50">
                  {saving ? "Sparar..." : "Spara anteckningar"}
                </button>
                {saved && (
                  <span className="text-sm text-accent-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Sparat
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-brand-300 mt-4">Bara bokningens ägare eller admin kan ändra anteckningar. Chatt är också begränsad till ägaren och admin.</p>
            )}
          </div>
        </div>

        {/* Right column: Chat */}
        <div ref={chatSectionRef} className="lg:col-span-1" id="chat">
          <div className="card flex flex-col h-[420px] sm:h-[500px]">
            <div className="p-4 border-b border-surface-border">
              <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                Chatt
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-brand-300">
                  <svg className="w-10 h-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  <p className="text-xs">Inga meddelanden ännu</p>
                </div>
              ) : null}
              {messages.map((m) => {
                const isOwn = m.author.id === user?.id;
                return (
                  <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      isOwn
                        ? "bg-brand-700 text-white rounded-br-md"
                        : "bg-surface-tertiary text-brand-700 rounded-bl-md"
                    }`}>
                      <p className={`text-[10px] font-medium mb-0.5 ${isOwn ? "text-white/60" : "text-brand-400"}`}>
                        {m.author.name || "Okänd"}
                      </p>
                      <p>{m.content}</p>
                      <p className={`text-[10px] mt-1 ${isOwn ? "text-white/40" : "text-brand-300"}`}>
                        {new Date(m.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {booking.canAccessChat !== false ? (
              <form onSubmit={sendMessage} className="p-3 border-t border-surface-border flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Skriv meddelande..."
                  className="input text-sm py-2"
                />
                <button type="submit" className="btn-primary px-3 py-2 shrink-0 min-w-11">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </button>
              </form>
            ) : (
              <div className="p-3 border-t border-surface-border text-sm text-brand-300">Chatt är bara tillgänglig för bokningens ägare och admin.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
