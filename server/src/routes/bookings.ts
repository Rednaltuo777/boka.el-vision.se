import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import * as outlook from "../lib/outlook";

const router = Router();

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

  res.json({ booking, distanceWarning });
});

// Get all bookings (admin sees all, client sees own)
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const where = req.userRole === "admin" ? {} : { clientId: req.userId };

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true } },
    },
    orderBy: { date: "asc" },
  });

  // Strip private notes for non-admin users
  const result = bookings.map((b) => ({
    ...b,
    privateNotes: req.userRole === "admin" ? b.privateNotes : undefined,
  }));

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
    },
  });

  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (req.userRole !== "admin" && booking.clientId !== req.userId) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  res.json({
    ...booking,
    privateNotes: req.userRole === "admin" ? booking.privateNotes : undefined,
  });
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
