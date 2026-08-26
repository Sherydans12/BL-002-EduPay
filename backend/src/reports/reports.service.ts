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
  type CourseMatrixGroup,
  type FeeQuotaItem,
  type FeeQuotaStatus,
  type SchoolFeeMatrixExportData,
  type StudentMatrixItem,
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

  async getSchoolFeeMatrix(
    year = new Date().getFullYear(),
    courseId?: number,
    statusFilter?: string,
    search?: string,
  ): Promise<SchoolFeeMatrixExportData> {
    const now = new Date();
    const courses = await this.prisma.course.findMany({
      where: {
        deletedAt: null,
        ...(courseId ? { id: courseId } : {}),
      },
      select: {
        id: true,
        name: true,
        students: {
          where: {
            deletedAt: null,
            ...(search?.trim()
              ? {
                  OR: [
                    { name: { contains: search.trim(), mode: 'insensitive' } },
                    { rut: { contains: search.trim(), mode: 'insensitive' } },
                    {
                      guardian: {
                        name: {
                          contains: search.trim(),
                          mode: 'insensitive',
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            rut: true,
            guardian: {
              select: {
                name: true,
                phone: true,
                email: true,
              },
            },
            charges: {
              where: { deletedAt: null },
              select: {
                id: true,
                amount: true,
                paidAmount: true,
                dueDate: true,
                status: true,
                concept: {
                  select: { id: true, name: true },
                },
              },
              orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const monthMap: Record<
      number,
      keyof Pick<
        StudentMatrixItem,
        | 'marzo'
        | 'abril'
        | 'mayo'
        | 'junio'
        | 'julio'
        | 'agosto'
        | 'septiembre'
        | 'octubre'
        | 'noviembre'
        | 'diciembre'
      >
    > = {
      2: 'marzo',
      3: 'abril',
      4: 'mayo',
      5: 'junio',
      6: 'julio',
      7: 'agosto',
      8: 'septiembre',
      9: 'octubre',
      10: 'noviembre',
      11: 'diciembre',
    };

    const courseGroups: CourseMatrixGroup[] = [];
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalStudents = 0;
    let totalAlDia = 0;
    let totalMorosos = 0;
    let totalSaldoAFavor = 0;

    for (const course of courses) {
      const studentItems: StudentMatrixItem[] = [];
      let courseInvoiced = 0;
      let coursePaid = 0;
      let coursePending = 0;
      let courseAlDia = 0;
      let courseMorosos = 0;
      let courseSaldoAFavor = 0;

      for (const student of course.students) {
        totalStudents++;
        const emptyQuota = (): FeeQuotaItem => ({
          status: 'NONE',
          amount: 0,
          paidAmount: 0,
          dueDate: null,
        });

        const quotas: Record<string, FeeQuotaItem> = {
          matricula: emptyQuota(),
          marzo: emptyQuota(),
          abril: emptyQuota(),
          mayo: emptyQuota(),
          junio: emptyQuota(),
          julio: emptyQuota(),
          agosto: emptyQuota(),
          septiembre: emptyQuota(),
          octubre: emptyQuota(),
          noviembre: emptyQuota(),
          diciembre: emptyQuota(),
        };

        let studentInvoiced = 0;
        let studentPaid = 0;
        let studentOverdue = 0;

        for (const charge of student.charges) {
          studentInvoiced += charge.amount;
          studentPaid += charge.paidAmount;
          const pending = Math.max(charge.amount - charge.paidAmount, 0);

          let status: FeeQuotaStatus = 'NONE';
          if (charge.paidAmount >= charge.amount || charge.status === 'PAID') {
            status = 'PAID';
          } else if (charge.paidAmount > 0) {
            status = 'PARTIAL';
          } else if (charge.dueDate <= now || charge.status === 'OVERDUE') {
            status = 'OVERDUE';
            studentOverdue += pending;
          } else {
            status = 'PENDING';
          }

          const conceptNameNorm = charge.concept?.name?.toLowerCase() || '';
          const dueDateObj = new Date(charge.dueDate);
          const dueMonth = dueDateObj.getUTCMonth();

          const item: FeeQuotaItem = {
            status,
            amount: charge.amount,
            paidAmount: charge.paidAmount,
            dueDate: charge.dueDate ? charge.dueDate.toISOString() : null,
          };

          if (
            conceptNameNorm.includes('matr') ||
            conceptNameNorm.includes('matric')
          ) {
            quotas.matricula = item;
          } else if (
            conceptNameNorm.includes('marzo') ||
            (!conceptNameNorm.includes('abril') && dueMonth === 2)
          ) {
            quotas.marzo = item;
          } else if (conceptNameNorm.includes('abril') || dueMonth === 3) {
            quotas.abril = item;
          } else if (conceptNameNorm.includes('mayo') || dueMonth === 4) {
            quotas.mayo = item;
          } else if (conceptNameNorm.includes('junio') || dueMonth === 5) {
            quotas.junio = item;
          } else if (conceptNameNorm.includes('julio') || dueMonth === 6) {
            quotas.julio = item;
          } else if (conceptNameNorm.includes('agosto') || dueMonth === 7) {
            quotas.agosto = item;
          } else if (
            conceptNameNorm.includes('sept') ||
            conceptNameNorm.includes('set') ||
            dueMonth === 8
          ) {
            quotas.septiembre = item;
          } else if (conceptNameNorm.includes('oct') || dueMonth === 9) {
            quotas.octubre = item;
          } else if (conceptNameNorm.includes('nov') || dueMonth === 10) {
            quotas.noviembre = item;
          } else if (conceptNameNorm.includes('dic') || dueMonth === 11) {
            quotas.diciembre = item;
          } else if (monthMap[dueMonth]) {
            quotas[monthMap[dueMonth]] = item;
          }
        }

        const studentPending = Math.max(studentInvoiced - studentPaid, 0);
        let generalStatus: StudentMatrixItem['generalStatus'] = 'PENDIENTE';
        if (studentPaid > studentInvoiced) {
          generalStatus = 'SALDO_A_FAVOR';
          courseSaldoAFavor++;
          totalSaldoAFavor++;
        } else if (studentPending === 0 && studentInvoiced > 0) {
          generalStatus = 'AL_DIA';
          courseAlDia++;
          totalAlDia++;
        } else if (studentOverdue > 0) {
          generalStatus = 'MOROSO';
          courseMorosos++;
          totalMorosos++;
        }

        // Apply statusFilter if requested
        if (statusFilter && statusFilter !== 'ALL') {
          if (statusFilter === 'OVERDUE' && generalStatus !== 'MOROSO') continue;
          if (statusFilter === 'AL_DIA' && generalStatus !== 'AL_DIA') continue;
          if (
            statusFilter === 'SALDO_A_FAVOR' &&
            generalStatus !== 'SALDO_A_FAVOR'
          )
            continue;
        }

        courseInvoiced += studentInvoiced;
        coursePaid += studentPaid;
        coursePending += studentPending;

        studentItems.push({
          studentId: student.id,
          studentRut: student.rut,
          studentName: student.name,
          guardianName: student.guardian?.name ?? '—',
          guardianPhone: student.guardian?.phone ?? null,
          guardianEmail: student.guardian?.email ?? null,
          matricula: quotas.matricula,
          marzo: quotas.marzo,
          abril: quotas.abril,
          mayo: quotas.mayo,
          junio: quotas.junio,
          julio: quotas.julio,
          agosto: quotas.agosto,
          septiembre: quotas.septiembre,
          octubre: quotas.octubre,
          noviembre: quotas.noviembre,
          diciembre: quotas.diciembre,
          totalInvoiced: studentInvoiced,
          totalPaid: studentPaid,
          totalPending: studentPending,
          generalStatus,
        });
      }

      totalInvoiced += courseInvoiced;
      totalPaid += coursePaid;
      totalPending += coursePending;

      const courseCollectionRate =
        courseInvoiced > 0
          ? Math.round((coursePaid / courseInvoiced) * 100)
          : 100;

      courseGroups.push({
        courseId: course.id,
        courseName: course.name,
        students: studentItems,
        subtotalInvoiced: courseInvoiced,
        subtotalPaid: coursePaid,
        subtotalPending: coursePending,
        totalStudents: course.students.length,
        alDiaCount: courseAlDia,
        morosoCount: courseMorosos,
        saldoAFavorCount: courseSaldoAFavor,
        collectionRate: courseCollectionRate,
      });
    }

    const overallCollectionRate =
      totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 100;

    return {
      year,
      courses: courseGroups,
      totalInvoiced,
      totalPaid,
      totalPending,
      totalStudents,
      totalAlDia,
      totalMorosos,
      totalSaldoAFavor,
      collectionRate: overallCollectionRate,
    };
  }

  async exportToXlsx(filters: FilterPaymentsDto): Promise<Buffer> {
    const { dateFrom, dateTo, courseId, studentId, year } = filters;
    const [groups, matrixData] = await Promise.all([
      this.paymentsService.findAllGroupsForExport(filters),
      this.getSchoolFeeMatrix(year ?? new Date().getFullYear(), courseId),
    ]);

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
      matrixData,
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
