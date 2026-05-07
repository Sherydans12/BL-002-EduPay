-- CreateTable
CREATE TABLE "payment_concepts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAmount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payment_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_concepts_name_key" ON "payment_concepts"("name");

-- AlterTable: add optional conceptId to payments
ALTER TABLE "payments" ADD COLUMN "conceptId" INTEGER;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "payment_concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
