import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// Get all courses
router.get("/", authenticate, async (_req: AuthRequest, res: Response) => {
  const courses = await prisma.course.findMany({ orderBy: { name: "asc" } });
  res.json(courses);
});

export default router;
