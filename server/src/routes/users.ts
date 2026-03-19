import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { createPasswordResetToken, generateTemporaryPassword, sendPasswordResetEmail } from "../lib/passwords";
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest, UserRole } from "../middleware/auth";

const router = Router();
const USER_ROLES: UserRole[] = ["client", "admin", "superadmin"];
const userSelect = { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true, forcePasswordChange: true, createdAt: true } as const;

function canManageVisibleUser(requesterRole?: UserRole, targetRole?: string) {
  if (requesterRole === "superadmin") {
    return true;
  }

  return targetRole !== "superadmin";
}

// List all users (admin only)
router.get("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: req.userRole === "superadmin" ? undefined : { role: { not: "superadmin" } },
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

router.post("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();
  const company = typeof req.body.company === "string" ? req.body.company.trim() : "";

  if (!name || !phone || !email || !password) {
    res.status(400).json({ error: "Namn, telefonnummer, e-post och lösenord krävs" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Lösenordet måste vara minst 8 tecken" });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(400).json({ error: "Användare med denna e-post finns redan" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      phone,
      email,
      password: hashedPassword,
      company: company || null,
      role: "client",
      forcePasswordChange: true,
    },
    select: userSelect,
  });

  res.status(201).json(user);
});

// Update own profile
router.put("/me", authenticate, async (req: AuthRequest, res: Response) => {
  const { name, company, logoUrl, department, phone } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name, company, logoUrl, department, phone },
    select: { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true, forcePasswordChange: true },
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
    select: userSelect,
  });

  res.json(user);
});

router.put("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { logoUrl } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!existingUser || !canManageVisibleUser(req.userRole, existingUser.role)) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  const user = await prisma.user.update({
    where: { id },
    data: { logoUrl: typeof logoUrl === "string" ? logoUrl.trim() || null : null },
    select: userSelect,
  });

  res.json(user);
});

router.put("/:id/password", authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const nextPassword = String(req.body.password || "").trim();

  if (nextPassword.length < 8) {
    res.status(400).json({ error: "Lösenordet måste vara minst 8 tecken" });
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingUser) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  const hashedPassword = await bcrypt.hash(nextPassword, 10);
  await prisma.user.update({
    where: { id },
    data: { password: hashedPassword, forcePasswordChange: true },
  });

  res.json({ success: true });
});

router.post("/:id/temporary-password", authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });

  if (!user) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

  await prisma.user.update({
    where: { id },
    data: {
      password: hashedPassword,
      forcePasswordChange: true,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    },
  });

  res.json({ success: true, temporaryPassword });
});

router.put("/:id/force-password-change", authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const forcePasswordChange = Boolean(req.body.forcePasswordChange);

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!user) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { forcePasswordChange },
  });

  res.json({ success: true, forcePasswordChange });
});

router.post("/:id/password-reset-link", authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });

  if (!user) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  const { resetUrl } = await createPasswordResetToken(user.id);
  const emailSent = await sendPasswordResetEmail({ email: user.email, resetUrl });

  if (!emailSent) {
    res.status(503).json({ error: "E-postutskick är inte konfigurerat på servern" });
    return;
  }

  res.json({ success: true });
});

export default router;
