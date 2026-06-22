import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChargeStatus, FinancialSetupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetupFinancialPlanDto } from './dto/create-charge.dto';

@Injectable()
export class ChargesService {
  constructor(private readonly prisma: PrismaService) {}

  async setupStudentFinancialPlan(
    studentId: number,
    dto: SetupFinancialPlanDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, financialSetup: true },
    });

    if (!student) {
      throw new NotFoundException(`Student #${studentId} not found`);
    }

    if (student.financialSetup !== FinancialSetupStatus.PENDING) {
      throw new BadRequestException(
        `Student #${studentId} financial plan is already configured`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const planCreatedAt = new Date();
      const createdCharges = await tx.charge.createMany({
        data: dto.charges.map((charge) => ({
          studentId,
          conceptId: charge.conceptId,
          amount: charge.amount,
          dueDate: new Date(charge.dueDate),
          status: ChargeStatus.PENDING,
          createdAt: planCreatedAt,
        })),
      });

      const [orphanPayments, newCharges] = await Promise.all([
        tx.payment.findMany({
          where: { studentId, chargeId: null, deletedAt: null },
          select: { id: true, amount: true },
          orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
        }),
        tx.charge.findMany({
          where: { studentId, deletedAt: null, createdAt: planCreatedAt },
          select: { id: true, amount: true, paidAmount: true, status: true },
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        }),
      ]);

      const dirtyChargeIds = new Set<number>();
      let chargeIndex = 0;

      for (const payment of orphanPayments) {
        let remainingPaymentAmount = payment.amount;
        let firstAppliedChargeId: number | null = null;

        while (remainingPaymentAmount > 0 && chargeIndex < newCharges.length) {
          const charge = newCharges[chargeIndex];
          const isLastCharge = chargeIndex === newCharges.length - 1;
          const pendingChargeAmount = Math.max(
            charge.amount - charge.paidAmount,
            0,
          );

          if (pendingChargeAmount === 0 && !isLastCharge) {
            chargeIndex += 1;
            continue;
          }

          const appliedAmount = isLastCharge
            ? remainingPaymentAmount
            : Math.min(remainingPaymentAmount, pendingChargeAmount);

          charge.paidAmount += appliedAmount;
          remainingPaymentAmount -= appliedAmount;
          firstAppliedChargeId ??= charge.id;
          dirtyChargeIds.add(charge.id);

          charge.status =
            charge.paidAmount >= charge.amount
              ? ChargeStatus.PAID
              : ChargeStatus.PARTIALLY_PAID;

          if (charge.status === ChargeStatus.PAID && !isLastCharge) {
            chargeIndex += 1;
            continue;
          }

          break;
        }

        if (firstAppliedChargeId) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { chargeId: firstAppliedChargeId },
          });
        }
      }

      for (const charge of newCharges) {
        if (!dirtyChargeIds.has(charge.id)) continue;

        await tx.charge.update({
          where: { id: charge.id },
          data: {
            paidAmount: charge.paidAmount,
            status: charge.status,
          },
        });
      }

      await tx.student.update({
        where: { id: studentId },
        data: { financialSetup: FinancialSetupStatus.CONFIGURED },
      });

      return createdCharges;
    });

    return {
      message: 'Financial plan configured successfully',
      count: result.count,
    };
  }

  findPendingByStudent(studentId: number) {
    return this.prisma.charge.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: {
          in: [
            ChargeStatus.PENDING,
            ChargeStatus.PARTIALLY_PAID,
            ChargeStatus.OVERDUE,
          ],
        },
      },
      include: { concept: true },
      orderBy: { dueDate: 'asc' },
    });
  }
}
