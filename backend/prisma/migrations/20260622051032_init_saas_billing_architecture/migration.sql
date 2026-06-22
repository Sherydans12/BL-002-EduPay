-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'PORTAL');

-- CreateEnum
CREATE TYPE "FinancialSetupStatus" AS ENUM ('PENDING', 'CONFIGURED');

-- AlterTable
ALTER TABLE "payment_groups" ADD COLUMN     "isBoletaPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "chargeId" INTEGER;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "financialSetup" "FinancialSetupStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "charges" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "payment_concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
