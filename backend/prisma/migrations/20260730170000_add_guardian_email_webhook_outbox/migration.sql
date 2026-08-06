-- CreateEnum
CREATE TYPE "GuardianEmailUpdateSource" AS ENUM ('PORTAL', 'EDUPAY_ADMIN');

-- CreateEnum
CREATE TYPE "GuardianEmailWebhookStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'DELIVERED',
    'DEAD_LETTER'
);

-- CreateTable
CREATE TABLE "guardian_email_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guardianId" INTEGER NOT NULL,
    "guardianRut" TEXT,
    "email" TEXT,
    "previousEmail" TEXT,
    "guardianUpdatedAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "GuardianEmailUpdateSource" NOT NULL,
    "actorId" TEXT,
    "status" "GuardianEmailWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_email_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guardian_email_webhook_events_status_nextAttemptAt_idx"
ON "guardian_email_webhook_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "guardian_email_webhook_events_tenantId_occurredAt_idx"
ON "guardian_email_webhook_events"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "guardian_email_webhook_events_guardianId_occurredAt_idx"
ON "guardian_email_webhook_events"("guardianId", "occurredAt");

-- AddForeignKey
ALTER TABLE "guardian_email_webhook_events"
ADD CONSTRAINT "guardian_email_webhook_events_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
