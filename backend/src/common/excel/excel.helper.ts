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

export async function buildWorkbook(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BL-002 Sistema Escolar';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 20,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_BG },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      bottom: { style: 'medium', color: { argb: HEADER_BORDER } },
    };
  });

  // Add data rows
  rows.forEach((rowData) => sheet.addRow(rowData));

  // Apply number formats and alternate row fill
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

  // Auto-filter and freeze header
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
