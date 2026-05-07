import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    try {
      return await this.prisma.student.create({
        data: dto,
        include: { course: true, guardian: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Student with RUT ${dto.rut} already exists`);
      }
      throw error;
    }
  }

  async findAll(courseId?: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where: Prisma.StudentWhereInput = { deletedAt: null };
    if (courseId) where.courseId = courseId;

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { course: true, guardian: true },
        skip,
        take: limit,
      }),
      this.prisma.student.count({ where }),
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
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        course: true,
        guardian: true,
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!student) throw new NotFoundException(`Student #${id} not found`);
    return student;
  }

  async update(id: number, dto: UpdateStudentDto) {
    await this.findOne(id);
    try {
      return await this.prisma.student.update({
        where: { id },
        data: dto,
        include: { course: true, guardian: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Student with RUT ${dto.rut} already exists`);
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
}
