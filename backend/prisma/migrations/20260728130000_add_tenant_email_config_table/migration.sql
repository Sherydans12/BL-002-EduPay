-- CreateTable
CREATE TABLE "tenant_email_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL DEFAULT 'Colegio Conquistadores',
    "replyToEmail" TEXT,
    "emailFooter" TEXT,
    "enableManualPaymentEmails" BOOLEAN NOT NULL DEFAULT true,
    "enableBoletaEmails" BOOLEAN NOT NULL DEFAULT true,
    "enableReminderEmails" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_email_configs_tenantId_key"
ON "tenant_email_configs"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_email_configs"
ADD CONSTRAINT "tenant_email_configs_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
