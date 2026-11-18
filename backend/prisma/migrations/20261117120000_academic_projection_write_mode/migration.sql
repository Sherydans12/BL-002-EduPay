-- ADR-0025 / ADR-0027: projection write mode. Additive only: nullable columns
-- and unique indexes. Existing rows are not modified; links are written later
-- by the projection writer when the operator enables it.

-- Académico ids of the records BL links or creates from the projection.
ALTER TABLE "students" ADD COLUMN "canonicalStudentId" UUID;
ALTER TABLE "students" ADD COLUMN "nationalIdType" VARCHAR(8);
ALTER TABLE "courses" ADD COLUMN "canonicalCourseId" UUID;

CREATE UNIQUE INDEX "students_tenantId_canonicalStudentId_key" ON "students"("tenantId", "canonicalStudentId");
CREATE UNIQUE INDEX "courses_tenantId_canonicalCourseId_key" ON "courses"("tenantId", "canonicalCourseId");

-- Outcome of writing each shadow row into BL's own tables.
ALTER TABLE "academic_financial_projections" ADD COLUMN "writeOutcome" VARCHAR(32);
ALTER TABLE "academic_financial_projections" ADD COLUMN "writeReasonCode" VARCHAR(64);
ALTER TABLE "academic_financial_projections" ADD COLUMN "writtenAt" TIMESTAMP(3);
ALTER TABLE "academic_financial_projections" ADD COLUMN "writtenVersion" BIGINT;

CREATE INDEX "academic_financial_projections_tenantId_writeOutcome_idx" ON "academic_financial_projections"("tenantId", "writeOutcome");
