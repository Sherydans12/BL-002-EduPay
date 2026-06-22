import * as ExcelJS from 'exceljs';
import {
  fillPaymentGroupsMergedSheet,
  type PaymentGroupExportPayload,
} from './payment-groups-sheet.export';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  CHECK: 'Cheque',
  TRANSFER: 'Transferencia',
};

const HEADER_BG = 'FF1E293B';
const HEADER_FG = 'FFFFFFFF';
const HEADER_BORDER = 'FF334155';
const ALT_BG = 'FFF8FAFC';
const ROW_BORDER = 'FFE2E8F0';
const CURRENCY_FMT = '$#,##0';
const ACCENT_BG = 'FFEFF6FF';

export type ReportExportMeta = {
  periodLabel: string;
  courseLabel?: string;
  studentLabel?: string;
  totalCollected: number;
  transactionCount: number;
  lineCount: number;
  averagePerTransaction: number;
};

export type ReportAggregateRow = {
  label: string;
  transactions: number;
  lines: number;
  total: number;
};

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: ROW_BORDER } },
    left: { style: 'thin', color: { argb: ROW_BORDER } },
    bottom: { style: 'thin', color: { argb: ROW_BORDER } },
    right: { style: 'thin', color: { argb: ROW_BORDER } },
  };
}

function styleTableHeader(sheet: ExcelJS.Worksheet, colCount: number): void {
  const hRow = sheet.getRow(1);
  hRow.height = 24;
  for (let c = 1; c <= colCount; c++) {
    const cell = hRow.getCell(c);
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_BG },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: HEADER_BORDER } },
    };
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function fillAggregateTable(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  widths: number[],
  rows: ReportAggregateRow[],
): void {
  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = widths[i];
    sheet.getRow(1).getCell(i + 1).value = h;
  });
  styleTableHeader(sheet, headers.length);

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const row = sheet.getRow(rowNum);
    const fillArgb = idx % 2 === 0 ? 'FFFFFFFF' : ALT_BG;
    const values = [r.label, r.transactions, r.lines, r.total];
    values.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = val;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillArgb },
      };
      cell.border = thinBorder();
      cell.alignment = {
        vertical: 'middle',
        horizontal: ci === 0 ? 'left' : 'center',
      };
      if (ci === 3) cell.numFmt = CURRENCY_FMT;
    });
  });

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
  }
}

function fillResumenGeneralSheet(
  sheet: ExcelJS.Worksheet,
  meta: ReportExportMeta,
): void {
  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 28;

  sheet.mergeCells('A1:B1');
  const title = sheet.getCell('A1');
  title.value = 'Resumen General de Recaudación';
  title.font = { bold: true, size: 18, color: { argb: HEADER_FG } };
  title.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_BG },
  };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 36;

  const filters: [string, string][] = [['Período', meta.periodLabel]];
  if (meta.courseLabel) filters.push(['Curso', meta.courseLabel]);
  if (meta.studentLabel) filters.push(['Alumno', meta.studentLabel]);

  let row = 3;
  for (const [label, value] of filters) {
    sheet.getRow(row).height = 22;
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
    sheet.getCell(`B${row}`).value = value;
    row++;
  }

  row += 1;
  const kpis: [string, number, boolean][] = [
    ['Total Recaudado', meta.totalCollected, true],
    ['N° Transacciones', meta.transactionCount, false],
    ['N° Líneas de Pago', meta.lineCount, false],
    ['Promedio por Transacción', meta.averagePerTransaction, true],
  ];

  for (const [label, value, isCurrency] of kpis) {
    sheet.mergeCells(`A${row}:A${row + 1}`);
    sheet.mergeCells(`B${row}:B${row + 1}`);
    sheet.getRow(row).height = 28;
    sheet.getRow(row + 1).height = 28;

    const labelCell = sheet.getCell(`A${row}`);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 12, color: { argb: 'FF475569' } };
    labelCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: ACCENT_BG },
    };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    labelCell.border = thinBorder();

    const valueCell = sheet.getCell(`B${row}`);
    valueCell.value = value;
    valueCell.font = { bold: true, size: 20, color: { argb: 'FF0F172A' } };
    valueCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' },
    };
    valueCell.alignment = { vertical: 'middle', horizontal: 'right' };
    valueCell.border = thinBorder();
    if (isCurrency) valueCell.numFmt = CURRENCY_FMT;

    row += 3;
  }
}

export async function buildReportsWorkbookBuffer(
  meta: ReportExportMeta,
  byMethod: ReportAggregateRow[],
  byCourse: ReportAggregateRow[],
  byConcept: ReportAggregateRow[],
  groups: PaymentGroupExportPayload[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BL-002 Sistema Escolar';
  wb.created = new Date();

  fillResumenGeneralSheet(wb.addWorksheet('Resumen General'), meta);

  const methodSheet = wb.addWorksheet('Por Método');
  fillAggregateTable(
    methodSheet,
    ['Método de Pago', 'Transacciones', 'Líneas', 'Total Recaudado'],
    [24, 16, 12, 20],
    byMethod,
  );

  const courseSheet = wb.addWorksheet('Por Curso');
  fillAggregateTable(
    courseSheet,
    ['Curso', 'Transacciones', 'Líneas', 'Total Recaudado'],
    [32, 16, 12, 20],
    byCourse,
  );

  const conceptSheet = wb.addWorksheet('Por Concepto');
  fillAggregateTable(
    conceptSheet,
    ['Concepto', 'Transacciones', 'Líneas', 'Total Recaudado'],
    [28, 16, 12, 20],
    byConcept,
  );

  fillPaymentGroupsMergedSheet(
    wb.addWorksheet('Detalle de Transacciones'),
    groups,
  );

  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export function aggregateGroupsByMethod(
  groups: PaymentGroupExportPayload[],
): ReportAggregateRow[] {
  const map = new Map<
    string,
    { transactions: number; lines: number; total: number }
  >();
  for (const g of groups) {
    const label = METHOD_LABELS[g.method] ?? g.method;
    const prev = map.get(label) ?? { transactions: 0, lines: 0, total: 0 };
    prev.transactions += 1;
    prev.lines += g.payments.length;
    prev.total += g.totalAmount;
    map.set(label, prev);
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      transactions: v.transactions,
      lines: v.lines,
      total: v.total,
    }))
    .sort((a, b) => b.total - a.total);
}

export function aggregateGroupsByCourse(
  groups: PaymentGroupExportPayload[],
): ReportAggregateRow[] {
  const map = new Map<
    string,
    { transactions: Set<number>; lines: number; total: number }
  >();
  for (const g of groups) {
    for (const p of g.payments) {
      const label = p.student.course.name;
      const prev = map.get(label) ?? {
        transactions: new Set<number>(),
        lines: 0,
        total: 0,
      };
      prev.transactions.add(g.id);
      prev.lines += 1;
      prev.total += p.amount;
      map.set(label, prev);
    }
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      transactions: v.transactions.size,
      lines: v.lines,
      total: v.total,
    }))
    .sort((a, b) => b.total - a.total);
}

export function aggregateGroupsByConcept(
  groups: PaymentGroupExportPayload[],
): ReportAggregateRow[] {
  const map = new Map<
    string,
    { transactions: Set<number>; lines: number; total: number }
  >();
  for (const g of groups) {
    for (const p of g.payments) {
      const label = p.concept?.name ?? 'Sin concepto';
      const prev = map.get(label) ?? {
        transactions: new Set<number>(),
        lines: 0,
        total: 0,
      };
      prev.transactions.add(g.id);
      prev.lines += 1;
      prev.total += p.amount;
      map.set(label, prev);
    }
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      transactions: v.transactions.size,
      lines: v.lines,
      total: v.total,
    }))
    .sort((a, b) => b.total - a.total);
}

export function buildPeriodLabel(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo) return `${dateFrom} — ${dateTo}`;
  if (dateFrom) return `Desde ${dateFrom}`;
  if (dateTo) return `Hasta ${dateTo}`;
  return 'Todos los períodos';
}
