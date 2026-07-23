import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChargeStatus, PaymentSource, Prisma } from '@prisma/client';
import { stripRut } from '../common/rut/rut.util';
import { PrismaService } from '../prisma/prisma.service';
import { SyncPortalPaymentDto } from './dto/sync-portal-payment.dto';

export type PortalInstallmentStatus = 'PAGADO' | 'VENCIDO' | 'PENDIENTE';

type WebpayAuditEvent =
  | 'WEBPAY_SYNCED'
  | 'WEBPAY_SYNC_DUPLICATE'
  | 'WEBPAY_SYNC_CONFLICT';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

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
                concept: {
                  select: { id: true, name: true },
                },
                payments: {
                  where: { deletedAt: null },
                  orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    amount: true,
                    method: true,
                    paymentDate: true,
                  },
                },
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

    const students = (guardian.students ?? []).map((student) => {
      const installments = (student.charges ?? []).map((charge) => {
        const amount = charge.amount ?? 0;
        const paidAmount = charge.paidAmount ?? 0;

        return {
          id: charge.id,
          month: charge.dueDate ? this.toMonth(charge.dueDate) : null,
          amount,
          paidAmount,
          outstandingAmount: Math.max(amount - paidAmount, 0),
          status: this.toPortalStatus(charge.status, charge.dueDate, today),
          concept: charge.concept
            ? {
                id: charge.concept?.id ?? null,
                name: charge.concept?.name ?? null,
              }
            : null,
          payments:
            charge.payments?.map((payment) => ({
              id: payment.id,
              amount: payment.amount ?? 0,
              method: payment.method,
              paymentDate: payment.paymentDate,
            })) ?? [],
        };
      });

      return {
        id: student.id,
        rut: student.rut,
        name: student.name,
        course: student.course
          ? {
              id: student.course?.id ?? null,
              name: student.course?.name ?? null,
            }
          : null,
        installments,
        totalDebt: installments.reduce(
          (total, installment) => total + installment.outstandingAmount,
          0,
        ),
      };
    });

    return {
      guardian: {
        rut: guardian.rut,
        name: guardian.name,
      },
      students,
      totalDebt: students.reduce(
        (total, student) => total + student.totalDebt,
        0,
      ),
    };
  }

  async syncPayment(dto: SyncPortalPaymentDto, tenantId: string) {
    const buyOrder = dto.buyOrder.trim();
    const startedAtMs = Date.now();

    if (!tenantId?.trim()) {
      throw new InternalServerErrorException(
        'No existe un tenant activo para sincronizar el pago',
      );
    }

    let confirmation: {
      synced: true;
      alreadyProcessed: boolean;
      buyOrder: string;
      paymentGroupId: number;
      amount: number;
      chargeIds: number[];
    };

    try {
      confirmation = await this.prisma.$transaction(async (tx) => {
        const previousGroup = await tx.paymentGroup.findFirst({
          where: { tenantId, buyOrder },
          include: {
            payments: {
              where: { tenantId, deletedAt: null },
              select: { chargeId: true },
            },
          },
        });

        if (previousGroup) {
          this.assertIdempotentRetry(previousGroup, dto);
          return {
            ...this.toSyncConfirmation(previousGroup, buyOrder),
            alreadyProcessed: true,
          };
        }

        const charges = await tx.charge.findMany({
          where: {
            tenantId,
            id: { in: dto.chargeIds },
            deletedAt: null,
            student: {
              tenantId,
              deletedAt: null,
              guardian: { tenantId, deletedAt: null },
            },
          },
          include: {
            student: {
              select: {
                id: true,
                name: true,
                guardian: {
                  select: { rut: true, name: true, email: true },
                },
              },
            },
            concept: { select: { name: true } },
          },
          orderBy: { id: 'asc' },
        });

        if (charges.length !== dto.chargeIds.length) {
          const foundIds = new Set(charges.map((charge) => charge.id));
          const missingIds = dto.chargeIds.filter((id) => !foundIds.has(id));
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
            tenantId,
            buyOrder,
            authorizationCode: dto.authorizationCode,
            cardLast4: dto.cardNumber,
            totalAmount: dto.amount,
            method: dto.paymentMethod,
            paymentDate: new Date(),
            source: PaymentSource.PORTAL,
            isBoletaPending: true,
          },
        });

        for (const allocation of allocations) {
          await tx.payment.create({
            data: {
              tenantId,
              amount: allocation.amount,
              method: dto.paymentMethod,
              source: PaymentSource.PORTAL,
              paymentDate: group.paymentDate,
              studentId: allocation.charge.studentId,
              conceptId: allocation.charge.conceptId,
              chargeId: allocation.charge.id,
              paymentGroupId: group.id,
              payerRut: allocation.charge.student.guardian.rut,
              referenceCode: buyOrder,
            },
          });

          await tx.charge.update({
            where: { id: allocation.charge.id, tenantId },
            data: {
              paidAmount: allocation.charge.amount,
              status: ChargeStatus.PAID,
            },
          });
        }

        return {
          synced: true as const,
          alreadyProcessed: false,
          buyOrder,
          paymentGroupId: group.id,
          amount: dto.amount,
          chargeIds: charges.map((charge) => charge.id),
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const previousGroup = await this.prisma.paymentGroup.findFirst({
          where: { tenantId, buyOrder },
          include: {
            payments: {
              where: { tenantId, deletedAt: null },
              select: { chargeId: true },
            },
          },
        });

        if (previousGroup) {
          try {
            this.assertIdempotentRetry(previousGroup, dto);
          } catch (retryError) {
            if (retryError instanceof ConflictException) {
              this.logWebpayEvent(
                'WEBPAY_SYNC_CONFLICT',
                tenantId,
                buyOrder,
                dto.amount,
                startedAtMs,
              );
            }
            throw retryError;
          }

          this.logWebpayEvent(
            'WEBPAY_SYNC_DUPLICATE',
            tenantId,
            buyOrder,
            dto.amount,
            startedAtMs,
          );
          return {
            ...this.toSyncConfirmation(previousGroup, buyOrder),
            alreadyProcessed: true,
          };
        }
      }

      if (error instanceof ConflictException) {
        this.logWebpayEvent(
          'WEBPAY_SYNC_CONFLICT',
          tenantId,
          buyOrder,
          dto.amount,
          startedAtMs,
        );
      }
      throw error;
    }

    this.logWebpayEvent(
      confirmation.alreadyProcessed ? 'WEBPAY_SYNC_DUPLICATE' : 'WEBPAY_SYNCED',
      tenantId,
      buyOrder,
      dto.amount,
      startedAtMs,
    );

    // El Portal ya envió el comprobante al aprobar Webpay.
    // Esta ruta S2S termina aquí y no despacha notificaciones por correo.
    return confirmation;
  }

  private logWebpayEvent(
    event: WebpayAuditEvent,
    tenantId: string,
    buyOrder: string,
    amount: number,
    startedAtMs: number,
  ): void {
    const metadata = {
      event,
      tenantId,
      buyOrder,
      amount,
      durationMs: Math.max(Date.now() - startedAtMs, 0),
    };

    if (event === 'WEBPAY_SYNCED') {
      this.logger.log(metadata);
      return;
    }

    this.logger.warn(metadata);
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
    const requestedIds = [...dto.chargeIds].sort((a, b) => a - b);

    const sameIds =
      previousIds.length === requestedIds.length &&
      previousIds.every((id, index) => id === requestedIds[index]);

    if (group.totalAmount !== dto.amount || !sameIds) {
      throw new ConflictException(
        `La orden de compra ${dto.buyOrder.trim()} ya existe con datos diferentes`,
      );
    }
  }

  private toSyncConfirmation(
    group: {
      id: number;
      totalAmount: number;
      payments: Array<{ chargeId: number | null }>;
    },
    buyOrder: string,
  ) {
    return {
      synced: true as const,
      buyOrder,
      paymentGroupId: group.id,
      amount: group.totalAmount,
      chargeIds: group.payments
        .map((payment) => payment.chargeId)
        .filter((id): id is number => id !== null)
        .sort((a, b) => a - b),
    };
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
    status: ChargeStatus | null | undefined,
    dueDate: Date | null | undefined,
    today: Date,
  ): PortalInstallmentStatus {
    if (status === ChargeStatus.PAID) return 'PAGADO';
    if (status === ChargeStatus.OVERDUE || (dueDate && dueDate < today)) {
      return 'VENCIDO';
    }
    return 'PENDIENTE';
  }
}
