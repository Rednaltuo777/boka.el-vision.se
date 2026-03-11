# Boka El-Vision – Copilot Instructions

## Projekt
Bokningssystem för El-Vision utbildningar. Fullstack med React (client) och Express (server).

## Teknikstack
- **Client:** React 19, TypeScript, Vite, Tailwind CSS 3, FullCalendar 6, React Router 7
- **Server:** Node.js, Express 4, TypeScript, Prisma ORM (SQLite), JWT-auth, Zod

## Konventioner
- Alla API-routes under `/api/` med JWT Bearer-token
- Prisma som ORM — kör `npx prisma migrate dev` vid schemaändringar
- Tailwind utility classes — ingen separat CSS utöver index.css
- Svenska i UI-texter, engelska i koden
- Autentisering via `middleware/auth.ts` (authenticate + requireAdmin)

## Kommandon
- Server dev: `cd server && npm run dev`
- Client dev: `cd client && npm run dev`
- Databas-migration: `cd server && npx prisma migrate dev`
- Seed: `cd server && npm run db:seed`

## Viktig affärslogik
- Dubbelbokning förhindras (en bokning per dag)
- Geografisk varning vid >300 km (30 mil) mellan bokningar på konsekutiva dagar
- Privata anteckningar synliga enbart för admin
- Inbjudningssystem: admin skapar inbjudan → användare registrerar sig via token
