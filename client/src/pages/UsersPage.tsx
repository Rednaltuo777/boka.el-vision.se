import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User, Invitation } from "../types";

const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Kunde inte läsa bildfilen"));
    reader.readAsDataURL(file);
  });
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);

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
      const inv = await api.post<Invitation & { emailSent?: boolean }>("/invitations", { email });
      if (inv.emailSent) {
        setMessage(`Inbjudan skickad till ${email}!`);
      } else {
        setMessage(`Inbjudan skapad. E-post kunde inte skickas. Länk: ${inv.registerUrl}`);
      }
      setEmail("");
      setInvitations((prev) => [inv, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka inbjudan");
    }
  };

  const deleteInvitation = async (id: string) => {
    try {
      await api.delete(`/invitations/${id}`);
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte radera inbjudan");
    }
  };

  const startEditingLogo = (selectedUser: User) => {
    setError("");
    setMessage("");
    setEditingUserId(selectedUser.id);
    setLogoUrl(selectedUser.logoUrl || "");
  };

  const saveLogo = async (userId: string) => {
    setSavingLogo(true);
    setError("");
    setMessage("");

    try {
      const updatedUser = await api.put<User>(`/users/${userId}`, { logoUrl });
      setUsers((current) => current.map((item) => item.id === userId ? updatedUser : item));
      setEditingUserId(null);
      setLogoUrl("");
      setMessage("Logotypen sparades.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara logotypen");
    } finally {
      setSavingLogo(false);
    }
  };

  const handleLogoFileChange = async (selectedUserId: string, file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Välj en bildfil för logotypen");
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE) {
      setError("Bildfilen är för stor. Välj en fil som är mindre än 2 MB.");
      return;
    }

    setError("");
    setMessage("");
    setSavingLogo(true);

    try {
      const nextLogoUrl = await readFileAsDataUrl(file);
      const updatedUser = await api.put<User>(`/users/${selectedUserId}`, { logoUrl: nextLogoUrl });
      setUsers((current) => current.map((item) => item.id === selectedUserId ? updatedUser : item));
      setEditingUserId(null);
      setLogoUrl("");
      setMessage("Logotypen laddades upp.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp logotypen");
    } finally {
      setSavingLogo(false);
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
                  <div className="flex items-center gap-2">
                    <span className={`badge ${inv.used ? "badge-success" : "badge-warning"}`}>
                      {inv.used ? "Använd" : "Väntande"}
                    </span>
                    {!inv.used && (
                      <button
                        onClick={() => deleteInvitation(inv.id)}
                        className="text-red-400 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50"
                        title="Radera inbjudan"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
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
              <div key={u.id} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-surface-border overflow-hidden flex items-center justify-center text-sm font-bold text-brand-600 shrink-0 shadow-sm">
                    {u.logoUrl ? (
                      <img src={u.logoUrl} alt={u.company || u.name || "Logotyp"} className="h-full w-full object-contain bg-white p-1.5" />
                    ) : (
                      u.name?.[0]?.toUpperCase() || "?"
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-brand-700 truncate">{u.name || "–"}</p>
                      <span className={`badge ${u.role === "admin" ? "badge-admin" : "badge-info"}`}>
                        {u.role === "admin" ? "Admin" : "Uppdragsgivare"}
                      </span>
                      {u.logoUrl && (
                        <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">
                          Logga sparad
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brand-400 truncate">{u.company ? `${u.company} · ` : ""}{u.email}</p>
                  </div>
                  {u.role !== "admin" && (
                    <button
                      type="button"
                      onClick={() => startEditingLogo(u)}
                      className="inline-flex items-center rounded-xl border border-surface-border px-3 py-2 text-xs font-medium text-brand-500 hover:bg-surface-secondary"
                    >
                      Logotyp
                    </button>
                  )}
                </div>

                {editingUserId === u.id && u.role !== "admin" && (
                  <div className="rounded-2xl border border-surface-border bg-surface-secondary/60 p-4 space-y-3">
                    <div>
                      <label className="label">Förhandsvisning</label>
                      <div className="mt-2 flex items-center gap-4 rounded-2xl border border-surface-border bg-white p-4">
                        <div className="h-20 w-20 rounded-2xl border border-surface-border bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                          {logoUrl || u.logoUrl ? (
                            <img
                              src={logoUrl || u.logoUrl || ""}
                              alt={u.company || u.name || "Logotyp"}
                              className="h-full w-full object-contain bg-white p-2"
                            />
                          ) : (
                            <span className="text-xs text-brand-300">Ingen logga</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-brand-700">{u.company || u.name || "Uppdragsgivare"}</p>
                          <p className="text-xs text-brand-400 mt-1">Här ser du direkt om logotypen finns sparad och hur den visas i systemet.</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="label">Ladda upp logotyp</label>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => void handleLogoFileChange(u.id, e.target.files?.[0] || null)}
                        className="block w-full rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-brand-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-200"
                      />
                      <p className="mt-2 text-xs text-brand-400">PNG, JPG, WebP eller SVG. Max 2 MB.</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-surface-border" />
                      <span className="text-xs font-medium uppercase tracking-wide text-brand-300">eller</span>
                      <div className="h-px flex-1 bg-surface-border" />
                    </div>

                    <label className="label">Logotyp-URL</label>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://.../logo.png"
                      className="input"
                    />
                    <p className="text-xs text-brand-400">Ange en publik bildlänk till uppdragsgivarens logotyp. Förhandsvisningen uppdateras direkt.</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveLogo(u.id)}
                        disabled={savingLogo}
                        className="btn-primary disabled:opacity-50"
                      >
                        {savingLogo ? "Sparar..." : "Spara logotyp"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(null);
                          setLogoUrl("");
                        }}
                        className="inline-flex items-center rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
