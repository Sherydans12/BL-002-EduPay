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
      const createdCharges = await tx.charge.createMany({
        data: dto.charges.map((charge) => ({
          studentId,
          conceptId: charge.conceptId,
          amount: charge.amount,
          dueDate: new Date(charge.dueDate),
          status: ChargeStatus.PENDING,
        })),
      });

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
}
