import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { buildWorkbook } from '../common/excel/excel.helper';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCourseDto) {
    return this.prisma.course.create({ data: dto });
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = { deletedAt: null };

    const [data, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { name: 'asc' },
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
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { students: { include: { guardian: true } } },
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
    const data = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    });

    const rows = data.map((c) => ({
      id: c.id,
      nombre: c.name,
      alumnos: c._count.students,
    }));

    return buildWorkbook('Cursos', [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Nombre', key: 'nombre', width: 40 },
      { header: 'N° Alumnos', key: 'alumnos', width: 14 },
    ], rows);
  }
}
