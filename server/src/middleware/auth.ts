import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export type UserRole = "superadmin" | "admin" | "client";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: UserRole;
  userEmail?: string;
}

export function hasAdminAccess(role?: string): role is "superadmin" | "admin" {
  return role === "superadmin" || role === "admin";
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Ingen autentisering" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: UserRole; email?: string };
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.userEmail = payload.email;

    if (!req.userEmail && req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true },
      });
      req.userEmail = user?.email;
    }

    next();
  } catch {
    res.status(401).json({ error: "Ogiltig token" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!hasAdminAccess(req.userRole)) {
    res.status(403).json({ error: "Administratörsbehörighet krävs" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== "superadmin") {
    res.status(403).json({ error: "Superadminbehörighet krävs" });
    return;
  }
  next();
}
