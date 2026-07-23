-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM (
    'BOLETA_EMITTED',
    'MANUAL_PAYMENT_RECEIPT',
    'PAYMENT_REMINDER',
    'ACCOUNT_STATEMENT'
);

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "sent_communications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "type" "CommunicationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_communications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sent_communications_tenantId_idx"
ON "sent_communications"("tenantId");

-- CreateIndex
CREATE INDEX "sent_communications_tenantId_createdAt_idx"
ON "sent_communications"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "sent_communications_tenantId_type_status_idx"
ON "sent_communications"("tenantId", "type", "status");

-- AddForeignKey
ALTER TABLE "sent_communications"
ADD CONSTRAINT "sent_communications_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
