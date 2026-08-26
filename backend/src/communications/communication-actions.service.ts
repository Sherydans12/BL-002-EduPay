import { Injectable } from '@nestjs/common';
import { ChargeStatus, Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SendPaymentRemindersDto } from './dto/send-payment-reminders.dto';

export type ReminderStudentPreview = {
  studentId: number;
  studentName: string;
  studentRut: string | null;
  courseId: number | null;
  courseName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string | null;
  totalOverdueAmount: number;
  chargesCount: number;
  charges: Array<{
    id: number;
    conceptName: string;
    amount: number;
    dueDate: Date;
  }>;
};

@Injectable()
export class CommunicationActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private async fetchOverdueCharges(courseId?: number, studentId?: number) {
    const now = new Date();
    const where: Prisma.ChargeWhereInput = {
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
        ...(courseId ? { courseId } : {}),
        ...(studentId ? { id: studentId } : {}),
        guardian: {
          deletedAt: null,
          email: { not: null },
        },
      },
    };

    return this.prisma.charge.findMany({
      where,
      include: {
        concept: true,
        student: {
          include: {
            guardian: true,
            course: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
  }

  private groupChargesByStudent(
    charges: Awaited<ReturnType<typeof this.fetchOverdueCharges>>,
  ): ReminderStudentPreview[] {
    const studentMap = new Map<number, ReminderStudentPreview>();

    for (const charge of charges) {
      const email = charge.student.guardian.email?.trim();
      const pendingAmount = Math.max(charge.amount - charge.paidAmount, 0);

      if (!email || pendingAmount <= 0) {
        continue;
      }

      let existing = studentMap.get(charge.studentId);
      if (!existing) {
        existing = {
          studentId: charge.studentId,
          studentName: charge.student.name,
          studentRut: charge.student.rut,
          courseId: charge.student.courseId,
          courseName: charge.student.course?.name ?? 'Sin curso asignado',
          guardianName: charge.student.guardian.name,
          guardianEmail: email,
          guardianPhone: charge.student.guardian.phone,
          totalOverdueAmount: 0,
          chargesCount: 0,
          charges: [],
        };
        studentMap.set(charge.studentId, existing);
      }

      existing.totalOverdueAmount += pendingAmount;
      existing.chargesCount += 1;
      existing.charges.push({
        id: charge.id,
        conceptName: charge.concept.name,
        amount: pendingAmount,
        dueDate: charge.dueDate,
      });
    }

    return Array.from(studentMap.values()).sort(
      (a, b) => b.totalOverdueAmount - a.totalOverdueAmount,
    );
  }

  async getRemindersPreview(courseId?: number, studentId?: number) {
    const charges = await this.fetchOverdueCharges(courseId, studentId);
    const previewList = this.groupChargesByStudent(charges);

    const totalOverdueAmount = previewList.reduce(
      (acc, s) => acc + s.totalOverdueAmount,
      0,
    );
    const uniqueGuardians = new Set(previewList.map((s) => s.guardianEmail));

    return {
      totalRecipients: uniqueGuardians.size,
      totalStudents: previewList.length,
      totalCharges: charges.length,
      totalOverdueAmount,
      students: previewList,
    };
  }

  async sendPaymentReminders(dto: SendPaymentRemindersDto = {}) {
    const charges = await this.fetchOverdueCharges(dto.courseId, dto.studentId);
    const studentGroups = this.groupChargesByStudent(charges);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const group of studentGroups) {
      if (!group.guardianEmail || group.totalOverdueAmount <= 0) {
        skipped += 1;
        continue;
      }

      try {
        await this.mailService.sendConsolidatedReminder({
          to: group.guardianEmail,
          recipientName: group.guardianName,
          studentName: group.studentName,
          studentId: group.studentId,
          courseName: group.courseName,
          totalAmount: group.totalOverdueAmount,
          charges: group.charges.map((c) => ({
            conceptName: c.conceptName,
            amount: c.amount,
            dueDate: c.dueDate,
          })),
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      processed: studentGroups.length,
      totalCharges: charges.length,
      sent,
      failed,
      skipped,
    };
  }
}
