import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const token = searchParams.get("token") || "";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("Återställningslänken saknar token.");
      return;
    }

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
      await api.post<{ success: boolean }>("/auth/reset-password", { token, newPassword });
      setMessage("Lösenordet är uppdaterat. Du kan nu logga in.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte återställa lösenordet");
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
          <h1 className="text-2xl font-bold text-brand-800">Välj nytt lösenord</h1>
          <p className="text-brand-400 text-sm mt-1">Skriv ditt nya lösenord nedan.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-xl border border-accent-200 bg-accent-50 px-3 py-3 text-sm text-accent-700">{message}</div>}

          <div>
            <label className="label">Nytt lösenord</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" autoComplete="new-password" />
          </div>

          <div>
            <label className="label">Bekräfta nytt lösenord</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" autoComplete="new-password" />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "Uppdaterar..." : "Spara nytt lösenord"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-400">
          <Link to="/login" className="text-brand-700 font-medium hover:underline">Tillbaka till inloggning</Link>
        </div>
      </div>
    </div>
  );
}