-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- Backfill target for all records that predate multi-tenancy.
INSERT INTO "tenants" ("id", "name", "slug", "isActive", "updatedAt")
VALUES (
    'colegio-conquistadores',
    'Colegio Conquistadores',
    'colegio-conquistadores',
    true,
    CURRENT_TIMESTAMP
);

-- DropIndex
DROP INDEX "guardians_rut_key";

-- DropIndex
DROP INDEX "payment_concepts_name_key";

-- DropIndex
DROP INDEX "payment_groups_buyOrder_key";

-- DropIndex
DROP INDEX "students_rut_key";

-- AlterTable
ALTER TABLE "charges" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "payment_concepts" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "payment_groups" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "students" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'colegio-conquistadores';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "charges_tenantId_idx" ON "charges"("tenantId");

-- CreateIndex
CREATE INDEX "courses_tenantId_idx" ON "courses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenantId_name_key" ON "courses"("tenantId", "name");

-- CreateIndex
CREATE INDEX "guardians_tenantId_idx" ON "guardians"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_tenantId_rut_key" ON "guardians"("tenantId", "rut");

-- CreateIndex
CREATE INDEX "notification_logs_tenantId_idx" ON "notification_logs"("tenantId");

-- CreateIndex
CREATE INDEX "payment_concepts_tenantId_idx" ON "payment_concepts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_concepts_tenantId_name_key" ON "payment_concepts"("tenantId", "name");

-- CreateIndex
CREATE INDEX "payment_groups_tenantId_idx" ON "payment_groups"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_groups_tenantId_buyOrder_key" ON "payment_groups"("tenantId", "buyOrder");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_rut_key" ON "students"("tenantId", "rut");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_concepts" ADD CONSTRAINT "payment_concepts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_groups" ADD CONSTRAINT "payment_groups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
