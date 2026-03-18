import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { sendEmail } from "../lib/email";
import { canViewSharedBookingContent } from "../lib/emailDomainAccess";
import { getOpenRouteServiceDistanceKm, getOpenRouteServiceTravelMinutes } from "../lib/openRouteService";
import { authenticate, requireAdmin, AuthRequest, hasAdminAccess } from "../middleware/auth";
import * as outlook from "../lib/outlook";

const router = Router();
const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";
const BOOKING_EDIT_WINDOW_MS = 4 * 60 * 60 * 1000;

const stockholmOffsetFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const stockholmTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const stockholmLongDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

function getTimeZoneOffsetMinutes(dateValue: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(dateValue);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second),
  );

  return (asUtc - dateValue.getTime()) / 60000;
}

function createStockholmDate(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = getTimeZoneOffsetMinutes(new Date(utcGuessMs), STOCKHOLM_TIME_ZONE);
  const candidateMs = utcGuessMs - firstOffset * 60 * 1000;
  const secondOffset = getTimeZoneOffsetMinutes(new Date(candidateMs), STOCKHOLM_TIME_ZONE);

  return new Date(utcGuessMs - secondOffset * 60 * 1000);
}

function canManageBooking(booking: { clientId: string }, req: AuthRequest) {
  return hasAdminAccess(req.userRole) || booking.clientId === req.userId;
}

function canViewBookingContent(booking: { clientId: string; isPrivate?: boolean; client?: { email?: string | null } | null }, req: AuthRequest) {
  return canViewSharedBookingContent(booking, req);
}

function isWithinEditWindow(createdAt: Date) {
  return Date.now() <= createdAt.getTime() + BOOKING_EDIT_WINDOW_MS;
}

function canEditBookingFields(booking: { clientId: string; createdAt: Date }, req: AuthRequest) {
  if (!canManageBooking(booking, req)) {
    return false;
  }

  if (hasAdminAccess(req.userRole)) {
    return true;
  }

  return isWithinEditWindow(booking.createdAt);
}

function canMoveBooking(booking: { clientId: string; rescheduleToken: boolean }, req: AuthRequest) {
  if (!canManageBooking(booking, req)) {
    return false;
  }

  if (hasAdminAccess(req.userRole)) {
    return true;
  }

  return booking.rescheduleToken;
}

function formatStockholmDateOnly(dateValue: Date): string {
  const parts = stockholmOffsetFormatter.formatToParts(dateValue);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

async function logBookingChange(input: {
  bookingId: string;
  changedById: string;
  changeType: string;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  await prisma.bookingChange.create({
    data: {
      bookingId: input.bookingId,
      changedById: input.changedById,
      changeType: input.changeType,
      oldValue: input.oldValue === undefined ? undefined : input.oldValue as object,
      newValue: input.newValue === undefined ? undefined : input.newValue as object,
    },
  });
}

function toBookingTitle(booking: {
  clientId: string;
  isPrivate?: boolean;
  customCourse: string | null;
  course: { name: string };
  client: { company: string | null; name: string | null; email?: string | null };
}, req: AuthRequest) {
  const canViewContent = canViewBookingContent(booking, req);
  if (!canViewContent) {
    return booking.isPrivate ? "Privat" : "Bokad";
  }

  return booking.client.company || booking.client.name
    ? `${booking.client.company || booking.client.name} – ${booking.customCourse || booking.course.name}`
    : booking.customCourse || booking.course.name;
}

function serializeBooking(booking: any, req: AuthRequest) {
  const canManage = canManageBooking(booking, req);
  const canViewContent = canViewBookingContent(booking, req);
  const isMasked = !canViewContent;
  const maskedTitle = booking.isPrivate ? "Privat" : "Bokad";
  const editable = canEditBookingFields(booking, req);
  const movable = canMoveBooking(booking, req);

  return {
    ...booking,
    notes: isMasked ? "" : booking.sharedNotes,
    customCourse: isMasked ? null : booking.customCourse,
    course: isMasked ? { ...booking.course, name: maskedTitle, isCustom: false } : booking.course,
    client: isMasked ? { ...booking.client, name: maskedTitle, company: null, email: "", logoUrl: null } : booking.client,
    city: isMasked ? "" : booking.city,
    sharedNotes: isMasked ? "" : booking.sharedNotes,
    privateNotes: hasAdminAccess(req.userRole) && canViewContent ? booking.privateNotes : undefined,
    hasUnread: canManage ? Boolean(booking.hasUnread) : false,
    latestChatAt: canManage ? booking.latestChatAt : null,
    displayTitle: toBookingTitle(booking, req),
    canAccessChat: canManage,
    canViewBookingContent: canViewContent,
    canEditBookingFields: editable,
    canMoveBooking: movable,
    editWindowEndsAt: new Date(booking.createdAt.getTime() + BOOKING_EDIT_WINDOW_MS).toISOString(),
  };
}

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
    hasUnread,
    latestChatAt: latestMessage?.createdAt ?? null,
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

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function getCityDistanceKm(city1: string, city2: string): number | null {
  const c1 = CITY_COORDS[normalizeCity(city1)];
  const c2 = CITY_COORDS[normalizeCity(city2)];
  if (!c1 || !c2) return null;
  return haversineKm(c1[0], c1[1], c2[0], c2[1]);
}

function getEstimatedTravelMinutes(city1: string, city2: string): number {
  if (normalizeCity(city1) === normalizeCity(city2)) {
    return 0;
  }

  const km = getCityDistanceKm(city1, city2);
  if (km === null) {
    // Unknown cities should not silently bypass same-day travel validation.
    return 31;
  }

  return Math.ceil((km / 80) * 60) + 30;
}

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

async function getRequiredTravelMinutes(city1: string, city2: string): Promise<number> {
  if (normalizeCity(city1) === normalizeCity(city2)) {
    return 0;
  }

  try {
    const openRouteServiceTravelMinutes = await getOpenRouteServiceTravelMinutes(city1, city2);
    if (openRouteServiceTravelMinutes !== null) {
      return openRouteServiceTravelMinutes;
    }
  } catch (error) {
    console.error("OpenRouteService travel time lookup failed:", error);
  }

  return getEstimatedTravelMinutes(city1, city2);
}

async function getDistanceWarning(city1: string, city2: string): Promise<string | null> {
  let km = getCityDistanceKm(city1, city2);

  if (km === null) {
    try {
      km = await getOpenRouteServiceDistanceKm(city1, city2);
    } catch (error) {
      console.error("OpenRouteService distance lookup failed:", error);
    }
  }

  if (km === null) return null;
  // 30 Swedish miles = 300 km
  if (km > 300) {
    return `Varning: Avståndet mellan ${city1} och ${city2} är ca ${Math.round(km)} km (${Math.round(km / 10)} mil). Det överstiger 30 mil.`;
  }
  return null;
}

function combineDateAndTime(dateValue: string, timeValue: string): Date {
  return createStockholmDate(dateValue, timeValue);
}

function formatDateOnly(dateValue: Date): string {
  return dateValue.toISOString().split("T")[0];
}

function addDays(dateValue: Date, days: number): Date {
  const result = new Date(dateValue);
  result.setDate(result.getDate() + days);
  return result;
}

function buildDateRange(startDateValue: string, endDateValue: string): string[] {
  const startDate = startOfDay(new Date(`${startDateValue}T12:00:00`));
  const endDate = startOfDay(new Date(`${endDateValue}T12:00:00`));
  const dates: string[] = [];

  for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
    dates.push(formatDateOnly(current));
  }

  return dates;
}

function startOfDay(dateValue: Date): Date {
  return new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()));
}

function endOfDay(dateValue: Date): Date {
  return new Date(startOfDay(dateValue).getTime() + 86400000);
}

function toTimeLabel(dateValue: Date | null): string | null {
  if (!dateValue) return null;
  return stockholmTimeFormatter.format(dateValue);
}

function getBlockingPeriodLabel(type: string): string {
  if (type === "vacation") return "semester";
  if (type === "private") return "privat period";
  return "spärrad period";
}

async function findBlockingPeriodForDate(dateValue: Date, userRole?: string) {
  return prisma.blockingPeriod.findFirst({
    where: {
      startDate: { lt: endOfDay(dateValue) },
      endDate: { gt: startOfDay(dateValue) },
      ...(hasAdminAccess(userRole) ? { type: { not: "private" } } : {}),
    },
    orderBy: { startDate: "asc" },
  });
}

async function findBookingsOnDate(dateValue: Date, excludeBookingId?: string) {
  return prisma.booking.findMany({
    where: {
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      date: {
        gte: startOfDay(dateValue),
        lt: endOfDay(dateValue),
      },
    },
    select: {
      id: true,
      date: true,
      endDate: true,
      city: true,
    },
    orderBy: { date: "asc" },
  });
}

async function findSameDaySchedulingConflict(
  bookingDate: Date,
  bookingEndDate: Date,
  city: string,
  excludeBookingId?: string,
) {
  const bookingsOnDate = await findBookingsOnDate(bookingDate, excludeBookingId);

  for (const existingBooking of bookingsOnDate) {
    const existingEndDate = existingBooking.endDate ?? existingBooking.date;

    if (rangesOverlap(bookingDate, bookingEndDate, existingBooking.date, existingEndDate)) {
      return `Tiden krockar med en annan bokning samma dag (${toTimeLabel(existingBooking.date) || "okänd tid"}-${toTimeLabel(existingEndDate) || "okänd tid"}).`;
    }

    const requiredTravelMinutes = await getRequiredTravelMinutes(city, existingBooking.city);
    if (requiredTravelMinutes === 0) {
      continue;
    }

    const newBookingStartsAfterExisting = bookingDate >= existingEndDate;
    const travelGapMs = newBookingStartsAfterExisting
      ? bookingDate.getTime() - existingEndDate.getTime()
      : existingBooking.date.getTime() - bookingEndDate.getTime();

    const requiredTravelMs = requiredTravelMinutes * 60 * 1000;

    if (travelGapMs >= 0 && travelGapMs < requiredTravelMs) {
      return `Det finns inte tillrackligt med restid mellan ${existingBooking.city} och ${city} samma dag.`;
    }

    if (requiredTravelMinutes > 30) {
      return `Restiden mellan ${existingBooking.city} och ${city} ar mer an 30 minuter, sa dessa bokningar kan inte ligga samma dag.`;
    }
  }

  return null;
}

async function sendBookingConfirmationEmail(booking: {
  id: string;
  date: Date;
  endDate: Date | null;
  city: string;
  sharedNotes: string;
  customCourse: string | null;
  course: { name: string };
  client: { name: string | null; company: string | null; email: string };
}) {
  const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").trim();
  const bookingUrl = `${clientUrl}/bookings/${booking.id}`;
  const courseName = booking.customCourse || booking.course.name;
  const formattedDate = stockholmLongDateFormatter.format(booking.date);
  const startTime = toTimeLabel(booking.date);
  const endTime = toTimeLabel(booking.endDate);
  const formattedTime = startTime && endTime ? `${startTime}–${endTime}` : null;

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
          ${formattedTime ? `<tr>
            <td style="padding: 8px 0; color: #6b7280;">Tid</td>
            <td style="padding: 8px 0; font-weight: 600;">${formattedTime}</td>
          </tr>` : ""}
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
      formattedTime ? `Tid: ${formattedTime}` : "",
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
  const { date, dateTo, startTime, endTime, city, courseId, customCourse, sharedNotes, notes, isPrivate, participants } = req.body;
  if (!date || !startTime || !endTime || !city || !courseId) {
    res.status(400).json({ error: "Datum, starttid, sluttid, ort och kurs krävs" });
    return;
  }

  const parsedParticipants = participants === undefined ? 1 : Number(participants);
  if (!Number.isInteger(parsedParticipants) || parsedParticipants < 1) {
    res.status(400).json({ error: "Participants måste vara ett heltal större än 0" });
    return;
  }

  const lastDate = hasAdminAccess(req.userRole) && dateTo ? dateTo : date;
  const selectedDates = hasAdminAccess(req.userRole) ? buildDateRange(date, lastDate) : [date];

  if (selectedDates.length === 0) {
    res.status(400).json({ error: "Ogiltigt datumintervall" });
    return;
  }

  if (hasAdminAccess(req.userRole)) {
    const firstDate = new Date(`${date}T12:00:00`);
    const lastSelectedDate = new Date(`${lastDate}T12:00:00`);
    if (lastSelectedDate < firstDate) {
      res.status(400).json({ error: "Datum till måste vara samma dag eller senare än datum från" });
      return;
    }
  }

  let distanceWarning: string | null = null;

  for (const selectedDate of selectedDates) {
    const bookingDate = combineDateAndTime(selectedDate, startTime);
    const bookingEndDate = combineDateAndTime(selectedDate, endTime);

    if (Number.isNaN(bookingDate.getTime()) || Number.isNaN(bookingEndDate.getTime())) {
      res.status(400).json({ error: "Ogiltigt datum eller tid" });
      return;
    }

    if (bookingEndDate <= bookingDate) {
      res.status(400).json({ error: "Sluttiden måste vara senare än starttiden" });
      return;
    }

    const blockingPeriod = await findBlockingPeriodForDate(bookingDate, req.userRole);
    if (blockingPeriod) {
      res.status(409).json({ error: `Datumet ${selectedDate} ligger i en ${getBlockingPeriodLabel(blockingPeriod.type)} och kan inte bokas.` });
      return;
    }

    const schedulingConflict = await findSameDaySchedulingConflict(bookingDate, bookingEndDate, city);
    if (schedulingConflict) {
      res.status(409).json({ error: schedulingConflict });
      return;
    }

    if (!distanceWarning) {
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

      for (const adjacentBooking of adjacentBookings) {
        const warning = await getDistanceWarning(city, adjacentBooking.city);
        if (warning) {
          distanceWarning = warning;
          break;
        }
      }
    }
  }

  const createdBookings = await prisma.$transaction(
    selectedDates.map((selectedDate) => prisma.booking.create({
      data: {
        date: combineDateAndTime(selectedDate, startTime),
        endDate: combineDateAndTime(selectedDate, endTime),
        city,
        status: "active",
        isPrivate: hasAdminAccess(req.userRole) ? Boolean(isPrivate) : false,
        participants: parsedParticipants,
        rescheduleToken: true,
        courseId,
        customCourse: customCourse || null,
        sharedNotes: sharedNotes || notes || "",
        clientId: req.userId!,
        createdById: req.userId!,
      },
      include: {
        course: true,
        client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
      },
    })),
  );

  await Promise.all(createdBookings.map((booking) => logBookingChange({
    bookingId: booking.id,
    changedById: req.userId!,
    changeType: "BOOKING_CREATED",
    newValue: {
      date: booking.date.toISOString(),
      endDate: booking.endDate?.toISOString() ?? null,
      participants: booking.participants,
      notes: booking.sharedNotes,
      rescheduleToken: booking.rescheduleToken,
    },
  })));

  createdBookings.forEach((booking) => {
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
  });

  if (createdBookings.length === 1) {
    sendBookingConfirmationEmail(createdBookings[0]).catch((err) => {
      console.error("Failed to send booking confirmation email:", err);
    });
  }

  res.json({
    booking: serializeBooking(createdBookings[0], req),
    bookings: createdBookings.map((booking) => serializeBooking(booking, req)),
    createdCount: createdBookings.length,
    distanceWarning,
  });
});

router.put("/:id/edit", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
    },
  });

  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (!canManageBooking(booking, req)) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  if (!hasAdminAccess(req.userRole) && !isWithinEditWindow(booking.createdAt)) {
    res.status(409).json({ error: "Bookings can only be edited within 4 hours after creation." });
    return;
  }

  const rawParticipants = req.body.participants ?? booking.participants;
  const parsedParticipants = Number(rawParticipants);
  if (!Number.isInteger(parsedParticipants) || parsedParticipants < 1) {
    res.status(400).json({ error: "Participants måste vara ett heltal större än 0" });
    return;
  }

  const nextStartTime = typeof req.body.startTime === "string" ? req.body.startTime : toTimeLabel(booking.date) || "08:00";
  const nextEndTime = typeof req.body.endTime === "string" ? req.body.endTime : toTimeLabel(booking.endDate) || toTimeLabel(booking.date) || "16:00";
  const bookingDatePart = formatStockholmDateOnly(booking.date);
  const nextDate = combineDateAndTime(bookingDatePart, nextStartTime);
  const nextEndDate = combineDateAndTime(bookingDatePart, nextEndTime);

  if (nextEndDate <= nextDate) {
    res.status(400).json({ error: "Sluttiden måste vara senare än starttiden" });
    return;
  }

  const schedulingConflict = await findSameDaySchedulingConflict(nextDate, nextEndDate, booking.city, id);
  if (schedulingConflict) {
    res.status(409).json({ error: schedulingConflict });
    return;
  }

  const nextNotes = typeof req.body.notes === "string"
    ? req.body.notes
    : typeof req.body.sharedNotes === "string"
      ? req.body.sharedNotes
      : booking.sharedNotes;

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      date: nextDate,
      endDate: nextEndDate,
      participants: parsedParticipants,
      sharedNotes: nextNotes,
    },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
    },
  });

  await logBookingChange({
    bookingId: updated.id,
    changedById: req.userId!,
    changeType: "BOOKING_EDITED",
    oldValue: {
      startTime: toTimeLabel(booking.date),
      endTime: toTimeLabel(booking.endDate),
      participants: booking.participants,
      notes: booking.sharedNotes,
    },
    newValue: {
      startTime: toTimeLabel(updated.date),
      endTime: toTimeLabel(updated.endDate),
      participants: updated.participants,
      notes: updated.sharedNotes,
    },
  });

  res.json(serializeBooking(updated, req));
});

router.put("/:id/move", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
    },
  });

  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (!canManageBooking(booking, req)) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  if (!hasAdminAccess(req.userRole) && !booking.rescheduleToken) {
    res.status(409).json({ error: "This booking has already been moved once and cannot be moved again." });
    return;
  }

  const nextDateValue = typeof req.body.date === "string" ? req.body.date : "";
  if (!nextDateValue) {
    res.status(400).json({ error: "Datum krävs för att flytta bokningen" });
    return;
  }

  const nextStartTime = toTimeLabel(booking.date) || "08:00";
  const nextEndTime = toTimeLabel(booking.endDate) || toTimeLabel(booking.date) || "16:00";
  const nextDate = combineDateAndTime(nextDateValue, nextStartTime);
  const nextEndDate = combineDateAndTime(nextDateValue, nextEndTime);

  const blockingPeriod = await findBlockingPeriodForDate(nextDate, req.userRole);
  if (blockingPeriod) {
    res.status(409).json({ error: `Datumet ligger i en ${getBlockingPeriodLabel(blockingPeriod.type)} och kan inte bokas.` });
    return;
  }

  const schedulingConflict = await findSameDaySchedulingConflict(nextDate, nextEndDate, booking.city, id);
  if (schedulingConflict) {
    res.status(409).json({ error: schedulingConflict });
    return;
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      date: nextDate,
      endDate: nextEndDate,
      rescheduleToken: hasAdminAccess(req.userRole) ? booking.rescheduleToken : false,
    },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
    },
  });

  await logBookingChange({
    bookingId: updated.id,
    changedById: req.userId!,
    changeType: "BOOKING_MOVED",
    oldValue: {
      date: booking.date.toISOString(),
      endDate: booking.endDate?.toISOString() ?? null,
      rescheduleToken: booking.rescheduleToken,
    },
    newValue: {
      date: updated.date.toISOString(),
      endDate: updated.endDate?.toISOString() ?? null,
      rescheduleToken: updated.rescheduleToken,
    },
  });

  res.json(serializeBooking(updated, req));
});

// Get all bookings for all authenticated users
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const bookings = await prisma.booking.findMany({
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
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

  const result = bookings.map((booking) => serializeBooking(withUnreadStatus(booking, req.userId!, hasAdminAccess(req.userRole)), req));

  res.json(result);
});

// Get single booking
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
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

  res.json(serializeBooking(withUnreadStatus(booking, req.userId!, hasAdminAccess(req.userRole)), req));
});

// Update booking
router.put("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    res.status(404).json({ error: "Bokning ej hittad" });
    return;
  }

  if (!canManageBooking(booking, req)) {
    res.status(403).json({ error: "Åtkomst nekad" });
    return;
  }

  if (!hasAdminAccess(req.userRole)) {
    res.status(403).json({ error: "Customers must use the dedicated edit and move booking actions." });
    return;
  }

  const { date, endDate, city, courseId, customCourse, sharedNotes, privateNotes, isPrivate } = req.body;
  const { startTime, endTime } = req.body;
  const bookingDatePart = booking.date.toISOString().split("T")[0];
  const nextDate = (date || startTime)
    ? combineDateAndTime(date || bookingDatePart, startTime || toTimeLabel(booking.date) || "08:00")
    : booking.date;
  const nextEndDate = (date || startTime || endTime)
    ? combineDateAndTime(date || bookingDatePart, endTime || toTimeLabel(booking.endDate) || toTimeLabel(booking.date) || "16:00")
    : booking.endDate;
  const nextCity = city || booking.city;

  if (Number.isNaN(nextDate.getTime()) || (nextEndDate && Number.isNaN(nextEndDate.getTime()))) {
    res.status(400).json({ error: "Ogiltigt datum eller tid" });
    return;
  }

  if (nextEndDate && nextEndDate <= nextDate) {
    res.status(400).json({ error: "Sluttiden måste vara senare än starttiden" });
    return;
  }

  const blockingPeriod = await findBlockingPeriodForDate(nextDate, req.userRole);
  if (blockingPeriod) {
    res.status(409).json({ error: `Datumet ligger i en ${getBlockingPeriodLabel(blockingPeriod.type)} och kan inte bokas.` });
    return;
  }

  if (!nextCity || !(courseId || booking.courseId)) {
    res.status(400).json({ error: "Datum, ort och kurs krävs" });
    return;
  }

  const startOfBookingDay = startOfDay(nextDate);
  const endOfBookingDay = endOfDay(nextDate);

  const schedulingConflict = await findSameDaySchedulingConflict(nextDate, nextEndDate || nextDate, nextCity, id);
  if (schedulingConflict) {
    res.status(409).json({ error: schedulingConflict });
    return;
  }

  const dayBefore = new Date(startOfBookingDay.getTime() - 86400000);
  const dayAfter = new Date(startOfBookingDay.getTime() + 86400000);

  const adjacentBookings = await prisma.booking.findMany({
    where: {
      id: { not: id },
      OR: [
        { date: { gte: dayBefore, lt: startOfBookingDay } },
        { date: { gte: startOfBookingDay, lt: dayAfter } },
      ],
    },
  });

  let distanceWarning: string | null = null;
  for (const adjacentBooking of adjacentBookings) {
    const warning = await getDistanceWarning(nextCity, adjacentBooking.city);
    if (warning) {
      distanceWarning = warning;
      break;
    }
  }

  const data: Record<string, unknown> = {};
  if (date || startTime) data.date = nextDate;
  if (date || startTime || endTime || endDate !== undefined) data.endDate = nextEndDate;
  if (city) data.city = city;
  if (isPrivate !== undefined && hasAdminAccess(req.userRole)) data.isPrivate = Boolean(isPrivate);
  if (courseId) data.courseId = courseId;
  if (customCourse !== undefined) data.customCourse = customCourse || null;
  if (sharedNotes !== undefined) data.sharedNotes = sharedNotes;
  if (privateNotes !== undefined && hasAdminAccess(req.userRole)) data.privateNotes = privateNotes;

  const updated = await prisma.booking.update({
    where: { id },
    data,
    include: {
      course: true,
      client: { select: { id: true, name: true, company: true, email: true, logoUrl: true } },
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
    ...serializeBooking(updated, req),
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
