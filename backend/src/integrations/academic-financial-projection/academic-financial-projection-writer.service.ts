import { Injectable, Logger } from '@nestjs/common';
import {
  AcademicFinancialProjection,
  AcademicYearStatus,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;
type Row = AcademicFinancialProjection;

/** Result of writing one shadow row into BL's own tables (ADR-0027). */
export type WriteOutcome =
  | 'APPLIED'
  | 'PENDING_INTAKE'
  | 'CONFLICT'
  | 'SKIPPED';

export type WriteChange =
  | 'YEAR_CREATED'
  | 'YEAR_LINKED'
  | 'YEAR_UPDATED'
  | 'YEAR_STATUS_CHANGED'
  | 'COURSE_CREATED'
  | 'COURSE_LINKED'
  | 'COURSE_RENAMED'
  | 'STUDENT_LINKED'
  | 'STUDENT_RENAMED'
  | 'STUDENT_NATIONAL_ID_DIFFERS'
  | 'ENROLLMENT_CREATED'
  | 'ENROLLMENT_LINKED'
  | 'ENROLLMENT_COURSE_CHANGED'
  | 'ENROLLMENT_ACTIVATED'
  | 'ENROLLMENT_DEACTIVATED';

export type RowWriteResult = {
  academicEnrollmentId: string;
  outcome: WriteOutcome;
  reasonCode?: string;
  changes: WriteChange[];
};

export type WritePlanReport = {
  tenantId: string;
  dryRun: boolean;
  rows: number;
  outcomes: Record<WriteOutcome, number>;
  changes: Partial<Record<WriteChange, number>>;
  reasons: Record<string, number>;
  /** Conflicts and skips by enrollment id only: no names or RUN/IPE. */
  attention: Array<{
    academicEnrollmentId: string;
    outcome: WriteOutcome;
    reasonCode: string;
  }>;
  mirrorsUpdated: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR_STATUSES = new Set<string>([
  'DRAFT',
  'ACTIVE',
  'CLOSED',
  'ARCHIVED',
]);
const APPLY_CHUNK = 200;

class Rollback extends Error {
  constructor(readonly report: WritePlanReport) {
    super('dry-run rollback');
  }
}

class RowConflict extends Error {
  constructor(
    readonly outcome: WriteOutcome,
    readonly reasonCode: string,
  ) {
    super(reasonCode);
  }
}

/** An upserted, active enrollment (not closed nor tombstoned). */
export function isActiveRow(row: {
  operation: string;
  enrollmentStatus: string;
}): boolean {
  return row.operation !== 'TOMBSTONE' && row.enrollmentStatus === 'ACTIVE';
}

/** Uppercase digits and K: the same normalization as `students.rut_normalized`. */
export function normalizeNationalId(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^0-9K]/g, '');
}

/**
 * Writes the shadow projection into BL's academic years, courses, students
 * and enrollments (ADR-0025 decision 2, ADR-0027).
 *
 * - Links existing records by canonical id or legacy `integrationId`; never by
 *   name, course or email.
 * - Creates years, courses and enrollments only for an active enrollment of
 *   a linked student. Never creates a student: a new student waits in the
 *   intake until an operator assigns a guardian.
 * - Never deletes. A tombstone or inactive enrollment only deactivates the
 *   linked BL enrollment; charges and payments are untouched.
 * - Never changes a RUN: a difference is reported, not written.
 */
@Injectable()
export class AcademicFinancialProjectionWriterService {
  private readonly logger = new Logger(
    AcademicFinancialProjectionWriterService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Plans (dry run) or applies every row not yet written at its current
   * version. A dry run executes the same writes in one transaction and rolls
   * it back, so the plan matches what applying would do.
   */
  async run(
    tenantId: string,
    options: { dryRun: boolean },
  ): Promise<WritePlanReport> {
    const report = this.emptyReport(tenantId, options.dryRun);
    const rows = await this.pendingRows(tenantId);
    report.rows = rows.length;
    if (options.dryRun) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            for (const row of rows) {
              this.record(report, await this.writeRow(tx, tenantId, row));
            }
            report.mirrorsUpdated = await this.syncMirrors(tx, tenantId);
            throw new Rollback(report);
          },
          { timeout: 600_000, maxWait: 30_000 },
        );
      } catch (error) {
        if (error instanceof Rollback) return error.report;
        throw error;
      }
      return report;
    }
    for (let start = 0; start < rows.length; start += APPLY_CHUNK) {
      const chunk = rows.slice(start, start + APPLY_CHUNK);
      await this.prisma.$transaction(
        async (tx) => {
          for (const row of chunk) {
            const result = await this.writeRow(tx, tenantId, row);
            await this.markWritten(tx, row, result);
            this.record(report, result);
          }
          report.mirrorsUpdated += await this.syncMirrors(tx, tenantId);
        },
        { timeout: 600_000, maxWait: 30_000 },
      );
    }
    this.logger.log({
      action: 'ACADEMIC_FINANCIAL_PROJECTION_WRITE_APPLIED',
      tenantId,
      rows: report.rows,
      outcomes: report.outcomes,
    });
    return report;
  }

  /**
   * Writes one row inside the caller's transaction and records its outcome on
   * the row. Used by event consumption when the write mode is enabled.
   */
  async writeAndMark(
    tx: Tx,
    tenantId: string,
    row: Row,
  ): Promise<RowWriteResult> {
    const result = await this.writeRow(tx, tenantId, row);
    await this.markWritten(tx, row, result);
    await this.syncMirrors(tx, tenantId);
    return result;
  }

  /** Rows never written, written at an older version, or retryable. */
  pendingRows(tenantId: string, academicStudentId?: string) {
    return this.prisma.academicFinancialProjection
      .findMany({
        where: {
          tenantId,
          ...(academicStudentId ? { academicStudentId } : {}),
        },
        orderBy: [{ sourceUpdatedAt: 'asc' }, { academicEnrollmentId: 'asc' }],
      })
      .then((rows) =>
        rows.filter(
          (row) =>
            row.writtenVersion === null ||
            row.writtenVersion < row.version ||
            row.writeOutcome === 'PENDING_INTAKE' ||
            row.writeOutcome === 'CONFLICT',
        ),
      );
  }

  async writeRow(tx: Tx, tenantId: string, row: Row): Promise<RowWriteResult> {
    const changes: WriteChange[] = [];
    const base = { academicEnrollmentId: row.academicEnrollmentId, changes };
    try {
      if (
        !row.academicYearLabel ||
        !row.academicYearStartDate ||
        !row.academicYearEndDate ||
        !row.academicYearStatus ||
        !YEAR_STATUSES.has(row.academicYearStatus) ||
        !row.courseLabel ||
        !row.studentFirstName ||
        !row.studentLastName
      ) {
        throw new RowConflict('SKIPPED', 'DESCRIPTORS_MISSING');
      }
      // The student comes first: a row that cannot reach an enrollment must
      // not create years or courses in BL (e.g. a closed test enrollment).
      const studentId = await this.resolveStudent(tx, tenantId, row, changes);
      const active = isActiveRow(row);
      if (studentId === null) {
        return active
          ? { ...base, outcome: 'PENDING_INTAKE', reasonCode: 'NEW_STUDENT' }
          : { ...base, outcome: 'SKIPPED', reasonCode: 'INACTIVE_NOT_LINKED' };
      }
      // Only an active enrollment may create its year and course; a closed one
      // can only update what BL already has.
      const { yearId, courseId } = await this.resolveStructure(
        tx,
        tenantId,
        row,
        changes,
        active,
      );
      await this.resolveEnrollment(
        tx,
        tenantId,
        row,
        { yearId, courseId, studentId },
        changes,
      );
      return { ...base, outcome: 'APPLIED' };
    } catch (error) {
      if (error instanceof RowConflict) {
        return {
          ...base,
          outcome: error.outcome,
          reasonCode: error.reasonCode,
        };
      }
      throw error;
    }
  }

  /**
   * Keeps `Student.courseId` and `Student.financialSetup` as the mirror of the
   * enrollment in the tenant's ACTIVE year (ADR-0026, the most recent when
   * several are active). Only rows that differ are touched.
   */
  async syncMirrors(tx: Tx, tenantId: string): Promise<number> {
    return tx.$executeRaw`
      UPDATE "students" s
      SET "courseId" = e."courseId",
          "financialSetup" = e."financialSetup",
          "updatedAt" = NOW()
      FROM "enrollments" e
      WHERE e."studentId" = s."id"
        AND e."tenantId" = ${tenantId}
        AND s."tenantId" = ${tenantId}
        AND e."academicYearId" = (
          SELECT y."id" FROM "academic_years" y
          WHERE y."tenantId" = ${tenantId} AND y."status" = 'ACTIVE'
          ORDER BY y."startDate" DESC, y."id" DESC
          LIMIT 1
        )
        AND (s."courseId" <> e."courseId"
          OR s."financialSetup" <> e."financialSetup")`;
  }

  /**
   * Year and course of an active row, created when missing. Used by the
   * intake right before it creates the student of that row.
   */
  async ensureYearAndCourse(
    tx: Tx,
    tenantId: string,
    row: Row,
  ): Promise<{ yearId: number; courseId: number }> {
    if (!isActiveRow(row)) {
      throw new Error('Only an active enrollment can create its course.');
    }
    return this.resolveStructure(tx, tenantId, row, [], true);
  }

  private async resolveStructure(
    tx: Tx,
    tenantId: string,
    row: Row,
    changes: WriteChange[],
    allowCreate: boolean,
  ): Promise<{ yearId: number; courseId: number }> {
    const yearId = await this.resolveYear(
      tx,
      tenantId,
      row,
      changes,
      allowCreate,
    );
    const courseId = await this.resolveCourse(
      tx,
      tenantId,
      row,
      yearId,
      changes,
      allowCreate,
    );
    return { yearId, courseId };
  }

  private async resolveYear(
    tx: Tx,
    tenantId: string,
    row: Row,
    changes: WriteChange[],
    allowCreate: boolean,
  ): Promise<number> {
    const label = row.academicYearLabel!;
    const status = row.academicYearStatus as AcademicYearStatus;
    const startDate = row.academicYearStartDate!;
    const endDate = row.academicYearEndDate!;
    let year = await tx.academicYear.findFirst({
      where: { tenantId, canonicalAcademicYearId: row.academicYearId },
    });
    if (!year) {
      const byLabel = await tx.academicYear.findFirst({
        where: { tenantId, label },
      });
      if (byLabel && byLabel.canonicalAcademicYearId) {
        throw new RowConflict('CONFLICT', 'YEAR_LABEL_LINKED_ELSEWHERE');
      }
      if (byLabel) {
        year = await tx.academicYear.update({
          where: { id: byLabel.id },
          data: { canonicalAcademicYearId: row.academicYearId },
        });
        changes.push('YEAR_LINKED');
      } else {
        if (!allowCreate) {
          throw new RowConflict('SKIPPED', 'INACTIVE_NOT_LINKED');
        }
        year = await tx.academicYear.create({
          data: {
            tenantId,
            label,
            startDate,
            endDate,
            status,
            canonicalAcademicYearId: row.academicYearId,
          },
        });
        changes.push('YEAR_CREATED');
        return year.id;
      }
    }
    // Descriptors of a shared record come only from its freshest row: an old
    // or closed enrollment must not revert a newer year, course or name.
    if (
      !(await this.isFreshest(tx, tenantId, row, {
        academicYearId: row.academicYearId,
      }))
    ) {
      return year.id;
    }
    const descriptorsDiffer =
      year.label !== label ||
      year.startDate.getTime() !== startDate.getTime() ||
      year.endDate.getTime() !== endDate.getTime();
    if (descriptorsDiffer) {
      const taken = await tx.academicYear.findFirst({
        where: { tenantId, label, id: { not: year.id } },
        select: { id: true },
      });
      if (taken) throw new RowConflict('CONFLICT', 'YEAR_LABEL_TAKEN');
      await tx.academicYear.update({
        where: { id: year.id },
        data: { label, startDate, endDate },
      });
      changes.push('YEAR_UPDATED');
    }
    if (year.status !== status) {
      await tx.academicYear.update({
        where: { id: year.id },
        data: { status },
      });
      changes.push('YEAR_STATUS_CHANGED');
    }
    return year.id;
  }

  private async resolveCourse(
    tx: Tx,
    tenantId: string,
    row: Row,
    yearId: number,
    changes: WriteChange[],
    allowCreate: boolean,
  ): Promise<number> {
    const label = row.courseLabel!;
    let course = await tx.course.findFirst({
      where: { tenantId, canonicalCourseId: row.academicCourseId },
    });
    if (!course && row.courseLegacyIntegrationId) {
      if (!UUID.test(row.courseLegacyIntegrationId)) {
        throw new RowConflict('CONFLICT', 'COURSE_LEGACY_ID_INVALID');
      }
      const legacy = await tx.course.findFirst({
        where: { tenantId, integrationId: row.courseLegacyIntegrationId },
      });
      if (!legacy) throw new RowConflict('CONFLICT', 'COURSE_LEGACY_NOT_FOUND');
      if (legacy.canonicalCourseId) {
        throw new RowConflict('CONFLICT', 'COURSE_LINKED_ELSEWHERE');
      }
      course = await tx.course.update({
        where: { id: legacy.id },
        data: { canonicalCourseId: row.academicCourseId },
      });
      changes.push('COURSE_LINKED');
    }
    if (!course) {
      const byName = await tx.course.findFirst({
        where: { tenantId, academicYearId: yearId, name: label },
      });
      if (byName && byName.canonicalCourseId) {
        throw new RowConflict('CONFLICT', 'COURSE_NAME_LINKED_ELSEWHERE');
      }
      if (byName) {
        course = await tx.course.update({
          where: { id: byName.id },
          data: { canonicalCourseId: row.academicCourseId },
        });
        changes.push('COURSE_LINKED');
      } else {
        if (!allowCreate) {
          throw new RowConflict('SKIPPED', 'INACTIVE_NOT_LINKED');
        }
        course = await tx.course.create({
          data: {
            tenantId,
            name: label,
            academicYearId: yearId,
            canonicalCourseId: row.academicCourseId,
          },
        });
        changes.push('COURSE_CREATED');
        return course.id;
      }
    }
    if (course.deletedAt) throw new RowConflict('CONFLICT', 'COURSE_DELETED');
    if (course.academicYearId !== yearId) {
      throw new RowConflict('CONFLICT', 'COURSE_YEAR_MISMATCH');
    }
    if (
      course.name !== label &&
      (await this.isFreshest(tx, tenantId, row, {
        academicCourseId: row.academicCourseId,
      }))
    ) {
      const taken = await tx.course.findFirst({
        where: {
          tenantId,
          academicYearId: yearId,
          name: label,
          id: { not: course.id },
        },
        select: { id: true },
      });
      if (taken) throw new RowConflict('CONFLICT', 'COURSE_NAME_TAKEN');
      await tx.course.update({
        where: { id: course.id },
        data: { name: label },
      });
      changes.push('COURSE_RENAMED');
    }
    return course.id;
  }

  /** The linked BL student, or null when the student must go to the intake. */
  private async resolveStudent(
    tx: Tx,
    tenantId: string,
    row: Row,
    changes: WriteChange[],
  ): Promise<number | null> {
    let student = await tx.student.findFirst({
      where: { tenantId, canonicalStudentId: row.academicStudentId },
    });
    if (!student && row.studentLegacyIntegrationId) {
      if (!UUID.test(row.studentLegacyIntegrationId)) {
        throw new RowConflict('CONFLICT', 'STUDENT_LEGACY_ID_INVALID');
      }
      const legacy = await tx.student.findFirst({
        where: { tenantId, integrationId: row.studentLegacyIntegrationId },
      });
      if (!legacy) {
        throw new RowConflict('CONFLICT', 'STUDENT_LEGACY_NOT_FOUND');
      }
      if (legacy.canonicalStudentId) {
        throw new RowConflict('CONFLICT', 'STUDENT_LINKED_ELSEWHERE');
      }
      student = await tx.student.update({
        where: { id: legacy.id },
        data: { canonicalStudentId: row.academicStudentId },
      });
      changes.push('STUDENT_LINKED');
    }
    if (!student) return null;
    if (student.deletedAt) throw new RowConflict('CONFLICT', 'STUDENT_DELETED');

    const firstName = row.studentFirstName!.trim();
    const lastName = row.studentLastName!.trim();
    if (
      (student.firstName !== firstName || student.lastName !== lastName) &&
      (await this.isFreshest(tx, tenantId, row, {
        academicStudentId: row.academicStudentId,
      }))
    ) {
      await tx.student.update({
        where: { id: student.id },
        data: { firstName, lastName, name: `${firstName} ${lastName}` },
      });
      changes.push('STUDENT_RENAMED');
    }
    if (
      row.studentNationalId &&
      normalizeNationalId(row.studentNationalId) !==
        normalizeNationalId(student.rut)
    ) {
      changes.push('STUDENT_NATIONAL_ID_DIFFERS');
    }
    return student.id;
  }

  private async resolveEnrollment(
    tx: Tx,
    tenantId: string,
    row: Row,
    target: { yearId: number; courseId: number; studentId: number },
    changes: WriteChange[],
  ): Promise<void> {
    const status: EnrollmentStatus = isActiveRow(row) ? 'ACTIVE' : 'INACTIVE';
    const linked = await tx.enrollment.findFirst({
      where: { tenantId, canonicalEnrollmentId: row.academicEnrollmentId },
    });
    if (linked) {
      if (
        linked.studentId !== target.studentId ||
        linked.academicYearId !== target.yearId
      ) {
        throw new RowConflict('CONFLICT', 'ENROLLMENT_IDENTITY_MISMATCH');
      }
      await this.updateEnrollment(tx, linked, target.courseId, status, changes);
      return;
    }
    const sameYear = await tx.enrollment.findFirst({
      where: {
        tenantId,
        studentId: target.studentId,
        academicYearId: target.yearId,
      },
    });
    if (status === 'INACTIVE') {
      // Never deactivate a BL enrollment that is not linked to this one.
      throw new RowConflict('SKIPPED', 'INACTIVE_NOT_LINKED');
    }
    if (!sameYear) {
      await tx.enrollment.create({
        data: {
          tenantId,
          studentId: target.studentId,
          courseId: target.courseId,
          academicYearId: target.yearId,
          status: 'ACTIVE',
          canonicalEnrollmentId: row.academicEnrollmentId,
        },
      });
      changes.push('ENROLLMENT_CREATED');
      return;
    }
    if (sameYear.canonicalEnrollmentId && sameYear.status === 'ACTIVE') {
      // BL keeps one enrollment per student and year. A course change in
      // Académico may arrive as the new enrollment before the old one's
      // closure: replace the link only if the shadow already shows the old
      // enrollment closed.
      const previous = await tx.academicFinancialProjection.findFirst({
        where: {
          tenantId,
          academicEnrollmentId: sameYear.canonicalEnrollmentId,
        },
        select: { operation: true, enrollmentStatus: true },
      });
      const previousClosed =
        previous &&
        (previous.operation === 'TOMBSTONE' ||
          previous.enrollmentStatus !== 'ACTIVE');
      if (!previousClosed) {
        throw new RowConflict('CONFLICT', 'ENROLLMENT_ALREADY_ACTIVE');
      }
    }
    await tx.enrollment.update({
      where: { id: sameYear.id },
      data: { canonicalEnrollmentId: row.academicEnrollmentId },
    });
    changes.push('ENROLLMENT_LINKED');
    await this.updateEnrollment(tx, sameYear, target.courseId, status, changes);
  }

  private async updateEnrollment(
    tx: Tx,
    enrollment: { id: number; courseId: number; status: EnrollmentStatus },
    courseId: number,
    status: EnrollmentStatus,
    changes: WriteChange[],
  ) {
    const data: Prisma.EnrollmentUpdateInput = {};
    if (enrollment.courseId !== courseId) {
      data.course = { connect: { id: courseId } };
      changes.push('ENROLLMENT_COURSE_CHANGED');
    }
    if (enrollment.status !== status) {
      data.status = status;
      changes.push(
        status === 'ACTIVE' ? 'ENROLLMENT_ACTIVATED' : 'ENROLLMENT_DEACTIVATED',
      );
    }
    if (Object.keys(data).length) {
      await tx.enrollment.update({ where: { id: enrollment.id }, data });
    }
  }

  /** Whether `row` is the latest shadow row (by source time) for `where`. */
  private async isFreshest(
    tx: Tx,
    tenantId: string,
    row: Row,
    where: Prisma.AcademicFinancialProjectionWhereInput,
  ): Promise<boolean> {
    const latest = await tx.academicFinancialProjection.findFirst({
      where: { tenantId, ...where },
      orderBy: [
        { sourceUpdatedAt: 'desc' },
        { version: 'desc' },
        { academicEnrollmentId: 'desc' },
      ],
      select: { id: true },
    });
    return !latest || latest.id === row.id;
  }

  private markWritten(tx: Tx, row: Row, result: RowWriteResult) {
    return tx.academicFinancialProjection.update({
      where: { id: row.id },
      data: {
        writeOutcome: result.outcome,
        writeReasonCode: result.reasonCode ?? null,
        writtenAt: new Date(),
        writtenVersion: row.version,
      },
    });
  }

  private emptyReport(tenantId: string, dryRun: boolean): WritePlanReport {
    return {
      tenantId,
      dryRun,
      rows: 0,
      outcomes: { APPLIED: 0, PENDING_INTAKE: 0, CONFLICT: 0, SKIPPED: 0 },
      changes: {},
      reasons: {},
      attention: [],
      mirrorsUpdated: 0,
    };
  }

  private record(report: WritePlanReport, result: RowWriteResult) {
    report.outcomes[result.outcome] += 1;
    for (const change of result.changes) {
      report.changes[change] = (report.changes[change] ?? 0) + 1;
    }
    if (result.reasonCode) {
      report.reasons[result.reasonCode] =
        (report.reasons[result.reasonCode] ?? 0) + 1;
    }
    if (result.outcome === 'CONFLICT' || result.outcome === 'SKIPPED') {
      report.attention.push({
        academicEnrollmentId: result.academicEnrollmentId,
        outcome: result.outcome,
        reasonCode: result.reasonCode ?? 'UNKNOWN',
      });
    }
  }
}
