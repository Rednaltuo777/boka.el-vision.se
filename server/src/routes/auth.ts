import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { authenticate, AuthRequest, UserRole } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

function toUserRole(role: string): UserRole {
  return role === "superadmin" || role === "admin" ? role : "client";
}

function createAuthResponse(user: { id: string; email: string; name: string | null; role: string }) {
  const role = toUserRole(user.role);
  const token = jwt.sign({ userId: user.id, role, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role },
  };
}

async function findAuthenticatedUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return null;
  }

  return {
    ...user,
    role: toUserRole(user.role),
  };
}

function isValidPassword(password: string) {
  return typeof password === "string" && password.trim().length >= 8;
}

// Login
router.post("/login", async (req, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "E-post och lösenord krävs" });
    return;
  }

  const user = await findAuthenticatedUser(email, password);
  if (!user) {
    res.status(401).json({ error: "Felaktig e-post eller lösenord" });
    return;
  }

  if (user.role === "superadmin") {
    res.status(403).json({ error: "Superadmin måste logga in via superadmin-inloggningen" });
    return;
  }

  res.json(createAuthResponse(user));
});

router.post("/superadmin/login", async (req, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "E-post och lösenord krävs" });
    return;
  }

  const user = await findAuthenticatedUser(email, password);
  if (!user) {
    res.status(401).json({ error: "Felaktig e-post eller lösenord" });
    return;
  }

  if (user.role !== "superadmin") {
    res.status(403).json({ error: "Endast superadmin kan använda denna inloggning" });
    return;
  }

  res.json(createAuthResponse(user));
});

// Register (via invitation token)
router.post("/register", async (req, res: Response) => {
  const { token, name, company, department, phone, email, password } = req.body;
  if (!token || !email || !password) {
    res.status(400).json({ error: "Token, e-post och lösenord krävs" });
    return;
  }

  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation || invitation.used || invitation.expiresAt < new Date()) {
    res.status(400).json({ error: "Ogiltig eller utgången inbjudan" });
    return;
  }

  if (invitation.email !== email) {
    res.status(400).json({ error: "E-postadressen matchar inte inbjudan" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: "Användare med denna e-post finns redan" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name, company, department, phone, role: "client" },
  });

  await prisma.invitation.update({ where: { id: invitation.id }, data: { used: true } });

  res.json(createAuthResponse(user));
});

// Get current user
router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, company: true, logoUrl: true, department: true, phone: true, role: true },
  });
  if (!user) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }
  res.json(user);
});

router.post("/change-password", authenticate, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Nuvarande lösenord och nytt lösenord krävs" });
    return;
  }

  if (!isValidPassword(newPassword)) {
    res.status(400).json({ error: "Det nya lösenordet måste vara minst 8 tecken" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !user.password) {
    res.status(404).json({ error: "Användare ej hittad" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    res.status(401).json({ error: "Nuvarande lösenord är felaktigt" });
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  res.json({ success: true });
});

export default router;
