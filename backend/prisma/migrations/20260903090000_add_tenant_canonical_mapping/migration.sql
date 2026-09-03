-- Fase 1A: infraestructura vacía para una asignación manual y auditable.
-- No se modifica ningún PK local de tenants y no hay backfill: cada fila debe
-- ser creada explícitamente por un SUPER_ADMIN tras verificar Identity.
CREATE TABLE "tenant_canonical_mappings" (
    "tenantId" TEXT NOT NULL,
    "canonicalTenantId" UUID NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_canonical_mappings_pkey" PRIMARY KEY ("tenantId")
);

CREATE UNIQUE INDEX "tenant_canonical_mappings_canonicalTenantId_key"
    ON "tenant_canonical_mappings"("canonicalTenantId");
CREATE INDEX "tenant_canonical_mappings_assignedByUserId_idx"
    ON "tenant_canonical_mappings"("assignedByUserId");
CREATE INDEX "tenant_canonical_mappings_correlationId_idx"
    ON "tenant_canonical_mappings"("correlationId");

ALTER TABLE "tenant_canonical_mappings"
    ADD CONSTRAINT "tenant_canonical_mappings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_canonical_mappings"
    ADD CONSTRAINT "tenant_canonical_mappings_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
