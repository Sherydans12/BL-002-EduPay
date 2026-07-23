import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeStatus,
  NotificationType,
  PaymentSource,
  Prisma,
} from '@prisma/client';
import { stripRut } from '../common/rut/rut.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncPortalPaymentDto } from './dto/sync-portal-payment.dto';

export type PortalInstallmentStatus = 'PAGADO' | 'VENCIDO' | 'PENDIENTE';

type PaymentReceiptData = {
  tenantId: string;
  recipientEmail: string;
  guardianName: string;
  paymentGroupId: number;
  buyOrder: string;
  paymentDate: Date;
  totalAmount: number;
  cardNumber?: string;
  items: Array<{
    chargeId: number;
    studentName: string;
    conceptName: string;
    dueDate: Date;
    amount: number;
  }>;
};

type WebpayAuditEvent =
  | 'WEBPAY_SYNCED'
  | 'WEBPAY_SYNC_DUPLICATE'
  | 'WEBPAY_SYNC_CONFLICT';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    let transactionResult: {
      confirmation: {
        synced: true;
        alreadyProcessed: boolean;
        buyOrder: string;
        paymentGroupId: number;
        amount: number;
        chargeIds: number[];
      };
      receipt: PaymentReceiptData | null;
    };

    try {
      transactionResult = await this.prisma.$transaction(async (tx) => {
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
            confirmation: {
              ...this.toSyncConfirmation(previousGroup, buyOrder),
              alreadyProcessed: true,
            },
            receipt: null,
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

        const guardian = charges[0].student.guardian;

        return {
          confirmation: {
            synced: true as const,
            alreadyProcessed: false,
            buyOrder,
            paymentGroupId: group.id,
            amount: dto.amount,
            chargeIds: charges.map((charge) => charge.id),
          },
          receipt: {
            tenantId,
            recipientEmail: guardian.email ?? '',
            guardianName: guardian.name,
            paymentGroupId: group.id,
            buyOrder,
            paymentDate: group.paymentDate,
            totalAmount: dto.amount,
            cardNumber: dto.cardNumber,
            items: allocations.map((allocation) => ({
              chargeId: allocation.charge.id,
              studentName: allocation.charge.student.name,
              conceptName: allocation.charge.concept.name,
              dueDate: allocation.charge.dueDate,
              amount: allocation.amount,
            })),
          },
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
      transactionResult.confirmation.alreadyProcessed
        ? 'WEBPAY_SYNC_DUPLICATE'
        : 'WEBPAY_SYNCED',
      tenantId,
      buyOrder,
      dto.amount,
      startedAtMs,
    );

    if (!transactionResult.confirmation.alreadyProcessed) {
      void this.dispatchPaymentReceipt(transactionResult.receipt);
    }

    return transactionResult.confirmation;
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

  private async dispatchPaymentReceipt(
    receipt: PaymentReceiptData | null,
  ): Promise<void> {
    if (!receipt) return;

    const subject = `Comprobante de pago - Orden ${receipt.buyOrder}`;
    const html = this.buildPaymentReceiptHtml(receipt);

    try {
      await this.notificationsService.dispatchEmail({
        tenantId: receipt.tenantId,
        type: NotificationType.PAYMENT_RECEIPT,
        recipientEmail: receipt.recipientEmail,
        subject,
        html,
        paymentGroupId: receipt.paymentGroupId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error de correo desconocido';
      this.logger.error(
        `No fue posible despachar el comprobante de la orden ${receipt.buyOrder}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildPaymentReceiptHtml(receipt: PaymentReceiptData): string {
    const formattedDate = new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Santiago',
    }).format(receipt.paymentDate);
    const formattedTotal = this.formatClp(receipt.totalAmount);
    const detailRows = receipt.items
      .map(
        (item) => `
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">#${item.chargeId}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${this.escapeHtml(item.studentName)}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${this.escapeHtml(item.conceptName)}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${this.formatDate(item.dueDate)}</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right;">${this.formatClp(item.amount)}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #111827; line-height: 1.5;">
        <h2 style="color: #1d4ed8; margin-bottom: 8px;">Comprobante de pago</h2>
        <p>Estimado/a ${this.escapeHtml(receipt.guardianName)}, confirmamos que su pago fue procesado exitosamente.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Número de orden</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${this.escapeHtml(receipt.buyOrder)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Fecha/Hora</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Monto total</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${formattedTotal}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Método de pago</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${receipt.cardNumber ? `WEBPAY **** ${this.escapeHtml(receipt.cardNumber)}` : 'WEBPAY'}</td>
          </tr>
        </table>
        <h3 style="margin-bottom: 8px;">Detalle de cuotas y conceptos cancelados</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f9fafb; text-align: left;">
              <th style="padding: 10px; border: 1px solid #e5e7eb;">Cuota</th>
              <th style="padding: 10px; border: 1px solid #e5e7eb;">Alumno/a</th>
              <th style="padding: 10px; border: 1px solid #e5e7eb;">Concepto</th>
              <th style="padding: 10px; border: 1px solid #e5e7eb;">Vencimiento</th>
              <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: right;">Monto</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>
        <p style="color: #6b7280; font-size: 12px;">Este es un correo automático, por favor no responder directamente a este mensaje.</p>
      </div>
    `;
  }

  private formatClp(amount: number): string {
    return amount.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'medium',
      timeZone: 'America/Santiago',
    }).format(date);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
