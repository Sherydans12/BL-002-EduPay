import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/create-e2e-app';
import { seedE2eDatabase, type E2eSeedContext } from './helpers/seed-e2e-db';

// Synthetic data only. The 2027 year, course and enrollment are inserted
// directly: in production they arrive from Académico (ADR-0025).
describe('Billing by academic year (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ctx: E2eSeedContext;
  let year2027Id: number;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.accessToken}` });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);
    ctx = await seedE2eDatabase(prisma, (email, password) =>
      authService.login(email, password),
    );
    await prisma.academicYear.deleteMany({
      where: { tenantId: 'colegio-conquistadores', label: '2027' },
    });
    // Another school with a more recent ACTIVE year must never be picked:
    // the e2e session has no tenant context, so lookups are not auto-scoped.
    await prisma.tenant.upsert({
      where: { id: 'billing-e2e-other' },
      update: {},
      create: {
        id: 'billing-e2e-other',
        slug: 'billing-e2e-other',
        name: 'Otro colegio E2E',
      },
    });
    await prisma.academicYear.upsert({
      where: {
        tenantId_label: { tenantId: 'billing-e2e-other', label: '2030' },
      },
      update: { status: 'ACTIVE' },
      create: {
        tenantId: 'billing-e2e-other',
        label: '2030',
        startDate: new Date('2030-03-01T00:00:00.000Z'),
        endDate: new Date('2030-12-15T00:00:00.000Z'),
        status: 'ACTIVE',
      },
    });
    const year2027 = await prisma.academicYear.create({
      data: {
        tenantId: 'colegio-conquistadores',
        label: '2027',
        startDate: new Date('2027-03-01T00:00:00.000Z'),
        endDate: new Date('2027-12-15T00:00:00.000Z'),
        status: 'DRAFT',
      },
    });
    year2027Id = year2027.id;
    const course2027 = await prisma.course.create({
      data: {
        tenantId: 'colegio-conquistadores',
        name: 'Curso E2E',
        academicYearId: year2027.id,
      },
    });
    await prisma.enrollment.create({
      data: {
        tenantId: 'colegio-conquistadores',
        studentId: ctx.studentId,
        courseId: course2027.id,
        academicYearId: year2027.id,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.charge.deleteMany({ where: { studentId: ctx.studentId } });
    await prisma.enrollment.deleteMany({
      where: { academicYearId: year2027Id },
    });
    await prisma.course.deleteMany({ where: { academicYearId: year2027Id } });
    await prisma.academicYear.deleteMany({ where: { id: year2027Id } });
    await app.close();
  });

  it('lists the academic years, most recent first', async () => {
    const response = await api()
      .get('/api/academic-years')
      .set(auth())
      .expect(200);
    const labels = response.body.data.map(
      (year: { label: string }) => year.label,
    );
    expect(labels).toContain('2027');
    expect(labels).toContain('2026');
    expect(labels.indexOf('2027')).toBeLessThan(labels.indexOf('2026'));
  });

  it('keeps the 2026 and 2027 plans of the same student independent', async () => {
    // 2026 (ACTIVE year, default): its enrollment fee falls due in 2025.
    await api()
      .post(`/api/charges/setup/${ctx.studentId}`)
      .set(auth())
      .send({
        charges: [
          { conceptId: ctx.conceptId, amount: 100000, dueDate: '2025-12-15' },
          { conceptId: ctx.conceptId, amount: 75000, dueDate: '2026-03-05' },
        ],
      })
      .expect(201);
    // 2027: its enrollment fee falls due in 2026.
    await api()
      .post(`/api/charges/setup/${ctx.studentId}?academicYearId=${year2027Id}`)
      .set(auth())
      .send({
        charges: [
          { conceptId: ctx.conceptId, amount: 120000, dueDate: '2026-12-15' },
        ],
      })
      .expect(201);

    const plan2026 = await api()
      .get(`/api/charges/plan/${ctx.studentId}`)
      .set(auth())
      .expect(200);
    const plan2027 = await api()
      .get(`/api/charges/plan/${ctx.studentId}?academicYearId=${year2027Id}`)
      .set(auth())
      .expect(200);
    expect(
      plan2026.body.data.map((charge: { amount: number }) => charge.amount),
    ).toEqual([100000, 75000]);
    expect(
      plan2027.body.data.map((charge: { amount: number }) => charge.amount),
    ).toEqual([120000]);

    // Replacing the 2027 plan never deletes 2026 charges.
    await api()
      .put(`/api/charges/plan/${ctx.studentId}?academicYearId=${year2027Id}`)
      .set(auth())
      .send({
        charges: [
          { conceptId: ctx.conceptId, amount: 130000, dueDate: '2026-12-20' },
        ],
      })
      .expect(200);
    const liveCharges = await prisma.charge.findMany({
      where: { studentId: ctx.studentId, deletedAt: null },
      include: { enrollment: { include: { academicYear: true } } },
      orderBy: { dueDate: 'asc' },
    });
    expect(
      liveCharges.map((charge) => [
        charge.enrollment.academicYear.label,
        charge.amount,
      ]),
    ).toEqual([
      ['2026', 100000],
      ['2026', 75000],
      ['2027', 130000],
    ]);

    // The statement can be filtered by year; without a year it covers all.
    const statement2027 = await api()
      .get(
        `/api/charges/statement/${ctx.studentId}?academicYearId=${year2027Id}`,
      )
      .set(auth())
      .expect(200);
    expect(statement2027.body.data.summary.totalInvoiced).toBe(130000);
    const statementAll = await api()
      .get(`/api/charges/statement/${ctx.studentId}`)
      .set(auth())
      .expect(200);
    expect(statementAll.body.data.summary.totalInvoiced).toBe(305000);
  });

  it('configures each year once and mirrors only the ACTIVE year into the student', async () => {
    await api()
      .post(`/api/charges/setup/${ctx.studentId}`)
      .set(auth())
      .send({
        charges: [
          { conceptId: ctx.conceptId, amount: 1000, dueDate: '2026-04-05' },
        ],
      })
      .expect(400);

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: ctx.studentId },
      include: { academicYear: true },
      orderBy: { academicYearId: 'asc' },
    });
    expect(
      enrollments.map((item) => [item.academicYear.label, item.financialSetup]),
    ).toEqual([
      ['2026', 'CONFIGURED'],
      ['2027', 'CONFIGURED'],
    ]);

    // A student without a 2027 enrollment cannot get a 2027 plan.
    await api()
      .post(`/api/charges/setup/${ctx.student2Id}?academicYearId=${year2027Id}`)
      .set(auth())
      .send({
        charges: [
          { conceptId: ctx.conceptId, amount: 1000, dueDate: '2026-12-15' },
        ],
      })
      .expect(404);
    const student2 = await prisma.student.findUniqueOrThrow({
      where: { id: ctx.student2Id },
      select: { financialSetup: true },
    });
    expect(student2.financialSetup).toBe('PENDING');
  });
  it('previews and issues a single fee for a draft year without touching 2026', async () => {
    const email = 'e2e@baselogic.cl';
    await prisma.user.update({
      where: { email },
      data: { tenantId: 'colegio-conquistadores' },
    });
    const session = await app.get(AuthService).login(email, 'e2e-secret');
    const token = { Authorization: `Bearer ${session.access_token}` };
    const concept = await prisma.paymentConcept.create({
      data: {
        tenantId: 'colegio-conquistadores',
        name: 'Matrícula E2E',
        defaultAmount: 54000,
      },
    });
    const otherYear = await prisma.academicYear.findFirstOrThrow({
      where: { tenantId: 'billing-e2e-other' },
    });
    const input = {
      academicYearId: year2027Id,
      conceptId: concept.id,
      amount: 54000,
      dueDate: '2026-12-15',
    };
    const previewPath = '/api/charges/enrollment-fees/preview';
    const issuePath = '/api/charges/enrollment-fees/issue';
    await api().post(previewPath).send(input).expect(401);
    await api()
      .post(previewPath)
      .set(token)
      .set('x-tenant-id', 'billing-e2e-other')
      .send({ ...input, academicYearId: otherYear.id })
      .expect(404);
    const prior = await prisma.charge.findMany({
      where: { studentId: ctx.studentId },
    });
    const preview = await api()
      .post(previewPath)
      .set(token)
      .send(input)
      .expect(201);
    expect(preview.body.data).toMatchObject({
      pendingCount: 1,
      issuedCount: 0,
      academicYearLabel: '2027',
    });
    await api()
      .post(issuePath)
      .set(token)
      .send({
        ...input,
        amount: 55000,
        fingerprint: preview.body.data.fingerprint,
      })
      .expect(409);
    const payload = { ...input, fingerprint: preview.body.data.fingerprint };
    const issued = await api()
      .post(issuePath)
      .set(token)
      .send(payload)
      .expect(201);
    expect(issued.body.data.issuedCount).toBe(1);
    const replay = await api()
      .post(issuePath)
      .set(token)
      .send(payload)
      .expect(201);
    expect(replay.body.data).toMatchObject({
      issuedCount: 0,
      existingCount: 1,
    });
    const fee = await prisma.charge.findFirstOrThrow({
      where: { conceptId: concept.id },
      include: { enrollment: { include: { academicYear: true } } },
    });
    expect(fee.enrollment.academicYear).toMatchObject({
      label: '2027',
      status: 'DRAFT',
    });
    expect(fee.dueDate.toISOString().slice(0, 10)).toBe('2026-12-15');
    expect(
      await prisma.charge.findMany({
        where: { id: { in: prior.map(({ id }) => id) } },
      }),
    ).toEqual(expect.arrayContaining(prior));
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    try {
      await api().post(previewPath).set(token).send(input).expect(401);
    } finally {
      await prisma.user.update({ where: { email }, data: { isActive: true } });
    }
  });
});
