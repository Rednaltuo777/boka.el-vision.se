import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

export default function ForcePasswordChangePage() {
  const navigate = useNavigate();
  const { refreshUser, logout } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Det nya lösenordet måste vara minst 8 tecken.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Lösenorden matchar inte.");
      return;
    }

    setLoading(true);
    try {
      await api.post<{ success: boolean; user: User }>("/auth/change-password", { newPassword });
      await refreshUser();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera lösenordet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-surface-secondary">
      <div className="w-full max-w-sm card p-6 sm:p-8">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-brand-900 p-4 mb-4">
            <img src="/logo.svg" alt="El-Vision" className="h-10 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-brand-800">Byt lösenord nu</h1>
          <p className="text-brand-400 text-sm mt-1">Ditt konto kräver ett nytt lösenord innan du kan fortsätta.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="label">Nytt lösenord</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" autoComplete="new-password" />
          </div>

          <div>
            <label className="label">Bekräfta nytt lösenord</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" autoComplete="new-password" />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "Sparar..." : "Spara nytt lösenord"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-400">
          <button onClick={logout} className="text-brand-700 font-medium hover:underline">Logga ut</button>
        </div>
      </div>
    </div>
  );
}