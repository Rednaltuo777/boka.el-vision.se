import { useState, FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [form, setForm] = useState({
    token: searchParams.get("token") || "",
    email: searchParams.get("email") || "",
    password: "",
    name: "",
    company: "",
    department: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrering misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-900 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <img src="/logo.svg" alt="El-Vision" className="h-20 w-auto mx-auto mb-10" />
          <p className="text-white/50 text-sm leading-relaxed">
            Skapa ditt konto för att börja boka utbildningar.
            Fyll i dina uppgifter nedan för att komma igång.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-surface-secondary">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            <div className="bg-brand-900 rounded-2xl p-4">
              <img src="/logo.svg" alt="El-Vision" className="h-10 w-auto" />
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-brand-800">Skapa konto</h1>
            <p className="text-brand-400 text-sm mt-1">Fyll i dina uppgifter för att registrera dig</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                {error}
              </div>
            )}

            <input type="hidden" value={form.token} />

            <div>
              <label className="label">E-post</label>
              <input type="email" value={form.email} readOnly className="input bg-surface-tertiary" />
            </div>
            <div>
              <label className="label">Lösenord</label>
              <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={6} placeholder="Minst 6 tecken" className="input" />
            </div>
            <div>
              <label className="label">Namn</label>
              <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} required placeholder="Ditt fullständiga namn" className="input" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Företag</label>
                <input type="text" value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Företagsnamn" className="input" />
              </div>
              <div>
                <label className="label">Avdelning</label>
                <input type="text" value={form.department} onChange={(e) => update("department", e.target.value)} placeholder="Avdelning" className="input" />
              </div>
            </div>
            <div>
              <label className="label">Telefonnummer</label>
              <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="070-123 45 67" className="input" />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? "Registrerar..." : "Skapa konto"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-brand-400 hover:text-brand-700">
              Har redan ett konto? Logga in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
