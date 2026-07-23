import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ChargeStatus,
  PaymentMethod,
  PaymentSource,
  Prisma,
} from '@prisma/client';
import { tenantContext } from '../core/tenant/tenant.context';
import { buildPaymentGroupsWorkbookBuffer } from '../common/excel/payment-groups-sheet.export';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachBoletaDto } from './dto/attach-boleta.dto';
import { CreatePaymentBatchDto } from './dto/create-payment-batch.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FilterPaymentsDto } from './dto/filter-payments.dto';
import { MarkChargePaidDto } from './dto/mark-charge-paid.dto';
import { UpdatePaymentGroupDto } from './dto/update-payment-group.dto';

const RELATED_RECORD_NOT_FOUND =
  'Registro relacionado no encontrado o pertenece a otro colegio';

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

type PaymentGroupWithLines = Prisma.PaymentGroupGetPayload<{
  include: typeof paymentGroupInclude;
}>;

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly tenantContext = tenantContext;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyPayments();
  }

  /** Migra pagos sin grupo a un PaymentGroup 1:1 (idempotente). */
  async migrateLegacyPayments(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
    });

    for (const tenant of tenants) {
      await this.tenantContext.run(
        { tenantId: tenant.id, isSuperAdmin: false },
        async () => {
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
                  source: p.source,
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
        },
      );
    }
  }

  private async assertPaymentRelationsExist(
    studentId: number,
    conceptId?: number | null,
    chargeId?: number | null,
  ): Promise<void> {
    const [student, concept, charge] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: { id: true },
      }),
      conceptId
        ? this.prisma.paymentConcept.findFirst({
            where: { id: conceptId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: null }),
      chargeId
        ? this.prisma.charge.findFirst({
            where: { id: chargeId, studentId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve({ id: null }),
    ]);

    if (!student || !concept || !charge) {
      throw new NotFoundException(RELATED_RECORD_NOT_FOUND);
    }
  }

  private async assertBatchPaymentRelationsExist(
    allocations: CreatePaymentBatchDto['allocations'],
  ): Promise<void> {
    await Promise.all(
      allocations.map((allocation) =>
        this.assertPaymentRelationsExist(
          allocation.studentId,
          allocation.conceptId,
          allocation.chargeId,
        ),
      ),
    );
  }

  private resolveChargeStatus(
    amount: number,
    paidAmount: number,
  ): ChargeStatus {
    if (paidAmount >= amount) return ChargeStatus.PAID;
    if (paidAmount > 0) return ChargeStatus.PARTIALLY_PAID;
    return ChargeStatus.PENDING;
  }

  private async recalculateCharges(
    tx: Prisma.TransactionClient,
    chargeIds: Array<number | null | undefined>,
  ): Promise<void> {
    const uniqueChargeIds = [...new Set(chargeIds.filter(Boolean) as number[])];
    if (uniqueChargeIds.length === 0) return;

    const charges = await tx.charge.findMany({
      where: { id: { in: uniqueChargeIds }, deletedAt: null },
      select: { id: true, amount: true },
    });

    for (const charge of charges) {
      const aggregate = await tx.payment.aggregate({
        where: {
          chargeId: charge.id,
          deletedAt: null,
          paymentGroup: { is: { deletedAt: null } },
        },
        _sum: { amount: true },
      });
      const paidAmount = aggregate._sum.amount ?? 0;

      await tx.charge.update({
        where: { id: charge.id },
        data: {
          paidAmount,
          status: this.resolveChargeStatus(charge.amount, paidAmount),
        },
      });
    }
  }

  async create(dto: CreatePaymentDto, boletaFileUrl?: string) {
    await this.assertPaymentRelationsExist(dto.studentId, dto.conceptId);

    const paymentDate = new Date(dto.paymentDate);
    const resolvedBoletaUrl = boletaFileUrl ?? null;
    const boletaNumber = dto.boletaNumber?.trim() || null;
    const isBoletaPending = !boletaNumber;

    const payment = await this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.create({
        data: {
          totalAmount: dto.amount,
          method: dto.method,
          source: PaymentSource.MANUAL,
          paymentDate,
          boletaFileUrl: resolvedBoletaUrl,
          boletaNumber,
          isBoletaPending,
          notes: dto.notes ?? null,
        },
      });

      return tx.payment.create({
        data: {
          amount: dto.amount,
          method: dto.method,
          source: PaymentSource.MANUAL,
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

    if (
      payment.source === PaymentSource.MANUAL &&
      dto.sendEmailNotification !== false
    ) {
      void this.sendManualPaymentReceipt(payment, resolvedBoletaUrl);
    }

    return payment;
  }

  private async sendManualPaymentReceipt(
    payment: {
      id: number;
      amount: number;
      source: PaymentSource;
      paymentDate: Date;
      student: {
        name: string;
        guardian: { name: string; email: string | null };
      };
      paymentGroupId?: number | null;
      studentId?: number;
    },
    boletaFileUrl: string | null,
  ): Promise<void> {
    const guardianEmail = payment.student.guardian.email?.trim();
    if (
      payment.source !== PaymentSource.MANUAL ||
      !guardianEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)
    ) {
      return;
    }

    try {
      await this.mailService.sendPaymentConfirmation({
        to: guardianEmail,
        recipientName: payment.student.guardian.name,
        studentName: payment.student.name,
        studentId: payment.studentId,
        paymentGroupId: payment.paymentGroupId ?? undefined,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        boletaFileUrl: boletaFileUrl ?? undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error de correo desconocido';
      this.logger.error(
        `No fue posible enviar el comprobante del pago manual #${payment.id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async createBatch(dto: CreatePaymentBatchDto, boletaFileUrl?: string) {
    await this.assertBatchPaymentRelationsExist(dto.allocations);

    const paymentDate = new Date(dto.paymentDate);
    const resolvedBoletaUrl = boletaFileUrl ?? dto.boletaFileUrl ?? null;
    const boletaNumber = dto.boletaNumber?.trim() || null;
    const isBoletaPending = !boletaNumber;

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.create({
        data: {
          totalAmount: dto.totalAmount,
          method: dto.method,
          source: PaymentSource.MANUAL,
          paymentDate,
          boletaFileUrl: resolvedBoletaUrl,
          boletaNumber,
          isBoletaPending,
          notes: dto.notes ?? null,
        },
      });

      for (const allocation of dto.allocations) {
        await tx.payment.create({
          data: {
            amount: allocation.amount,
            method: dto.method,
            source: PaymentSource.MANUAL,
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
            throw new NotFoundException(RELATED_RECORD_NOT_FOUND);
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

      return tx.paymentGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: paymentGroupInclude,
      });
    });

    if (!dto.isBoletaPending && dto.boletaNumber && resolvedBoletaUrl) {
      this.sendBoletaNotifications(result);
    }

    return result;
  }

  async markChargePaid(chargeId: number, dto: MarkChargePaidDto) {
    const charge = await this.prisma.charge.findFirst({
      where: { id: chargeId, deletedAt: null },
      include: { student: { include: { guardian: true } }, concept: true },
    });

    if (!charge) {
      throw new NotFoundException(`Charge #${chargeId} not found`);
    }

    if (charge.status === ChargeStatus.CANCELLED) {
      throw new BadRequestException('No se puede pagar una cuota anulada');
    }

    const remainingAmount = Math.max(charge.amount - charge.paidAmount, 0);
    if (remainingAmount <= 0) {
      throw new BadRequestException('La cuota ya se encuentra pagada');
    }

    const method = dto.method ?? PaymentMethod.TRANSFER;
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    const notes =
      dto.notes?.trim() || `Pago rápido registrado para ${charge.concept.name}`;

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.create({
        data: {
          totalAmount: remainingAmount,
          method,
          source: PaymentSource.MANUAL,
          paymentDate,
          isBoletaPending: true,
          notes,
        },
      });

      await tx.payment.create({
        data: {
          amount: remainingAmount,
          method,
          source: PaymentSource.MANUAL,
          paymentDate,
          studentId: charge.studentId,
          conceptId: charge.conceptId,
          chargeId: charge.id,
          paymentGroupId: group.id,
          notes: null,
          boletaFileUrl: null,
          boletaNumber: null,
        },
      });

      await this.recalculateCharges(tx, [charge.id]);

      return tx.paymentGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: paymentGroupInclude,
      });
    });
  }

  async resolvePendingBoleta(
    id: number,
    boletaNumber: string,
    boletaFileUrl?: string,
  ) {
    const trimmedBoletaNumber = boletaNumber?.trim();

    if (!trimmedBoletaNumber) {
      throw new BadRequestException('El número de boleta es requerido');
    }

    const group = await this.prisma.paymentGroup.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException(`PaymentGroup #${id} not found`);
    }

    const updatedGroup = await this.prisma.paymentGroup.update({
      where: { id },
      data: {
        boletaNumber: trimmedBoletaNumber,
        ...(boletaFileUrl ? { boletaFileUrl } : {}),
        isBoletaPending: false,
      },
      include: paymentGroupInclude,
    });

    this.sendBoletaNotifications(updatedGroup);

    return updatedGroup;
  }

  async attachBoleta(
    id: number,
    dto: AttachBoletaDto,
    uploadedFileUrl?: string,
  ) {
    const tenantId = this.tenantContext.getStore()?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'Debe seleccionar un colegio para adjuntar una boleta',
      );
    }

    const boletaFileUrl = uploadedFileUrl ?? dto.boletaFileUrl?.trim();
    if (!boletaFileUrl) {
      throw new BadRequestException(
        'Debe adjuntar un archivo PDF o indicar boletaFileUrl',
      );
    }

    const paymentGroup = await this.prisma.paymentGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: paymentGroupInclude,
    });

    if (!paymentGroup) {
      throw new NotFoundException(`PaymentGroup #${id} not found`);
    }

    if (!paymentGroup.isBoletaPending) {
      throw new BadRequestException(
        'La transacción ya tiene su boleta resuelta',
      );
    }

    const updatedGroup = await this.prisma.paymentGroup.update({
      where: { id, tenantId },
      data: {
        boletaFileUrl,
        isBoletaPending: false,
      },
      include: paymentGroupInclude,
    });

    this.sendBoletaNotifications(updatedGroup);

    return updatedGroup;
  }

  async updateGroupDetails(
    id: number,
    dto: UpdatePaymentGroupDto,
    boletaFileUrl?: string,
  ) {
    const group = await this.prisma.paymentGroup.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException(`PaymentGroup #${id} not found`);
    }

    const trimmedBoletaNumber = dto.boletaNumber?.trim();
    const data: Prisma.PaymentGroupUpdateInput = {};

    if (dto.method) data.method = dto.method;
    if (dto.paymentDate) data.paymentDate = new Date(dto.paymentDate);
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    if (trimmedBoletaNumber !== undefined) {
      data.boletaNumber = trimmedBoletaNumber || null;
    }
    if (boletaFileUrl) data.boletaFileUrl = boletaFileUrl;
    if (dto.isBoletaPending !== undefined) {
      data.isBoletaPending = dto.isBoletaPending;
    } else if (trimmedBoletaNumber) {
      data.isBoletaPending = false;
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedGroup = await tx.paymentGroup.update({
        where: { id },
        data,
      });

      if (dto.method || dto.paymentDate) {
        await tx.payment.updateMany({
          where: { paymentGroupId: id, deletedAt: null },
          data: {
            ...(dto.method ? { method: dto.method } : {}),
            ...(dto.paymentDate
              ? { paymentDate: new Date(dto.paymentDate) }
              : {}),
          },
        });
      }

      return tx.paymentGroup.findUniqueOrThrow({
        where: { id: updatedGroup.id },
        include: paymentGroupInclude,
      });
    });
  }

  private sendBoletaNotifications(group: PaymentGroupWithLines): void {
    if (!group.boletaFileUrl) return;

    const recipients = new Map<
      string,
      {
        recipientName: string;
        studentNames: string[];
        studentId: number;
      }
    >();

    for (const payment of group.payments) {
      const email = payment.student.guardian.email?.trim();
      if (!email) continue;

      const existing = recipients.get(email);
      if (existing) {
        if (!existing.studentNames.includes(payment.student.name)) {
          existing.studentNames.push(payment.student.name);
        }
        continue;
      }

      recipients.set(email, {
        recipientName: payment.student.guardian.name,
        studentNames: [payment.student.name],
        studentId: payment.studentId,
      });
    }

    for (const [to, recipient] of recipients) {
      void this.mailService
        .sendBoletaNotification({
          to,
          recipientName: recipient.recipientName,
          studentName: recipient.studentNames.join(', '),
          studentId: recipient.studentId,
          paymentGroupId: group.id,
          boletaNumber: group.boletaNumber,
          boletaFileUrl: group.boletaFileUrl,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `No fue posible enviar la boleta del PaymentGroup #${group.id}: ${
              error instanceof Error ? error.message : 'Error desconocido'
            }`,
            error instanceof Error ? error.stack : undefined,
          );
        });
    }
  }

  private buildPaymentGroupWhere(
    filters: FilterPaymentsDto,
  ): Prisma.PaymentGroupWhereInput {
    const { dateFrom, dateTo, courseId, studentId, method } = filters;
    const where: Prisma.PaymentGroupWhereInput = { deletedAt: null };

    if (method) {
      where.method = method;
    }

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    where.payments = {
      some: {
        ...(studentId ? { studentId } : {}),
        deletedAt: null,
        student: {
          deletedAt: null,
          ...(courseId ? { courseId } : {}),
        },
      },
    };

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
      student: {
        deletedAt: null,
        ...(courseId ? { courseId } : {}),
      },
      ...(studentId ? { studentId } : {}),
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
    const payment = await this.prisma.payment.findFirst({
      where: {
        id,
        deletedAt: null,
        paymentGroup: { is: { deletedAt: null } },
        student: { deletedAt: null },
      },
      include: {
        student: { include: { course: true, guardian: true } },
        concept: true,
        paymentGroup: true,
      },
    });
    if (!payment) {
      throw new NotFoundException(`Payment #${id} not found`);
    }
    return payment;
  }

  async removeGroup(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.paymentGroup.findFirst({
        where: { id, deletedAt: null },
        include: {
          payments: {
            where: { deletedAt: null },
            select: { chargeId: true },
          },
        },
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

      await this.recalculateCharges(
        tx,
        group.payments.map((payment) => payment.chargeId),
      );

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
      student: { deletedAt: null },
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
