import { Injectable } from '@nestjs/common';
import { ChargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MONTH_LABELS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinancialDashboard() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthStart = new Date(currentYear, now.getMonth(), 1);
    const nextMonthStart = new Date(currentYear, now.getMonth() + 1, 1);
    const yearStart = new Date(currentYear, 0, 1);
    const nextYearStart = new Date(currentYear + 1, 0, 1);

    const paymentWhere = {
      deletedAt: null,
      OR: [
        { paymentGroupId: null },
        { paymentGroup: { is: { deletedAt: null } } },
      ],
    };

    const [
      totalActiveStudents,
      totalCourses,
      currentMonthRevenueResult,
      overdueCharges,
      totalExpectedRevenueResult,
      paymentsThisYear,
    ] = await Promise.all([
      this.prisma.student.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.payment.aggregate({
        where: {
          ...paymentWhere,
          paymentDate: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.charge.findMany({
        where: {
          deletedAt: null,
          status: ChargeStatus.OVERDUE,
        },
        select: {
          amount: true,
          paidAmount: true,
        },
      }),
      this.prisma.charge.aggregate({
        where: {
          deletedAt: null,
          createdAt: {
            gte: yearStart,
            lt: nextYearStart,
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          ...paymentWhere,
          paymentDate: {
            gte: yearStart,
            lt: nextYearStart,
          },
        },
        select: {
          amount: true,
          paymentDate: true,
        },
      }),
    ]);

    const totalOverdueDebt = overdueCharges.reduce(
      (total, charge) => total + Math.max(charge.amount - charge.paidAmount, 0),
      0,
    );

    const revenueByMonth = MONTH_LABELS.map((month) => ({
      month,
      total: 0,
    }));

    for (const payment of paymentsThisYear) {
      const monthIndex = payment.paymentDate.getMonth();
      revenueByMonth[monthIndex].total += payment.amount;
    }

    return {
      totalActiveStudents,
      totalCourses,
      currentMonthRevenue: currentMonthRevenueResult._sum.amount ?? 0,
      totalOverdueDebt,
      totalExpectedRevenue: totalExpectedRevenueResult._sum.amount ?? 0,
      revenueByMonth,
    };
  }
}
