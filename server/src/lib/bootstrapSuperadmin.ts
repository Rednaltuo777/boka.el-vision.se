import bcrypt from "bcryptjs";
import prisma from "./prisma";

export async function ensureSuperadminFromEnv() {
  const email = process.env.SUPERADMIN_EMAIL?.trim();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();

  if (!email && !password) {
    return;
  }

  if (!email || !password) {
    console.warn("SUPERADMIN_EMAIL och SUPERADMIN_PASSWORD måste båda vara satta för bootstrap av superadmin.");
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: "superadmin",
      name: "Superadmin",
    },
    create: {
      email,
      password: hashedPassword,
      role: "superadmin",
      name: "Superadmin",
    },
  });
}