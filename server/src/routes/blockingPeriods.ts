import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest, hasAdminAccess } from "../middleware/auth";

const router = Router();
const BLOCKING_PERIOD_TYPES = ["vacation", "blocked", "private"] as const;

function startOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function exclusiveEndOfDay(value: string) {
  const result = startOfDay(value);
  result.setDate(result.getDate() + 1);
  return result;
}

function serializeBlockingPeriod(period: {
  id: string;
  startDate: Date;
  endDate: Date;
  type: string;
  customLabel: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
}, req: AuthRequest) {
  const isAdminLike = hasAdminAccess(req.userRole);
  const isPrivate = period.type === "private";

  return {
    ...period,
    customLabel: isPrivate && !isAdminLike ? null : period.customLabel,
    displayLabel: isPrivate && !isAdminLike
      ? "Privat"
      : period.customLabel?.trim() || (period.type === "vacation" ? "Semester" : period.type === "blocked" ? "Spärrad för bokning" : "Privat"),
  };
}

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  const periods = await prisma.blockingPeriod.findMany({
    orderBy: { startDate: "asc" },
  });

  res.json(periods.map((period) => serializeBlockingPeriod(period, req)));
});

router.post("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { startDate, endDate, type, customLabel } = req.body;

  if (!startDate || !endDate || !type) {
    res.status(400).json({ error: "Startdatum, slutdatum och typ krävs" });
    return;
  }

  if (!BLOCKING_PERIOD_TYPES.includes(type)) {
    res.status(400).json({ error: "Ogiltig periodtyp" });
    return;
  }

  if (typeof customLabel !== "undefined" && typeof customLabel !== "string") {
    res.status(400).json({ error: "Egen text måste vara en sträng" });
    return;
  }

  const normalizedLabel = typeof customLabel === "string" ? customLabel.trim() : "";

  const normalizedStartDate = startOfDay(startDate);
  const normalizedEndDate = exclusiveEndOfDay(endDate);

  if (Number.isNaN(normalizedStartDate.getTime()) || Number.isNaN(normalizedEndDate.getTime())) {
    res.status(400).json({ error: "Ogiltigt datum" });
    return;
  }

  if (normalizedEndDate <= normalizedStartDate) {
    res.status(400).json({ error: "Slutdatum måste vara samma dag eller senare än startdatum" });
    return;
  }

  const period = await prisma.blockingPeriod.create({
    data: {
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      type,
      customLabel: normalizedLabel || null,
      createdById: req.userId!,
    },
  });

  res.json(serializeBlockingPeriod(period, req));
});

router.delete("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  await prisma.blockingPeriod.delete({
    where: { id },
  });

  res.json({ success: true });
});

export default router;