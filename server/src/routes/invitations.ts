import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import prisma from "../lib/prisma";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendInvitationEmail(toEmail: string, registerUrl: string) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`SMTP not configured. Invitation link for ${toEmail}: ${registerUrl}`);
    return false;
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"El-Vision Bokningar" <${fromAddress}>`,
    to: toEmail,
    subject: "Du har blivit inbjuden till El-Vision Bokningssystem",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e3a5f;">Välkommen till El-Vision!</h2>
        <p>Du har blivit inbjuden att registrera dig i El-Visions bokningssystem för utbildningar.</p>
        <p>Klicka på knappen nedan för att skapa ditt konto:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${registerUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Registrera dig
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">Länken är giltig i 7 dagar.</p>
        <p style="color: #666; font-size: 14px;">Om knappen inte fungerar, kopiera denna länk:<br/><a href="${registerUrl}">${registerUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">El-Vision – Utbildningar & bokningar</p>
      </div>
    `,
  });
  return true;
}

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

  const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").trim();
  const registerUrl = `${clientUrl}/register?token=${token}&email=${encodeURIComponent(email)}`;

  let emailSent = false;
  try {
    emailSent = await sendInvitationEmail(email, registerUrl);
  } catch (err) {
    console.error("Failed to send invitation email:", err);
  }

  res.json({ id: invitation.id, email, registerUrl, expiresAt, emailSent });
});

// List invitations (admin only)
router.get("/", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  const invitations = await prisma.invitation.findMany({
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(invitations);
});

// Delete pending invitation (admin only)
router.delete("/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const invitation = await prisma.invitation.findUnique({ where: { id } });
  if (!invitation) {
    res.status(404).json({ error: "Inbjudan hittades inte" });
    return;
  }
  if (invitation.used) {
    res.status(400).json({ error: "Kan inte radera en använd inbjudan" });
    return;
  }

  await prisma.invitation.delete({ where: { id } });
  res.json({ message: "Inbjudan raderad" });
});

export default router;
