-- ADR-0025 step 3: Academic Financial Projection contract v2 descriptors.
-- Additive and nullable; shadow table only. No backfill, no write to students,
-- courses, charges or payments. Running it on a real database requires the
-- recovery point and specific authorization from the BL runbooks.
-- studentNationalId holds RUN/IPE: sensitive, never logged.

ALTER TABLE "academic_financial_projections"
  ADD COLUMN "studentFirstName" VARCHAR(120),
  ADD COLUMN "studentLastName" VARCHAR(120),
  ADD COLUMN "studentNationalIdType" VARCHAR(8),
  ADD COLUMN "studentNationalId" VARCHAR(20),
  ADD COLUMN "studentLegacyIntegrationId" VARCHAR(200),
  ADD COLUMN "courseLabel" VARCHAR(160),
  ADD COLUMN "courseLegacyIntegrationId" VARCHAR(200),
  ADD COLUMN "academicYearLabel" VARCHAR(160),
  ADD COLUMN "academicYearStartDate" DATE,
  ADD COLUMN "academicYearEndDate" DATE,
  ADD COLUMN "academicYearStatus" VARCHAR(16);

CREATE INDEX "academic_financial_projections_tenantId_studentLegacyIntegr_idx" ON "academic_financial_projections"("tenantId", "studentLegacyIntegrationId");
CREATE INDEX "academic_financial_projections_tenantId_courseLegacyIntegra_idx" ON "academic_financial_projections"("tenantId", "courseLegacyIntegrationId");
