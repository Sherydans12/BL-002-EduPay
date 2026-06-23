import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeStatus,
  FinancialSetupStatus,
  type Charge,
  type NotificationLog,
  type Payment,
  type PaymentConcept,
  type PaymentGroup,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SetupFinancialPlanDto,
  UpdateFinancialPlanDto,
} from './dto/create-charge.dto';

export interface StudentAccountStatement {
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalOverdue: number;
  };
  charges: Array<Charge & { concept: PaymentConcept }>;
  payments: Array<Payment & { paymentGroup: PaymentGroup | null }>;
  logs: NotificationLog[];
}

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

  findPlanByStudent(studentId: number) {
    return this.prisma.charge.findMany({
      where: { studentId, deletedAt: null },
      include: { concept: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getStudentAccountStatement(
    studentId: number,
  ): Promise<StudentAccountStatement> {
    const [charges, payments, logs] = await Promise.all([
      this.prisma.charge.findMany({
        where: { studentId, deletedAt: null },
        include: { concept: true },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: {
          studentId,
          deletedAt: null,
          paymentGroup: { is: { deletedAt: null } },
        },
        include: { paymentGroup: true },
        orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.notificationLog.findMany({
        where: { studentId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalInvoiced = charges.reduce(
      (total, charge) => total + charge.amount,
      0,
    );
    const totalPaid = payments.reduce(
      (total, payment) => total + payment.amount,
      0,
    );
    const totalOverdue = charges.reduce((total, charge) => {
      if (
        charge.status === ChargeStatus.CANCELLED ||
        charge.status === ChargeStatus.PAID ||
        charge.dueDate >= today
      ) {
        return total;
      }

      return total + Math.max(charge.amount - charge.paidAmount, 0);
    }, 0);

    return {
      summary: { totalInvoiced, totalPaid, totalOverdue },
      charges,
      payments,
      logs,
    };
  }

  async updateStudentFinancialPlan(
    studentId: number,
    dto: UpdateFinancialPlanDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, financialSetup: true },
    });

    if (!student) {
      throw new NotFoundException(`Student #${studentId} not found`);
    }

    if (student.financialSetup !== FinancialSetupStatus.CONFIGURED) {
      throw new BadRequestException(
        `Student #${studentId} financial plan is not configured`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const currentCharges = await tx.charge.findMany({
        where: { studentId, deletedAt: null },
        orderBy: { dueDate: 'asc' },
      });

      const payloadChargeIds = new Set(
        dto.charges
          .map((charge) => charge.id)
          .filter((id): id is number => typeof id === 'number'),
      );

      const chargesToDelete = currentCharges.filter(
        (charge) => !payloadChargeIds.has(charge.id),
      );

      if (
        chargesToDelete.some((charge) => charge.status === ChargeStatus.PAID)
      ) {
        throw new BadRequestException(
          'No se pueden eliminar cuotas ya pagadas',
        );
      }

      const deletedAt = new Date();
      if (chargesToDelete.length > 0) {
        await tx.charge.updateMany({
          where: { id: { in: chargesToDelete.map((charge) => charge.id) } },
          data: { deletedAt },
        });
      }

      const currentChargesById = new Map(
        currentCharges.map((charge) => [charge.id, charge]),
      );

      for (const payloadCharge of dto.charges) {
        if (!payloadCharge.id) {
          await tx.charge.create({
            data: {
              studentId,
              conceptId: payloadCharge.conceptId,
              amount: payloadCharge.amount,
              dueDate: new Date(payloadCharge.dueDate),
              status: ChargeStatus.PENDING,
            },
          });
          continue;
        }

        const currentCharge = currentChargesById.get(payloadCharge.id);
        if (!currentCharge) {
          throw new BadRequestException(
            `Charge #${payloadCharge.id} no pertenece al alumno o fue eliminada`,
          );
        }

        if (payloadCharge.amount < currentCharge.paidAmount) {
          throw new BadRequestException(
            'El monto de la cuota no puede ser menor al monto ya pagado',
          );
        }

        await tx.charge.update({
          where: { id: currentCharge.id },
          data: {
            conceptId: payloadCharge.conceptId,
            amount: payloadCharge.amount,
            dueDate: new Date(payloadCharge.dueDate),
          },
        });
      }

      return tx.charge.findMany({
        where: { studentId, deletedAt: null },
        include: { concept: true },
        orderBy: { dueDate: 'asc' },
      });
    });
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
