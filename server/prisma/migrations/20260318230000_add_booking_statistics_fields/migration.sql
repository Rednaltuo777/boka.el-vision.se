ALTER TABLE "Booking"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "createdById" TEXT;

UPDATE "Booking"
SET "createdById" = "clientId"
WHERE "createdById" IS NULL;

ALTER TABLE "Booking"
ALTER COLUMN "createdById" SET NOT NULL;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "Booking_createdById_idx" ON "Booking"("createdById");
CREATE INDEX "Booking_status_idx" ON "Booking"("status");