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
  const isAdminLike = user?.role === "admin" || user?.role === "superadmin";
  const isSuperadmin = user?.role === "superadmin";
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, User["role"]>>({});
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [previewLogoUrl, setPreviewLogoUrl] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [savingPasswordId, setSavingPasswordId] = useState<string | null>(null);
  const [forcingPasswordId, setForcingPasswordId] = useState<string | null>(null);
  const [sendingResetLinkId, setSendingResetLinkId] = useState<string | null>(null);
  const [temporaryPasswords, setTemporaryPasswords] = useState<Record<string, string>>({});
  const [brokenLogoUserIds, setBrokenLogoUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isAdminLike) return;
    api.get<User[]>("/users").then((loadedUsers) => {
      setUsers(loadedUsers);
      setRoleDrafts(Object.fromEntries(loadedUsers.map((loadedUser) => [loadedUser.id, loadedUser.role])));
    });
    api.get<Invitation[]>("/invitations").then(setInvitations);
  }, [isAdminLike]);

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
    setPreviewLogoUrl(selectedUser.logoUrl || "");
  };

  const saveLogo = async (userId: string) => {
    setSavingLogo(true);
    setError("");
    setMessage("");

    try {
      const updatedUser = await api.put<User>(`/users/${userId}`, { logoUrl });
      setUsers((current) => current.map((item) => item.id === userId ? updatedUser : item));
      setEditingUserId(userId);
      setLogoUrl(updatedUser.logoUrl || "");
      setPreviewLogoUrl(updatedUser.logoUrl || "");
      setBrokenLogoUserIds((current) => current.filter((id) => id !== userId));
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
      const objectUrl = URL.createObjectURL(file);
      setEditingUserId(selectedUserId);
      setPreviewLogoUrl(objectUrl);
      setBrokenLogoUserIds((current) => current.filter((id) => id !== selectedUserId));

      const nextLogoUrl = await readFileAsDataUrl(file);
      setLogoUrl(nextLogoUrl);
      const updatedUser = await api.put<User>(`/users/${selectedUserId}`, { logoUrl: nextLogoUrl });
      setUsers((current) => current.map((item) => item.id === selectedUserId ? updatedUser : item));
      setPreviewLogoUrl(updatedUser.logoUrl || nextLogoUrl);
      setMessage("Logotypen laddades upp och sparades.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp logotypen");
    } finally {
      setSavingLogo(false);
    }
  };

  const saveRole = async (userId: string) => {
    const nextRole = roleDrafts[userId];
    if (!nextRole) {
      return;
    }

    setSavingRoleId(userId);
    setError("");
    setMessage("");

    try {
      const updatedUser = await api.put<User>(`/users/${userId}/role`, { role: nextRole });
      setUsers((current) => current.map((item) => item.id === userId ? updatedUser : item));
      setRoleDrafts((current) => ({ ...current, [userId]: updatedUser.role }));
      setMessage(`Rollen uppdaterades för ${updatedUser.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera rollen");
    } finally {
      setSavingRoleId(null);
    }
  };

  const savePassword = async (targetUser: User) => {
    const nextPassword = (passwordDrafts[targetUser.id] || "").trim();
    if (nextPassword.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken.");
      setMessage("");
      return;
    }

    setSavingPasswordId(targetUser.id);
    setError("");
    setMessage("");

    try {
      await api.put<{ success: boolean }>(`/users/${targetUser.id}/password`, { password: nextPassword });
      setPasswordDrafts((current) => ({ ...current, [targetUser.id]: "" }));
      setMessage(`Nytt lösenord har sparats för ${targetUser.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera lösenordet");
    } finally {
      setSavingPasswordId(null);
    }
  };

  const generateTemporaryPassword = async (targetUser: User) => {
    setSavingPasswordId(targetUser.id);
    setError("");
    setMessage("");

    try {
      const result = await api.post<{ success: boolean; temporaryPassword: string }>(`/users/${targetUser.id}/temporary-password`, {});
      setTemporaryPasswords((current) => ({ ...current, [targetUser.id]: result.temporaryPassword }));
      setMessage(`Temporärt lösenord genererades för ${targetUser.email}. Användaren måste byta lösenord vid nästa inloggning.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte generera tillfälligt lösenord");
    } finally {
      setSavingPasswordId(null);
    }
  };

  const forcePasswordChange = async (targetUser: User, forcePasswordChange: boolean) => {
    setForcingPasswordId(targetUser.id);
    setError("");
    setMessage("");

    try {
      await api.put<{ success: boolean; forcePasswordChange: boolean }>(`/users/${targetUser.id}/force-password-change`, { forcePasswordChange });
      setUsers((current) => current.map((item) => item.id === targetUser.id ? { ...item, forcePasswordChange } : item));
      setMessage(forcePasswordChange
        ? `Användaren ${targetUser.email} måste byta lösenord vid nästa inloggning.`
        : `Kravet på lösenordsbyte togs bort för ${targetUser.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera lösenordskravet");
    } finally {
      setForcingPasswordId(null);
    }
  };

  const sendResetLink = async (targetUser: User) => {
    setSendingResetLinkId(targetUser.id);
    setError("");
    setMessage("");

    try {
      await api.post<{ success: boolean }>(`/users/${targetUser.id}/password-reset-link`, {});
      setMessage(`Återställningslänk skickades till ${targetUser.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka återställningslänk");
    } finally {
      setSendingResetLinkId(null);
    }
  };

  if (!isAdminLike) {
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
      <div className="card p-4 sm:p-6">
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
                <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-700 break-all">{inv.email}</p>
                    <p className="text-xs text-brand-300 mt-0.5">
                      Utgår {new Date(inv.expiresAt).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-surface-border overflow-hidden flex items-center justify-center text-sm font-bold text-brand-600 shrink-0 shadow-sm">
                    {u.logoUrl && !brokenLogoUserIds.includes(u.id) ? (
                      <img
                        src={u.logoUrl || ""}
                        alt={u.company || u.name || "Logotyp"}
                        className="h-full w-full object-contain bg-white p-1.5"
                        onError={() => setBrokenLogoUserIds((current) => current.includes(u.id) ? current : [...current, u.id])}
                      />
                    ) : (
                      u.name?.[0]?.toUpperCase() || "?"
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-brand-700 truncate">{u.name || "–"}</p>
                      <span className={`badge ${u.role === "superadmin" ? "badge-superadmin" : u.role === "admin" ? "badge-admin" : "badge-info"}`}>
                        {u.role === "superadmin" ? "Superadmin" : u.role === "admin" ? "Admin" : "Uppdragsgivare"}
                      </span>
                      {u.logoUrl && (
                        <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">
                          Logga sparad
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brand-400 truncate">{u.company ? `${u.company} · ` : ""}{u.email}</p>
                  </div>
                  {u.role === "client" && (
                    <button
                      type="button"
                      onClick={() => startEditingLogo(u)}
                      className="inline-flex items-center justify-center rounded-xl border border-surface-border px-3 py-2 text-xs font-medium text-brand-500 hover:bg-surface-secondary self-start sm:self-auto"
                    >
                      Logotyp
                    </button>
                  )}
                </div>

                {u.logoUrl && (
                  <div className={`rounded-2xl border px-4 py-3 ${brokenLogoUserIds.includes(u.id) ? "border-amber-200 bg-amber-50" : "border-surface-border bg-surface-secondary/40"}`}>
                    <p className="text-xs font-medium uppercase tracking-wide text-brand-300 mb-3">Sparad logotyp</p>
                    {brokenLogoUserIds.includes(u.id) ? (
                      <p className="text-sm text-amber-700">Logotypen är sparad men kunde inte visas. Kontrollera bildlänken eller prova att ladda upp filen igen.</p>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="h-20 w-20 rounded-2xl border border-surface-border bg-white overflow-hidden flex items-center justify-center shrink-0">
                          <img
                            src={u.logoUrl || ""}
                            alt={u.company || u.name || "Logotyp"}
                            className="h-full w-full object-contain p-2"
                            onError={() => setBrokenLogoUserIds((current) => current.includes(u.id) ? current : [...current, u.id])}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-brand-700">{u.company || u.name || "Uppdragsgivare"}</p>
                          <p className="text-xs text-brand-400 mt-1">Logotypen ar sparad och visas ovan.</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isSuperadmin && (
                  <div className="rounded-2xl border border-surface-border bg-surface-secondary/60 p-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-brand-700">Rollhantering</p>
                        <p className="text-xs text-brand-400">Endast superadmin kan ändra roller och utse fler administratörer.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <select
                          value={roleDrafts[u.id] || u.role}
                          onChange={(e) => setRoleDrafts((current) => ({ ...current, [u.id]: e.target.value as User["role"] }))}
                          className="input min-w-40"
                        >
                          <option value="client">Uppdragsgivare</option>
                          <option value="admin">Admin</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void saveRole(u.id)}
                          disabled={savingRoleId === u.id || (roleDrafts[u.id] || u.role) === u.role}
                          className="btn-secondary disabled:opacity-50"
                        >
                          {savingRoleId === u.id ? "Sparar..." : "Spara roll"}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-surface-border pt-3 space-y-2">
                      <p className="text-sm font-medium text-brand-700">Sätt nytt lösenord</p>
                      <p className="text-xs text-brand-400">Superadmin kan sätta ett nytt lösenord, men kan inte se befintliga lösenord eftersom de lagras hashade.</p>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <input
                          type="password"
                          value={passwordDrafts[u.id] || ""}
                          onChange={(e) => setPasswordDrafts((current) => ({ ...current, [u.id]: e.target.value }))}
                          placeholder="Minst 8 tecken"
                          className="input"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => void savePassword(u)}
                          disabled={savingPasswordId === u.id || !(passwordDrafts[u.id] || "").trim()}
                          className="btn-secondary disabled:opacity-50"
                        >
                          {savingPasswordId === u.id ? "Sparar..." : "Sätt lösenord"}
                        </button>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-brand-500 pt-1">
                        <input
                          type="checkbox"
                          checked={Boolean(u.forcePasswordChange)}
                          onChange={(e) => void forcePasswordChange(u, e.target.checked)}
                          disabled={forcingPasswordId === u.id}
                          className="rounded border-brand-300 text-brand-700 focus:ring-brand-400"
                        />
                        Tvinga lösenordsbyte vid nästa inloggning
                      </label>
                    </div>

                    <div className="border-t border-surface-border pt-3 space-y-2">
                      <p className="text-sm font-medium text-brand-700">Temporärt lösenord</p>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <button
                          type="button"
                          onClick={() => void generateTemporaryPassword(u)}
                          disabled={savingPasswordId === u.id}
                          className="btn-secondary disabled:opacity-50"
                        >
                          {savingPasswordId === u.id ? "Genererar..." : "Generera temporärt lösenord"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void sendResetLink(u)}
                          disabled={sendingResetLinkId === u.id}
                          className="btn-secondary disabled:opacity-50"
                        >
                          {sendingResetLinkId === u.id ? "Skickar..." : "Skicka återställningslänk"}
                        </button>
                      </div>
                      {temporaryPasswords[u.id] && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 break-all">
                          Temporärt lösenord: <span className="font-semibold">{temporaryPasswords[u.id]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {editingUserId === u.id && u.role === "client" && (
                  <div className="rounded-2xl border border-surface-border bg-surface-secondary/60 p-4 space-y-3">
                    <div>
                      <label className="label">Förhandsvisning</label>
                      <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-surface-border bg-white p-4">
                        <div className="h-20 w-20 rounded-2xl border border-surface-border bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                          {((editingUserId === u.id ? (previewLogoUrl || logoUrl) : u.logoUrl) && !brokenLogoUserIds.includes(u.id)) ? (
                            <img
                              src={editingUserId === u.id ? previewLogoUrl || logoUrl || u.logoUrl || "" : u.logoUrl || ""}
                              alt={u.company || u.name || "Logotyp"}
                              className="h-full w-full object-contain bg-white p-2"
                              onError={() => setBrokenLogoUserIds((current) => current.includes(u.id) ? current : [...current, u.id])}
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
                    {editingUserId === u.id && (error || message) && (
                      <div className={`rounded-xl px-3 py-2 text-sm ${error ? "border border-red-200 bg-red-50 text-red-700" : "border border-accent-200 bg-accent-50 text-accent-700"}`}>
                        {error || message}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveLogo(u.id)}
                        disabled={savingLogo}
                        className="btn-primary w-full sm:w-auto disabled:opacity-50"
                      >
                        {savingLogo ? "Sparar..." : "Spara logotyp"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(null);
                          setLogoUrl("");
                          setPreviewLogoUrl("");
                        }}
                        className="inline-flex items-center justify-center rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary"
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
