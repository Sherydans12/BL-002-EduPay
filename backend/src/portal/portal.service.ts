import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeStatus,
  PaymentMethod,
  PaymentSource,
  Prisma,
} from '@prisma/client';
import { stripRut } from '../common/rut/rut.util';
import { PrismaService } from '../prisma/prisma.service';
import { SyncPortalPaymentDto } from './dto/sync-portal-payment.dto';

export type PortalInstallmentStatus = 'PAGADO' | 'VENCIDO' | 'PENDIENTE';

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  async findGuardian(rut: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: {
        rutNormalized: stripRut(rut),
        deletedAt: null,
      },
      select: {
        rut: true,
        name: true,
        email: true,
      },
    });

    if (!guardian) {
      return {
        exists: false,
        rut: null,
        name: null,
        email: null,
      };
    }

    return {
      exists: true,
      rut: guardian.rut,
      name: guardian.name,
      email: guardian.email,
    };
  }

  async getGuardianStatement(rut: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: {
        rutNormalized: stripRut(rut),
        deletedAt: null,
      },
      select: {
        rut: true,
        name: true,
        students: {
          where: { deletedAt: null },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            rut: true,
            name: true,
            course: { select: { id: true, name: true } },
            charges: {
              where: {
                deletedAt: null,
                status: { not: ChargeStatus.CANCELLED },
              },
              orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
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

    if (!guardian) {
      throw new NotFoundException('Apoderado no encontrado');
    }

    const today = this.startOfToday();

    return {
      guardian: {
        rut: guardian.rut,
        name: guardian.name,
      },
      students: guardian.students.map((student) => ({
        id: student.id,
        rut: student.rut,
        name: student.name,
        course: student.course,
        installments: student.charges.map((charge) => ({
          id: charge.id,
          month: this.toMonth(charge.dueDate),
          amount: charge.amount,
          paidAmount: charge.paidAmount,
          outstandingAmount: Math.max(charge.amount - charge.paidAmount, 0),
          status: this.toPortalStatus(charge.status, charge.dueDate, today),
        })),
      })),
    };
  }

  async syncPayment(dto: SyncPortalPaymentDto) {
    const buyOrder = dto.buyOrder.trim();
    const paymentDate = new Date(dto.paymentDate);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const previousGroup = await tx.paymentGroup.findFirst({
          where: { buyOrder },
          include: {
            payments: {
              where: { deletedAt: null },
              select: { chargeId: true },
            },
          },
        });

        if (previousGroup) {
          this.assertIdempotentRetry(previousGroup, dto);
          return {
            synced: true,
            alreadyProcessed: true,
            buyOrder,
            paymentGroupId: previousGroup.id,
            amount: previousGroup.totalAmount,
            paidInstallmentsIds: previousGroup.payments
              .map((payment) => payment.chargeId)
              .filter((id): id is number => id !== null)
              .sort((a, b) => a - b),
          };
        }

        const charges = await tx.charge.findMany({
          where: {
            id: { in: dto.installmentsIds },
            deletedAt: null,
            student: {
              deletedAt: null,
              guardian: { deletedAt: null },
            },
          },
          include: {
            student: {
              select: {
                id: true,
                guardian: { select: { rut: true } },
              },
            },
          },
          orderBy: { id: 'asc' },
        });

        if (charges.length !== dto.installmentsIds.length) {
          const foundIds = new Set(charges.map((charge) => charge.id));
          const missingIds = dto.installmentsIds.filter(
            (id) => !foundIds.has(id),
          );
          throw new NotFoundException(
            `Cuota(s) no encontrada(s): ${missingIds.join(', ')}`,
          );
        }

        const nonPayable = charges.filter(
          (charge) =>
            charge.status === ChargeStatus.PAID ||
            charge.status === ChargeStatus.CANCELLED ||
            charge.paidAmount >= charge.amount,
        );
        if (nonPayable.length > 0) {
          throw new ConflictException(
            `Cuota(s) no pagable(s): ${nonPayable
              .map((charge) => charge.id)
              .join(', ')}`,
          );
        }

        const allocations = charges.map((charge) => ({
          charge,
          amount: charge.amount - charge.paidAmount,
        }));
        const expectedAmount = allocations.reduce(
          (total, allocation) => total + allocation.amount,
          0,
        );

        if (expectedAmount !== dto.amount) {
          throw new BadRequestException(
            `El monto informado (${dto.amount}) no coincide con el saldo de las cuotas (${expectedAmount})`,
          );
        }

        const group = await tx.paymentGroup.create({
          data: {
            buyOrder,
            totalAmount: dto.amount,
            method: PaymentMethod.WEBPAY,
            paymentDate,
            source: PaymentSource.PORTAL,
            isBoletaPending: true,
          },
        });

        for (const allocation of allocations) {
          await tx.payment.create({
            data: {
              amount: allocation.amount,
              method: PaymentMethod.WEBPAY,
              paymentDate,
              studentId: allocation.charge.studentId,
              conceptId: allocation.charge.conceptId,
              chargeId: allocation.charge.id,
              paymentGroupId: group.id,
              payerRut: allocation.charge.student.guardian.rut,
              referenceCode: buyOrder,
            },
          });

          await tx.charge.update({
            where: { id: allocation.charge.id },
            data: {
              paidAmount: allocation.charge.amount,
              status: ChargeStatus.PAID,
            },
          });
        }

        return {
          synced: true,
          alreadyProcessed: false,
          buyOrder,
          paymentGroupId: group.id,
          amount: dto.amount,
          paidInstallmentsIds: charges.map((charge) => charge.id),
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `La orden de compra ${buyOrder} ya fue procesada`,
        );
      }
      throw error;
    }
  }

  private assertIdempotentRetry(
    group: {
      totalAmount: number;
      payments: Array<{ chargeId: number | null }>;
    },
    dto: SyncPortalPaymentDto,
  ): void {
    const previousIds = group.payments
      .map((payment) => payment.chargeId)
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
    const requestedIds = [...dto.installmentsIds].sort((a, b) => a - b);

    const sameIds =
      previousIds.length === requestedIds.length &&
      previousIds.every((id, index) => id === requestedIds[index]);

    if (group.totalAmount !== dto.amount || !sameIds) {
      throw new ConflictException(
        `La orden de compra ${dto.buyOrder.trim()} ya existe con datos diferentes`,
      );
    }
  }

  private startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private toMonth(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private toPortalStatus(
    status: ChargeStatus,
    dueDate: Date,
    today: Date,
  ): PortalInstallmentStatus {
    if (status === ChargeStatus.PAID) return 'PAGADO';
    if (status === ChargeStatus.OVERDUE || dueDate < today) return 'VENCIDO';
    return 'PENDIENTE';
  }
}
