import * as ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  /** Number format string, e.g. '"$"#,##0' for currency */
  numFmt?: string;
}

const HEADER_BG = 'FF1E3A5F';
const HEADER_FG = 'FFFFFFFF';
const ROW_ALT_BG = 'FFF0F4F8';
const ROW_BORDER = 'FFE2E8F0';
const HEADER_BORDER = 'FF2563EB';

/** Excel worksheet names: max 31 chars, no \ / ? * [ ] : */
export function sanitizeExcelSheetName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\]\[\\\/\?\*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned.length > 0 ? cleaned : fallback;
  return base.length > 31 ? base.slice(0, 31) : base;
}

function uniqueTabName(baseSanitized: string, used: Set<string>): string {
  let candidate = baseSanitized;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate =
      baseSanitized.slice(0, Math.max(1, 31 - suffix.length)) + suffix;
    n++;
  }
  used.add(candidate);
  return candidate;
}

function fillStyledSheet(
  sheet: ExcelJS.Worksheet,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
): void {
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 20,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_BG },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: false,
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: HEADER_BORDER } },
    };
  });

  rows.forEach((rowData) => sheet.addRow(rowData));

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const fillColor = rowNumber % 2 === 0 ? ROW_ALT_BG : 'FFFFFFFF';
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillColor },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: ROW_BORDER } },
      };
      const col = columns[colNumber - 1];
      if (col?.numFmt) cell.numFmt = col.numFmt;
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildWorkbook(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BL-002 Sistema Escolar';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  fillStyledSheet(sheet, columns, rows);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface MultiSheetSpec {
  /** Nombre de pestaña (debe ser único; usar sanitizeExcelSheetName antes) */
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
}

/**
 * Un libro con varias hojas, cada una con el mismo esquema de columnas permitido por hoja.
 */
export async function buildMultiSheetWorkbook(
  sheets: MultiSheetSpec[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BL-002 Sistema Escolar';
  workbook.created = new Date();

  const usedNames = new Set<string>();

  if (sheets.length === 0) {
    const sheet = workbook.addWorksheet('Info');
    fillStyledSheet(
      sheet,
      [{ header: 'Mensaje', key: 'mensaje', width: 50 }],
      [{ mensaje: 'No hay cursos activos para exportar.' }],
    );
  } else {
    for (const spec of sheets) {
      const tabName = uniqueTabName(spec.name, usedNames);
      const sheet = workbook.addWorksheet(tabName);
      fillStyledSheet(sheet, spec.columns, spec.rows);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
