import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ReviewStudentNameDto } from './dto/review-student-name.dto';
import { validateNameTokenPreservation } from './student-name-validation.util';
import { Prisma, StudentStatus } from '@prisma/client';
import { buildWorkbook } from '../common/excel/excel.helper';
import { buildStudentSearchWhere } from '../common/search/flexible-search';

const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  GRADUATED: 'Egresado',
};

const RELATED_RECORD_NOT_FOUND =
  'Registro relacionado no encontrado o pertenece a otro colegio';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStudentRelationsExist(
    courseId?: number,
    guardianId?: number,
  ): Promise<void> {
    const [course, guardian] = await Promise.all([
      courseId
        ? this.prisma.course.findFirst({
            where: { id: courseId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: null }),
      guardianId
        ? this.prisma.guardian.findFirst({
            where: { id: guardianId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: null }),
    ]);

    if (!course || !guardian) {
      throw new NotFoundException(RELATED_RECORD_NOT_FOUND);
    }
  }

  async create(dto: CreateStudentDto) {
    await this.assertStudentRelationsExist(dto.courseId, dto.guardianId);
    const name = this.legacyName(dto.firstName, dto.lastName);

    try {
      const student = await this.prisma.student.create({
        data: {
          rut: dto.rut,
          firstName: dto.firstName,
          lastName: dto.lastName,
          courseId: dto.courseId,
          guardianId: dto.guardianId,
          status: dto.status,
          name,
        },
        include: { course: true, guardian: true },
      });
      return { ...student, integrationReady: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Student with RUT ${dto.rut} already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(
    courseId?: number,
    page = 1,
    limit = 50,
    search?: string,
    status?: StudentStatus,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      ...(courseId ? { courseId } : {}),
      ...(status ? { status } : {}),
      ...(buildStudentSearchWhere(search) ?? {}),
    };

    const [students, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          course: true,
          guardian: true,
          charges: {
            where: { status: 'OVERDUE', deletedAt: null },
            select: { amount: true, paidAmount: true },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.student.count({ where }),
    ]);

    const dataWithDebt = students.map(({ charges, ...student }) => {
      const overdueDebt = charges.reduce(
        (sum, charge) => sum + Math.max(0, charge.amount - charge.paidAmount),
        0,
      );
      return {
        ...student,
        overdueDebt,
        integrationReady: this.isIntegrationReady(student),
      };
    });

    return {
      data: dataWithDebt,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        course: true,
        guardian: true,
        payments: {
          where: {
            deletedAt: null,
            paymentGroup: { is: { deletedAt: null } },
          },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });
    if (!student) throw new NotFoundException(`Student #${id} not found`);
    return {
      ...student,
      integrationReady: this.isIntegrationReady(student),
    };
  }

  async update(id: number, dto: UpdateStudentDto) {
    const current = await this.findOne(id);
    await this.assertStudentRelationsExist(dto.courseId, dto.guardianId);
    const { name: requestedLegacyName, firstName, lastName, ...updates } = dto;
    const nextFirstName = firstName ?? current.firstName;
    const nextLastName = lastName ?? current.lastName;
    const derivedLegacyName =
      nextFirstName && nextLastName
        ? this.legacyName(nextFirstName, nextLastName)
        : requestedLegacyName?.trim();

    try {
      const student = await this.prisma.student.update({
        where: { id },
        data: {
          ...updates,
          ...(firstName !== undefined ? { firstName } : {}),
          ...(lastName !== undefined ? { lastName } : {}),
          ...(derivedLegacyName ? { name: derivedLegacyName } : {}),
        },
        include: { course: true, guardian: true },
      });
      return {
        ...student,
        integrationReady: this.isIntegrationReady(student),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Student with RUT ${dto.rut} already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async exportToXlsx(courseId?: number): Promise<Buffer> {
    const where: Prisma.StudentWhereInput = { deletedAt: null };
    if (courseId) where.courseId = courseId;

    const data = await this.prisma.student.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { course: true, guardian: true },
    });

    const rows = data.map((s) => ({
      id: s.id,
      rut: s.rut,
      nombre: s.name,
      curso: s.course.name,
      estado: STUDENT_STATUS_LABELS[s.status],
      apoderado: s.guardian?.name ?? 'Sin Apoderado',
    }));

    return buildWorkbook(
      'Alumnos',
      [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'RUT', key: 'rut', width: 16 },
        { header: 'Nombre', key: 'nombre', width: 35 },
        { header: 'Curso', key: 'curso', width: 22 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Apoderado', key: 'apoderado', width: 35 },
      ],
      rows,
    );
  }

  async getNameReviewQueue(tenantId?: string) {
    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      ...(tenantId ? { tenantId } : {}),
      OR: [
        { firstName: null },
        { firstName: '' },
        { lastName: null },
        { lastName: '' },
      ],
    };

    const students = await this.prisma.student.findMany({
      where,
      orderBy: [{ courseId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        integrationId: true,
        name: true,
        firstName: true,
        lastName: true,
        status: true,
        courseId: true,
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const items = students.map((s) => ({
      id: s.id,
      integrationId: s.integrationId,
      name: s.name,
      firstName: s.firstName ?? '',
      lastName: s.lastName ?? '',
      status: s.status,
      course: s.course,
      reason: 'STUDENT_STRUCTURED_NAME_MISSING',
      tokenCount: s.name.split(/\s+/).filter(Boolean).length,
    }));

    return {
      data: items,
      meta: {
        pendingCount: items.length,
      },
    };
  }

  async reviewStudentName(
    id: number,
    dto: ReviewStudentNameDto,
    actor?: { id?: number; email?: string; role?: string },
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        integrationId: true,
        name: true,
        firstName: true,
        lastName: true,
        status: true,
        courseId: true,
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student #${id} not found`);
    }

    const validation = validateNameTokenPreservation(
      student.name,
      dto.firstName,
      dto.lastName,
    );

    if (!validation.valid) {
      throw new BadRequestException(
        validation.reason ||
          'Los nombres y apellidos deben conservar exactamente las palabras del nombre original.',
      );
    }

    const cleanFirstName = dto.firstName.trim().replace(/\s+/g, ' ');
    const cleanLastName = dto.lastName.trim().replace(/\s+/g, ' ');

    const previousClassification =
      !student.firstName?.trim() || !student.lastName?.trim()
        ? 'STUDENT_STRUCTURED_NAME_MISSING'
        : 'STRUCTURED';

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        firstName: cleanFirstName,
        lastName: cleanLastName,
      },
      select: {
        id: true,
        integrationId: true,
        name: true,
        firstName: true,
        lastName: true,
        status: true,
        courseId: true,
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    this.logger.log(
      `[STUDENT_NAME_REVIEW_AUDIT] studentId=${student.id} integrationId=${student.integrationId} actorId=${actor?.id ?? 'system'} actorRole=${actor?.role ?? 'admin'} previousClassification=${previousClassification} newClassification=STRUCTURED timestamp=${new Date().toISOString()}`,
    );

    return {
      data: {
        ...updated,
        integrationReady: true,
      },
    };
  }

  private readonly logger = new Logger('StudentNameReview');

  private legacyName(firstName: string, lastName: string): string {
    return `${firstName.trim()} ${lastName.trim()}`;
  }

  private isIntegrationReady(student: {
    firstName: string | null;
    lastName: string | null;
  }): boolean {
    return Boolean(student.firstName?.trim() && student.lastName?.trim());
  }
}
