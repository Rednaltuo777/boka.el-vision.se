import { ConfidentialClientApplication } from "@azure/msal-node";
import prisma from "./prisma";

// Microsoft Entra ID (Azure AD) configuration
const TENANT_ID = process.env.MS_TENANT_ID || "consumers"; // "consumers" for personal Microsoft accounts
const CLIENT_ID = process.env.MS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.MS_REDIRECT_URI || "http://localhost:3001/api/outlook/callback";

const SCOPES = [
  "openid",
  "offline_access",
  "Calendars.ReadWrite",
  "User.Read",
];

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET,
  },
};

let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (!msalClient) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("MS_CLIENT_ID and MS_CLIENT_SECRET must be set in environment variables");
    }
    msalClient = new ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
}

/** Generate the Microsoft OAuth2 authorization URL */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPES.join(" "),
    prompt: "consent",
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

/** Exchange authorization code for tokens and store them */
export async function handleCallback(code: string): Promise<void> {
  const cca = getMsalClient();
  const result = await cca.acquireTokenByCode({
    code,
    redirectUri: REDIRECT_URI,
    scopes: SCOPES,
  });

  if (!result) throw new Error("Failed to acquire token");

  // Get user email from the token
  const email = result.account?.username || null;
  const expiresAt = result.expiresOn || new Date(Date.now() + 3600 * 1000);

  // Upsert the token — we only store one Microsoft account
  const existing = await prisma.oAuthToken.findFirst({ where: { provider: "microsoft" } });
  if (existing) {
    await prisma.oAuthToken.update({
      where: { id: existing.id },
      data: {
        accessToken: result.accessToken,
        // MSAL may or may not return a refresh token on every call
        // acquireTokenByCode should always give us one via MSAL cache
        refreshToken: "", // MSAL handles token caching internally
        expiresAt,
        email,
      },
    });
  } else {
    await prisma.oAuthToken.create({
      data: {
        provider: "microsoft",
        accessToken: result.accessToken,
        refreshToken: "",
        expiresAt,
        email,
      },
    });
  }
}

/** Get a valid access token, refreshing if needed using MSAL's built-in cache */
export async function getAccessToken(): Promise<string | null> {
  const stored = await prisma.oAuthToken.findFirst({ where: { provider: "microsoft" } });
  if (!stored) return null;

  // If token is still valid (with 5-min buffer), return it
  if (stored.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return stored.accessToken;
  }

  // Try silent token acquisition from MSAL cache
  try {
    const cca = getMsalClient();
    const accounts = await cca.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;

    const result = await cca.acquireTokenSilent({
      account: accounts[0],
      scopes: SCOPES.filter((s) => s !== "openid" && s !== "offline_access"),
    });

    if (result) {
      const expiresAt = result.expiresOn || new Date(Date.now() + 3600 * 1000);
      await prisma.oAuthToken.update({
        where: { id: stored.id },
        data: {
          accessToken: result.accessToken,
          expiresAt,
        },
      });
      return result.accessToken;
    }
  } catch {
    console.error("Failed to refresh Outlook token silently. Re-authentication needed.");
  }

  return null;
}

/** Check if Outlook is connected */
export async function getConnectionStatus(): Promise<{ connected: boolean; email: string | null }> {
  const stored = await prisma.oAuthToken.findFirst({ where: { provider: "microsoft" } });
  if (!stored) return { connected: false, email: null };

  const token = await getAccessToken();
  return { connected: !!token, email: stored.email };
}

/** Disconnect Outlook (remove stored tokens) */
export async function disconnect(): Promise<void> {
  await prisma.oAuthToken.deleteMany({ where: { provider: "microsoft" } });
  // Clear MSAL cache
  msalClient = null;
}

// ── Microsoft Graph Calendar API ──

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("Outlook not connected");

  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

interface BookingData {
  id: string;
  date: Date | string;
  endDate?: Date | string | null;
  city: string;
  courseName: string;
  clientName: string;
  clientCompany?: string;
  sharedNotes?: string;
}

function buildCalendarEvent(booking: BookingData) {
  const startDate = new Date(booking.date);
  const hasExplicitTime = startDate.getHours() !== 0 || startDate.getMinutes() !== 0 || startDate.getSeconds() !== 0;
  let endDate: Date;
  if (booking.endDate) {
    endDate = new Date(booking.endDate);
  } else {
    // Default: all-day event (same day)
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
  }

  const title = booking.clientCompany
    ? `${booking.clientCompany} – ${booking.courseName}`
    : `${booking.clientName} – ${booking.courseName}`;

  return {
    subject: title,
    body: {
      contentType: "text",
      content: booking.sharedNotes || "",
    },
    start: {
      dateTime: hasExplicitTime ? startDate.toISOString() : startDate.toISOString().split("T")[0],
      timeZone: "Europe/Stockholm",
    },
    end: {
      dateTime: hasExplicitTime ? endDate.toISOString() : endDate.toISOString().split("T")[0],
      timeZone: "Europe/Stockholm",
    },
    isAllDay: !hasExplicitTime,
    location: {
      displayName: booking.city,
    },
  };
}

/** Create a calendar event in Outlook for a booking */
export async function createEvent(booking: BookingData): Promise<string | null> {
  try {
    const event = buildCalendarEvent(booking);
    const res = await graphFetch("/me/events", {
      method: "POST",
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      console.error("Failed to create Outlook event:", await res.text());
      return null;
    }

    const data = (await res.json()) as { id: string };
    return data.id;
  } catch (err) {
    console.error("Outlook createEvent error:", err);
    return null;
  }
}

/** Update an existing calendar event */
export async function updateEvent(outlookEventId: string, booking: BookingData): Promise<void> {
  try {
    const event = buildCalendarEvent(booking);
    const res = await graphFetch(`/me/events/${outlookEventId}`, {
      method: "PATCH",
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      console.error("Failed to update Outlook event:", await res.text());
    }
  } catch (err) {
    console.error("Outlook updateEvent error:", err);
  }
}

/** Delete a calendar event from Outlook */
export async function deleteEvent(outlookEventId: string): Promise<void> {
  try {
    const res = await graphFetch(`/me/events/${outlookEventId}`, {
      method: "DELETE",
    });

    if (!res.ok && res.status !== 404) {
      console.error("Failed to delete Outlook event:", await res.text());
    }
  } catch (err) {
    console.error("Outlook deleteEvent error:", err);
  }
}
