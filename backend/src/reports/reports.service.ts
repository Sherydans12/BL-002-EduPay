import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { FilterPaymentsDto } from '../payments/dto/filter-payments.dto';
import {
  aggregateGroupsByConcept,
  aggregateGroupsByCourse,
  aggregateGroupsByMethod,
  buildPeriodLabel,
  buildReportsWorkbookBuffer,
} from '../common/excel/reports-workbook.export';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async getSummary(startDate?: string, endDate?: string, courseId?: string) {
    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      paymentGroup: { is: { deletedAt: null } },
    };

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate)
        where.paymentDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    if (courseId) {
      where.student = {
        courseId: Number(courseId),
      };
    }

    const aggregations = await this.prisma.payment.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    const groupByMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      totalCollected: aggregations._sum.amount || 0,
      totalTransactions: aggregations._count.id || 0,
      byMethod: groupByMethod.map((item) => ({
        method: item.method,
        total: item._sum.amount || 0,
        count: item._count.id || 0,
      })),
    };
  }

  async getRevenueTrend(
    months = 12,
  ): Promise<{ month: string; total: number }[]> {
    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - (months - 1),
      1,
    );

    const payments = await this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        paymentGroup: { is: { deletedAt: null } },
        paymentDate: { gte: startDate },
      },
      select: { paymentDate: true, amount: true },
    });

    const grouped = new Map<string, number>();
    for (const p of payments) {
      const key = `${p.paymentDate.getUTCFullYear()}-${String(p.paymentDate.getUTCMonth() + 1).padStart(2, '0')}`;
      grouped.set(key, (grouped.get(key) ?? 0) + p.amount);
    }

    const result: { month: string; total: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CL', {
        month: 'short',
        year: '2-digit',
      });
      result.push({ month: label, total: grouped.get(key) ?? 0 });
    }
    return result;
  }

  async exportToXlsx(filters: FilterPaymentsDto): Promise<Buffer> {
    const { dateFrom, dateTo, courseId, studentId } = filters;
    const groups = await this.paymentsService.findAllGroupsForExport(filters);

    const totalCollected = groups.reduce((s, g) => s + g.totalAmount, 0);
    const transactionCount = groups.length;
    const lineCount = groups.reduce((s, g) => s + g.payments.length, 0);
    const averagePerTransaction =
      transactionCount > 0 ? Math.round(totalCollected / transactionCount) : 0;

    let courseLabel: string | undefined;
    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { name: true },
      });
      courseLabel = course?.name;
    }

    let studentLabel: string | undefined;
    if (studentId) {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true },
      });
      studentLabel = student?.name;
    }

    return buildReportsWorkbookBuffer(
      {
        periodLabel: buildPeriodLabel(dateFrom, dateTo),
        courseLabel,
        studentLabel,
        totalCollected,
        transactionCount,
        lineCount,
        averagePerTransaction,
      },
      aggregateGroupsByMethod(groups),
      aggregateGroupsByCourse(groups),
      aggregateGroupsByConcept(groups),
      groups,
    );
  }
}
