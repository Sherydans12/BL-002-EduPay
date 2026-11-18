import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AcademicFinancialProjection } from '@prisma/client';

import { formatRut } from '../../common/rut/rut.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AcademicFinancialProjectionWriterService,
  normalizeNationalId,
  type RowWriteResult,
} from './academic-financial-projection-writer.service';

type Row = AcademicFinancialProjection;

export type AcademicIntakeItem = {
  academicStudentId: string;
  firstName: string;
  lastName: string;
  nationalIdType: string | null;
  nationalId: string | null;
  courseLabel: string;
  academicYearLabel: string;
  academicYearStatus: string;
  /** A BL student with the same RUN not yet linked; the operator decides. */
  possibleMatch: { studentId: number; name: string; courseName: string } | null;
};

function isActive(row: Row) {
  return row.operation !== 'TOMBSTONE' && row.enrollmentStatus === 'ACTIVE';
}

/** The active enrollment of the most recent year, if any. */
function currentRow(rows: Row[]): Row | undefined {
  return rows
    .filter(isActive)
    .sort(
      (a, b) =>
        (b.academicYearStartDate?.getTime() ?? 0) -
        (a.academicYearStartDate?.getTime() ?? 0),
    )[0];
}

/**
 * Students that arrived from Académico without a BL record (ADR-0027). BL
 * owns guardians, so a student is incorporated only when an operator assigns
 * one, or confirms an existing BL student with the same RUN.
 */
@Injectable()
export class AcademicFinancialProjectionIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: AcademicFinancialProjectionWriterService,
  ) {}

  async list(tenantId: string): Promise<AcademicIntakeItem[]> {
    const rows = await this.prisma.academicFinancialProjection.findMany({
      where: { tenantId, writeOutcome: 'PENDING_INTAKE' },
    });
    const byStudent = new Map<string, Row[]>();
    for (const row of rows) {
      byStudent.set(row.academicStudentId, [
        ...(byStudent.get(row.academicStudentId) ?? []),
        row,
      ]);
    }
    const items: AcademicIntakeItem[] = [];
    for (const [academicStudentId, studentRows] of byStudent) {
      const current = currentRow(studentRows);
      if (!current) continue;
      items.push({
        academicStudentId,
        firstName: current.studentFirstName ?? '',
        lastName: current.studentLastName ?? '',
        nationalIdType: current.studentNationalIdType,
        nationalId: current.studentNationalId,
        courseLabel: current.courseLabel ?? '',
        academicYearLabel: current.academicYearLabel ?? '',
        academicYearStatus: current.academicYearStatus ?? '',
        possibleMatch: await this.possibleMatch(tenantId, current),
      });
    }
    return items.sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'es-CL') ||
        a.firstName.localeCompare(b.firstName, 'es-CL'),
    );
  }

  /**
   * Creates the BL student with the given guardian, or links the confirmed
   * existing student, then writes all of the student's enrollments.
   */
  async accept(
    tenantId: string,
    academicStudentId: string,
    input: { guardianId?: number; existingStudentId?: number },
  ): Promise<{ studentId: number; enrollments: RowWriteResult[] }> {
    const hasGuardian = input.guardianId !== undefined;
    const hasExisting = input.existingStudentId !== undefined;
    if (hasGuardian === hasExisting) {
      throw new BadRequestException(
        'Indica un apoderado para crear la ficha, o el alumno existente que corresponde.',
      );
    }
    const rows = await this.prisma.academicFinancialProjection.findMany({
      where: { tenantId, academicStudentId },
    });
    if (!rows.some((row) => row.writeOutcome === 'PENDING_INTAKE')) {
      throw new NotFoundException(
        'El alumno no está pendiente de incorporación.',
      );
    }
    const current = currentRow(rows);
    if (!current) {
      throw new ConflictException(
        'El alumno no tiene una matrícula activa en Académico.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        let studentId: number;
        if (hasExisting) {
          const existing = await tx.student.findFirst({
            where: { id: input.existingStudentId, tenantId, deletedAt: null },
          });
          if (!existing) throw new NotFoundException('Alumno no encontrado.');
          if (existing.canonicalStudentId) {
            throw new ConflictException(
              'Ese alumno ya está vinculado a otra ficha de Académico.',
            );
          }
          if (
            current.studentNationalId &&
            normalizeNationalId(current.studentNationalId) !==
              normalizeNationalId(existing.rut)
          ) {
            throw new ConflictException(
              'El RUN del alumno existente no coincide con el de Académico.',
            );
          }
          await tx.student.update({
            where: { id: existing.id },
            data: { canonicalStudentId: academicStudentId },
          });
          studentId = existing.id;
        } else {
          if (!current.studentNationalId || !current.studentNationalIdType) {
            throw new UnprocessableEntityException(
              'El alumno no tiene RUN ni IPE en Académico; regístralo allí primero.',
            );
          }
          const guardian = await tx.guardian.findFirst({
            where: { id: input.guardianId, tenantId, deletedAt: null },
            select: { id: true },
          });
          if (!guardian)
            throw new NotFoundException('Apoderado no encontrado.');
          const rut =
            current.studentNationalIdType === 'RUN'
              ? formatRut(current.studentNationalId)
              : current.studentNationalId;
          const taken = await tx.student.findFirst({
            where: { tenantId, rut },
            select: { id: true },
          });
          if (taken) {
            throw new ConflictException(
              'Ya existe un alumno con ese RUN en Pagos: vincúlalo en lugar de crear otro.',
            );
          }
          // The year and course of the current enrollment exist once written.
          await this.writer.writeRow(tx, tenantId, current);
          const course = await tx.course.findFirst({
            where: { tenantId, canonicalCourseId: current.academicCourseId },
            select: { id: true },
          });
          if (!course) {
            throw new ConflictException(
              'No se pudo preparar el curso del alumno; revisa el plan de escritura.',
            );
          }
          const firstName = (current.studentFirstName ?? '').trim();
          const lastName = (current.studentLastName ?? '').trim();
          const created = await tx.student.create({
            data: {
              tenantId,
              rut,
              nationalIdType: current.studentNationalIdType,
              firstName,
              lastName,
              name: `${firstName} ${lastName}`,
              courseId: course.id,
              guardianId: guardian.id,
              canonicalStudentId: academicStudentId,
            },
            select: { id: true },
          });
          studentId = created.id;
        }

        const enrollments: RowWriteResult[] = [];
        for (const row of rows) {
          enrollments.push(await this.writer.writeAndMark(tx, tenantId, row));
        }
        return { studentId, enrollments };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  private async possibleMatch(tenantId: string, row: Row) {
    if (row.studentNationalIdType !== 'RUN' || !row.studentNationalId) {
      return null;
    }
    const match = await this.prisma.student.findFirst({
      where: {
        tenantId,
        canonicalStudentId: null,
        deletedAt: null,
        rutNormalized: normalizeNationalId(row.studentNationalId),
      },
      select: { id: true, name: true, course: { select: { name: true } } },
    });
    return match
      ? { studentId: match.id, name: match.name, courseName: match.course.name }
      : null;
  }
}
