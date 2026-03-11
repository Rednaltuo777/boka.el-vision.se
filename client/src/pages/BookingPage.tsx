import { useState, useEffect, FormEvent, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Booking, ChatMessage } from "../types";

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sharedNotes, setSharedNotes] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<Booking>(`/bookings/${id}`).then((b) => {
      setBooking(b);
      setSharedNotes(b.sharedNotes);
      setPrivateNotes(b.privateNotes || "");
    });
    api.get<ChatMessage[]>(`/chat/${id}`).then(setMessages);
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveNotes = async () => {
    if (!id) return;
    setSaving(true);
    setSaved(false);
    const data: Record<string, string> = { sharedNotes };
    if (isAdmin) data.privateNotes = privateNotes;
    const updated = await api.put<Booking>(`/bookings/${id}`, data);
    setBooking(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <h1 className="text-2xl font-bold text-brand-800">{booking.customCourse || booking.course.name}</h1>
            <p className="text-brand-400 text-sm mt-1">
              {new Date(booking.date).toLocaleDateString("sv-SE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              {" · "}{booking.city}
            </p>
          </div>
          <span className="badge badge-info self-start">
            {booking.client.company || booking.client.name}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Details + Notes */}
        <div className="lg:col-span-2 space-y-6">

          {/* Booking Details */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide mb-4">Bokningsdetaljer</h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <p className="text-brand-400 text-xs mb-0.5">Datum</p>
                <p className="font-medium text-brand-700">{new Date(booking.date).toLocaleDateString("sv-SE")}</p>
              </div>
              <div>
                <p className="text-brand-400 text-xs mb-0.5">Ort</p>
                <p className="font-medium text-brand-700">{booking.city}</p>
              </div>
              <div>
                <p className="text-brand-400 text-xs mb-0.5">Utbildning</p>
                <p className="font-medium text-brand-700">{booking.customCourse || booking.course.name}</p>
              </div>
              <div>
                <p className="text-brand-400 text-xs mb-0.5">Företag</p>
                <p className="font-medium text-brand-700">{booking.client.company || "–"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-brand-400 text-xs mb-0.5">Bokad av</p>
                <p className="font-medium text-brand-700">{booking.client.name} · {booking.client.email}</p>
              </div>
            </div>
          </div>

          {/* Shared Notes */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide mb-4">Anteckningar</h2>
            <div>
              <label className="label">Delade anteckningar (synliga för båda)</label>
              <textarea
                value={sharedNotes}
                onChange={(e) => { setSharedNotes(e.target.value); setSaved(false); }}
                rows={3}
                placeholder="Skriv anteckningar här..."
                className="input resize-none"
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
                  value={privateNotes}
                  onChange={(e) => { setPrivateNotes(e.target.value); setSaved(false); }}
                  rows={3}
                  placeholder="Privata anteckningar..."
                  className="input resize-none"
                />
              </div>
            )}

            <div className="flex items-center gap-3 mt-4">
              <button onClick={saveNotes} disabled={saving} className="btn-primary disabled:opacity-50">
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
          </div>
        </div>

        {/* Right column: Chat */}
        <div className="lg:col-span-1">
          <div className="card flex flex-col h-[500px]">
            <div className="p-4 border-b border-surface-border">
              <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                Chatt
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-brand-300">
                  <svg className="w-10 h-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  <p className="text-xs">Inga meddelanden ännu</p>
                </div>
              )}
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

            <form onSubmit={sendMessage} className="p-3 border-t border-surface-border flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Skriv meddelande..."
                className="input text-sm py-2"
              />
              <button type="submit" className="btn-primary px-3 py-2 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
