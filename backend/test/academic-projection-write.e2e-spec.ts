import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthService } from '../src/auth/auth.service';
import { AcademicFinancialProjectionIntakeService } from '../src/integrations/academic-financial-projection/academic-financial-projection-intake.service';
import { AcademicFinancialProjectionWriterService } from '../src/integrations/academic-financial-projection/academic-financial-projection-writer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/create-e2e-app';
import {
  resetE2eDatabase,
  seedE2eDatabase,
  type E2eSeedContext,
} from './helpers/seed-e2e-db';

const TENANT = 'colegio-conquistadores';

// Synthetic data only. Shadow rows are inserted directly: in production they
// arrive from Académico through the projection (ADR-0025, ADR-0027).
describe('Academic projection write mode (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let writer: AcademicFinancialProjectionWriterService;
  let intake: AcademicFinancialProjectionIntakeService;
  let ctx: E2eSeedContext;

  const canonicalTenantId = randomUUID();
  const year2026Canonical = randomUUID();
  const year2027Canonical = randomUUID();
  const course2026Canonical = randomUUID();
  const course2027Canonical = randomUUID();
  const student1Canonical = randomUUID();
  const student2Canonical = randomUUID();
  const newStudentCanonical = randomUUID();
  const enrollment2026 = randomUUID();
  const enrollment2027 = randomUUID();
  const newStudentEnrollment = randomUUID();
  const student2Inactive = randomUUID();
  const orphanEnrollment = randomUUID();
  let year2026: { label: string; startDate: Date; endDate: Date };
  let course2026: { id: number; integrationId: string; name: string };
  let student1: { id: number; integrationId: string; courseId: number };
  let student2IntegrationId: string;
  let guardianId: number;

  function shadowRow(input: {
    enrollmentId: string;
    studentId: string;
    courseId: string;
    yearId: string;
    year: { label: string; startDate: Date; endDate: Date; status: string };
    courseLabel: string;
    status?: 'ACTIVE' | 'INACTIVE';
    student: {
      firstName: string;
      lastName: string;
      nationalId?: string | null;
      legacy?: string | null;
    };
    courseLegacy?: string | null;
    version?: number;
  }) {
    return {
      tenantId: TENANT,
      canonicalTenantId,
      academicYearId: input.yearId,
      academicStudentId: input.studentId,
      academicCourseId: input.courseId,
      academicEnrollmentId: input.enrollmentId,
      enrollmentStatus: input.status ?? 'ACTIVE',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
      effectiveTo: null,
      version: BigInt(input.version ?? 1),
      sourceUpdatedAt: new Date(),
      operation: 'UPSERT' as const,
      studentFirstName: input.student.firstName,
      studentLastName: input.student.lastName,
      studentNationalIdType: input.student.nationalId ? 'RUN' : null,
      studentNationalId: input.student.nationalId ?? null,
      studentLegacyIntegrationId: input.student.legacy ?? null,
      courseLabel: input.courseLabel,
      courseLegacyIntegrationId: input.courseLegacy ?? null,
      academicYearLabel: input.year.label,
      academicYearStartDate: input.year.startDate,
      academicYearEndDate: input.year.endDate,
      academicYearStatus: input.year.status,
    };
  }

  const year2027 = {
    label: '2027',
    startDate: new Date('2027-03-01T00:00:00.000Z'),
    endDate: new Date('2027-12-15T00:00:00.000Z'),
    status: 'DRAFT',
  };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    writer = app.get(AcademicFinancialProjectionWriterService);
    intake = app.get(AcademicFinancialProjectionIntakeService);
    ctx = await seedE2eDatabase(prisma, (email, password) =>
      app.get(AuthService).login(email, password),
    );
    await prisma.academicFinancialProjection.deleteMany({
      where: { tenantId: TENANT },
    });
    await prisma.academicYear.deleteMany({
      where: { tenantId: TENANT, label: '2027' },
    });
    const active = await prisma.academicYear.findFirstOrThrow({
      where: { tenantId: TENANT, status: 'ACTIVE' },
    });
    await prisma.academicYear.update({
      where: { id: active.id },
      data: { canonicalAcademicYearId: null },
    });
    year2026 = active;
    course2026 = await prisma.course.findUniqueOrThrow({
      where: { id: ctx.courseId },
    });
    student1 = await prisma.student.findUniqueOrThrow({
      where: { id: ctx.studentId },
    });
    student2IntegrationId = (
      await prisma.student.findUniqueOrThrow({ where: { id: ctx.student2Id } })
    ).integrationId;
    guardianId = (
      await prisma.guardian.findFirstOrThrow({ where: { tenantId: TENANT } })
    ).id;

    const y2026 = { ...year2026, status: 'ACTIVE' };
    await prisma.academicFinancialProjection.createMany({
      data: [
        shadowRow({
          enrollmentId: enrollment2026,
          studentId: student1Canonical,
          courseId: course2026Canonical,
          yearId: year2026Canonical,
          year: y2026,
          courseLabel: course2026.name,
          courseLegacy: course2026.integrationId,
          student: {
            firstName: 'Ana',
            lastName: 'Sintética',
            legacy: student1.integrationId,
          },
        }),
        shadowRow({
          enrollmentId: enrollment2027,
          studentId: student1Canonical,
          courseId: course2027Canonical,
          yearId: year2027Canonical,
          year: year2027,
          courseLabel: '1° Básico A',
          student: {
            firstName: 'Ana',
            lastName: 'Sintética',
            legacy: student1.integrationId,
          },
        }),
        shadowRow({
          enrollmentId: newStudentEnrollment,
          studentId: newStudentCanonical,
          courseId: course2027Canonical,
          yearId: year2027Canonical,
          year: year2027,
          courseLabel: '1° Básico A',
          student: {
            firstName: 'Nuevo',
            lastName: 'Ingreso',
            nationalId: '11111111-1',
          },
        }),
        shadowRow({
          enrollmentId: student2Inactive,
          studentId: student2Canonical,
          courseId: course2026Canonical,
          yearId: year2026Canonical,
          year: y2026,
          courseLabel: course2026.name,
          courseLegacy: course2026.integrationId,
          status: 'INACTIVE',
          student: {
            firstName: 'Alumno',
            lastName: 'Dos',
            legacy: student2IntegrationId,
          },
        }),
        shadowRow({
          enrollmentId: orphanEnrollment,
          studentId: randomUUID(),
          courseId: course2027Canonical,
          yearId: year2027Canonical,
          year: year2027,
          courseLabel: '1° Básico A',
          student: {
            firstName: 'Sin',
            lastName: 'Ficha',
            legacy: randomUUID(),
          },
        }),
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await resetE2eDatabase(prisma);
    await prisma.academicFinancialProjection.deleteMany({
      where: { tenantId: TENANT },
    });
    await prisma.academicYear.deleteMany({
      where: { tenantId: TENANT, label: '2027' },
    });
    await prisma.academicYear.updateMany({
      where: { tenantId: TENANT },
      data: { canonicalAcademicYearId: null, status: 'ACTIVE' },
    });
    await app.close();
  });

  it('plans the write without changing BL records', async () => {
    const chargesBefore = await prisma.charge.count();
    const plan = await writer.run(TENANT, { dryRun: true });

    expect(plan.rows).toBe(5);
    expect(plan.outcomes).toEqual({
      APPLIED: 2,
      PENDING_INTAKE: 1,
      CONFLICT: 1,
      SKIPPED: 1,
    });
    expect(plan.changes).toMatchObject({
      YEAR_LINKED: 1,
      YEAR_CREATED: 1,
      COURSE_LINKED: 1,
      COURSE_CREATED: 1,
      STUDENT_LINKED: 2,
      ENROLLMENT_LINKED: 1,
      ENROLLMENT_CREATED: 1,
    });
    expect(plan.reasons).toMatchObject({
      NEW_STUDENT: 1,
      STUDENT_LEGACY_NOT_FOUND: 1,
      INACTIVE_NOT_LINKED: 1,
    });
    expect(JSON.stringify(plan)).not.toMatch(/Sintética|11111111/);

    expect(
      await prisma.academicYear.count({
        where: { tenantId: TENANT, label: '2027' },
      }),
    ).toBe(0);
    expect(
      await prisma.student.count({
        where: { tenantId: TENANT, canonicalStudentId: { not: null } },
      }),
    ).toBe(0);
    expect(
      await prisma.academicFinancialProjection.count({
        where: { tenantId: TENANT, writeOutcome: { not: null } },
      }),
    ).toBe(0);
    expect(await prisma.charge.count()).toBe(chargesBefore);
  });

  it('applies the plan idempotently and keeps the 2026 mirror', async () => {
    const chargesBefore = await prisma.charge.count();
    const applied = await writer.run(TENANT, { dryRun: false });
    expect(applied.outcomes).toEqual({
      APPLIED: 2,
      PENDING_INTAKE: 1,
      CONFLICT: 1,
      SKIPPED: 1,
    });

    const linked = await prisma.student.findUniqueOrThrow({
      where: { id: student1.id },
      include: { enrollments: { include: { academicYear: true } } },
    });
    expect(linked.canonicalStudentId).toBe(student1Canonical);
    expect(linked.firstName).toBe('Ana');
    expect(linked.name).toBe('Ana Sintética');
    // The ACTIVE year is still 2026: the mirror stays on its course.
    expect(linked.courseId).toBe(course2026.id);
    const byYear = new Map(
      linked.enrollments.map((e) => [e.academicYear.label, e]),
    );
    expect(byYear.get(year2026.label)?.canonicalEnrollmentId).toBe(
      enrollment2026,
    );
    const next = byYear.get('2027');
    expect(next).toMatchObject({
      canonicalEnrollmentId: enrollment2027,
      status: 'ACTIVE',
      financialSetup: 'PENDING',
    });
    expect(next?.academicYear).toMatchObject({
      status: 'DRAFT',
      canonicalAcademicYearId: year2027Canonical,
    });
    // The inactive enrollment of a student not linked to it is not touched.
    const student2Enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: ctx.student2Id },
    });
    expect(student2Enrollment.status).toBe('ACTIVE');
    expect(await prisma.charge.count()).toBe(chargesBefore);

    const again = await writer.run(TENANT, { dryRun: false });
    expect(again.rows).toBe(2);
    expect(again.outcomes).toEqual({
      APPLIED: 0,
      PENDING_INTAKE: 1,
      CONFLICT: 1,
      SKIPPED: 0,
    });
    expect(again.changes).toEqual({});
  });

  it('incorporates a new student once an operator assigns a guardian', async () => {
    const pending = await intake.list(TENANT);
    expect(pending).toEqual([
      expect.objectContaining({
        academicStudentId: newStudentCanonical,
        firstName: 'Nuevo',
        lastName: 'Ingreso',
        courseLabel: '1° Básico A',
        academicYearLabel: '2027',
        possibleMatch: null,
      }),
    ]);

    await expect(
      intake.accept(TENANT, newStudentCanonical, {}),
    ).rejects.toThrow(/apoderado/);

    const accepted = await intake.accept(TENANT, newStudentCanonical, {
      guardianId,
    });
    expect(accepted.enrollments).toEqual([
      expect.objectContaining({
        academicEnrollmentId: newStudentEnrollment,
        outcome: 'APPLIED',
        changes: ['ENROLLMENT_CREATED'],
      }),
    ]);
    const created = await prisma.student.findUniqueOrThrow({
      where: { id: accepted.studentId },
      include: { enrollments: { include: { course: true } } },
    });
    expect(created).toMatchObject({
      canonicalStudentId: newStudentCanonical,
      nationalIdType: 'RUN',
      guardianId,
      name: 'Nuevo Ingreso',
    });
    expect(created.rut.replace(/[^0-9K]/gi, '')).toBe('111111111');
    expect(created.enrollments).toEqual([
      expect.objectContaining({
        canonicalEnrollmentId: newStudentEnrollment,
        status: 'ACTIVE',
        financialSetup: 'PENDING',
      }),
    ]);
    expect(created.enrollments[0]?.course.name).toBe('1° Básico A');
    expect(await intake.list(TENANT)).toEqual([]);
  });

  it('moves the mirror to 2027 when Académico activates it', async () => {
    await prisma.academicFinancialProjection.update({
      where: {
        tenantId_academicEnrollmentId: {
          tenantId: TENANT,
          academicEnrollmentId: enrollment2027,
        },
      },
      // Académico reprojects the year's active enrollments with a new version
      // and time; the closed or conflicting rows keep their older descriptors.
      data: {
        academicYearStatus: 'ACTIVE',
        version: BigInt(2),
        sourceUpdatedAt: new Date(),
      },
    });
    const applied = await writer.run(TENANT, { dryRun: false });
    expect(applied.changes.YEAR_STATUS_CHANGED).toBe(1);
    expect(
      (
        await prisma.academicYear.findFirstOrThrow({
          where: { tenantId: TENANT, label: '2027' },
        })
      ).status,
    ).toBe('ACTIVE');
    expect(applied.mirrorsUpdated).toBeGreaterThan(0);

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: student1.id },
      include: { course: { include: { academicYear: true } } },
    });
    expect(student.course.academicYear.label).toBe('2027');
    expect(student.financialSetup).toBe('PENDING');
  });

  it('deactivates a linked enrollment on a tombstone and keeps its charges', async () => {
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { canonicalEnrollmentId: enrollment2026 },
    });
    await prisma.charge.create({
      data: {
        tenantId: TENANT,
        studentId: student1.id,
        enrollmentId: enrollment.id,
        conceptId: ctx.conceptId,
        amount: 75000,
        dueDate: new Date('2026-12-05T00:00:00.000Z'),
      },
    });
    const charges = await prisma.charge.count({
      where: { enrollmentId: enrollment.id },
    });
    await prisma.academicFinancialProjection.update({
      where: {
        tenantId_academicEnrollmentId: {
          tenantId: TENANT,
          academicEnrollmentId: enrollment2026,
        },
      },
      data: {
        operation: 'TOMBSTONE',
        enrollmentStatus: 'INACTIVE',
        version: BigInt(3),
        sourceUpdatedAt: new Date(),
      },
    });

    const applied = await writer.run(TENANT, { dryRun: false });
    expect(applied.changes.ENROLLMENT_DEACTIVATED).toBe(1);
    expect(
      (
        await prisma.enrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).status,
    ).toBe('INACTIVE');
    expect(
      await prisma.charge.count({ where: { enrollmentId: enrollment.id } }),
    ).toBe(charges);
  });

  it('keeps the plan and intake behind their permissions', async () => {
    await api()
      .get(
        `/api/integrations/academic-financial-projection/shadow/tenants/${TENANT}/write-plan`,
      )
      .set(auth())
      .expect(403);
    await api()
      .post(`/api/academic-intake/${randomUUID()}/accept`)
      .set(auth())
      .send({ guardianId })
      .expect(403);
    await api().get('/api/academic-intake').expect(401);
  });

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.accessToken}` });
});
