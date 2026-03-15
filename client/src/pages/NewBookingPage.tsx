import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Course, Booking } from "../types";

export default function NewBookingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [useCustomCourse, setUseCustomCourse] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    date: searchParams.get("date") || "",
    startTime: "08:00",
    endTime: "16:00",
    city: "",
    courseId: "",
    customCourse: "",
    sharedNotes: "",
  });

  useEffect(() => {
    api.get<Course[]>("/courses").then(setCourses);
  }, []);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setWarning("");
    setLoading(true);
    try {
      const res = await api.post<{ booking: Booking; distanceWarning: string | null }>("/bookings", {
        ...form,
        courseId: form.courseId || courses[0]?.id,
      });
      if (res.distanceWarning) {
        setWarning(res.distanceWarning);
        setTimeout(() => navigate(`/bookings/${res.booking.id}`), 3000);
      } else {
        navigate(`/bookings/${res.booking.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa bokning");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-brand-400 hover:text-brand-700 flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Tillbaka
        </button>
        <h1 className="text-2xl font-bold text-brand-800">Ny bokning</h1>
        <p className="text-sm text-brand-400 mt-1">Fyll i uppgifterna för att boka en utbildning</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Datum</label>
            <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required className="input" />
          </div>
          <div>
            <label className="label">Ort</label>
            <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} required placeholder="T.ex. Stockholm, Göteborg..." className="input" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Starttid</label>
            <input type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} required className="input" />
          </div>
          <div>
            <label className="label">Sluttid</label>
            <input type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} required className="input" />
          </div>
        </div>

        <div>
          <label className="label">Utbildning</label>
          {!useCustomCourse ? (
            <select value={form.courseId} onChange={(e) => update("courseId", e.target.value)} required className="input">
              <option value="">Välj utbildning...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input type="text" value={form.customCourse} onChange={(e) => update("customCourse", e.target.value)} placeholder="Ange kursnamn..." className="input" />
          )}
          <label className="flex items-center gap-2 mt-2.5 text-sm text-brand-400 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustomCourse}
              onChange={(e) => setUseCustomCourse(e.target.checked)}
              className="rounded border-brand-300 text-brand-700 focus:ring-brand-400"
            />
            Ange egen kurs (finns ej i listan)
          </label>
        </div>

        <div>
          <label className="label">Anteckningar (synliga för båda parter)</label>
          <textarea value={form.sharedNotes} onChange={(e) => update("sharedNotes", e.target.value)} rows={3} placeholder="Valfria anteckningar..." className="input resize-none" />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? "Skapar bokning..." : "Skapa bokning"}
        </button>
      </form>
    </div>
  );
}
