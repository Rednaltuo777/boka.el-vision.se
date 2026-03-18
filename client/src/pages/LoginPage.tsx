import { useState, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggning misslyckades");
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
            Bokningssystem för utbildningar inom elkraft och elsäkerhet.
            Hantera bokningar, kurser och kommunikation – allt på ett ställe.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-surface-secondary">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 flex justify-center">
            <div className="bg-brand-900 rounded-2xl p-4">
              <img src="/logo.svg" alt="El-Vision" className="h-10 w-auto" />
            </div>
          </div>

          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-bold text-brand-800">Välkommen tillbaka</h1>
            <p className="text-brand-400 text-sm mt-1">Logga in för att hantera dina bokningar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                {error}
              </div>
            )}

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
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-sm text-brand-700 font-medium hover:underline">
                  Glömt lösenord?
                </Link>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loggar in...
                </span>
              ) : "Logga in"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-brand-400">
              Fått en inbjudan?{" "}
              <Link to="/register" className="text-brand-700 font-medium hover:underline">
                Registrera dig här
              </Link>
            </p>
            <p className="text-sm text-brand-400 mt-2">
              Superadmin?{" "}
              <Link to="/superadmin/login" className="text-brand-700 font-medium hover:underline">
                Använd superadmin-inloggningen
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
