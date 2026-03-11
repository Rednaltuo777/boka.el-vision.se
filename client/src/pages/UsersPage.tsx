import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User, Invitation } from "../types";

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") return;
    api.get<User[]>("/users").then(setUsers);
    api.get<Invitation[]>("/invitations").then(setInvitations);
  }, [user]);

  const sendInvitation = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const inv = await api.post<Invitation>("/invitations", { email });
      setMessage(`Inbjudan skickad! Registreringslänk: ${inv.registerUrl}`);
      setEmail("");
      setInvitations((prev) => [inv, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka inbjudan");
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-20 text-brand-400">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        <p className="font-medium">Endast administratörer har åtkomst</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">Användare & inbjudningar</h1>
        <p className="text-sm text-brand-400 mt-1">Hantera uppdragsgivare och skicka inbjudningar</p>
      </div>

      {/* Invite Form */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide mb-4">Bjud in ny uppdragsgivare</h2>
        <form onSubmit={sendInvitation} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-postadress..."
            required
            className="input flex-1"
          />
          <button type="submit" className="btn-primary shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
            Skicka inbjudan
          </button>
        </form>
        {error && <p className="text-red-600 text-sm mt-3 flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>{error}</p>}
        {message && (
          <div className="mt-3 bg-accent-50 border border-accent-200 text-accent-700 p-3 rounded-xl text-sm break-all">
            {message}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invitations */}
        <div className="card">
          <div className="p-5 border-b border-surface-border">
            <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide">Inbjudningar</h2>
          </div>
          <div className="divide-y divide-surface-border">
            {invitations.length === 0 ? (
              <p className="p-5 text-brand-300 text-sm text-center">Inga inbjudningar ännu</p>
            ) : (
              invitations.map((inv) => (
                <div key={inv.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-brand-700">{inv.email}</p>
                    <p className="text-xs text-brand-300 mt-0.5">
                      Utgår {new Date(inv.expiresAt).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  <span className={`badge ${inv.used ? "badge-success" : "badge-warning"}`}>
                    {inv.used ? "Använd" : "Väntande"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* User List */}
        <div className="card">
          <div className="p-5 border-b border-surface-border">
            <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wide">
              Registrerade användare ({users.length})
            </h2>
          </div>
          <div className="divide-y divide-surface-border">
            {users.map((u) => (
              <div key={u.id} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-600 shrink-0">
                  {u.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-brand-700 truncate">{u.name || "–"}</p>
                    <span className={`badge ${u.role === "admin" ? "badge-admin" : "badge-info"}`}>
                      {u.role === "admin" ? "Admin" : "Uppdragsgivare"}
                    </span>
                  </div>
                  <p className="text-xs text-brand-400 truncate">{u.company ? `${u.company} · ` : ""}{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
