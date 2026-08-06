import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { GuardianEmailUpdateSource, Prisma } from '@prisma/client';
import { buildWorkbook } from '../common/excel/excel.helper';
import { buildGuardianSearchWhere } from '../common/search/flexible-search';
import { GuardianEmailWebhooksService } from '../guardian-email-webhooks/guardian-email-webhooks.service';

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guardianEmailWebhooks: GuardianEmailWebhooksService,
  ) {}

  private async validateStudentIds(
    studentIds: number[],
    guardianId?: number,
  ): Promise<void> {
    const found = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: { id: true, name: true, guardianId: true },
    });
    if (found.length !== studentIds.length) {
      const foundSet = new Set(found.map((s) => s.id));
      const missing = studentIds.filter((id) => !foundSet.has(id));
      throw new NotFoundException(`Students not found: ${missing.join(', ')}`);
    }

    if (guardianId !== undefined) {
      const currentStudents = await this.prisma.student.findMany({
        where: { guardianId, deletedAt: null },
        select: { id: true, name: true },
      });
      const requestedIds = new Set(studentIds);
      const removedStudents = currentStudents.filter(
        (student) => !requestedIds.has(student.id),
      );

      if (removedStudents.length > 0) {
        const names = removedStudents.map((student) => student.name).join(', ');
        throw new BadRequestException(
          `No se puede quitar a ${names} porque cada alumno debe tener un apoderado. Cambie su apoderado desde el módulo de Alumnos.`,
        );
      }
    }

    const conflicts = found.filter((s) =>
      guardianId === undefined
        ? s.guardianId != null
        : s.guardianId !== guardianId,
    );
    if (conflicts.length > 0) {
      const names = conflicts.map((s) => s.name).join(', ');
      throw new BadRequestException(
        `El/los alumno(s) ${names} ya están asignados a otro apoderado. Debe desvincularlos primero.`,
      );
    }
  }

  private buildStudentRelation(
    studentIds: number[] | undefined,
  ): Prisma.GuardianUpdateInput['students'] | undefined {
    if (!studentIds || studentIds.length === 0) return undefined;
    return { set: studentIds.map((id) => ({ id })) };
  }

  async create(dto: CreateGuardianDto) {
    const { studentIds, ...fields } = dto;
    const normalizedStudentIds = studentIds?.length
      ? [...new Set(studentIds)]
      : undefined;
    if (normalizedStudentIds !== undefined) {
      await this.validateStudentIds(normalizedStudentIds);
    }
    const studentsRelation = this.buildStudentRelation(normalizedStudentIds);
    const data: Prisma.GuardianCreateInput = {
      ...fields,
      ...(studentsRelation ? { students: studentsRelation } : {}),
    };
    try {
      return await this.prisma.guardian.create({
        data,
        include: {
          students: {
            where: { deletedAt: null },
            include: { course: true },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Guardian with RUT ${dto.rut} already exists`,
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2014' &&
        normalizedStudentIds !== undefined
      ) {
        throw new BadRequestException(
          'No se puede desasociar un alumno sin asignarlo a otro apoderado',
        );
      }
      throw error;
    }
  }

  async findAll(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.GuardianWhereInput = {
      deletedAt: null,
      ...(buildGuardianSearchWhere(search) ?? {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.guardian.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          students: {
            where: { deletedAt: null },
            include: {
              course: true,
              charges: {
                where: { status: 'OVERDUE', deletedAt: null },
                select: { amount: true, paidAmount: true },
              },
            },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.guardian.count({ where }),
    ]);

    const dataWithFamilyDebt = data.map(({ students, ...guardian }) => {
      const optimizedStudents = (students ?? []).map(
        ({ charges, course, ...student }) => {
          const overdueDebt = (charges ?? []).reduce(
            (total, charge) =>
              total + Math.max(0, charge.amount - charge.paidAmount),
            0,
          );

          return {
            id: String(student.id),
            name: student.name,
            course: course ? { name: course?.name ?? null } : null,
            overdueDebt,
          };
        },
      );
      const familyOverdueDebt = optimizedStudents.reduce(
        (total, student) => total + student.overdueDebt,
        0,
      );

      return {
        ...guardian,
        students: optimizedStudents,
        familyOverdueDebt,
      };
    });

    return {
      data: dataWithFamilyDebt,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id, deletedAt: null },
      include: {
        students: {
          where: { deletedAt: null },
          include: { course: true },
        },
      },
    });
    if (!guardian) throw new NotFoundException(`Guardian #${id} not found`);
    return guardian;
  }

  async update(id: number, dto: UpdateGuardianDto, actorId: string) {
    await this.findOne(id);
    const { studentIds, ...fields } = dto;
    const normalizedStudentIds = studentIds?.length
      ? [...new Set(studentIds)]
      : studentIds;
    if (normalizedStudentIds !== undefined) {
      await this.validateStudentIds(normalizedStudentIds, id);
    }
    const studentsRelation = this.buildStudentRelation(normalizedStudentIds);
    const data: Prisma.GuardianUpdateInput = {
      ...fields,
      ...(studentsRelation ? { students: studentsRelation } : {}),
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.guardian.findFirst({
          where: { id, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            rut: true,
            email: true,
          },
        });
        if (!current) {
          throw new NotFoundException(`Guardian #${id} not found`);
        }

        const updated = await tx.guardian.update({
          where: { id },
          data,
          include: {
            students: {
              where: { deletedAt: null },
              include: { course: true },
            },
          },
        });

        if (dto.email !== undefined && updated.email !== current.email) {
          await this.guardianEmailWebhooks.enqueue(tx, {
            tenantId: updated.tenantId,
            guardianId: updated.id,
            guardianRut: updated.rut,
            email: updated.email,
            previousEmail: current.email,
            guardianUpdatedAt: updated.updatedAt,
            source: GuardianEmailUpdateSource.EDUPAY_ADMIN,
            actorId,
          });
        }

        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Guardian with RUT ${dto.rut} already exists`,
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2014' || error.code === 'P2003') &&
        normalizedStudentIds !== undefined
      ) {
        throw new BadRequestException(
          'No se puede desasociar un alumno sin asignarlo a otro apoderado',
        );
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.guardian.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async exportToXlsx(): Promise<Buffer> {
    const data = await this.prisma.guardian.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        students: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          select: { name: true },
        },
      },
    });

    const rows = data.map((g) => {
      const nombresAlumnos = g.students.map((s) => s.name);
      return {
        id: g.id,
        rut: g.rut ?? '',
        nombre: g.name,
        email: g.email ?? '',
        telefono: g.phone ?? '',
        alumnosAsociados: nombresAlumnos.join(', '),
        cantidadAlumnos: nombresAlumnos.length,
      };
    });

    return buildWorkbook(
      'Apoderados',
      [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'RUT', key: 'rut', width: 16 },
        { header: 'Nombre', key: 'nombre', width: 35 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Teléfono', key: 'telefono', width: 18 },
        { header: 'Alumnos Asociados', key: 'alumnosAsociados', width: 45 },
        { header: 'Cantidad de Alumnos', key: 'cantidadAlumnos', width: 18 },
      ],
      rows,
    );
  }
}
