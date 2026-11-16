-- ADR-0025 step 4 (first cut): billing by academic year.
-- Adds academic years, courses per year, enrollments (student + year) and
-- links every charge to its enrollment. Backfill: every existing course,
-- student plan and charge belongs to the 2026 school year (verified on
-- 2026-11-15: no 2027 charges exist; the 2025-12 enrollment fee and the 2025
-- payments belong to the 2026 school year). The due date never defines the
-- year. No charge, payment or amount is modified.

CREATE TYPE "AcademicYearStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "academic_years" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'ACTIVE',
    "canonicalAcademicYearId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollments" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "financialSetup" "FinancialSetupStatus" NOT NULL DEFAULT 'PENDING',
    "canonicalEnrollmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- Backfill 1: one ACTIVE "2026" year per tenant. When the v2 shadow already
-- holds the tenant's 2026 year from Académico, reuse its dates and canonical
-- id; otherwise use the school calendar defaults.
INSERT INTO "academic_years" ("tenantId", "label", "startDate", "endDate", "status", "canonicalAcademicYearId", "updatedAt")
SELECT t."id",
       '2026',
       COALESCE(p."startDate", DATE '2026-03-01'),
       COALESCE(p."endDate", DATE '2026-12-31'),
       'ACTIVE',
       p."academicYearId",
       CURRENT_TIMESTAMP
FROM "tenants" t
LEFT JOIN LATERAL (
    SELECT afp."academicYearId",
           min(afp."academicYearStartDate") AS "startDate",
           max(afp."academicYearEndDate") AS "endDate"
    FROM "academic_financial_projections" afp
    WHERE afp."tenantId" = t."id"
      AND afp."academicYearLabel" = '2026'
    GROUP BY afp."academicYearId"
    ORDER BY count(*) DESC, afp."academicYearId"
    LIMIT 1
) p ON true;

-- Backfill 2: every course belongs to its tenant's 2026 year.
ALTER TABLE "courses" ADD COLUMN "academicYearId" INTEGER;
UPDATE "courses" c
SET "academicYearId" = y."id"
FROM "academic_years" y
WHERE y."tenantId" = c."tenantId" AND y."label" = '2026';
ALTER TABLE "courses" ALTER COLUMN "academicYearId" SET NOT NULL;

DROP INDEX "courses_tenantId_name_key";

-- Backfill 3: one 2026 enrollment per student (deleted or inactive students
-- included, so every historical charge keeps an owner), with the student's
-- course and plan status.
INSERT INTO "enrollments" ("tenantId", "studentId", "courseId", "academicYearId", "status", "financialSetup", "updatedAt")
SELECT s."tenantId",
       s."id",
       s."courseId",
       y."id",
       CASE WHEN s."status" = 'ACTIVE' AND s."deletedAt" IS NULL
            THEN 'ACTIVE'::"EnrollmentStatus"
            ELSE 'INACTIVE'::"EnrollmentStatus" END,
       s."financialSetup",
       CURRENT_TIMESTAMP
FROM "students" s
JOIN "academic_years" y ON y."tenantId" = s."tenantId" AND y."label" = '2026';

-- Backfill 4: every charge belongs to its student's 2026 enrollment.
ALTER TABLE "charges" ADD COLUMN "enrollmentId" INTEGER;
UPDATE "charges" ch
SET "enrollmentId" = e."id"
FROM "enrollments" e
JOIN "academic_years" y ON y."id" = e."academicYearId" AND y."label" = '2026'
WHERE e."studentId" = ch."studentId";
ALTER TABLE "charges" ALTER COLUMN "enrollmentId" SET NOT NULL;

CREATE INDEX "academic_years_tenantId_status_idx" ON "academic_years"("tenantId", "status");
CREATE UNIQUE INDEX "academic_years_tenantId_label_key" ON "academic_years"("tenantId", "label");
CREATE UNIQUE INDEX "academic_years_tenantId_canonicalAcademicYearId_key" ON "academic_years"("tenantId", "canonicalAcademicYearId");
CREATE INDEX "enrollments_tenantId_academicYearId_status_idx" ON "enrollments"("tenantId", "academicYearId", "status");
CREATE INDEX "enrollments_courseId_idx" ON "enrollments"("courseId");
CREATE UNIQUE INDEX "enrollments_studentId_academicYearId_key" ON "enrollments"("studentId", "academicYearId");
CREATE UNIQUE INDEX "enrollments_tenantId_canonicalEnrollmentId_key" ON "enrollments"("tenantId", "canonicalEnrollmentId");
CREATE INDEX "charges_enrollmentId_idx" ON "charges"("enrollmentId");
CREATE INDEX "courses_academicYearId_idx" ON "courses"("academicYearId");
CREATE UNIQUE INDEX "courses_tenantId_academicYearId_name_key" ON "courses"("tenantId", "academicYearId", "name");

ALTER TABLE "courses" ADD CONSTRAINT "courses_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
