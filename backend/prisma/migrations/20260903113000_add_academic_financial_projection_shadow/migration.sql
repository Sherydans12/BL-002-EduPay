-- Phase 1C-B. CREATED and schema-validated only. Do not run this migration on
-- a real school database as part of this branch; no backfill or financial write
-- is included.

CREATE TYPE "AcademicFinancialProjectionOperation" AS ENUM ('UPSERT', 'TOMBSTONE');
CREATE TYPE "AcademicFinancialProjectionEventOutcome" AS ENUM ('APPLIED', 'DUPLICATE', 'STALE', 'REJECTED', 'QUARANTINED');
CREATE TYPE "AcademicFinancialProjectionSnapshotStatus" AS ENUM ('STARTED', 'INCOMPLETE', 'COMPLETE', 'RECONCILED', 'FAILED');

CREATE TABLE "academic_financial_projections" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "canonicalTenantId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "academicStudentId" UUID NOT NULL,
  "academicCourseId" UUID NOT NULL,
  "academicEnrollmentId" UUID NOT NULL,
  "enrollmentStatus" VARCHAR(16) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "version" BIGINT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "operation" "AcademicFinancialProjectionOperation" NOT NULL,
  "lastEventId" UUID,
  "lastSnapshotId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_financial_projections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_financial_projections_tenantId_academicEnrollmentId_key" ON "academic_financial_projections"("tenantId", "academicEnrollmentId");
CREATE INDEX "academic_financial_projections_canonicalTenantId_academicEnrollmentId_idx" ON "academic_financial_projections"("canonicalTenantId", "academicEnrollmentId");
CREATE INDEX "academic_financial_projections_tenantId_academicYearId_enrollmentStatus_idx" ON "academic_financial_projections"("tenantId", "academicYearId", "enrollmentStatus");
CREATE INDEX "academic_financial_projections_tenantId_operation_sourceUpdatedAt_idx" ON "academic_financial_projections"("tenantId", "operation", "sourceUpdatedAt");

CREATE TABLE "academic_financial_projection_consumed_events" (
  "producer" VARCHAR(32) NOT NULL DEFAULT 'ACADEMIC',
  "canonical_tenant_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "tenantId" TEXT,
  "aggregate_id" UUID,
  "entity_version" BIGINT,
  "outcome" "AcademicFinancialProjectionEventOutcome" NOT NULL,
  "reason_code" VARCHAR(80),
  "correlation_id" VARCHAR(128),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_financial_projection_consumed_events_pkey" PRIMARY KEY ("producer", "canonical_tenant_id", "event_id")
);
CREATE INDEX "academic_financial_projection_consumed_events_tenantId_received_at_idx" ON "academic_financial_projection_consumed_events"("tenantId", "received_at");
CREATE INDEX "academic_financial_projection_consumed_events_canonical_tenant_id_aggregate_id_entity_version_idx" ON "academic_financial_projection_consumed_events"("canonical_tenant_id", "aggregate_id", "entity_version");

CREATE TABLE "academic_financial_projection_quarantine" (
  "id" UUID NOT NULL,
  "producer" VARCHAR(32) NOT NULL DEFAULT 'ACADEMIC',
  "canonical_tenant_id" UUID NOT NULL,
  "event_id" UUID,
  "reason_code" VARCHAR(80) NOT NULL,
  "correlation_id" VARCHAR(128),
  "payload" JSONB NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_financial_projection_quarantine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_financial_projection_quarantine_producer_canonical_tenant_id_event_id_key" ON "academic_financial_projection_quarantine"("producer", "canonical_tenant_id", "event_id");
CREATE INDEX "academic_financial_projection_quarantine_canonical_tenant_id_resolved_at_created_at_idx" ON "academic_financial_projection_quarantine"("canonical_tenant_id", "resolved_at", "created_at");

CREATE TABLE "academic_financial_projection_snapshots" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "canonicalTenantId" UUID NOT NULL,
  "sourceSnapshotId" UUID NOT NULL,
  "sourceSnapshotToken" TEXT NOT NULL,
  "next_cursor" TEXT,
  "status" "AcademicFinancialProjectionSnapshotStatus" NOT NULL DEFAULT 'STARTED',
  "watermark" TEXT,
  "expected_item_count" INTEGER,
  "received_item_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "reconciled_at" TIMESTAMP(3),
  "error_code" VARCHAR(80),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_financial_projection_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_financial_projection_snapshots_tenantId_sourceSnapshotId_key" ON "academic_financial_projection_snapshots"("tenantId", "sourceSnapshotId");
CREATE INDEX "academic_financial_projection_snapshots_tenantId_status_started_at_idx" ON "academic_financial_projection_snapshots"("tenantId", "status", "started_at");

ALTER TABLE "academic_financial_projections" ADD CONSTRAINT "academic_financial_projections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_financial_projection_consumed_events" ADD CONSTRAINT "academic_financial_projection_consumed_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_financial_projection_snapshots" ADD CONSTRAINT "academic_financial_projection_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
