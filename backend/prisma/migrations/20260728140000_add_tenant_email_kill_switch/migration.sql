-- AlterTable
ALTER TABLE "tenant_email_configs"
ADD COLUMN IF NOT EXISTS "enableAllEmails" BOOLEAN NOT NULL DEFAULT true;
