ALTER TABLE "User"
ADD COLUMN "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resetPasswordTokenHash" TEXT,
ADD COLUMN "resetPasswordExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_resetPasswordTokenHash_key" ON "User"("resetPasswordTokenHash");