import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeStatus,
  FinancialSetupStatus,
  Prisma,
  type Charge,
  type NotificationLog,
  type Payment,
  type PaymentConcept,
  type PaymentGroup,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import {
  FinancialPlanPaymentAllocationDto,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicYears: AcademicYearsService,
  ) {}

  /** Whether the year is the tenant's ACTIVE one (it mirrors into Student). */
  private async isActiveYear(
    tx: Prisma.TransactionClient,
    tenantId: string,
    academicYearId: number,
  ): Promise<boolean> {
    const active = await tx.academicYear.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    return active?.id === academicYearId;
  }

  private async requireStudent(studentId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException(`Student #${studentId} not found`);
    }
  }

  private resolveStatusFromPaidAmount(
    amount: number,
    paidAmount: number,
  ): ChargeStatus {
    if (paidAmount >= amount) return ChargeStatus.PAID;
    if (paidAmount > 0) return ChargeStatus.PARTIALLY_PAID;
    return ChargeStatus.PENDING;
  }

  private async recalculateCharges(
    tx: Prisma.TransactionClient,
    chargeIds: number[],
  ): Promise<void> {
    const uniqueChargeIds = [...new Set(chargeIds.filter(Boolean))];
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
          status: this.resolveStatusFromPaidAmount(charge.amount, paidAmount),
        },
      });
    }
  }

  private async applyPaymentAllocations(
    tx: Prisma.TransactionClient,
    studentId: number,
    allocations: FinancialPlanPaymentAllocationDto[] | undefined,
    chargeIdsByIndex: number[],
  ): Promise<void> {
    if (!allocations || allocations.length === 0) return;

    const paymentIds = allocations.map((allocation) => allocation.paymentId);
    if (new Set(paymentIds).size !== paymentIds.length) {
      throw new BadRequestException(
        'No se puede asignar el mismo pago más de una vez',
      );
    }

    const payments = await tx.payment.findMany({
      where: {
        id: { in: paymentIds },
        studentId,
        deletedAt: null,
        paymentGroup: { is: { deletedAt: null } },
      },
      select: { id: true, chargeId: true },
    });

    if (payments.length !== paymentIds.length) {
      throw new BadRequestException(
        'Uno o más pagos no pertenecen al alumno o fueron eliminados',
      );
    }

    const paymentsById = new Map(
      payments.map((payment) => [payment.id, payment]),
    );
    const touchedChargeIds = new Set<number>();

    for (const allocation of allocations) {
      const payment = paymentsById.get(allocation.paymentId);
      if (!payment) continue;

      const targetChargeId =
        allocation.chargeIndex == null
          ? null
          : chargeIdsByIndex[allocation.chargeIndex];

      if (allocation.chargeIndex != null && !targetChargeId) {
        throw new BadRequestException(
          'La cuota seleccionada para un pago no existe',
        );
      }

      if (payment.chargeId) touchedChargeIds.add(payment.chargeId);
      if (targetChargeId) touchedChargeIds.add(targetChargeId);

      await tx.payment.update({
        where: { id: allocation.paymentId },
        data: { chargeId: targetChargeId },
      });
    }

    await this.recalculateCharges(tx, [...touchedChargeIds]);
  }

  async setupStudentFinancialPlan(
    studentId: number,
    dto: SetupFinancialPlanDto,
    academicYearId?: number,
  ) {
    await this.requireStudent(studentId);
    const enrollment = await this.academicYears.enrollmentFor(
      this.prisma,
      studentId,
      academicYearId,
    );

    if (enrollment.financialSetup !== FinancialSetupStatus.PENDING) {
      throw new BadRequestException(
        `Student #${studentId} financial plan is already configured for this academic year`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const createdChargeIds: number[] = [];

      for (const charge of dto.charges) {
        const createdCharge = await tx.charge.create({
          data: {
            studentId,
            enrollmentId: enrollment.id,
            conceptId: charge.conceptId,
            amount: charge.amount,
            dueDate: new Date(charge.dueDate),
            status: ChargeStatus.PENDING,
          },
          select: { id: true },
        });
        createdChargeIds.push(createdCharge.id);
      }

      await this.applyPaymentAllocations(
        tx,
        studentId,
        dto.paymentAllocations,
        createdChargeIds,
      );

      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { financialSetup: FinancialSetupStatus.CONFIGURED },
      });
      if (
        await this.isActiveYear(
          tx,
          enrollment.tenantId,
          enrollment.academicYearId,
        )
      ) {
        await tx.student.update({
          where: { id: studentId },
          data: { financialSetup: FinancialSetupStatus.CONFIGURED },
        });
      }

      return createdChargeIds.length;
    });

    return {
      message: 'Financial plan configured successfully',
      count: result,
    };
  }

  async findPlanByStudent(studentId: number, academicYearId?: number) {
    const enrollment = await this.academicYears.enrollmentFor(
      this.prisma,
      studentId,
      academicYearId,
    );
    return this.prisma.charge.findMany({
      where: { studentId, enrollmentId: enrollment.id, deletedAt: null },
      include: { concept: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Without `academicYearId` the statement covers every year (unchanged
   * behaviour). With it, only that year's charges and the payments allocated
   * to them.
   */
  async getStudentAccountStatement(
    studentId: number,
    academicYearId?: number,
  ): Promise<StudentAccountStatement> {
    const enrollmentId =
      academicYearId === undefined
        ? undefined
        : (
            await this.academicYears.enrollmentFor(
              this.prisma,
              studentId,
              academicYearId,
            )
          ).id;
    const [charges, payments, logs] = await Promise.all([
      this.prisma.charge.findMany({
        where: {
          studentId,
          deletedAt: null,
          ...(enrollmentId !== undefined ? { enrollmentId } : {}),
        },
        include: { concept: true },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: {
          studentId,
          deletedAt: null,
          paymentGroup: { is: { deletedAt: null } },
          ...(enrollmentId !== undefined
            ? { charge: { is: { enrollmentId } } }
            : {}),
        },
        include: { paymentGroup: true, concept: true },
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
    academicYearId?: number,
  ) {
    await this.requireStudent(studentId);
    const enrollment = await this.academicYears.enrollmentFor(
      this.prisma,
      studentId,
      academicYearId,
    );

    if (enrollment.financialSetup !== FinancialSetupStatus.CONFIGURED) {
      throw new BadRequestException(
        `Student #${studentId} financial plan is not configured for this academic year`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Only this year's charges: editing the 2027 plan never touches 2026.
      const currentCharges = await tx.charge.findMany({
        where: { studentId, enrollmentId: enrollment.id, deletedAt: null },
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
      const chargeIdsByPayloadIndex: number[] = [];

      for (const [index, payloadCharge] of dto.charges.entries()) {
        if (!payloadCharge.id) {
          const createdCharge = await tx.charge.create({
            data: {
              studentId,
              enrollmentId: enrollment.id,
              conceptId: payloadCharge.conceptId,
              amount: payloadCharge.amount,
              dueDate: new Date(payloadCharge.dueDate),
              status: ChargeStatus.PENDING,
            },
            select: { id: true },
          });
          chargeIdsByPayloadIndex[index] = createdCharge.id;
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
        chargeIdsByPayloadIndex[index] = currentCharge.id;
      }

      await this.applyPaymentAllocations(
        tx,
        studentId,
        dto.paymentAllocations,
        chargeIdsByPayloadIndex,
      );
      await this.recalculateCharges(tx, chargeIdsByPayloadIndex);

      return tx.charge.findMany({
        where: { studentId, enrollmentId: enrollment.id, deletedAt: null },
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
