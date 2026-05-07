import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { Prisma } from '@prisma/client';

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

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = { deletedAt: null };

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
}
