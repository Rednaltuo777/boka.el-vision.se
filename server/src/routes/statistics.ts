import { Router, Response } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest, requireAdmin } from "../middleware/auth";

const router = Router();
const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const stockholmDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const stockholmDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const stockholmTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: STOCKHOLM_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const querySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clientIds: z.string().optional(),
  statuses: z.string().optional(),
});

const statusLabels: Record<string, string> = {
  active: "Aktiv",
  pending: "Väntande",
  cancelled: "Avbokad",
};

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

function parseCsv(value?: string) {
  return (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatUserLabel(user: { company: string | null; name: string | null; email: string }) {
  return user.company || user.name || user.email;
}

function formatStatus(status: string) {
  return statusLabels[status] || status;
}

function formatDate(dateValue: Date) {
  return stockholmDateFormatter.format(dateValue);
}

function formatDateTime(dateValue: Date) {
  return stockholmDateTimeFormatter.format(dateValue);
}

function formatTimeRange(start: Date, end: Date | null) {
  const startLabel = stockholmTimeFormatter.format(start);
  const endLabel = end ? stockholmTimeFormatter.format(end) : "-";
  return `${startLabel} - ${endLabel}`;
}

function buildQueryString(filters: { fromDate?: string; toDate?: string; clientIds: string[]; statuses: string[] }) {
  return [
    filters.fromDate ? `Från: ${filters.fromDate}` : null,
    filters.toDate ? `Till: ${filters.toDate}` : null,
    filters.clientIds.length > 0 ? `Uppdragsgivare: ${filters.clientIds.length} valda` : null,
    filters.statuses.length > 0 ? `Status: ${filters.statuses.map(formatStatus).join(", ")}` : null,
  ].filter(Boolean).join(" | ");
}

async function getStatisticsData(rawQuery: unknown) {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new Error("Ogiltiga filter för statistik");
  }

  const { fromDate, toDate, clientIds, statuses } = parsed.data;
  const selectedClientIds = parseCsv(clientIds);
  const selectedStatuses = parseCsv(statuses).filter((status) => status !== "all");

  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("Datum från kan inte vara senare än datum till");
  }

  const where = {
    ...(fromDate || toDate
      ? {
          date: {
            ...(fromDate ? { gte: createStockholmDate(fromDate, "00:00") } : {}),
            ...(toDate ? { lte: createStockholmDate(toDate, "23:59") } : {}),
          },
        }
      : {}),
    ...(selectedClientIds.length > 0 ? { clientId: { in: selectedClientIds } } : {}),
    ...(selectedStatuses.length > 0 ? { status: { in: selectedStatuses } } : {}),
  };

  const [bookings, clients] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        course: { select: { id: true, name: true, isCustom: true } },
        client: { select: { id: true, name: true, company: true, email: true } },
        createdBy: { select: { id: true, name: true, company: true, email: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "client" },
      select: { id: true, name: true, company: true, email: true },
      orderBy: [{ company: "asc" }, { name: "asc" }, { email: "asc" }],
    }),
  ]);

  const bookingsPerClientMap = new Map<string, { clientId: string; label: string; count: number; participants: number }>();
  let totalParticipants = 0;

  const rows = bookings.map((booking) => {
    const clientLabel = formatUserLabel(booking.client);
    const createdByLabel = formatUserLabel(booking.createdBy);
    const statusLabel = formatStatus(booking.status);
    totalParticipants += booking.participants;

    const existingClientSummary = bookingsPerClientMap.get(booking.clientId);
    if (existingClientSummary) {
      existingClientSummary.count += 1;
      existingClientSummary.participants += booking.participants;
    } else {
      bookingsPerClientMap.set(booking.clientId, {
        clientId: booking.clientId,
        label: clientLabel,
        count: 1,
        participants: booking.participants,
      });
    }

    return {
      id: booking.id,
      date: booking.date.toISOString(),
      endDate: booking.endDate?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      city: booking.city,
      participants: booking.participants,
      status: booking.status,
      statusLabel,
      courseName: booking.customCourse || booking.course.name,
      customer: {
        id: booking.client.id,
        label: clientLabel,
        email: booking.client.email,
      },
      createdBy: {
        id: booking.createdBy.id,
        label: createdByLabel,
        email: booking.createdBy.email,
      },
      dateLabel: formatDate(booking.date),
      createdAtLabel: formatDateTime(booking.createdAt),
      timeLabel: formatTimeRange(booking.date, booking.endDate),
    };
  });

  const bookingsPerClient = Array.from(bookingsPerClientMap.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label, "sv");
  });

  return {
    filters: {
      fromDate: fromDate || null,
      toDate: toDate || null,
      clientIds: selectedClientIds,
      statuses: selectedStatuses,
    },
    filterDescription: buildQueryString({ fromDate, toDate, clientIds: selectedClientIds, statuses: selectedStatuses }),
    options: {
      clients: clients.map((client) => ({
        id: client.id,
        label: formatUserLabel(client),
        email: client.email,
      })),
      statuses: Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
    },
    summary: {
      totalBookings: rows.length,
      totalParticipants,
      uniqueClients: bookingsPerClient.length,
      bookingsPerClient,
    },
    bookings: rows,
  };
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, currentY: number, minSpace = 40) {
  if (currentY <= doc.page.height - minSpace) {
    return currentY;
  }

  doc.addPage();
  return 50;
}

function drawPdfTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Uppdragsgivare", 40, y, { width: 140 });
  doc.text("Datum", 185, y, { width: 70 });
  doc.text("Tid", 260, y, { width: 70 });
  doc.text("Delt.", 335, y, { width: 40 });
  doc.text("Skapad av", 380, y, { width: 110 });
  doc.text("Status", 500, y, { width: 55 });
  doc.moveTo(40, y + 16).lineTo(555, y + 16).strokeColor("#D6DEE8").stroke();
}

router.get("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getStatisticsData(req.query);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Kunde inte hämta statistik" });
  }
});

router.get("/pdf", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getStatisticsData(req.query);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const safeDate = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="statistik-${safeDate}.pdf"`);

    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#14324A").text("Bokningsstatistik", { align: "left" });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).fillColor("#526377").text(`Skapad ${formatDateTime(new Date())}`);
    if (data.filterDescription) {
      doc.moveDown(0.2);
      doc.text(data.filterDescription);
    }

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#14324A").text("Sammanfattning");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#1F2A37");
    doc.text(`Totalt antal bokningar: ${data.summary.totalBookings}`);
    doc.text(`Totalt antal deltagare: ${data.summary.totalParticipants}`);
    doc.text(`Antal uppdragsgivare: ${data.summary.uniqueClients}`);

    if (data.summary.bookingsPerClient.length > 0) {
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#14324A").text("Bokningar per uppdragsgivare");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10).fillColor("#1F2A37");
      data.summary.bookingsPerClient.slice(0, 12).forEach((entry) => {
        doc.text(`${entry.label}: ${entry.count} bokningar, ${entry.participants} deltagare`);
      });
    }

    let y = ensurePdfSpace(doc, doc.y + 24, 120);
    doc.moveDown(0.8);
    y = ensurePdfSpace(doc, doc.y + 24, 120);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#14324A").text("Bokningar", 40, y);
    y += 22;
    y = ensurePdfSpace(doc, y, 90);
    drawPdfTableHeader(doc, y);
    y += 24;

    doc.font("Helvetica").fontSize(9).fillColor("#1F2A37");
    data.bookings.forEach((booking, index) => {
      y = ensurePdfSpace(doc, y, 36);
      if (y === 50) {
        drawPdfTableHeader(doc, y);
        y += 24;
        doc.font("Helvetica").fontSize(9).fillColor("#1F2A37");
      }

      const fill = index % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
      doc.rect(40, y - 4, 515, 24).fill(fill);
      doc.fillColor("#1F2A37");
      doc.text(booking.customer.label, 40, y, { width: 140, ellipsis: true });
      doc.text(booking.dateLabel, 185, y, { width: 70 });
      doc.text(booking.timeLabel, 260, y, { width: 70 });
      doc.text(String(booking.participants), 335, y, { width: 40 });
      doc.text(booking.createdBy.label, 380, y, { width: 110, ellipsis: true });
      doc.text(booking.statusLabel, 500, y, { width: 55, ellipsis: true });
      y += 26;
    });

    doc.end();
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Kunde inte skapa PDF" });
  }
});

export default router;