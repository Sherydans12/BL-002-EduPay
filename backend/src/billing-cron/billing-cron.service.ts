import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChargeStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverdueCharges() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueCharges = await this.prisma.charge.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [ChargeStatus.PENDING, ChargeStatus.PARTIALLY_PAID],
        },
        dueDate: { lt: today },
      },
      include: {
        concept: true,
        student: {
          include: {
            guardian: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    for (const charge of overdueCharges) {
      await this.prisma.charge.update({
        where: { id: charge.id },
        data: { status: ChargeStatus.OVERDUE },
      });

      const recipientEmail = charge.student.guardian.email?.trim();
      if (!recipientEmail) {
        this.logger.warn(
          `Charge #${charge.id} marked overdue but guardian has no email`,
        );
        continue;
      }

      const formattedAmount = new Intl.NumberFormat('es-CL').format(
        charge.amount,
      );
      const formattedDueDate = new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'short',
      }).format(charge.dueDate);

      await this.notificationsService.dispatchEmail({
        type: NotificationType.COBRANZA_MORA,
        recipientEmail,
        subject: `Cuota vencida: ${charge.concept.name}`,
        studentId: charge.studentId,
        html: `
          <p>Estimado Apoderado,</p>
          <p>
            le recordamos que la cuota de ${charge.concept.name}
            por $${formattedAmount} ha vencido el ${formattedDueDate}.
            Por favor regularice su situación.
          </p>
        `,
      });
    }

    return { processed: overdueCharges.length };
  }
}
