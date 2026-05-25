-- CreateTable
CREATE TABLE "payment_groups" (
    "id" SERIAL NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "boletaFileUrl" TEXT,
    "boletaNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payment_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "paymentGroupId" INTEGER;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentGroupId_fkey" FOREIGN KEY ("paymentGroupId") REFERENCES "payment_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
