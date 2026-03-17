-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "participants" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rescheduleToken" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BookingChange" (
    "id" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,

    CONSTRAINT "BookingChange_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BookingChange" ADD CONSTRAINT "BookingChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingChange" ADD CONSTRAINT "BookingChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
