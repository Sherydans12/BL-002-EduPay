-- Immutable public identities and monotonic source ordering for the
-- Académico integration contract. Legacy Student.name is intentionally not
-- parsed: first_name and last_name remain NULL until an operator validates it.

CREATE SEQUENCE "integration_change_sequence" AS BIGINT;

CREATE TABLE "integration_id_registry" (
    "integrationId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_id_registry_pkey" PRIMARY KEY ("integrationId")
);

ALTER TABLE "courses"
    ADD COLUMN "integrationId" UUID,
    ADD COLUMN "integrationCreatedSequence" BIGINT,
    ADD COLUMN "integrationVersion" BIGINT;

UPDATE "courses"
SET
    "integrationId" = gen_random_uuid(),
    "integrationCreatedSequence" = nextval('integration_change_sequence'),
    "integrationVersion" = nextval('integration_change_sequence');

INSERT INTO "integration_id_registry" ("integrationId", "entityType")
SELECT "integrationId", 'COURSE' FROM "courses";

ALTER TABLE "courses"
    ALTER COLUMN "integrationId" SET DEFAULT gen_random_uuid(),
    ALTER COLUMN "integrationId" SET NOT NULL,
    ALTER COLUMN "integrationCreatedSequence" SET DEFAULT nextval('integration_change_sequence'),
    ALTER COLUMN "integrationCreatedSequence" SET NOT NULL,
    ALTER COLUMN "integrationVersion" SET DEFAULT nextval('integration_change_sequence'),
    ALTER COLUMN "integrationVersion" SET NOT NULL;

ALTER TABLE "students"
    ADD COLUMN "integrationId" UUID,
    ADD COLUMN "integrationCreatedSequence" BIGINT,
    ADD COLUMN "integrationVersion" BIGINT,
    ADD COLUMN "firstName" TEXT,
    ADD COLUMN "lastName" TEXT;

UPDATE "students"
SET
    "integrationId" = gen_random_uuid(),
    "integrationCreatedSequence" = nextval('integration_change_sequence'),
    "integrationVersion" = nextval('integration_change_sequence');

INSERT INTO "integration_id_registry" ("integrationId", "entityType")
SELECT "integrationId", 'STUDENT' FROM "students";

ALTER TABLE "students"
    ALTER COLUMN "integrationId" SET DEFAULT gen_random_uuid(),
    ALTER COLUMN "integrationId" SET NOT NULL,
    ALTER COLUMN "integrationCreatedSequence" SET DEFAULT nextval('integration_change_sequence'),
    ALTER COLUMN "integrationCreatedSequence" SET NOT NULL,
    ALTER COLUMN "integrationVersion" SET DEFAULT nextval('integration_change_sequence'),
    ALTER COLUMN "integrationVersion" SET NOT NULL;

CREATE UNIQUE INDEX "courses_integrationId_key" ON "courses"("integrationId");
CREATE INDEX "courses_tenantId_integrationVersion_integrationId_idx"
    ON "courses"("tenantId", "integrationVersion", "integrationId");
CREATE INDEX "courses_tenantId_integrationCreatedSequence_integrationId_idx"
    ON "courses"("tenantId", "integrationCreatedSequence", "integrationId");

CREATE UNIQUE INDEX "students_integrationId_key" ON "students"("integrationId");
CREATE INDEX "students_tenantId_integrationVersion_integrationId_idx"
    ON "students"("tenantId", "integrationVersion", "integrationId");
CREATE INDEX "students_tenantId_integrationCreatedSequence_integrationId_idx"
    ON "students"("tenantId", "integrationCreatedSequence", "integrationId");

CREATE OR REPLACE FUNCTION "enforce_integration_identity_and_version"()
RETURNS TRIGGER AS $$
DECLARE
    source_entity_type TEXT;
BEGIN
    source_entity_type := CASE TG_TABLE_NAME
        WHEN 'courses' THEN 'COURSE'
        WHEN 'students' THEN 'STUDENT'
        ELSE upper(TG_TABLE_NAME)
    END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO "integration_id_registry" ("integrationId", "entityType")
        VALUES (NEW."integrationId", source_entity_type);
        RETURN NEW;
    END IF;

    IF NEW."integrationId" IS DISTINCT FROM OLD."integrationId" THEN
        RAISE EXCEPTION 'integration_id is immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."integrationCreatedSequence" IS DISTINCT FROM OLD."integrationCreatedSequence" THEN
        RAISE EXCEPTION 'integration_created_sequence is immutable'
            USING ERRCODE = '23514';
    END IF;

    NEW."integrationVersion" := nextval('integration_change_sequence');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "courses_integration_identity_version_trigger"
BEFORE INSERT OR UPDATE ON "courses"
FOR EACH ROW EXECUTE FUNCTION "enforce_integration_identity_and_version"();

CREATE TRIGGER "students_integration_identity_version_trigger"
BEFORE INSERT OR UPDATE ON "students"
FOR EACH ROW EXECUTE FUNCTION "enforce_integration_identity_and_version"();
