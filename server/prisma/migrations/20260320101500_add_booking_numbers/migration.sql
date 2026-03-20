ALTER TABLE "Booking"
ADD COLUMN "bookingNumber" TEXT;

CREATE TABLE "BookingSequenceCounter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSequenceCounter_pkey" PRIMARY KEY ("id")
);

WITH numbered_bookings AS (
    SELECT
        "id",
        EXTRACT(YEAR FROM timezone('Europe/Stockholm', "createdAt"))::int AS booking_year,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM timezone('Europe/Stockholm', "createdAt"))::int
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS sequence_value
    FROM "Booking"
)
UPDATE "Booking" AS booking
SET "bookingNumber" = numbered_bookings.booking_year::text || LPAD(numbered_bookings.sequence_value::text, 4, '0')
FROM numbered_bookings
WHERE booking."id" = numbered_bookings."id";

INSERT INTO "BookingSequenceCounter" ("id", "year", "lastValue", "createdAt", "updatedAt")
SELECT
    md5(numbered_bookings.booking_year::text || ':' || clock_timestamp()::text || ':' || random()::text),
    numbered_bookings.booking_year,
    MAX(numbered_bookings.sequence_value),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        EXTRACT(YEAR FROM timezone('Europe/Stockholm', "createdAt"))::int AS booking_year,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM timezone('Europe/Stockholm', "createdAt"))::int
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS sequence_value
    FROM "Booking"
) AS numbered_bookings
GROUP BY numbered_bookings.booking_year;

ALTER TABLE "Booking"
ALTER COLUMN "bookingNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");
CREATE UNIQUE INDEX "BookingSequenceCounter_year_key" ON "BookingSequenceCounter"("year");