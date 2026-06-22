import * as ExcelJS from 'exceljs';
import { formatPaymentCalendarDateEsCl } from '../format-payment-calendar-date';

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
const ZEBRA_WHITE = 'FFFFFFFF';
const ZEBRA_ALT = 'FFF8FAFC';
const ROW_BORDER = 'FFE2E8F0';
const CURRENCY_FMT = '$#,##0';

/** Columnas A–H: bloque de cabecera de transacción (se combinan verticalmente). */
const MERGE_COL_END = 8;

const HEADERS = [
  'ID Transacción',
  'Fecha Transacción',
  'Monto Total Transacción',
  'Método de Pago',
  'N° Boleta',
  'Notas Transacción',
  'Cantidad de Líneas',
  'Tipo Transacción',
  'Alumno',
  'RUT Alumno',
  'Curso',
  'Concepto',
  'Monto Línea',
  'Pagador',
  'RUT Pagador',
  'Referencia',
] as const;

const COL_WIDTHS = [
  14, 16, 18, 16, 14, 28, 10, 14, 32, 16, 22, 22, 14, 28, 16, 20,
];

export type PaymentGroupExportPayload = {
  id: number;
  totalAmount: number;
  method: string;
  paymentDate: Date;
  boletaNumber: string | null;
  notes: string | null;
  payments: Array<{
    id: number;
    amount: number;
    payerName: string | null;
    payerRut: string | null;
    referenceCode: string | null;
    student: {
      name: string;
      rut: string;
      course: { name: string };
      guardian?: { name: string } | null;
    };
    concept: { name: string } | null;
  }>;
};

function linePayerLabel(
  line: PaymentGroupExportPayload['payments'][0],
): string {
  if (line.payerName?.trim()) return line.payerName.trim();
  return line.student.guardian?.name ?? 'Apoderado';
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: ROW_BORDER } },
    left: { style: 'thin', color: { argb: ROW_BORDER } },
    bottom: { style: 'thin', color: { argb: ROW_BORDER } },
    right: { style: 'thin', color: { argb: ROW_BORDER } },
  };
}

function applyCellStyle(
  cell: ExcelJS.Cell,
  opts: {
    fillArgb: string;
    numFmt?: string;
    align?: Partial<ExcelJS.Alignment>;
  },
): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.fillArgb },
  };
  cell.border = thinBorder();
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  if (opts.align) cell.alignment = opts.align;
}

function writeHeaderRow(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  HEADERS.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_BG },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: HEADER_BORDER } },
    };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Rellena una hoja con grupos de pago usando cabecera-detalle y merge vertical (A–H).
 */
export function fillPaymentGroupsMergedSheet(
  sheet: ExcelJS.Worksheet,
  groups: PaymentGroupExportPayload[],
): void {
  HEADERS.forEach((_, i) => {
    sheet.getColumn(i + 1).width = COL_WIDTHS[i] ?? 18;
  });
  writeHeaderRow(sheet);

  let currentRow = 2;

  groups.forEach((group, groupIndex) => {
    const lines = group.payments.length > 0 ? group.payments : [];
    const N = Math.max(lines.length, 1);
    const startRow = currentRow;
    const endRow = currentRow + N - 1;
    const zebraBg = groupIndex % 2 === 0 ? ZEBRA_WHITE : ZEBRA_ALT;
    const tipo = N === 1 && lines.length === 1 ? 'Individual' : 'Agrupada';

    const headerValues: (string | number)[] = [
      group.id,
      formatPaymentCalendarDateEsCl(group.paymentDate),
      group.totalAmount,
      METHOD_LABELS[group.method] ?? group.method,
      group.boletaNumber ?? '',
      group.notes ?? '',
      lines.length || 0,
      lines.length === 0 ? '—' : tipo,
    ];

    for (let i = 0; i < N; i++) {
      const rowNum = currentRow + i;
      const row = sheet.getRow(rowNum);
      row.height = 20;
      const line = lines[i];

      if (line) {
        const lineCells: (string | number)[] = [
          line.student.name,
          line.student.rut,
          line.student.course.name,
          line.concept?.name ?? '—',
          line.amount,
          linePayerLabel(line),
          line.payerRut ?? '',
          line.referenceCode ?? '',
        ];
        lineCells.forEach((val, idx) => {
          const col = MERGE_COL_END + 1 + idx;
          const cell = row.getCell(col);
          cell.value = val;
          const isMoney = col === 13;
          applyCellStyle(cell, {
            fillArgb: zebraBg,
            numFmt: isMoney ? CURRENCY_FMT : undefined,
            align: isMoney
              ? { vertical: 'middle', horizontal: 'right' }
              : { vertical: 'middle', horizontal: 'left' },
          });
        });
      } else {
        for (let col = MERGE_COL_END + 1; col <= HEADERS.length; col++) {
          const cell = row.getCell(col);
          cell.value = '—';
          applyCellStyle(cell, {
            fillArgb: zebraBg,
            align: { vertical: 'middle', horizontal: 'center' },
          });
        }
      }

      for (let col = 1; col <= MERGE_COL_END; col++) {
        const cell = row.getCell(col);
        if (i === 0) {
          const val = headerValues[col - 1];
          cell.value = val;
          const isMoney = col === 3;
          applyCellStyle(cell, {
            fillArgb: zebraBg,
            numFmt: isMoney ? CURRENCY_FMT : undefined,
            align: { vertical: 'middle', horizontal: 'center' },
          });
        } else {
          applyCellStyle(cell, {
            fillArgb: zebraBg,
            align: { vertical: 'middle', horizontal: 'center' },
          });
        }
      }
    }

    if (N > 1) {
      for (let col = 1; col <= MERGE_COL_END; col++) {
        sheet.mergeCells(startRow, col, endRow, col);
        const master = sheet.getCell(startRow, col);
        master.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
      }
    }

    currentRow = endRow + 1;
  });

  if (groups.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: HEADERS.length },
    };
  }
}

export async function buildPaymentGroupsWorkbookBuffer(
  groups: PaymentGroupExportPayload[],
  sheetName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BL-002 Sistema Escolar';
  wb.created = new Date();
  const sheet = wb.addWorksheet(sheetName);
  fillPaymentGroupsMergedSheet(sheet, groups);
  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}
