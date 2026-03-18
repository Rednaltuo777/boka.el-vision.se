import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest, UserRole } from "../middleware/auth";

const router = Router();
const USER_ROLES: UserRole[] = ["client", "admin", "superadmin"];

// List all users (admin only)
router.get("/", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// Update own profile
router.put("/me", authenticate, async (req: AuthRequest, res: Response) => {
  const { name, company, logoUrl, department, phone } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name, company, logoUrl, department, phone },
    select: { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true },
  });
  res.json(user);
});

router.put("/:id/role", authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const nextRole = String(req.body.role || "") as UserRole;

  if (!USER_ROLES.includes(nextRole)) {
    res.status(400).json({ error: "Ogiltig roll" });
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!existingUser) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  if (existingUser.id === req.userId && nextRole !== "superadmin") {
    res.status(400).json({ error: "Du kan inte ta bort din egen superadmin-roll" });
    return;
  }

  if (existingUser.role === "superadmin" && nextRole !== "superadmin") {
    const superadminCount = await prisma.user.count({ where: { role: "superadmin" } });
    if (superadminCount <= 1) {
      res.status(400).json({ error: "Det måste finnas minst en superadmin i systemet" });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role: nextRole },
    select: { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true, createdAt: true },
  });

  res.json(user);
});

router.put("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { logoUrl } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: { logoUrl: typeof logoUrl === "string" ? logoUrl.trim() || null : null },
    select: { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true, createdAt: true },
  });

  res.json(user);
});

export default router;
