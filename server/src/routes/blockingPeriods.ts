import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

function startOfDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function exclusiveEndOfDay(value: string) {
  const result = startOfDay(value);
  result.setDate(result.getDate() + 1);
  return result;
}

router.get("/", authenticate, async (_req: AuthRequest, res: Response) => {
  const periods = await prisma.blockingPeriod.findMany({
    orderBy: { startDate: "asc" },
  });

  res.json(periods);
});

router.post("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { startDate, endDate, type } = req.body;

  if (!startDate || !endDate || !type) {
    res.status(400).json({ error: "Startdatum, slutdatum och typ krävs" });
    return;
  }

  if (!["vacation", "blocked"].includes(type)) {
    res.status(400).json({ error: "Ogiltig periodtyp" });
    return;
  }

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
      createdById: req.userId!,
    },
  });

  res.json(period);
});

router.delete("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  await prisma.blockingPeriod.delete({
    where: { id },
  });

  res.json({ success: true });
});

export default router;