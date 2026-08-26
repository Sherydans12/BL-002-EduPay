import { Injectable } from '@nestjs/common';
import { ChargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isMatriculaConcept } from '../common/concepts/concept-classifier.helper';

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
      yearCharges,
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
          createdAt: {
            gte: yearStart,
            lt: nextYearStart,
          },
        },
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          dueDate: true,
          status: true,
          studentId: true,
          concept: { select: { name: true } },
        },
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
                select: {
                  amount: true,
                  paidAmount: true,
                  dueDate: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Segmentación Blindada de Cargos (Matrículas vs Mensualidades / Otros)
    let totalOverdueDebt = 0;
    const overdueStudentIds = new Set<number>();
    let totalExpectedRevenue = 0;

    // Métricas específicas de Matrícula
    const matriculaStudentMap = new Map<
      number,
      { expected: number; paid: number }
    >();

    // Métricas específicas de Mensualidades
    let monthlyExpected = 0;
    let monthlyCollected = 0;
    let monthlyOverdue = 0;

    for (const charge of yearCharges) {
      totalExpectedRevenue += charge.amount;
      const isDue = charge.dueDate <= now;
      const pending = Math.max(0, charge.amount - charge.paidAmount);
      const isOverdue =
        charge.status === ChargeStatus.OVERDUE || (isDue && pending > 0);

      if (isOverdue) {
        totalOverdueDebt += pending;
        overdueStudentIds.add(charge.studentId);
      }

      const isMatr = isMatriculaConcept(charge.concept?.name);

      if (isMatr) {
        const current = matriculaStudentMap.get(charge.studentId) || {
          expected: 0,
          paid: 0,
        };
        current.expected += charge.amount;
        current.paid += charge.paidAmount;
        matriculaStudentMap.set(charge.studentId, current);
      } else {
        monthlyExpected += charge.amount;
        monthlyCollected += charge.paidAmount;
        if (isOverdue) {
          monthlyOverdue += pending;
        }
      }
    }

    // Cálculo consolidado de Salud de Matrícula
    let matriculaPaidStudentsCount = 0;
    let matriculaPendingStudentsCount = 0;
    let matriculaTotalExpected = 0;
    let matriculaTotalCollected = 0;

    for (const [, val] of matriculaStudentMap) {
      matriculaTotalExpected += val.expected;
      matriculaTotalCollected += val.paid;
      if (val.paid >= val.expected && val.expected > 0) {
        matriculaPaidStudentsCount++;
      } else {
        matriculaPendingStudentsCount++;
      }
    }

    const matriculaStudentsTotal = matriculaStudentMap.size;
    const matriculaHealthRate =
      matriculaStudentsTotal > 0
        ? Math.round(
            (matriculaPaidStudentsCount / matriculaStudentsTotal) * 100,
          )
        : 100;

    // Cálculo consolidado de Salud de Mensualidades
    const monthlyHealthRate =
      monthlyExpected > 0
        ? Math.round((monthlyCollected / monthlyExpected) * 100)
        : 100;

    // Alumnos al día vs morosos
    const alumnosMorososCount = overdueStudentIds.size;
    const alumnosAlDiaCount = Math.max(
      0,
      totalActiveStudents - alumnosMorososCount,
    );

    // Ingresos mensuales
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
            const isDue = charge.dueDate <= now;
            const pending = Math.max(0, charge.amount - charge.paidAmount);
            if (
              charge.status === ChargeStatus.OVERDUE ||
              (isDue && pending > 0)
            ) {
              overdue += pending;
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
      matriculaBreakdown: {
        totalStudentsWithMatricula: matriculaStudentsTotal,
        paidStudentsCount: matriculaPaidStudentsCount,
        pendingStudentsCount: matriculaPendingStudentsCount,
        totalExpectedAmount: matriculaTotalExpected,
        totalCollectedAmount: matriculaTotalCollected,
        healthRate: matriculaHealthRate,
      },
      mensualidadesBreakdown: {
        totalExpectedAmount: monthlyExpected,
        totalCollectedAmount: monthlyCollected,
        totalOverdueAmount: monthlyOverdue,
        healthRate: monthlyHealthRate,
      },
    };
  }
}
