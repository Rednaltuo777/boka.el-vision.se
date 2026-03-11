import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

// Send invitation (admin only)
router.post("/", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "E-postadress krävs" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: "Användare med denna e-post finns redan" });
    return;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await prisma.invitation.create({
    data: {
      email,
      token,
      expiresAt,
      invitedById: req.userId!,
    },
  });

  // In production, send email with link: CLIENT_URL/register?token=...
  const registerUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/register?token=${token}&email=${encodeURIComponent(email)}`;
  console.log(`Invitation link for ${email}: ${registerUrl}`);

  res.json({ id: invitation.id, email, registerUrl, expiresAt });
});

// List invitations (admin only)
router.get("/", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const invitations = await prisma.invitation.findMany({
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(invitations);
});

export default router;
