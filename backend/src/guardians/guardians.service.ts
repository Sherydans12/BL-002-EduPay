import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { Prisma } from '@prisma/client';
import { buildWorkbook } from '../common/excel/excel.helper';
import { buildGuardianSearchWhere } from '../common/search/flexible-search';

@Injectable()
export class GuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateStudentIds(
    studentIds: number[],
    guardianId?: number,
  ): Promise<void> {
    if (studentIds.length === 0) return;
    const found = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: { id: true, name: true, guardianId: true },
    });
    if (found.length !== studentIds.length) {
      const foundSet = new Set(found.map((s) => s.id));
      const missing = studentIds.filter((id) => !foundSet.has(id));
      throw new NotFoundException(`Students not found: ${missing.join(', ')}`);
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
    if (studentIds === undefined) return undefined;
    return { set: studentIds.map((id) => ({ id })) };
  }

  async create(dto: CreateGuardianDto) {
    const { studentIds, ...fields } = dto;
    if (studentIds !== undefined) {
      await this.validateStudentIds(studentIds);
    }
    const studentsRelation = this.buildStudentRelation(studentIds);
    const data: Prisma.GuardianCreateInput = {
      ...fields,
      ...(studentsRelation ? { students: studentsRelation } : {}),
    };
    try {
      return await this.prisma.guardian.create({
        data,
        include: { students: { include: { course: true } } },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Guardian with RUT ${dto.rut} already exists`);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2014' &&
        studentIds !== undefined
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
        include: { _count: { select: { students: true } } },
        skip,
        take: limit,
      }),
      this.prisma.guardian.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id },
      include: {
        students: { include: { course: true } },
      },
    });
    if (!guardian) throw new NotFoundException(`Guardian #${id} not found`);
    return guardian;
  }

  async update(id: number, dto: UpdateGuardianDto) {
    await this.findOne(id);
    const { studentIds, ...fields } = dto;
    if (studentIds !== undefined) {
      await this.validateStudentIds(studentIds, id);
    }
    const studentsRelation = this.buildStudentRelation(studentIds);
    const data: Prisma.GuardianUpdateInput = {
      ...fields,
      ...(studentsRelation ? { students: studentsRelation } : {}),
    };
    try {
      return await this.prisma.guardian.update({
        where: { id },
        data,
        include: { students: { include: { course: true } } },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Guardian with RUT ${dto.rut} already exists`);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2014' || error.code === 'P2003') &&
        studentIds !== undefined
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
      include: { _count: { select: { students: true } } },
    });

    const rows = data.map((g) => ({
      id: g.id,
      rut: g.rut ?? '',
      nombre: g.name,
      email: g.email ?? '',
      telefono: g.phone ?? '',
      alumnos: g._count.students,
    }));

    return buildWorkbook('Apoderados', [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'RUT', key: 'rut', width: 16 },
      { header: 'Nombre', key: 'nombre', width: 35 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 18 },
      { header: 'N° Alumnos', key: 'alumnos', width: 14 },
    ], rows);
  }
}
