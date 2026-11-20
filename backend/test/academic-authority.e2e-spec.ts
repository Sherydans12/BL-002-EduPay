import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/create-e2e-app';
import {
  resetE2eDatabase,
  seedE2eDatabase,
  type E2eSeedContext,
} from './helpers/seed-e2e-db';

const TENANT = 'colegio-conquistadores';
const FLAGS = [
  'ACADEMIC_FINANCIAL_PROJECTION_ENABLED',
  'ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED',
] as const;

// ADR-0028: once Académico is the authority for a tenant, BL no longer
// creates or edits students and courses. Synthetic data only.
describe('Académico authority over students and courses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ctx: E2eSeedContext;
  let guardianId: number;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    ctx = await seedE2eDatabase(prisma, (email, password) =>
      app.get(AuthService).login(email, password),
    );
    const managePermissions = await Promise.all(
      ['manage:students', 'manage:courses'].map((action) =>
        prisma.permission.upsert({
          where: { action },
          create: { action },
          update: {},
        }),
      ),
    );
    await prisma.role.update({
      where: { name: 'E2E_ADMIN' },
      data: {
        permissions: {
          connect: managePermissions.map((permission) => ({
            id: permission.id,
          })),
        },
      },
    });
    guardianId = (
      await prisma.student.findUniqueOrThrow({ where: { id: ctx.studentId } })
    ).guardianId;
  }, 60_000);

  afterEach(async () => {
    for (const flag of FLAGS) delete process.env[flag];
    await prisma.tenantCanonicalMapping.deleteMany({
      where: { tenantId: TENANT },
    });
  });

  afterAll(async () => {
    await resetE2eDatabase(prisma);
    await app.close();
  });

  it('keeps managing students and courses in BL for a tenant without Académico authority', async () => {
    const status = await api()
      .get('/api/academic-authority')
      .set(auth())
      .expect(200);
    expect(status.body.data ?? status.body).toEqual({
      managedByAcademico: false,
    });
    const course = await prisma.course.findUniqueOrThrow({
      where: { id: ctx.courseId },
    });
    await api()
      .put(`/api/courses/${ctx.courseId}`)
      .set(auth())
      .send({ name: `${course.name} (local)` })
      .expect(200);
    await prisma.course.update({
      where: { id: ctx.courseId },
      data: { name: course.name },
    });
  });

  it('rejects academic writes once Académico is the authority and keeps financial edits', async () => {
    for (const flag of FLAGS) process.env[flag] = 'true';
    const user = await prisma.user.findFirstOrThrow({
      where: { email: 'e2e@baselogic.cl' },
    });
    await prisma.tenantCanonicalMapping.create({
      data: {
        tenantId: TENANT,
        canonicalTenantId: randomUUID(),
        assignedByUserId: user.id,
        correlationId: `e2e-${randomUUID()}`,
        reason: 'e2e: Académico authority',
      },
    });
    const before = await snapshot();

    const status = await api()
      .get('/api/academic-authority')
      .set(auth())
      .expect(200);
    expect(status.body.data ?? status.body).toEqual({
      managedByAcademico: true,
    });

    const rejected: Array<() => request.Test> = [
      () =>
        api().post('/api/students').set(auth()).send({
          rut: '11.111.111-1',
          firstName: 'Nuevo',
          lastName: 'Local',
          courseId: ctx.courseId,
          guardianId,
        }),
      () =>
        api()
          .put(`/api/students/${ctx.studentId}`)
          .set(auth())
          .send({ firstName: 'Cambio' }),
      () =>
        api()
          .put(`/api/students/${ctx.studentId}`)
          .set(auth())
          .send({ courseId: ctx.courseId, guardianId }),
      () => api().delete(`/api/students/${ctx.studentId}`).set(auth()),
      () =>
        api()
          .post(`/api/students/${ctx.studentId}/name-review`)
          .set(auth())
          .send({ firstName: 'A', lastName: 'B' }),
      () =>
        api().post('/api/courses').set(auth()).send({ name: 'Curso local' }),
      () =>
        api()
          .put(`/api/courses/${ctx.courseId}`)
          .set(auth())
          .send({ name: 'Cambio local' }),
      () => api().delete(`/api/courses/${ctx.courseId}`).set(auth()),
    ];
    for (const call of rejected) {
      const response = await call();
      expect(response.status).toBe(409);
      expect(JSON.stringify(response.body)).toContain('MANAGED_BY_ACADEMICO');
    }
    expect(await snapshot()).toEqual(before);

    await api()
      .put(`/api/students/${ctx.studentId}`)
      .set(auth())
      .send({ guardianId })
      .expect(200);
  });

  async function snapshot() {
    const [students, courses, enrollments] = await Promise.all([
      prisma.student.findMany({
        where: { tenantId: TENANT },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rut: true,
          courseId: true,
          status: true,
          deletedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      prisma.course.findMany({
        where: { tenantId: TENANT },
        select: { id: true, name: true, deletedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.enrollment.findMany({
        where: { tenantId: TENANT },
        select: { id: true, status: true, courseId: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { students, courses, enrollments };
  }

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.accessToken}` });
});
