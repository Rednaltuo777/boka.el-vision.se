import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const courses = [
  "EBR Kabelförläggning grundutbildning – Lärarledd på plats",
  "EBR Kabelförläggning repetitionsutbildning – Lärarledd på plats",
  "EBR Kabelförläggning repetitionsutbildning – Lärarledd digitalt",
  "EBR-ESA Instructed",
  "EBR-ESA Instructed Recurring",
  "EBR-ESA Skilled",
  "EBR-ESA Skilled Recurring",
  "EBR-ESA-E1 Elektriskt arbete grundutbildning – Lärarledd på plats",
  "EBR-ESA-E1.1 Elektriskt arbete repetitionsutbildning – Lärarledd digitalt",
  "EBR-ESA-E1.1 Elektriskt arbete repetitionsutbildning – Lärarledd på plats",
  "EBR-ESA-E1.2 Elektriskt arbete repetitionsutbildning med praktik – Lärarledd på plats",
  "EBR-ESA-E2 Icke elektriskt arbete grundutbildning – Lärarledd digitalt",
  "EBR-ESA-E2 Icke elektriskt arbete grundutbildning – Lärarledd på plats",
  "EBR-ESA-E2 Icke elektriskt arbete repetitionsutbildning – Lärarledd digitalt",
  "EBR-ESA-E2 Icke elektriskt arbete repetitionsutbildning – Lärarledd på plats",
  "EBR-ESA-E3 Röjning ledningsgata repetitionsutbildning – Lärarledd på plats",
  "EBR-ESA-E5 Industri och Installation grundutbildning – Lärarledd på plats",
  "EVA – Elsäkerhet vid arbete (EvA)",
  "KFI – Kontroll före idrifttagning, lågspänning (teori och praktik)",
];

async function upsertUser(email: string, password: string, name: string, role: "admin" | "superadmin") {
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: hashedPassword,
      name,
      role,
    },
  });
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@el-vision.se";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const superadminEmail = process.env.SUPERADMIN_EMAIL || (process.env.NODE_ENV !== "production" ? "superadmin@el-vision.se" : "");
  const superadminPassword = process.env.SUPERADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "superadmin123" : "");

  await upsertUser(adminEmail, adminPassword, "Administratör", "admin");

  if (superadminEmail && superadminPassword) {
    await upsertUser(superadminEmail, superadminPassword, "Superadmin", "superadmin");
  }

  // Seed courses
  for (const name of courses) {
    await prisma.course.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Seed complete: admin/superadmin users + courses created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
