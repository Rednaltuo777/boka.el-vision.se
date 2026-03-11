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

async function main() {
  // Create admin user
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@el-vision.se" },
    update: {},
    create: {
      email: "admin@el-vision.se",
      password: hashedPassword,
      name: "Administratör",
      role: "admin",
    },
  });

  // Seed courses
  for (const name of courses) {
    await prisma.course.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Seed complete: admin user + courses created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
