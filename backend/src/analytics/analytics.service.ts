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
    const prevMonthStart = new Date(currentYear, now.getMonth() - 1, 1);
    const prevMonthEnd = currentMonthStart;
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
      prevMonthRevenueResult,
      overdueCharges,
      totalExpectedRevenueResult,
      paymentsThisYear,
      recentPayments,
      coursesWithCharges,
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
        _count: { id: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          ...paymentWhere,
          paymentDate: {
            gte: prevMonthStart,
            lt: prevMonthEnd,
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
          studentId: true,
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
      this.prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paymentDate: 'desc' },
        take: 6,
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          method: true,
          student: {
            select: {
              name: true,
              course: { select: { name: true } },
            },
          },
          payerName: true,
        },
      }),
      this.prisma.course.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          students: {
            where: { deletedAt: null },
            select: {
              id: true,
              charges: {
                where: { deletedAt: null },
                select: { amount: true, paidAmount: true, status: true },
              },
            },
          },
        },
      }),
    ]);

    const totalOverdueDebt = overdueCharges.reduce(
      (total, charge) => total + Math.max(charge.amount - charge.paidAmount, 0),
      0,
    );

    const overdueStudentIds = new Set(overdueCharges.map((c) => c.studentId));
    const alumnosMorososCount = overdueStudentIds.size;
    const alumnosAlDiaCount = Math.max(0, totalActiveStudents - alumnosMorososCount);

    const revenueByMonth = MONTH_LABELS.map((month) => ({
      month,
      total: 0,
    }));

    let yearToDateRevenue = 0;
    for (const payment of paymentsThisYear) {
      yearToDateRevenue += payment.amount;
      const monthIndex = payment.paymentDate.getMonth();
      revenueByMonth[monthIndex].total += payment.amount;
    }

    const totalExpectedRevenue = totalExpectedRevenueResult._sum.amount ?? 0;
    const currentMonthRevenue = currentMonthRevenueResult._sum.amount ?? 0;
    const prevMonthRevenue = prevMonthRevenueResult._sum.amount ?? 0;
    const currentMonthTransactions = currentMonthRevenueResult._count.id ?? 0;

    const collectionRate =
      totalExpectedRevenue > 0
        ? Math.round((yearToDateRevenue / totalExpectedRevenue) * 100)
        : 100;

    const monthOverMonthGrowth =
      prevMonthRevenue > 0
        ? Math.round(
            ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100,
          )
        : currentMonthRevenue > 0
          ? 100
          : 0;

    // Top Courses by Collection
    const topCourses = coursesWithCharges
      .map((c) => {
        let expected = 0;
        let collected = 0;
        let overdue = 0;

        for (const student of c.students) {
          for (const charge of student.charges) {
            expected += charge.amount;
            collected += charge.paidAmount;
            if (charge.status === 'OVERDUE') {
              overdue += Math.max(0, charge.amount - charge.paidAmount);
            }
          }
        }

        const rate =
          expected > 0 ? Math.round((collected / expected) * 100) : 100;

        return {
          courseId: c.id,
          courseName: c.name,
          totalStudents: c.students.length,
          expectedRevenue: expected,
          collectedRevenue: collected,
          overdueDebt: overdue,
          collectionRate: rate,
        };
      })
      .sort((a, b) => b.collectedRevenue - a.collectedRevenue)
      .slice(0, 5);

    const formattedRecentPayments = recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      paymentDate: p.paymentDate.toISOString(),
      method: p.method,
      studentName: p.student.name,
      courseName: p.student.course?.name ?? '—',
      payerName: p.payerName ?? 'Apoderado',
    }));

    return {
      totalActiveStudents,
      totalCourses,
      currentMonthRevenue,
      prevMonthRevenue,
      monthOverMonthGrowth,
      currentMonthTransactions,
      yearToDateRevenue,
      totalOverdueDebt,
      totalExpectedRevenue,
      collectionRate,
      alumnosAlDiaCount,
      alumnosMorososCount,
      revenueByMonth,
      topCourses,
      recentPayments: formattedRecentPayments,
    };
  }
}
