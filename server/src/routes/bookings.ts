import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { sendEmail } from "../lib/email";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import * as outlook from "../lib/outlook";

const router = Router();

function withUnreadStatus<T extends { chatMessages: Array<{ createdAt: Date; authorId: string }>; chatReads: Array<{ lastReadAt: Date }>; privateNotes?: string | null }>(
  booking: T,
  userId: string,
  isAdmin: boolean,
) {
  const latestMessage = booking.chatMessages[0];
  const latestRead = booking.chatReads[0];
  const hasUnread = Boolean(
    latestMessage
    && latestMessage.authorId !== userId
    && (!latestRead || latestMessage.createdAt > latestRead.lastReadAt),
  );

  return {
    ...booking,
    privateNotes: isAdmin ? booking.privateNotes : undefined,
    hasUnread,
  };
}

/**
 * Calculate approximate distance in km between two Swedish cities
 * using a simple lookup + Haversine formula.
 * In production, replace with a geocoding API.
 */
const CITY_COORDS: Record<string, [number, number]> = {
  stockholm: [59.3293, 18.0686],
  göteborg: [57.7089, 11.9746],
  malmö: [55.605, 13.0038],
  uppsala: [59.8586, 17.6389],
  linköping: [58.4108, 15.6214],
  örebro: [59.2753, 15.2134],
  västerås: [59.6099, 16.5448],
  norrköping: [58.5942, 16.1826],
  jönköping: [57.7826, 14.1618],
  umeå: [63.8258, 20.2630],
  lund: [55.7047, 13.1910],
  borås: [57.7210, 12.9401],
  sundsvall: [62.3908, 17.3069],
  gävle: [60.6749, 17.1413],
  karlstad: [59.3793, 13.5036],
  luleå: [65.5848, 22.1547],
  växjö: [56.8777, 14.8091],
  halmstad: [56.6745, 12.8578],
  kalmar: [56.6634, 16.3566],
  kristianstad: [56.0294, 14.1567],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDistanceWarning(city1: string, city2: string): string | null {
  const c1 = CITY_COORDS[city1.toLowerCase()];
  const c2 = CITY_COORDS[city2.toLowerCase()];
  if (!c1 || !c2) return null;
  const km = haversineKm(c1[0], c1[1], c2[0], c2[1]);
  // 30 Swedish miles = 300 km
  if (km > 300) {
    return `Varning: Avståndet mellan ${city1} och ${city2} är ca ${Math.round(km)} km (${Math.round(km / 10)} mil). Det överstiger 30 mil.`;
  }
  return null;
}

async function sendBookingConfirmationEmail(booking: {
  id: string;
  date: Date;
  city: string;
  sharedNotes: string;
  customCourse: string | null;
  course: { name: string };
  client: { name: string | null; company: string | null; email: string };
}) {
  const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").trim();
  const bookingUrl = `${clientUrl}/bookings/${booking.id}`;
  const courseName = booking.customCourse || booking.course.name;
  const formattedDate = booking.date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return sendEmail({
    to: [booking.client.email, "thomas@el-vision.se"],
    subject: `Bokningsbekräftelse: ${courseName} ${formattedDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; color: #1f2937;">
        <h2 style="color: #1e3a5f; margin-bottom: 16px;">Bokningsbekräftelse</h2>
        <p>En ny bokning har registrerats i El-Visions bokningssystem.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 160px;">Datum</td>
            <td style="padding: 8px 0; font-weight: 600;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Ort</td>
            <td style="padding: 8px 0; font-weight: 600;">${booking.city}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Utbildning</td>
            <td style="padding: 8px 0; font-weight: 600;">${courseName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Bokad av</td>
            <td style="padding: 8px 0; font-weight: 600;">${booking.client.name || booking.client.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Företag</td>
            <td style="padding: 8px 0; font-weight: 600;">${booking.client.company || "-"}</td>
          </tr>
        </table>
        ${booking.sharedNotes ? `<p><strong>Anteckningar:</strong><br/>${booking.sharedNotes.replace(/\n/g, "<br/>")}</p>` : ""}
        <p style="margin-top: 24px;">
          <a href="${bookingUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Öppna bokningen
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Detta meddelande skickades automatiskt från El-Vision Bokningssystem.</p>
      </div>
    `,
    text: [
      "En ny bokning har registrerats i El-Visions bokningssystem.",
      `Datum: ${formattedDate}`,
      `Ort: ${booking.city}`,
      `Utbildning: ${courseName}`,
      `Bokad av: ${booking.client.name || booking.client.email}`,
      `Företag: ${booking.client.company || "-"}`,
      booking.sharedNotes ? `Anteckningar: ${booking.sharedNotes}` : "",
      `Öppna bokningen: ${bookingUrl}`,
    ].filter(Boolean).join("\n"),
  });
}

// Create a booking
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  const { date, endDate, city, courseId, customCourse, sharedNotes } = req.body;
  if (!date || !city || !courseId) {
    res.status(400).json({ error: "Datum, ort och kurs krävs" });
    return;
  }

  const bookingDate = new Date(date);

  // Check for double booking on the same date
  const existingOnDate = await prisma.booking.findFirst({
    where: {
      date: {
        gte: new Date(bookingDate.toISOString().split("T")[0]),
        lt: new Date(new Date(bookingDate.toISOString().split("T")[0]).getTime() + 86400000),
      },
    },
  });

  if (existingOnDate) {
    res.status(409).json({ error: "Det finns redan en bokning på detta datum. Dubbelbokning är inte tillåten." });
    return;
  }

  // Geographic distance warning
  const dayBefore = new Date(bookingDate.getTime() - 86400000);
  const dayAfter = new Date(bookingDate.getTime() + 86400000);

  const adjacentBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { date: { gte: dayBefore, lt: bookingDate } },
        { date: { gte: bookingDate, lt: dayAfter } },
      ],
    },
  });

  let distanceWarning: string | null = null;
  for (const adj of adjacentBookings) {
    const warning = getDistanceWarning(city, adj.city);
    if (warning) {
      distanceWarning = warning;
      break;
    }
  }

  const booking = await prisma.booking.create({
    data: {
      date: bookingDate,
      endDate: endDate ? new Date(endDate) : null,
      city,
      courseId,
      customCourse: customCourse || null,
      sharedNotes: sharedNotes || "",
      clientId: req.userId!,
    },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true } },
    },
  });

  // Sync to Outlook calendar (fire-and-forget)
  outlook.createEvent({
    id: booking.id,
    date: booking.date,
    endDate: booking.endDate,
    city: booking.city,
    courseName: booking.customCourse || booking.course.name,
    clientName: booking.client.name || "",
    clientCompany: booking.client.company || undefined,
    sharedNotes: booking.sharedNotes,
  }).then((eventId) => {
    if (eventId) {
      prisma.booking.update({ where: { id: booking.id }, data: { outlookEventId: eventId } }).catch(() => {});
    }
  }).catch(() => {});

  sendBookingConfirmationEmail(booking).catch((err) => {
    console.error("Failed to send booking confirmation email:", err);
  });

  res.json({ booking, distanceWarning });
});

// Get all bookings for all authenticated users
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const bookings = await prisma.booking.findMany({
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true } },
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, authorId: true },
      },
      chatReads: {
        where: { userId: req.userId },
        take: 1,
        select: { lastReadAt: true },
      },
    },
    orderBy: { date: "asc" },
  });

  const result = bookings.map((booking) => withUnreadStatus(booking, req.userId!, req.userRole === "admin"));

  res.json(result);
});

// Get single booking
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true } },
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, authorId: true },
      },
      chatReads: {
        where: { userId: req.userId },
        take: 1,
        select: { lastReadAt: true },
      },
    },
  });

  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  res.json(withUnreadStatus(booking, req.userId!, req.userRole === "admin"));
});

// Update booking
router.put("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (req.userRole !== "admin" && booking.clientId !== req.userId) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  const { date, endDate, city, courseId, customCourse, sharedNotes, privateNotes } = req.body;

  const nextDate = date ? new Date(date) : booking.date;
  const nextCity = city || booking.city;

  if (Number.isNaN(nextDate.getTime())) {
    res.status(400).json({ error: "Ogiltigt datum" });
    return;
  }

  if (!nextCity || !(courseId || booking.courseId)) {
    res.status(400).json({ error: "Datum, ort och kurs krävs" });
    return;
  }

  const startOfDay = new Date(nextDate.toISOString().split("T")[0]);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const existingOnDate = await prisma.booking.findFirst({
    where: {
      id: { not: id },
      date: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  });

  if (existingOnDate) {
    res.status(409).json({ error: "Det finns redan en bokning på detta datum. Dubbelbokning är inte tillåten." });
    return;
  }

  const dayBefore = new Date(startOfDay.getTime() - 86400000);
  const dayAfter = new Date(startOfDay.getTime() + 86400000);

  const adjacentBookings = await prisma.booking.findMany({
    where: {
      id: { not: id },
      OR: [
        { date: { gte: dayBefore, lt: startOfDay } },
        { date: { gte: startOfDay, lt: dayAfter } },
      ],
    },
  });

  let distanceWarning: string | null = null;
  for (const adjacentBooking of adjacentBookings) {
    const warning = getDistanceWarning(nextCity, adjacentBooking.city);
    if (warning) {
      distanceWarning = warning;
      break;
    }
  }

  const data: Record<string, unknown> = {};
  if (date) data.date = new Date(date);
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (city) data.city = city;
  if (courseId) data.courseId = courseId;
  if (customCourse !== undefined) data.customCourse = customCourse || null;
  if (sharedNotes !== undefined) data.sharedNotes = sharedNotes;
  if (privateNotes !== undefined && req.userRole === "admin") data.privateNotes = privateNotes;

  const updated = await prisma.booking.update({
    where: { id },
    data,
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true } },
    },
  });

  // Sync update to Outlook calendar (fire-and-forget)
  if (updated.outlookEventId) {
    outlook.updateEvent(updated.outlookEventId, {
      id: updated.id,
      date: updated.date,
      endDate: updated.endDate,
      city: updated.city,
      courseName: updated.customCourse || updated.course.name,
      clientName: updated.client.name || "",
      clientCompany: updated.client.company || undefined,
      sharedNotes: updated.sharedNotes,
    }).catch(() => {});
  }

  res.json({
    ...updated,
    privateNotes: req.userRole === "admin" ? updated.privateNotes : undefined,
    distanceWarning,
  });
});

// Delete booking (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({ where: { id } });

  // Delete from Outlook first (fire-and-forget)
  if (booking?.outlookEventId) {
    outlook.deleteEvent(booking.outlookEventId).catch(() => {});
  }

  await prisma.booking.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
