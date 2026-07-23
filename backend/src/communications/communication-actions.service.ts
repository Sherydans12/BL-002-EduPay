import { Injectable } from '@nestjs/common';
import { ChargeStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunicationActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async sendPaymentReminders() {
    const now = new Date();
    const charges = await this.prisma.charge.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [
            ChargeStatus.PENDING,
            ChargeStatus.PARTIALLY_PAID,
            ChargeStatus.OVERDUE,
          ],
        },
        dueDate: { lte: now },
        student: {
          deletedAt: null,
          guardian: {
            deletedAt: null,
            email: { not: null },
          },
        },
      },
      include: {
        concept: true,
        student: { include: { guardian: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 500,
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const charge of charges) {
      const to = charge.student.guardian.email?.trim();
      const amount = Math.max(charge.amount - charge.paidAmount, 0);
      if (!to || amount <= 0) {
        skipped += 1;
        continue;
      }

      try {
        await this.mailService.sendReminder({
          to,
          recipientName: charge.student.guardian.name,
          studentName: charge.student.name,
          studentId: charge.studentId,
          amount,
          dueDate: charge.dueDate,
          conceptName: charge.concept.name,
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      processed: charges.length,
      sent,
      failed,
      skipped,
    };
  }
}
