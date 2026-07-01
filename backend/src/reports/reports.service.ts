import { Injectable } from '@nestjs/common';
import * as exceljs from 'exceljs';
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
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    if (courseId) {
      where.student = {
        deletedAt: null,
        courseId: Number(courseId),
      };
    } else {
      where.student = { deletedAt: null };
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
        student: { deletedAt: null },
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
      const course = await this.prisma.course.findFirst({
        where: { id: courseId, deletedAt: null },
        select: { name: true },
      });
      courseLabel = course?.name;
    }

    let studentLabel: string | undefined;
    if (studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, deletedAt: null },
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

  async generateMonthlyReport(
    startDate?: string,
    endDate?: string,
  ): Promise<Buffer> {
    const workbook = new exceljs.Workbook();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const paymentDateFilter: Prisma.DateTimeFilter =
      startDate || endDate
        ? {
            ...(startDate
              ? { gte: new Date(`${startDate}T00:00:00.000Z`) }
              : {}),
            ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
          }
        : {
            gte: monthStart,
            lt: nextMonthStart,
          };

    const incomeSheet = workbook.addWorksheet('Ingresos');
    incomeSheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'N° Boleta', key: 'boleta', width: 18 },
      { header: 'Alumno', key: 'alumno', width: 32 },
      { header: 'Monto', key: 'monto', width: 16 },
      { header: 'Método', key: 'metodo', width: 16 },
    ];

    const payments = await this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        paymentGroup: { is: { deletedAt: null } },
        paymentDate: paymentDateFilter,
        student: { deletedAt: null },
      },
      include: {
        student: true,
        paymentGroup: true,
      },
      orderBy: { paymentDate: 'asc' },
    });

    payments.forEach((payment) => {
      incomeSheet.addRow({
        fecha: payment.paymentDate,
        boleta:
          payment.paymentGroup?.boletaNumber ?? payment.boletaNumber ?? '',
        alumno: payment.student.name,
        monto: payment.amount,
        metodo: payment.paymentGroup?.method ?? payment.method,
      });
    });

    const overdueSheet = workbook.addWorksheet('Morosidad Actual');
    overdueSheet.columns = [
      { header: 'Alumno', key: 'alumno', width: 32 },
      { header: 'Apoderado', key: 'apoderado', width: 32 },
      { header: 'Teléfono (para cobranza)', key: 'telefono', width: 24 },
      { header: 'Concepto', key: 'concepto', width: 28 },
      { header: 'Fecha Vencimiento', key: 'fechaVencimiento', width: 20 },
      { header: 'Saldo Pendiente', key: 'saldoPendiente', width: 18 },
    ];

    const overdueCharges = await this.prisma.charge.findMany({
      where: {
        deletedAt: null,
        status: 'OVERDUE',
        student: {
          deletedAt: null,
          guardian: { deletedAt: null },
        },
      },
      include: {
        student: {
          include: {
            guardian: true,
          },
        },
        concept: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    overdueCharges.forEach((charge) => {
      overdueSheet.addRow({
        alumno: charge.student.name,
        apoderado: charge.student.guardian.name,
        telefono: charge.student.guardian.phone ?? '',
        concepto: charge.concept.name,
        fechaVencimiento: charge.dueDate,
        saldoPendiente: Math.max(0, charge.amount - charge.paidAmount),
      });
    });

    [incomeSheet, overdueSheet].forEach((worksheet) => {
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5E7EB' },
        };
      });
    });

    incomeSheet.getColumn('fecha').numFmt = 'dd-mm-yyyy';
    incomeSheet.getColumn('monto').numFmt = '"$"#,##0';
    overdueSheet.getColumn('fechaVencimiento').numFmt = 'dd-mm-yyyy';
    overdueSheet.getColumn('saldoPendiente').numFmt = '"$"#,##0';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
