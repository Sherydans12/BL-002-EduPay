import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentConceptDto } from './dto/create-payment-concept.dto';
import { UpdatePaymentConceptDto } from './dto/update-payment-concept.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentConceptsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentConceptDto) {
    try {
      return await this.prisma.paymentConcept.create({ data: dto });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe un concepto con el nombre "${dto.name}"`,
        );
      }
      throw err;
    }
  }

  findAll() {
    return this.prisma.paymentConcept.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const concept = await this.prisma.paymentConcept.findFirst({
      where: { id, deletedAt: null },
    });
    if (!concept) throw new NotFoundException(`Concepto #${id} no encontrado`);
    return concept;
  }

  async update(id: number, dto: UpdatePaymentConceptDto) {
    await this.findOne(id);
    try {
      return await this.prisma.paymentConcept.update({
        where: { id },
        data: dto,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe un concepto con el nombre "${dto.name}"`,
        );
      }
      throw err;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.paymentConcept.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
