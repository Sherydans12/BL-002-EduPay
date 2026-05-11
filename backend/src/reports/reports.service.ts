import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  CHECK: 'Cheque',
  TRANSFER: 'Transferencia',
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(startDate?: string, endDate?: string, courseId?: string) {
    const where: any = {};

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
        courseId: Number(courseId),
      };
    }

    // 1. Total recaudado y conteo de transacciones
    const aggregations = await this.prisma.payment.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    // 2. Subtotales agrupados por m\u00e9todo de pago
    const groupByMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      totalCollected: aggregations._sum.amount || 0,
      totalTransactions: aggregations._count.id || 0,
      byMethod: groupByMethod.map(item => ({
        method: item.method,
        total: item._sum.amount || 0,
        count: item._count.id || 0,
      })),
    };
  }

  /**
   * Ingresos agrupados por mes para los últimos N meses (12 por defecto).
   * Rellena con total=0 los meses sin pagos para garantizar una serie continua.
   */
  async getRevenueTrend(months = 12): Promise<{ month: string; total: number }[]> {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const payments = await this.prisma.payment.findMany({
      where: { paymentDate: { gte: startDate } },
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
      const label = d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
      result.push({ month: label, total: grouped.get(key) ?? 0 });
    }
    return result;
  }

  /**
   * Genera un XLSX multi-hoja con:
   *  - Hoja 1: Resumen global
   *  - Hoja 2: Detalle por método de pago
   *  - Hoja 3: Detalle por curso
   */
  async exportToXlsx(
    startDate?: string,
    endDate?: string,
    courseId?: string,
  ): Promise<Buffer> {
    const where: any = {};
    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }
    if (courseId) where.student = { courseId: Number(courseId) };

    const [aggregations, groupByMethod, payments] = await Promise.all([
      this.prisma.payment.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        include: { student: { include: { course: true } } },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BL-002 Sistema Escolar';
    wb.created = new Date();

    const HEADER_BG = 'FF1E3A5F';
    const HEADER_FG = 'FFFFFFFF';
    const HEADER_BORDER = 'FF2563EB';
    const ALT_BG = 'FFF0F4F8';
    const ROW_BORDER = 'FFE2E8F0';

    const styleSheet = (
      sheet: ExcelJS.Worksheet,
      columns: { header: string; key: string; width: number; numFmt?: string }[],
    ) => {
      sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
      const hRow = sheet.getRow(1);
      hRow.height = 22;
      hRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { bottom: { style: 'medium', color: { argb: HEADER_BORDER } } };
      });
      sheet.eachRow((row, rn) => {
        if (rn === 1) return;
        row.eachCell({ includeEmpty: true }, (cell, cn) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rn % 2 === 0 ? ALT_BG : 'FFFFFFFF' },
          };
          cell.border = { bottom: { style: 'thin', color: { argb: ROW_BORDER } } };
          const col = columns[cn - 1];
          if (col?.numFmt) cell.numFmt = col.numFmt;
        });
      });
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    };

    // ── Sheet 1: Resumen Global ──────────────────────────────────
    const rangeLabel =
      startDate && endDate ? `${startDate} — ${endDate}`
        : startDate ? `Desde ${startDate}`
          : endDate ? `Hasta ${endDate}`
            : 'Todos los períodos';

    const s1 = wb.addWorksheet('Resumen Global');
    s1.columns = [
      { header: 'Indicador', key: 'indicador', width: 35 },
      { header: 'Valor', key: 'valor', width: 25 },
    ];
    const h1 = s1.getRow(1);
    h1.height = 22;
    h1.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: HEADER_BORDER } } };
    });
    s1.addRow({ indicador: 'Período', valor: rangeLabel });
    s1.addRow({ indicador: 'Total Recaudado', valor: aggregations._sum.amount ?? 0 });
    s1.addRow({ indicador: 'Total Transacciones', valor: aggregations._count.id ?? 0 });
    s1.getCell('B3').numFmt = '"$"#,##0';

    // ── Sheet 2: Por Método ──────────────────────────────────────
    const s2 = wb.addWorksheet('Por Método');
    groupByMethod.forEach((item) =>
      s2.addRow({
        metodo: METHOD_LABELS[item.method] ?? item.method,
        transacciones: item._count.id,
        total: item._sum.amount ?? 0,
      }),
    );
    styleSheet(s2, [
      { header: 'Método de Pago', key: 'metodo', width: 22 },
      { header: 'Transacciones', key: 'transacciones', width: 16 },
      { header: 'Total Recaudado', key: 'total', width: 20, numFmt: '"$"#,##0' },
    ]);

    // ── Sheet 3: Por Curso ───────────────────────────────────────
    const grouped: Record<string, { courseName: string; total: number; count: number }> = {};
    for (const p of payments) {
      const key = String(p.student.course.id);
      if (!grouped[key]) grouped[key] = { courseName: p.student.course.name, total: 0, count: 0 };
      grouped[key].total += p.amount;
      grouped[key].count += 1;
    }

    const s3 = wb.addWorksheet('Por Curso');
    Object.values(grouped)
      .sort((a, b) => b.total - a.total)
      .forEach((v) => s3.addRow({ curso: v.courseName, transacciones: v.count, total: v.total }));
    styleSheet(s3, [
      { header: 'Curso', key: 'curso', width: 30 },
      { header: 'Transacciones', key: 'transacciones', width: 16 },
      { header: 'Total Recaudado', key: 'total', width: 20, numFmt: '"$"#,##0' },
    ]);

    const rawBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(rawBuffer as ArrayBuffer);
  }
}
