-- Add soft-delete support to payment lines.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
