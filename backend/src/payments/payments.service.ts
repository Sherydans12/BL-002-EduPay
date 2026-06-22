import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePaymentBatchDto } from './dto/create-payment-batch.dto';
import { FilterPaymentsDto } from './dto/filter-payments.dto';
import { ChargeStatus, Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { buildPaymentGroupsWorkbookBuffer } from '../common/excel/payment-groups-sheet.export';

const paymentLineInclude = {
  student: { include: { course: true, guardian: true } },
  concept: true,
} as const;

const paymentGroupInclude = {
  payments: {
    where: { deletedAt: null },
    include: paymentLineInclude,
    orderBy: { id: 'asc' as const },
  },
} as const;

@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyPayments();
  }

  /** Migra pagos sin grupo a un PaymentGroup 1:1 (idempotente). */
  async migrateLegacyPayments(): Promise<void> {
    const orphans = await this.prisma.payment.findMany({
      where: { paymentGroupId: null, deletedAt: null },
      orderBy: { id: 'asc' },
    });
    if (orphans.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const p of orphans) {
        const group = await tx.paymentGroup.create({
          data: {
            totalAmount: p.amount,
            method: p.method,
            paymentDate: p.paymentDate,
            boletaFileUrl: p.boletaFileUrl,
            boletaNumber: p.boletaNumber,
            notes: p.notes,
          },
        });
        await tx.payment.update({
          where: { id: p.id },
          data: { paymentGroupId: group.id },
        });
      }
    });
  }

  async create(dto: CreatePaymentDto, boletaFileUrl?: string) {
    const paymentDate = new Date(dto.paymentDate);
    const resolvedBoletaUrl = boletaFileUrl ?? null;

    const payment = await this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.create({
        data: {
          totalAmount: dto.amount,
          method: dto.method,
          paymentDate,
          boletaFileUrl: resolvedBoletaUrl,
          boletaNumber: dto.boletaNumber ?? null,
          notes: dto.notes ?? null,
        },
      });

      return tx.payment.create({
        data: {
          amount: dto.amount,
          method: dto.method,
          paymentDate,
          studentId: dto.studentId,
          conceptId: dto.conceptId || null,
          paymentGroupId: group.id,
          payerName: dto.payerName || null,
          payerRut: dto.payerRut || null,
          referenceCode: dto.referenceCode || null,
          notes: null,
          boletaNumber: null,
          boletaFileUrl: null,
        },
        include: paymentLineInclude,
      });
    });

    const guardianEmail = payment.student.guardian.email?.trim();
    if (guardianEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
      await this.mailService.sendPaymentConfirmation({
        to: guardianEmail,
        studentName: payment.student.name,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        boletaFileUrl: resolvedBoletaUrl ?? undefined,
      });
    }

    return payment;
  }

  async createBatch(dto: CreatePaymentBatchDto, boletaFileUrl?: string) {
    const studentIds = [...new Set(dto.allocations.map((a) => a.studentId))];
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      select: { id: true },
    });

    if (students.length !== studentIds.length) {
      const found = new Set(students.map((s) => s.id));
      const missing = studentIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Alumno(s) no encontrado(s): ${missing.join(', ')}`,
      );
    }

    const paymentDate = new Date(dto.paymentDate);
    const resolvedBoletaUrl = boletaFileUrl ?? dto.boletaFileUrl ?? null;

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.create({
        data: {
          totalAmount: dto.totalAmount,
          method: dto.method,
          paymentDate,
          boletaFileUrl: resolvedBoletaUrl,
          boletaNumber: dto.boletaNumber ?? null,
          notes: dto.notes ?? null,
        },
      });

      for (const allocation of dto.allocations) {
        await tx.payment.create({
          data: {
            amount: allocation.amount,
            method: dto.method,
            paymentDate,
            studentId: allocation.studentId,
            conceptId: allocation.conceptId,
            chargeId: allocation.chargeId ?? null,
            paymentGroupId: group.id,
            boletaFileUrl: null,
            boletaNumber: null,
            notes: null,
          },
        });

        if (allocation.chargeId) {
          const charge = await tx.charge.findFirst({
            where: {
              id: allocation.chargeId,
              studentId: allocation.studentId,
              deletedAt: null,
            },
            select: { id: true, amount: true, paidAmount: true },
          });

          if (!charge) {
            throw new NotFoundException(
              `Charge #${allocation.chargeId} not found for student #${allocation.studentId}`,
            );
          }

          const nextPaidAmount = charge.paidAmount + allocation.amount;
          const nextStatus =
            nextPaidAmount >= charge.amount
              ? ChargeStatus.PAID
              : ChargeStatus.PARTIALLY_PAID;

          await tx.charge.update({
            where: { id: charge.id },
            data: {
              paidAmount: nextPaidAmount,
              status: nextStatus,
            },
          });
        }
      }

      const result = await tx.paymentGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: {
          payments: {
            where: { deletedAt: null },
            include: {
              student: { include: { course: true, guardian: true } },
              concept: true,
            },
          },
        },
      });

      return result;
    });
  }

  private buildPaymentGroupWhere(
    filters: FilterPaymentsDto,
  ): Prisma.PaymentGroupWhereInput {
    const { dateFrom, dateTo, courseId, studentId } = filters;
    const where: Prisma.PaymentGroupWhereInput = { deletedAt: null };

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    if (studentId || courseId) {
      where.payments = {
        some: {
          ...(studentId ? { studentId } : {}),
          ...(courseId ? { student: { courseId } } : {}),
          deletedAt: null,
        },
      };
    }

    return where;
  }

  async findGroups(filters: FilterPaymentsDto) {
    const { page = 1, limit = 50 } = filters;
    const where = this.buildPaymentGroupWhere(filters);

    const [data, total] = await Promise.all([
      this.prisma.paymentGroup.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: paymentGroupInclude,
      }),
      this.prisma.paymentGroup.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAll(filters: FilterPaymentsDto) {
    const {
      dateFrom,
      dateTo,
      courseId,
      studentId,
      page = 1,
      limit = 50,
    } = filters;

    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      paymentGroup: { is: { deletedAt: null } },
    };

    // Filtro por rango de fechas
    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    // Filtro por curso (a través de Student)
    if (courseId) {
      where.student = { courseId };
    }

    // Filtro por alumno
    if (studentId) {
      where.studentId = studentId;
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { include: { course: true, guardian: true } },
          concept: true,
          paymentGroup: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        student: { include: { course: true, guardian: true } },
        concept: true,
        paymentGroup: true,
      },
    });
    if (!payment || payment.deletedAt || payment.paymentGroup?.deletedAt) {
      throw new NotFoundException(`Payment #${id} not found`);
    }
    return payment;
  }

  async removeGroup(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });

      if (!group) {
        throw new NotFoundException(`PaymentGroup #${id} not found`);
      }

      const deletedAt = new Date();

      const updatedGroup = await tx.paymentGroup.update({
        where: { id },
        data: { deletedAt },
      });

      await tx.payment.updateMany({
        where: { paymentGroupId: id, deletedAt: null },
        data: { deletedAt },
      });

      return updatedGroup;
    });
  }

  /** Grupos de pago para exportación (sin paginación), alineado con filtros de la UI. */
  async findAllGroupsForExport(filters: FilterPaymentsDto) {
    const where = this.buildPaymentGroupWhere(filters);
    return this.prisma.paymentGroup.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
      include: paymentGroupInclude,
    });
  }

  /** Genera buffer XLSX con cabecera-detalle y celdas combinadas por transacción. */
  async exportToXlsx(filters: FilterPaymentsDto): Promise<Buffer> {
    const groups = await this.findAllGroupsForExport(filters);
    return buildPaymentGroupsWorkbookBuffer(groups, 'Historial de Pagos');
  }

  /** Resumen agrupado por curso */
  async summaryByCourse(dateFrom?: string, dateTo?: string) {
    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      paymentGroup: { is: { deletedAt: null } },
    };
    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: { student: { include: { course: true } } },
    });

    const grouped: Record<
      string,
      { courseName: string; total: number; count: number }
    > = {};
    for (const p of payments) {
      const key = p.student.course.id.toString();
      if (!grouped[key]) {
        grouped[key] = {
          courseName: p.student.course.name,
          total: 0,
          count: 0,
        };
      }
      grouped[key].total += p.amount;
      grouped[key].count += 1;
    }

    return Object.entries(grouped).map(([courseId, data]) => ({
      courseId: Number(courseId),
      ...data,
    }));
  }
}
