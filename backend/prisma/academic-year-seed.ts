import type {
  FinancialSetupStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Seeds and import scripts: return the tenant's ACTIVE academic year, creating
 * it for the given label when none exists (ADR-0025 billing by academic year).
 */
export async function ensureActiveAcademicYear(
  db: Db,
  tenantId: string,
  label = String(new Date().getFullYear()),
) {
  const active = await db.academicYear.findFirst({
    where: { tenantId, status: 'ACTIVE' },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });
  if (active) return active;
  return db.academicYear.upsert({
    where: { tenantId_label: { tenantId, label } },
    update: { status: 'ACTIVE' },
    create: {
      tenantId,
      label,
      startDate: new Date(`${label}-03-01T00:00:00.000Z`),
      endDate: new Date(`${label}-12-31T00:00:00.000Z`),
      status: 'ACTIVE',
    },
  });
}

/** The student's enrollment for the year, created with its current course. */
export async function ensureEnrollment(
  db: Db,
  student: {
    id: number;
    tenantId: string;
    courseId: number;
    financialSetup?: FinancialSetupStatus;
  },
  academicYearId: number,
) {
  return db.enrollment.upsert({
    where: {
      studentId_academicYearId: { studentId: student.id, academicYearId },
    },
    update: {},
    create: {
      tenantId: student.tenantId,
      studentId: student.id,
      courseId: student.courseId,
      academicYearId,
      ...(student.financialSetup
        ? { financialSetup: student.financialSetup }
        : {}),
    },
  });
}
