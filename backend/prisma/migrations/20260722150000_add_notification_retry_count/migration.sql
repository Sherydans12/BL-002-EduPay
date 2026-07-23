-- AlterTable
ALTER TABLE "notification_logs"
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "notification_logs_tenantId_status_retryCount_idx"
ON "notification_logs"("tenantId", "status", "retryCount");
