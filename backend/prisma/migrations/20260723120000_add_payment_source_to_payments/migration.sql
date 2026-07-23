-- AlterTable
ALTER TABLE "payments"
ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL';

-- Backfill existing line items from their parent transaction source.
UPDATE "payments" AS payment
SET "source" = payment_group."source"
FROM "payment_groups" AS payment_group
WHERE payment."paymentGroupId" = payment_group."id";
