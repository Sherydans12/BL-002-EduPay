import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { buildWorkbook } from '../common/excel/excel.helper';
import { Prisma, StudentStatus } from '@prisma/client';
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

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { id: 'asc' },
        include: {
          students: {
            where: { status: 'ACTIVE', deletedAt: null },
            include: {
              charges: { where: { deletedAt: null } },
            },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    const data = courses.map(({ students, ...course }) => {
      let expectedRevenue = 0;
      let collectedRevenue = 0;
      let overdueDebt = 0;

      for (const student of students) {
        for (const charge of student.charges) {
          expectedRevenue += charge.amount;
          collectedRevenue += charge.paidAmount;
          if (charge.status === 'OVERDUE' || (charge.dueDate && new Date(charge.dueDate) < new Date() && charge.paidAmount < charge.amount)) {
            overdueDebt += Math.max(0, charge.amount - charge.paidAmount);
          }
        }
      }

      const collectionRate =
        expectedRevenue > 0
          ? Math.round((collectedRevenue / expectedRevenue) * 100)
          : 100;

      return {
        ...course,
        activeStudents: students.length,
        expectedRevenue,
        collectedRevenue,
        overdueDebt,
        collectionRate,
      };
    });

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
          include: {
            guardian: {
              include: {
                students: {
                  where: { deletedAt: null },
                  select: { id: true, name: true, courseId: true },
                },
              },
            },
            charges: {
              where: { deletedAt: null },
              select: {
                id: true,
                amount: true,
                paidAmount: true,
                dueDate: true,
                status: true,
              },
            },
          },
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
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: {
        students: {
          where: { deletedAt: null, status: StudentStatus.ACTIVE },
          select: { id: true },
        },
      },
    });

    const rows = courses.map((c) => ({
      id: c.id,
      nombre: c.name,
      nivel: '—',
      matriculaActual: c.students.length,
    }));

    return buildWorkbook(
      'Cursos',
      [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Nombre del Curso', key: 'nombre', width: 30 },
        { header: 'Nivel', key: 'nivel', width: 16 },
        { header: 'Matrícula Actual', key: 'matriculaActual', width: 18 },
      ],
      rows,
    );
  }
}
