import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

// Get all courses
router.get("/", authenticate, async (_req: AuthRequest, res: Response) => {
  const courses = await prisma.course.findMany({ orderBy: { name: "asc" } });
  res.json(courses);
});

router.post("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const name = String(req.body?.name || "").trim();

  if (!name) {
    res.status(400).json({ error: "Kursnamn krävs" });
    return;
  }

  const existingCourse = await prisma.course.findUnique({ where: { name } });
  if (existingCourse) {
    res.status(409).json({ error: "Det finns redan en kurs med det namnet" });
    return;
  }

  const course = await prisma.course.create({
    data: {
      name,
      isCustom: false,
    },
  });

  res.json(course);
});

router.put("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const name = String(req.body?.name || "").trim();

  if (!name) {
    res.status(400).json({ error: "Kursnamn krävs" });
    return;
  }

  const existingCourse = await prisma.course.findFirst({
    where: {
      name,
      id: { not: id },
    },
  });

  if (existingCourse) {
    res.status(409).json({ error: "Det finns redan en kurs med det namnet" });
    return;
  }

  const course = await prisma.course.update({
    where: { id },
    data: { name },
  });

  res.json(course);
});

router.delete("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const bookingCount = await prisma.booking.count({ where: { courseId: id } });

  if (bookingCount > 0) {
    res.status(409).json({ error: "Kursen används i bokningar och kan inte raderas" });
    return;
  }

  await prisma.course.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
