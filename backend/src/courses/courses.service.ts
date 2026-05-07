import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import {
  buildMultiSheetWorkbook,
  sanitizeExcelSheetName,
  type ExcelColumn,
} from '../common/excel/excel.helper';
import { Prisma } from '@prisma/client';
import { buildCourseSearchWhere } from '../common/search/flexible-search';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCourseDto) {
    return this.prisma.course.create({ data: dto });
  }

  async findAll(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CourseWhereInput = {
      deletedAt: null,
      ...(buildCourseSearchWhere(search) ?? {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { id: 'asc' },
        include: { _count: { select: { students: true } } },
        skip,
        take: limit,
      }),
      this.prisma.course.count({ where }),
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
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: {
        students: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: { guardian: true },
        },
      },
    });
    if (!course) throw new NotFoundException(`Course #${id} not found`);
    return course;
  }

  async update(id: number, dto: UpdateCourseDto) {
    await this.findOne(id);
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.course.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async exportToXlsx(): Promise<Buffer> {
    const columns: ExcelColumn[] = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'RUT', key: 'rut', width: 14 },
      { header: 'Nombre completo', key: 'nombre', width: 40 },
      { header: 'Apoderado', key: 'apoderado', width: 35 },
      { header: 'RUT apoderado', key: 'rutApoderado', width: 18 },
      { header: 'Email apoderado', key: 'emailApoderado', width: 32 },
      { header: 'Teléfono apoderado', key: 'telefonoApoderado', width: 18 },
    ];

    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: {
        students: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: { guardian: true },
        },
      },
    });

    const sheets = courses.map((c) => ({
      name: sanitizeExcelSheetName(c.name, `Curso ${c.id}`),
      columns,
      rows: c.students.map((s) => ({
        id: s.id,
        rut: s.rut,
        nombre: s.name,
        apoderado: s.guardian.name,
        rutApoderado: s.guardian.rut,
        emailApoderado: s.guardian.email ?? '',
        telefonoApoderado: s.guardian.phone ?? '',
      })),
    }));

    return buildMultiSheetWorkbook(sheets);
  }
}
