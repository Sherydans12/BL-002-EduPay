import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChargeStatus } from '@prisma/client';
import { tenantContext } from '../core/tenant/tenant.context';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);
  private readonly tenantContext = tenantContext;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverdueCharges() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let processed = 0;

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
    });

    for (const tenant of tenants) {
      await this.tenantContext.run(
        { tenantId: tenant.id, isSuperAdmin: false },
        async () => {
          const overdueCharges = await this.prisma.charge.findMany({
            where: {
              deletedAt: null,
              status: {
                in: [ChargeStatus.PENDING, ChargeStatus.PARTIALLY_PAID],
              },
              dueDate: { lt: today },
              student: {
                deletedAt: null,
                guardian: { deletedAt: null },
              },
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
            processed += 1;

            const recipientEmail = charge.student.guardian.email?.trim();
            if (!recipientEmail) {
              this.logger.warn(
                `Charge #${charge.id} marked overdue but guardian has no email`,
              );
              continue;
            }

            try {
              await this.mailService.sendReminder({
                to: recipientEmail,
                recipientName: charge.student.guardian.name,
                studentName: charge.student.name,
                studentId: charge.studentId,
                amount: Math.max(charge.amount - charge.paidAmount, 0),
                dueDate: charge.dueDate,
                conceptName: charge.concept.name,
              });
            } catch (error) {
              this.logger.warn(
                `Charge #${charge.id} marked overdue but its reminder failed: ${
                  error instanceof Error ? error.message : 'unknown error'
                }`,
              );
            }
          }
        },
      );
    }

    return { processed };
  }
}
