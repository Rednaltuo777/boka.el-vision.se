import { useState, useEffect, FormEvent } from "react";
import { api } from "../lib/api";
import type { User } from "../types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", company: "", department: "", phone: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<User>("/auth/me").then((u) => {
      setProfile(u);
      setForm({ name: u.name || "", company: u.company || "", department: u.department || "", phone: u.phone || "" });
    });
  }, []);

  const update = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const updated = await api.put<User>("/users/me", form);
    setProfile(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-brand-300 border-t-brand-700 rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">Min profil</h1>
        <p className="text-sm text-brand-400 mt-1">Uppdatera dina kontaktuppgifter</p>
      </div>

      {/* Avatar + info */}
      <div className="card p-4 sm:p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-700 flex items-center justify-center text-xl font-bold text-white shrink-0">
          {profile.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div>
          <p className="font-semibold text-brand-800">{profile.name || "Namnlös"}</p>
          <p className="text-sm text-brand-400">{profile.email}</p>
          <span className={`badge mt-1 ${profile.role === "admin" ? "badge-admin" : "badge-info"}`}>
            {profile.role === "admin" ? "Administratör" : "Uppdragsgivare"}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSubmit} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide">Kontaktuppgifter</h2>

        <div>
          <label className="label">E-post</label>
          <input type="email" value={profile.email} readOnly className="input bg-surface-tertiary" />
        </div>
        <div>
          <label className="label">Namn</label>
          <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} className="input" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Företag</label>
            <input type="text" value={form.company} onChange={(e) => update("company", e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Avdelning</label>
            <input type="text" value={form.department} onChange={(e) => update("department", e.target.value)} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Telefonnummer</label>
          <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <button type="submit" className="btn-primary w-full sm:w-auto">
            Spara ändringar
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
    </div>
  );
}
