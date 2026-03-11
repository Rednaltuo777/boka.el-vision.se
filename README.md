# Boka – El-Vision Bokningssystem

Webbaserat bokningssystem för El-Vision utbildningar.

## Teknikstack

- **Client:** React 19, TypeScript, Vite, Tailwind CSS, FullCalendar
- **Server:** Node.js, Express, TypeScript, Prisma ORM, SQLite

## Komma igång

### 1. Server

```bash
cd server
npm install
npx prisma migrate dev --name init
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

Klienten startar på `http://localhost:5173` med proxy till servern.

### 3. Inloggning

Admin-konto (skapat av seed):
- E-post: `admin@el-vision.se`
- Lösenord: `admin123`

## Funktioner

1. **Användarhantering & inbjudningar** – Admin bjuder in uppdragsgivare via e-post. Inbjudna registrerar sig med namn, företag, avdelning, telefon och e-post.
2. **Bokningar** – Kurs från dropdown, ort, företag. Möjlighet att ange egen kurs.
3. **Kalender** – Månadsvy och veckovy (FullCalendar). Dubbelbokning förhindras.
4. **Anteckningar** – Delad fritextruta (synlig för båda) + privat ruta (bara admin, för hotell/tåg/flyg).
5. **Chatt** – Per bokning, realtidskommunikation mellan admin och uppdragsgivare.
6. **Kursval** – Dropdown med alla EBR/ESA/EVA/KFI-kurser + fält för egen kurs.
7. **Geografisk varning** – Varning vid bokningar >30 mil isär på konsekutiva dagar.

## Projektstruktur

```
client/          React-frontend
  src/
    components/  Layout
    context/     AuthContext
    lib/         API-klient
    pages/       Login, Register, Calendar, Booking, NewBooking, Users, Profile
server/          Express-backend
  prisma/        Schema + migrationer
  src/
    lib/         Prisma-klient
    middleware/  Auth (JWT)
    routes/      auth, bookings, chat, courses, invitations, users
```
