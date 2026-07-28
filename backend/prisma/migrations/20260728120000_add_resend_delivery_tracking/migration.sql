-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'COMPLAINED';

-- AlterTable
ALTER TABLE "sent_communications"
ADD COLUMN IF NOT EXISTS "resendEmailId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sent_communications_resendEmailId_idx"
ON "sent_communications"("resendEmailId");
