import {
  Injectable,
  NotFoundException,
  ConflictException,
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

  async create(dto: CreateGuardianDto) {
    try {
      return await this.prisma.guardian.create({ data: dto });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Guardian with RUT ${dto.rut} already exists`);
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
    try {
      return await this.prisma.guardian.update({ where: { id }, data: dto });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Guardian with RUT ${dto.rut} already exists`);
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
      rut: g.rut,
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
