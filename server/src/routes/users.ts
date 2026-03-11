import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

// List all users (admin only)
router.get("/", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, company: true, department: true, phone: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// Update own profile
router.put("/me", authenticate, async (req: AuthRequest, res: Response) => {
  const { name, company, department, phone } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name, company, department, phone },
    select: { id: true, email: true, name: true, company: true, department: true, phone: true, role: true },
  });
  res.json(user);
});

export default router;
