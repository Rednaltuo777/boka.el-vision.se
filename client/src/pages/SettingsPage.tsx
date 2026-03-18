import { useState, useEffect, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Course } from "../types";

interface OutlookStatus {
  connected: boolean;
  email: string | null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const [outlookStatus, setOutlookStatus] = useState<OutlookStatus | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courseActionLoading, setCourseActionLoading] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [courseError, setCourseError] = useState("");
  const [courseSuccess, setCourseSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  // Check for OAuth callback results
  const outlookResult = searchParams.get("outlook");
  const outlookMessage = searchParams.get("message");

  useEffect(() => {
    // Clear query params after reading
    if (outlookResult) {
      const timeout = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [outlookResult, setSearchParams]);

  useEffect(() => {
    api.get<OutlookStatus>("/outlook/status")
      .then(setOutlookStatus)
      .catch(() => setOutlookStatus({ connected: false, email: null }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setCoursesLoading(false);
      return;
    }

    api.get<Course[]>("/courses")
      .then(setCourses)
      .catch(() => setCourseError("Kunde inte hämta kurslistan"))
      .finally(() => setCoursesLoading(false));
  }, [isAdmin]);

  const loadCourses = async () => {
    const nextCourses = await api.get<Course[]>("/courses");
    setCourses(nextCourses);
  };

  const resetCourseMessages = () => {
    setCourseError("");
    setCourseSuccess("");
  };

  const createCourse = async (e: FormEvent) => {
    e.preventDefault();
    resetCourseMessages();
    setCourseActionLoading(true);

    try {
      await api.post<Course>("/courses", { name: courseName });
      setCourseName("");
      setCourseSuccess("Kursen lades till");
      await loadCourses();
    } catch (err) {
      setCourseError(err instanceof Error ? err.message : "Kunde inte lägga till kursen");
    } finally {
      setCourseActionLoading(false);
    }
  };

  const startEditingCourse = (course: Course) => {
    resetCourseMessages();
    setEditingCourseId(course.id);
    setEditingName(course.name);
  };

  const saveCourse = async (id: string) => {
    resetCourseMessages();
    setCourseActionLoading(true);

    try {
      await api.put<Course>(`/courses/${id}`, { name: editingName });
      setEditingCourseId(null);
      setEditingName("");
      setCourseSuccess("Kursen uppdaterades");
      await loadCourses();
    } catch (err) {
      setCourseError(err instanceof Error ? err.message : "Kunde inte uppdatera kursen");
    } finally {
      setCourseActionLoading(false);
    }
  };

  const deleteCourse = async (course: Course) => {
    const confirmed = window.confirm(`Radera kursen \"${course.name}\"?`);
    if (!confirmed) return;

    resetCourseMessages();
    setCourseActionLoading(true);

    try {
      await api.delete<{ success: boolean }>(`/courses/${course.id}`);
      setCourseSuccess("Kursen raderades");
      if (editingCourseId === course.id) {
        setEditingCourseId(null);
        setEditingName("");
      }
      await loadCourses();
    } catch (err) {
      setCourseError(err instanceof Error ? err.message : "Kunde inte radera kursen");
    } finally {
      setCourseActionLoading(false);
    }
  };

  const connectOutlook = async () => {
    setActionLoading(true);
    try {
      const { url } = await api.get<{ url: string }>("/outlook/connect");
      window.location.href = url;
    } catch {
      alert("Kunde inte starta Outlook-anslutning. Kontrollera att MS_CLIENT_ID och MS_CLIENT_SECRET är konfigurerade.");
      setActionLoading(false);
    }
  };

  const disconnectOutlook = async () => {
    if (!confirm("Vill du koppla bort Outlook-kalendern?")) return;
    setActionLoading(true);
    try {
      await api.post("/outlook/disconnect", {});
      setOutlookStatus({ connected: false, email: null });
    } catch {
      alert("Kunde inte koppla bort Outlook.");
    } finally {
      setActionLoading(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("Det nya lösenordet måste vara minst 8 tecken.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Det nya lösenordet och bekräftelsen matchar inte.");
      return;
    }

    setPasswordLoading(true);
    try {
      await api.post<{ success: boolean }>("/auth/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess("Lösenordet har uppdaterats.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Kunde inte byta lösenord");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">Inställningar</h1>
        <p className="text-sm text-brand-400 mt-1">Hantera integrationer och systeminställningar</p>
      </div>

      {/* OAuth callback notification */}
      {outlookResult === "connected" && (
        <div className="rounded-xl bg-accent-50 border border-accent-200 p-4 flex items-center gap-3">
          <CheckCircleIcon className="w-5 h-5 text-accent-600 shrink-0" />
          <p className="text-sm text-accent-700 font-medium">Outlook-kalendern har anslutits!</p>
        </div>
      )}
      {outlookResult === "error" && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
          <ExclamationIcon className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            Anslutning misslyckades{outlookMessage ? `: ${outlookMessage}` : ""}
          </p>
        </div>
      )}

      <div className="card">
        <div className="p-6 border-b border-surface-border/50">
          <h2 className="text-lg font-semibold text-brand-800">Byt lösenord</h2>
          <p className="text-sm text-brand-400">Gäller dig som är inloggad, oavsett roll.</p>
        </div>

        <form onSubmit={changePassword} className="p-6 space-y-4">
          <div>
            <label className="label">Nuvarande lösenord</label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))}
              className="input"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="label">Nytt lösenord</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((current) => ({ ...current, newPassword: e.target.value }))}
              className="input"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="label">Bekräfta nytt lösenord</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))}
              className="input"
              autoComplete="new-password"
            />
          </div>

          {passwordError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{passwordError}</div>
          )}
          {passwordSuccess && (
            <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">{passwordSuccess}</div>
          )}

          <button type="submit" disabled={passwordLoading} className="btn-primary disabled:opacity-50">
            {passwordLoading ? "Uppdaterar..." : "Byt lösenord"}
          </button>
        </form>
      </div>

      {/* Outlook Calendar Integration */}
      <div className="card">
        <div className="p-6 border-b border-surface-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <OutlookIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-800">Outlook-kalender</h2>
              <p className="text-sm text-brand-400">Synka bokningar automatiskt med Outlook</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-3 text-brand-400">
              <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
              <span className="text-sm">Kontrollerar status...</span>
            </div>
          ) : outlookStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-accent-50 border border-accent-200">
                <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
                  <CheckCircleIcon className="w-5 h-5 text-accent-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-accent-700">Ansluten</p>
                  {outlookStatus.email && (
                    <p className="text-xs text-accent-600 mt-0.5">{outlookStatus.email}</p>
                  )}
                </div>
              </div>

              <p className="text-sm text-brand-400">
                Alla bokningar synkas automatiskt till kalendern. Nya bokningar skapas som heldagshändelser,
                och ändringar och borttagningar speglas direkt.
              </p>

              <button
                onClick={disconnectOutlook}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50"
              >
                {actionLoading ? (
                  <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                ) : (
                  <DisconnectIcon className="w-4 h-4" />
                )}
                Koppla bort
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-tertiary border border-surface-border">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
                  <OutlookIcon className="w-5 h-5 text-brand-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-500">Ej ansluten</p>
                  <p className="text-xs text-brand-400 mt-0.5">Anslut för att synka bokningar till Outlook</p>
                </div>
              </div>

              <div className="text-sm text-brand-400 space-y-2">
                <p>Genom att ansluta Outlook-kalendern kommer:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Nya bokningar skapas som kalenderhändelser</li>
                  <li>Ändringar i bokningar uppdateras automatiskt</li>
                  <li>Borttagna bokningar tas bort från kalendern</li>
                </ul>
              </div>

              <button
                onClick={connectOutlook}
                disabled={actionLoading}
                className="btn-primary disabled:opacity-50"
              >
                {actionLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <OutlookIcon className="w-4 h-4" />
                )}
                Anslut Outlook-kalender
              </button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="p-6 border-b border-surface-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <CoursesIcon className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-brand-800">Kurser</h2>
                <p className="text-sm text-brand-400">Lägg till, byt namn på och radera kurser i listan</p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
            <form onSubmit={createCourse} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Namn på ny kurs"
                className="input flex-1"
              />
                <button type="submit" disabled={courseActionLoading} className="btn-primary w-full sm:w-auto disabled:opacity-50">
                Lägg till kurs
              </button>
            </form>

            {courseError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {courseError}
              </div>
            )}
            {courseSuccess && (
              <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
                {courseSuccess}
              </div>
            )}

            {coursesLoading ? (
              <div className="flex items-center gap-3 text-brand-400">
                <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
                <span className="text-sm">Laddar kurser...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {courses.map((course) => {
                  const isEditing = editingCourseId === course.id;

                  return (
                    <div key={course.id} className="rounded-2xl border border-surface-border bg-white px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="input"
                          />
                        ) : (
                          <div>
                            <p className="font-medium text-brand-700">{course.name}</p>
                            <p className="text-xs text-brand-400 mt-1">Standardkurs i bokningslistan</p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveCourse(course.id)}
                              disabled={courseActionLoading}
                              className="btn-primary w-full sm:w-auto disabled:opacity-50"
                            >
                              Spara
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCourseId(null);
                                setEditingName("");
                                resetCourseMessages();
                              }}
                              className="inline-flex items-center justify-center rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary"
                            >
                              Avbryt
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingCourse(course)}
                              className="inline-flex items-center justify-center rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-brand-500 hover:bg-surface-secondary"
                            >
                              Redigera
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteCourse(course)}
                              disabled={courseActionLoading}
                              className="inline-flex items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Radera
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {courses.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-surface-border px-4 py-6 text-sm text-brand-400">
                    Inga kurser finns ännu.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* SVG Icons */
function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  );
}

function DisconnectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function CoursesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h10.5m-10.5 4.5h10.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.5 15.75 2.25 2.25 3.75-4.5" />
    </svg>
  );
}
