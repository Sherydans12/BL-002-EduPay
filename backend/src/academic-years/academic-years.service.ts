import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type Client = Prisma.TransactionClient | PrismaService;

export const NO_ACTIVE_ACADEMIC_YEAR =
  'No hay un año académico activo para este colegio.';

/**
 * Academic years scope courses, enrollments and billing (ADR-0025). Académico
 * owns the years; BL keeps a local record. Plans default to the ACTIVE year.
 */
@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.academicYear.findMany({
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        label: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });
  }

  /**
   * The tenant's ACTIVE year; the most recent one when several are active.
   * Always pass the tenant of the record being changed: a request without a
   * tenant context (platform session) must never pick another school's year.
   */
  async activeYear(tenantId: string, client: Client = this.prisma) {
    const year = await client.academicYear.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      select: { id: true, label: true },
    });
    if (!year) throw new ConflictException(NO_ACTIVE_ACADEMIC_YEAR);
    return year;
  }

  /**
   * The student's enrollment for the requested year, or for the ACTIVE year
   * of the student's own tenant when none is requested.
   */
  async enrollmentFor(
    client: Client,
    studentId: number,
    academicYearId?: number,
  ) {
    const student = await client.student.findFirst({
      where: { id: studentId },
      select: { tenantId: true },
    });
    if (!student) {
      throw new NotFoundException(`Student #${studentId} not found`);
    }
    const yearId =
      academicYearId ?? (await this.activeYear(student.tenantId, client)).id;
    const enrollment = await client.enrollment.findFirst({
      where: { studentId, academicYearId: yearId, tenantId: student.tenantId },
      select: {
        id: true,
        tenantId: true,
        academicYearId: true,
        courseId: true,
        financialSetup: true,
        status: true,
      },
    });
    if (!enrollment) {
      throw new NotFoundException(
        `El alumno #${studentId} no tiene matrícula en el año académico indicado.`,
      );
    }
    return enrollment;
  }
}
