import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

interface OutlookStatus {
  connected: boolean;
  email: string | null;
}

export default function SettingsPage() {
  const [outlookStatus, setOutlookStatus] = useState<OutlookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
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
