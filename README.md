# Boka – El-Vision Bokningssystem

Webbaserat bokningssystem för El-Vision utbildningar.

## Teknikstack

- **Client:** React 19, TypeScript, Vite, Tailwind CSS 3, FullCalendar 6, React Router 7
- **Server:** Node.js, Express 4, TypeScript, Prisma ORM, PostgreSQL, JWT, Zod
- **Integrationer:** SMTP för e-post, Microsoft Graph för Outlook, OpenRouteService för restidskontroll

## Komma igång

### 1. Server

```bash
cd server
npm install
copy .env.example .env
npx prisma migrate dev
npx prisma generate
npm run db:seed
npm run dev
```

Servern startar på `http://localhost:3001`.

### 2. Client

```bash
cd client
npm install
npm run dev
```

Klienten startar på `http://localhost:5173`.

## Miljövariabler

Servern läser konfiguration från `server/.env`. Utgå från `server/.env.example`.

Obligatoriskt i normal drift:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `CLIENT_URL`

Valfritt beroende på funktioner:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`
- `OPENROUTESERVICE_API_KEY`

## OpenRouteService

Samma dags bokningar i olika orter valideras med OpenRouteService innan de sparas. Om API-nyckeln saknas eller tjänsten inte svarar faller servern tillbaka till den interna uppskattade restidslogiken.

För lokal miljö och Vercel:

1. Skapa en API-nyckel hos OpenRouteService.
2. Sätt `OPENROUTESERVICE_API_KEY` i `server/.env` lokalt.
3. Sätt samma variabel i Vercel för produktion.
4. Kör en ny deploy efter att variabeln lagts till.

## Funktioner

1. **Användarhantering och inbjudningar** – Admin bjuder in uppdragsgivare via e-post och registrering sker via token.
2. **Bokningar** – Kurs, ort, företag och möjlighet att ange egen kurs.
3. **Kalender** – Månadsvy och veckovy med ort och företagslogo i relevanta vyer.
4. **Anteckningar** – Delade anteckningar samt privata admin-anteckningar.
5. **Chatt** – Bokningskopplad kommunikation mellan admin och uppdragsgivare.
6. **Kursadministration** – Hantering av kurslista och egna kurser.
7. **Planeringsregler** – Överlappande tider blockeras och restid mellan orter kontrolleras.

## Projektstruktur

```text
client/          React-frontend
  src/
    components/  Layout
    context/     AuthContext
    lib/         API-klient
    pages/       Login, Register, Calendar, Booking, NewBooking, Users, Profile, Settings
server/          Express-backend
  prisma/        Schema + migrationer
  src/
    lib/         Prisma, Outlook, e-post, OpenRouteService
    middleware/  Auth (JWT)
    routes/      auth, bookings, chat, courses, invitations, outlook, users
```
