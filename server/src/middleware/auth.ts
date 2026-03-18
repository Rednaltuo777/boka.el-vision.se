import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export type UserRole = "superadmin" | "admin" | "client";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

export function hasAdminAccess(role?: string): role is "superadmin" | "admin" {
  return role === "superadmin" || role === "admin";
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Ingen autentisering" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: UserRole };
    req.userId = payload.userId;
    req.userRole = payload.role;
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
