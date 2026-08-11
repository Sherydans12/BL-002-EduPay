import { INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/create-e2e-app';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

const TOKEN = `${randomUUID()}${randomUUID()}`;
const CURSOR_SECRET = `${randomUUID()}${randomUUID()}`;
const TENANT_A = 'academico-e2e-a';
const TENANT_B = 'academico-e2e-b';

type FeedResponse = {
  schemaVersion: string;
  sourceTenantId: string;
  entity: 'COURSE' | 'STUDENT';
  mode: 'full' | 'incremental';
  items: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  page: {
    nextCursor: string | null;
    complete: boolean;
    scannedCount: number;
  };
  watermark: { next: string | null; available: boolean };
  snapshot?: { runId: string; entityComplete: boolean };
};

describe('Académico integration API', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let courseA1: { id: number; integrationId: string };
  let courseA2: { id: number; integrationId: string };
  let readyStudent1: { id: number; integrationId: string };
  let readyStudent2: { id: number; integrationId: string };
  let legacyStudent: { id: number; integrationId: string };
  let guardianAId: number;
  let courseWatermark: string;
  let studentWatermark: string;
  let snapshotToken: string;
  let snapshotRunId: string;

  beforeAll(async () => {
    process.env.EDUPAY_ACADEMICO_INTEGRATION_TOKEN = TOKEN;
    process.env.EDUPAY_ACADEMICO_CURSOR_SECRET = CURSOR_SECRET;
    process.env.EDUPAY_ACADEMICO_ALLOWED_TENANTS = `${TENANT_A},${TENANT_B}`;
    process.env.EDUPAY_ACADEMICO_RATE_LIMIT_PER_MINUTE = '1000';

    app = await createE2eApp();
    prisma = app.get(PrismaService);

    await prisma.tenant.upsert({
      where: { id: TENANT_A },
      update: { isActive: true },
      create: { id: TENANT_A, slug: TENANT_A, name: 'Académico E2E A' },
    });
    await prisma.tenant.upsert({
      where: { id: TENANT_B },
      update: { isActive: true },
      create: { id: TENANT_B, slug: TENANT_B, name: 'Académico E2E B' },
    });

    courseA1 = await prisma.course.create({
      data: { tenantId: TENANT_A, name: 'Course A1' },
      select: { id: true, integrationId: true },
    });
    courseA2 = await prisma.course.create({
      data: { tenantId: TENANT_A, name: 'Course A2' },
      select: { id: true, integrationId: true },
    });
    const courseB = await prisma.course.create({
      data: { tenantId: TENANT_B, name: 'Private Course B' },
      select: { id: true },
    });

    const guardianA = await prisma.guardian.create({
      data: {
        tenantId: TENANT_A,
        rut: '41.111.111-1',
        name: 'Private Guardian A',
        email: 'private@example.test',
      },
    });
    guardianAId = guardianA.id;
    const guardianB = await prisma.guardian.create({
      data: {
        tenantId: TENANT_B,
        rut: '42.222.222-2',
        name: 'Private Guardian B',
      },
    });

    readyStudent1 = await prisma.student.create({
      data: {
        tenantId: TENANT_A,
        rut: '51.111.111-1',
        name: 'Ana Silva',
        firstName: 'Ana',
        lastName: 'Silva',
        courseId: courseA1.id,
        guardianId: guardianA.id,
      },
      select: { id: true, integrationId: true },
    });
    readyStudent2 = await prisma.student.create({
      data: {
        tenantId: TENANT_A,
        rut: '52.222.222-2',
        name: 'Luis Pérez',
        firstName: 'Luis',
        lastName: 'Pérez',
        courseId: courseA1.id,
        guardianId: guardianA.id,
      },
      select: { id: true, integrationId: true },
    });
    legacyStudent = await prisma.student.create({
      data: {
        tenantId: TENANT_A,
        rut: '53.333.333-3',
        name: 'Legacy Unsplit Name',
        courseId: courseA1.id,
        guardianId: guardianA.id,
      },
      select: { id: true, integrationId: true },
    });
    await prisma.student.create({
      data: {
        tenantId: TENANT_B,
        rut: '54.444.444-4',
        name: 'Private Student B',
        firstName: 'Private',
        lastName: 'Student B',
        courseId: courseB.id,
        guardianId: guardianB.id,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function integrationGet(path: string, token = TOKEN, tenant = TENANT_A) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Source-Tenant-ID', tenant)
      .set('X-Correlation-ID', 'academico-e2e-correlation');
  }

  async function drainFeed(
    entity: 'courses' | 'students',
    query: string,
  ): Promise<{ pages: FeedResponse[]; watermark: string }> {
    const pages: FeedResponse[] = [];
    let nextPath = `/api/v1/integrations/academico/${entity}?${query}`;

    while (true) {
      const response = await integrationGet(nextPath).expect(200);
      const body = response.body as FeedResponse;
      pages.push(body);
      if (!body.page.nextCursor) {
        expect(body.page.complete).toBe(true);
        expect(body.watermark.available).toBe(true);
        expect(body.watermark.next).toBeTruthy();
        return { pages, watermark: body.watermark.next! };
      }
      nextPath = `/api/v1/integrations/academico/${entity}?mode=${body.mode}&limit=1&cursor=${encodeURIComponent(body.page.nextCursor)}`;
    }
  }

  it('accepts only the dedicated service token and redacts it from errors/logs', async () => {
    await integrationGet('/api/v1/integrations/academico/courses', '').expect(
      401,
    );

    const wrongToken = `${randomUUID()}${randomUUID()}`;
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const wrong = await integrationGet(
      '/api/v1/integrations/academico/courses',
      wrongToken,
    ).expect(401);
    expect(wrong.body).toMatchObject({
      code: 'INTEGRATION_AUTHENTICATION_FAILED',
      correlationId: 'academico-e2e-correlation',
    });
    expect(JSON.stringify(wrong.body)).not.toContain(wrongToken);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(wrongToken);
    warnSpy.mockRestore();

    const adminJwt = new JwtService({
      secret: process.env.JWT_SECRET,
    }).sign({ sub: 'admin', role: 'SUPER_ADMIN' });
    await integrationGet(
      '/api/v1/integrations/academico/courses',
      adminJwt,
    ).expect(401);

    await integrationGet('/api/v1/integrations/academico/courses').expect(200);
  });

  it('enforces the explicit allowed tenant and never leaks cross-tenant rows', async () => {
    const forbidden = await integrationGet(
      '/api/v1/integrations/academico/courses',
      TOKEN,
      'not-allowed',
    ).expect(403);
    expect(forbidden.body.code).toBe('INTEGRATION_TENANT_FORBIDDEN');

    const result = await drainFeed('courses', 'mode=incremental&limit=1');
    const serialized = JSON.stringify(result.pages);
    expect(serialized).toContain(courseA1.integrationId);
    expect(serialized).not.toContain('Private Course B');
  });

  it('creates a shared full boundary and returns sparse deterministic feeds', async () => {
    const started = await integrationGet(
      '/api/v1/integrations/academico/snapshot',
    ).expect(200);
    snapshotToken = started.body.snapshotToken as string;
    snapshotRunId = started.body.snapshot.runId as string;
    expect(started.body).toMatchObject({
      schemaVersion: '1',
      sourceTenantId: TENANT_A,
      snapshot: { complete: false, requiredEntities: ['COURSE', 'STUDENT'] },
    });

    const courses = await drainFeed(
      'courses',
      `mode=full&limit=1&snapshot=${encodeURIComponent(snapshotToken)}`,
    );
    courseWatermark = courses.watermark;
    expect(courses.pages[0].page.complete).toBe(false);
    expect(courses.pages.at(-1)?.snapshot).toMatchObject({
      runId: snapshotRunId,
      entityComplete: true,
    });
    const courseItems = courses.pages.flatMap((page) => page.items);
    expect(Object.keys(courseItems[0]).sort()).toEqual(
      [
        'deletedAt',
        'integrationId',
        'name',
        'sourceTenantId',
        'updatedAt',
      ].sort(),
    );

    const students = await drainFeed(
      'students',
      `mode=full&limit=1&snapshot=${encodeURIComponent(snapshotToken)}`,
    );
    studentWatermark = students.watermark;
    expect(students.pages.at(-1)?.snapshot).toMatchObject({
      runId: snapshotRunId,
      entityComplete: true,
    });
    const studentItems = students.pages.flatMap((page) => page.items);
    expect(Object.keys(studentItems[0]).sort()).toEqual(
      [
        'courseIntegrationId',
        'deletedAt',
        'firstName',
        'integrationId',
        'lastName',
        'sourceTenantId',
        'status',
        'updatedAt',
      ].sort(),
    );
    const serialized = JSON.stringify(students.pages);
    for (const forbiddenField of [
      'guardian',
      'payment',
      'charge',
      'rut',
      'email',
      'password',
      'financialSetup',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(
        forbiddenField.toLowerCase(),
      );
    }
    expect(students.pages.flatMap((page) => page.conflicts)).toContainEqual(
      expect.objectContaining({
        code: 'STUDENT_STRUCTURED_NAME_MISSING',
        integrationId: legacyStudent.integrationId,
      }),
    );
    expect(studentItems).not.toContainEqual(
      expect.objectContaining({ integrationId: legacyStudent.integrationId }),
    );
  });

  it('marks a tenant snapshot complete only with both terminal positions', async () => {
    const incomplete = await integrationGet(
      `/api/v1/integrations/academico/snapshot/complete?snapshot=${encodeURIComponent(snapshotToken)}&courseWatermark=${encodeURIComponent(courseWatermark)}&studentWatermark=invalid`,
    ).expect(400);
    expect(incomplete.body.code).toBe('INVALID_WATERMARK');
    expect(incomplete.body.snapshot?.complete).not.toBe(true);

    const completed = await integrationGet(
      `/api/v1/integrations/academico/snapshot/complete?snapshot=${encodeURIComponent(snapshotToken)}&courseWatermark=${encodeURIComponent(courseWatermark)}&studentWatermark=${encodeURIComponent(studentWatermark)}`,
    ).expect(200);
    expect(completed.body.snapshot).toMatchObject({
      runId: snapshotRunId,
      complete: true,
      requiredEntities: ['COURSE', 'STUDENT'],
    });
  });

  it('rejects invalid cursors, unsupported contracts, and unbounded pages', async () => {
    const invalidCursor = await integrationGet(
      '/api/v1/integrations/academico/courses?cursor=not-a-cursor',
    ).expect(400);
    expect(invalidCursor.body.code).toBe('INVALID_CURSOR');

    const tooLarge = await integrationGet(
      '/api/v1/integrations/academico/courses?limit=501',
    ).expect(400);
    expect(tooLarge.body.code).toBe('INVALID_PAGE_SIZE');

    const schema = await integrationGet(
      '/api/v1/integrations/academico/courses?schemaVersion=2',
    ).expect(400);
    expect(schema.body.code).toBe('UNSUPPORTED_SCHEMA_VERSION');

    const mode = await integrationGet(
      '/api/v1/integrations/academico/courses?mode=export',
    ).expect(400);
    expect(mode.body.code).toBe('UNSUPPORTED_INTEGRATION_MODE');
  });

  it('replays pages deterministically and safely handles equal updatedAt values', async () => {
    const baseline = await drainFeed(
      'students',
      `mode=incremental&watermark=${encodeURIComponent(studentWatermark)}`,
    );
    studentWatermark = baseline.watermark;
    const equalUpdatedAt = new Date('2026-08-11T12:00:00.000Z');
    await prisma.$executeRaw`
      UPDATE "students"
      SET "updatedAt" = ${equalUpdatedAt}
      WHERE "id" IN (${readyStudent1.id}, ${readyStudent2.id})
    `;

    const path = `/api/v1/integrations/academico/students?mode=incremental&limit=1&watermark=${encodeURIComponent(studentWatermark)}`;
    const first = await integrationGet(path).expect(200);
    expect(first.body.page.nextCursor).toBeTruthy();
    const continuationPath = `/api/v1/integrations/academico/students?mode=incremental&limit=1&cursor=${encodeURIComponent(first.body.page.nextCursor as string)}`;
    const continuation = await integrationGet(continuationPath).expect(200);
    const replay = await integrationGet(continuationPath).expect(200);
    expect(replay.body).toEqual(continuation.body);

    const drained = await drainFeed(
      'students',
      `mode=incremental&limit=1&watermark=${encodeURIComponent(studentWatermark)}`,
    );
    const ids = drained.pages.flatMap((page) =>
      page.items.map((item) => item.integrationId),
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        readyStudent1.integrationId,
        readyStudent2.integrationId,
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    studentWatermark = drained.watermark;
  });

  it('surfaces creates, updates, moves, and Student tombstones incrementally', async () => {
    const created = await prisma.student.create({
      data: {
        tenantId: TENANT_A,
        rut: '55.555.555-5',
        name: 'New Student',
        firstName: 'New',
        lastName: 'Student',
        courseId: courseA1.id,
        guardianId: guardianAId,
      },
    });
    let result = await drainFeed(
      'students',
      `mode=incremental&watermark=${encodeURIComponent(studentWatermark)}`,
    );
    expect(result.pages.flatMap((page) => page.items)).toContainEqual(
      expect.objectContaining({ integrationId: created.integrationId }),
    );
    studentWatermark = result.watermark;

    await prisma.student.update({
      where: { id: readyStudent1.id },
      data: { firstName: 'Ana María', name: 'Ana María Silva' },
    });
    result = await drainFeed(
      'students',
      `mode=incremental&watermark=${encodeURIComponent(studentWatermark)}`,
    );
    expect(result.pages.flatMap((page) => page.items)).toContainEqual(
      expect.objectContaining({
        integrationId: readyStudent1.integrationId,
        firstName: 'Ana María',
      }),
    );
    studentWatermark = result.watermark;

    await prisma.student.update({
      where: { id: readyStudent1.id },
      data: { courseId: courseA2.id },
    });
    result = await drainFeed(
      'students',
      `mode=incremental&watermark=${encodeURIComponent(studentWatermark)}`,
    );
    expect(result.pages.flatMap((page) => page.items)).toContainEqual(
      expect.objectContaining({
        integrationId: readyStudent1.integrationId,
        courseIntegrationId: courseA2.integrationId,
      }),
    );
    studentWatermark = result.watermark;

    await prisma.student.update({
      where: { id: readyStudent2.id },
      data: { deletedAt: new Date() },
    });
    result = await drainFeed(
      'students',
      `mode=incremental&watermark=${encodeURIComponent(studentWatermark)}`,
    );
    expect(result.pages.flatMap((page) => page.items)).toContainEqual(
      expect.objectContaining({
        integrationId: readyStudent2.integrationId,
        deletedAt: expect.any(String),
      }),
    );
    studentWatermark = result.watermark;

    const originalIntegrationId = readyStudent2.integrationId;
    const restored = await prisma.student.update({
      where: { id: readyStudent2.id },
      data: { deletedAt: null },
      select: { integrationId: true },
    });
    expect(restored.integrationId).toBe(originalIntegrationId);
  });

  it('surfaces Course tombstones without changing integration identity', async () => {
    await prisma.course.update({
      where: { id: courseA2.id },
      data: { deletedAt: new Date() },
    });
    const result = await drainFeed(
      'courses',
      `mode=incremental&watermark=${encodeURIComponent(courseWatermark)}`,
    );
    expect(result.pages.flatMap((page) => page.items)).toContainEqual(
      expect.objectContaining({
        integrationId: courseA2.integrationId,
        deletedAt: expect.any(String),
      }),
    );
    courseWatermark = result.watermark;

    const restored = await prisma.course.update({
      where: { id: courseA2.id },
      data: { deletedAt: null },
      select: { integrationId: true },
    });
    expect(restored.integrationId).toBe(courseA2.integrationId);
  });
});
