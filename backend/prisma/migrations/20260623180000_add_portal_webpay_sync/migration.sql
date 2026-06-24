-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'WEBPAY';

-- AlterTable
ALTER TABLE "payment_groups" ADD COLUMN "buyOrder" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_groups_buyOrder_key" ON "payment_groups"("buyOrder");
