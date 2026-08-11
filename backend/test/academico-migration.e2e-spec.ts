import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

describe('Académico integration migration', () => {
  let client: Client;
  let schemaName: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    schemaName = `academico_migration_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await client.query(`
      CREATE TABLE "courses" (
        "id" SERIAL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      );
      CREATE TABLE "students" (
        "id" SERIAL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "rut" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "courseId" INTEGER NOT NULL,
        "guardianId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      );
      INSERT INTO "courses" ("tenantId", "name")
      VALUES ('legacy-tenant', 'Legacy Course');
      INSERT INTO "students" (
        "tenantId", "rut", "name", "courseId", "guardianId"
      ) VALUES ('legacy-tenant', '1-9', 'Unsplit Legacy Name', 1, 1);
    `);

    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20260811120000_add_academico_integration_contract/migration.sql',
      ),
      'utf8',
    );
    await client.query(migration);
  });

  afterEach(async () => {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
  });

  it('backfills independent UUIDs while preserving unsplit legacy names', async () => {
    const course = await client.query<{
      integrationId: string;
      id: number;
    }>('SELECT "id", "integrationId" FROM "courses"');
    const student = await client.query<{
      integrationId: string;
      id: number;
      name: string;
      firstName: string | null;
      lastName: string | null;
    }>(
      'SELECT "id", "integrationId", "name", "firstName", "lastName" FROM "students"',
    );

    expect(course.rows[0].integrationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(student.rows[0].integrationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(student.rows[0].integrationId).not.toBe(
      course.rows[0].integrationId,
    );
    expect(student.rows[0].integrationId).not.toContain(
      String(student.rows[0].id),
    );
    expect(student.rows[0]).toMatchObject({
      name: 'Unsplit Legacy Name',
      firstName: null,
      lastName: null,
    });
  });

  it('assigns new UUIDs and enforces immutability and non-reuse in the database', async () => {
    const inserted = await client.query<{ integrationId: string }>(`
      INSERT INTO "courses" ("tenantId", "name", "updatedAt")
      VALUES ('legacy-tenant', 'New Course', CURRENT_TIMESTAMP)
      RETURNING "integrationId"
    `);
    const integrationId = inserted.rows[0].integrationId;

    await expect(
      client.query(
        'UPDATE "courses" SET "integrationId" = $1 WHERE "integrationId" = $2',
        [randomUUID(), integrationId],
      ),
    ).rejects.toThrow('integration_id is immutable');

    await client.query('DELETE FROM "courses" WHERE "integrationId" = $1', [
      integrationId,
    ]);
    await expect(
      client.query(
        `INSERT INTO "courses" (
          "tenantId", "name", "updatedAt", "integrationId"
        ) VALUES ('legacy-tenant', 'Reused Course', CURRENT_TIMESTAMP, $1)`,
        [integrationId],
      ),
    ).rejects.toThrow();
  });
});
