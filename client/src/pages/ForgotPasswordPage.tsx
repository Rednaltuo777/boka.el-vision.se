import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await api.post<{ success: boolean; message: string }>("/auth/forgot-password", { email });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka återställningslänk");
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
          <h1 className="text-2xl font-bold text-brand-800">Glömt lösenord</h1>
          <p className="text-brand-400 text-sm mt-1">Ange din e-post så skickar vi en säker återställningslänk.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded-xl border border-accent-200 bg-accent-50 px-3 py-3 text-sm text-accent-700">{message}</div>}

          <div>
            <label className="label">E-post</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="din@epost.se"
              className="input"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "Skickar..." : "Skicka återställningslänk"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-400">
          <Link to="/login" className="text-brand-700 font-medium hover:underline">Tillbaka till inloggning</Link>
        </div>
      </div>
    </div>
  );
}