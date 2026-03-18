import { createHash, randomBytes } from "crypto";
import prisma from "./prisma";
import { sendEmail } from "./email";

function getClientBaseUrl() {
  return (process.env.CLIENT_URL || "http://localhost:5173").trim().replace(/\/$/, "");
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += alphabet[bytes[index] % alphabet.length];
  }

  return password;
}

export async function createPasswordResetToken(userId: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: expiresAt,
    },
  });

  return {
    token,
    expiresAt,
    resetUrl: `${getClientBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`,
  };
}

export async function clearPasswordResetToken(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    },
  });
}

export async function sendPasswordResetEmail(input: { email: string; resetUrl: string }) {
  return sendEmail({
    to: input.email,
    subject: "Återställ ditt lösenord för El-Vision Bokningar",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; color: #1f2937;">
        <h2 style="color: #1e3a5f; margin-bottom: 16px;">Återställ lösenord</h2>
        <p>Vi har fått en begäran om att återställa ditt lösenord.</p>
        <p>Klicka på knappen nedan för att välja ett nytt lösenord. Länken gäller i 1 timme.</p>
        <p style="margin: 24px 0;">
          <a href="${input.resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Återställ lösenord</a>
        </p>
        <p>Om knappen inte fungerar kan du öppna denna länk:</p>
        <p><a href="${input.resetUrl}">${input.resetUrl}</a></p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Om du inte begärde detta kan du ignorera meddelandet.</p>
      </div>
    `,
    text: [
      "Vi har fått en begäran om att återställa ditt lösenord.",
      "Öppna länken nedan för att välja ett nytt lösenord. Länken gäller i 1 timme.",
      input.resetUrl,
      "Om du inte begärde detta kan du ignorera meddelandet.",
    ].join("\n\n"),
  });
}