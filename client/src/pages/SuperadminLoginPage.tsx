import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SuperadminLoginPage() {
  const { superadminLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await superadminLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggning misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-surface-secondary items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm card p-6 sm:p-8">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-brand-900 p-4 mb-4">
            <img src="/logo.svg" alt="El-Vision" className="h-10 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-brand-800">Superadmin</h1>
          <p className="text-brand-400 text-sm mt-1">Separat inloggning för systemadministration</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="label">E-post</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="superadmin@el-vision.se"
              className="input"
            />
          </div>

          <div>
            <label className="label">Lösenord</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="input"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "Loggar in..." : "Logga in som superadmin"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-brand-400">
          <Link to="/login" className="text-brand-700 font-medium hover:underline">
            Tillbaka till vanlig inloggning
          </Link>
        </div>
      </div>
    </div>
  );
}