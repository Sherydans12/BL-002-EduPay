/**
 * ============================================================
 *  CLI — Importación Masiva desde Excel (Datos Sucios)
 *  Uso: npm run db:import  (desde la carpeta backend/)
 *
 *  Coloca tu archivo Excel en:
 *    backend/uploads/importacion.xlsx
 *
 *  El script detecta automáticamente:
 *   • El nombre del curso desde la Fila 1 de cada hoja
 *   • El formato de columnas desde la Fila 2 (cabeceras)
 *   • Los datos desde la Fila 3 en adelante
 *   • Procesa TODAS las hojas del archivo
 * ============================================================
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

/** Ruta al archivo Excel, relativa a la raíz del backend */
const EXCEL_FILE_PATH = path.resolve(__dirname, '..', 'uploads', 'importacion.xlsx');

/** Fila de cabeceras (siempre la 2 según el formato del colegio) */
const HEADER_ROW_INDEX = 2;

/** Los datos empiezan en la fila 3 */
const DATA_START_ROW = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lee el valor de una celda como string limpio */
function cellText(row: ExcelJS.Row, colIndex: number): string {
  const cell = row.getCell(colIndex);
  const raw = cell.text ?? String(cell.value ?? '');
  return raw.trim();
}

/**
 * Limpieza AGRESIVA de RUT: elimina absolutamente todo excepto dígitos y la letra K.
 * Maneja errores comunes de tipeo como: "27,.206.121-1", "12 345 678-9", "12.345.678K"
 * "27,.206.121-1"  →  "272061211"
 * "12.345.678-K"   →  "12345678K"
 */
function normalizeRut(rut: string): string {
  return rut.replace(/[^0-9kK]/gi, '').toUpperCase();
}

/** Valida que el RUT normalizado tenga una longitud mínima razonable */
function isValidNormalizedRut(rut: string): boolean {
  return /^[0-9]{6,8}[0-9K]$/.test(rut);
}

/** Detecta si un string parece un email válido */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ─── Detección dinámica de columnas ──────────────────────────────────────────

interface ColumnMap {
  /** Índice de la columna con el RUT del alumno */
  rut: number;
  /** Índice de la columna con el nombre (o primer nombre en Formato B) */
  nombre: number;
  /** Solo en Formato B: apellido paterno */
  apellidoPaterno?: number;
  /** Solo en Formato B: apellido materno */
  apellidoMaterno?: number;
  /** Columna de correo electrónico (del apoderado) */
  correo?: number;
  /** Columna de teléfono */
  telefono?: number;
  /**
   * A = nombre completo en una sola columna
   * B = nombre + apellido paterno + apellido materno en columnas separadas
   */
  formatType: 'A' | 'B';
}

/**
 * Escanea la fila de cabeceras (fila 2) y construye un mapa dinámico de columnas.
 * Detecta el formato basándose en si existen columnas de apellidos separados.
 */
function detectColumns(headerRow: ExcelJS.Row): ColumnMap {
  const headers: Array<{ col: number; text: string }> = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = (cell.text ?? String(cell.value ?? '')).trim().toUpperCase();
    if (text) headers.push({ col: colNumber, text });
  });

  /** Retorna el índice de la primera columna cuyo header incluye alguna keyword */
  const find = (...keywords: string[]): number | undefined => {
    for (const kw of keywords) {
      const match = headers.find((h) => h.text.includes(kw));
      if (match) return match.col;
    }
    return undefined;
  };

  const rutCol = find('RUT') ?? 1;
  const apellidoPaternoCol = find('PATERNO', 'AP. PATERNO', 'A. PATERNO', 'APE PATERNO');
  const apellidoMaternoCol = find('MATERNO', 'AP. MATERNO', 'A. MATERNO', 'APE MATERNO');
  const nombreCol = find('NOMBRE', 'ALUMNO', 'NOMBRE COMPLETO', 'NOMBRE ALUMNO') ?? 2;
  const correoCol = find('CORREO', 'EMAIL', 'E-MAIL', 'MAIL');
  const telefonoCol = find('TELÉFONO', 'TELEFONO', 'FONO', 'CELULAR', 'FONOS');

  // Formato B si existen columnas de apellidos separados
  const formatType: 'A' | 'B' = apellidoPaternoCol !== undefined ? 'B' : 'A';

  return {
    rut: rutCol,
    nombre: nombreCol,
    apellidoPaterno: apellidoPaternoCol,
    apellidoMaterno: apellidoMaternoCol,
    correo: correoCol,
    telefono: telefonoCol,
    formatType,
  };
}

/**
 * Extrae y construye el nombre completo del alumno según el formato detectado.
 *
 * Formato A: la columna de nombre ya contiene el nombre completo.
 * Formato B: concatena nombre + apellido paterno + apellido materno.
 */
function extractStudentName(row: ExcelJS.Row, cols: ColumnMap): string {
  if (cols.formatType === 'A') {
    return cellText(row, cols.nombre);
  }

  const nombre = cellText(row, cols.nombre);
  const apPaterno = cols.apellidoPaterno ? cellText(row, cols.apellidoPaterno) : '';
  const apMaterno = cols.apellidoMaterno ? cellText(row, cols.apellidoMaterno) : '';

  return [nombre, apPaterno, apMaterno]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Importación Masiva — Cursos, Apoderados, Alumnos');
  console.log('  Modo: detección dinámica + sanitización de datos sucios');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Archivo: ${EXCEL_FILE_PATH}`);
  console.log('');

  if (!fs.existsSync(EXCEL_FILE_PATH)) {
    console.error(`ERROR: No se encontró el archivo Excel en:\n  ${EXCEL_FILE_PATH}`);
    console.error('Asegúrate de copiar tu Excel como: backend/uploads/importacion.xlsx');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE_PATH);

  console.log(`  Total de hojas encontradas: ${workbook.worksheets.length}`);

  let totalStudentsCreated = 0;
  let totalStudentsUpdated = 0;
  let totalGuardiansCreated = 0;
  let totalCoursesCreated = 0;
  let totalErrors = 0;

  // ── Iterar sobre todas las hojas del libro ──────────────────────────────────
  for (const worksheet of workbook.worksheets) {
    console.log(`\n── Hoja: "${worksheet.name}" (${worksheet.rowCount} filas) ──────────────────`);

    // ── Paso 1: Extraer el nombre del curso desde la Fila 1 ─────────────────
    // Buscamos la primera celda no vacía de la fila 1 (puede ser A1, B1, C1, etc.)
    const titleRow = worksheet.getRow(1);
    let nombreCurso = '';
    titleRow.eachCell({ includeEmpty: false }, (cell) => {
      if (!nombreCurso) {
        const text = (cell.text ?? String(cell.value ?? '')).trim();
        if (text) nombreCurso = text;
      }
    });

    if (!nombreCurso) {
      console.warn(`  Sin nombre de curso en Fila 1 — hoja omitida.`);
      continue;
    }
    console.log(`  Curso detectado (Fila 1): "${nombreCurso}"`);

    // ── Paso 2: Upsert del Curso ─────────────────────────────────────────────
    let courseId: number;
    const existingCourse = await prisma.course.findFirst({
      where: { name: nombreCurso },
      select: { id: true },
    });
    if (existingCourse) {
      courseId = existingCourse.id;
    } else {
      const newCourse = await prisma.course.create({
        data: { name: nombreCurso },
        select: { id: true },
      });
      courseId = newCourse.id;
      totalCoursesCreated++;
      console.log(`  Curso creado en BD: "${nombreCurso}" (id=${courseId})`);
    }

    // ── Paso 3: Detectar formato desde la Fila 2 (cabeceras) ─────────────────
    const headerRow = worksheet.getRow(HEADER_ROW_INDEX);
    const cols = detectColumns(headerRow);
    console.log(
      `  Formato ${cols.formatType} detectado — ` +
        `RUT=col${cols.rut} | Nombre=col${cols.nombre}` +
        (cols.apellidoPaterno ? ` | Ap.Paterno=col${cols.apellidoPaterno}` : '') +
        (cols.apellidoMaterno ? ` | Ap.Materno=col${cols.apellidoMaterno}` : '') +
        (cols.correo ? ` | Correo=col${cols.correo}` : ' | Correo=N/A'),
    );

    let sheetCreated = 0;
    let sheetUpdated = 0;

    // ── Paso 4: Procesar filas de datos (Fila 3 en adelante) ─────────────────
    for (let rowNumber = DATA_START_ROW; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const rawRut = cellText(row, cols.rut);

      // Saltar filas completamente vacías
      if (!rawRut) continue;

      const rutAlumno = normalizeRut(rawRut);

      if (!isValidNormalizedRut(rutAlumno)) {
        console.warn(`  [FILA ${rowNumber}] RUT inválido tras sanitizar: "${rawRut}" → "${rutAlumno}" — omitida.`);
        totalErrors++;
        continue;
      }

      try {
        const nombreAlumno = extractStudentName(row, cols);

        if (!nombreAlumno) {
          console.warn(`  [FILA ${rowNumber}] Nombre vacío para RUT "${rutAlumno}" — omitida.`);
          totalErrors++;
          continue;
        }

        // ── Apoderado Placeholder ─────────────────────────────────────────────
        // Se usa el correo de la fila como identificador del apoderado.
        // Si no hay correo válido, se genera un placeholder único basado en el RUT del alumno.
        const rawEmail = cols.correo ? cellText(row, cols.correo) : '';
        const emailApoderado = looksLikeEmail(rawEmail)
          ? rawEmail.toLowerCase()
          : `sin-correo-${rutAlumno}@placeholder.com`;

        const rawTelefono = cols.telefono ? cellText(row, cols.telefono) : '';
        const telefonoApoderado = rawTelefono || null;

        // RUT placeholder temporal para superar la validación de unicidad.
        // Formato: "RUT-<rutAlumno>" — debe actualizarse con datos reales luego.
        const rutApoderadoPlaceholder = `RUT-${rutAlumno}`;
        const nombreApoderado = `Apoderado de ${nombreAlumno}`;

        const guardianBefore = await prisma.guardian.findUnique({
          where: { rut: rutApoderadoPlaceholder },
          select: { id: true },
        });

        const guardian = await prisma.guardian.upsert({
          where: { rut: rutApoderadoPlaceholder },
          update: {
            email: emailApoderado,
            ...(telefonoApoderado && { phone: telefonoApoderado }),
          },
          create: {
            rut: rutApoderadoPlaceholder,
            name: nombreApoderado,
            email: emailApoderado,
            phone: telefonoApoderado,
          },
          select: { id: true },
        });

        if (!guardianBefore) totalGuardiansCreated++;

        // ── Upsert Alumno ─────────────────────────────────────────────────────
        const existingStudent = await prisma.student.findUnique({
          where: { rut: rutAlumno },
          select: { id: true },
        });

        if (existingStudent) {
          await prisma.student.update({
            where: { rut: rutAlumno },
            data: { name: nombreAlumno, courseId, guardianId: guardian.id },
          });
          sheetUpdated++;
          totalStudentsUpdated++;
        } else {
          await prisma.student.create({
            data: { rut: rutAlumno, name: nombreAlumno, courseId, guardianId: guardian.id },
          });
          sheetCreated++;
          totalStudentsCreated++;
        }

        console.log(
          `  Fila ${rowNumber} ✓ — ${nombreAlumno} (${rutAlumno}) | correo apoderado: ${emailApoderado}`,
        );
      } catch (error) {
        totalErrors++;
        console.error(`  [FILA ${rowNumber}] ERROR:`, (error as Error).message);
      }
    }

    console.log(
      `  Hoja "${worksheet.name}" completada — ` +
        `${sheetCreated} alumnos creados, ${sheetUpdated} actualizados.`,
    );
  }

  // ── Resumen final ────────────────────────────────────────────────────────────
  console.log('');
  console.log('─────────────────────────────────────────────────────');
  console.log('  IMPORTACIÓN FINALIZADA');
  console.log(`  Cursos creados       : ${totalCoursesCreated}`);
  console.log(`  Apoderados creados   : ${totalGuardiansCreated}`);
  console.log(`  Alumnos creados      : ${totalStudentsCreated}`);
  console.log(`  Alumnos actualizados : ${totalStudentsUpdated}`);
  console.log(`  Filas con error      : ${totalErrors}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  await app.close();
}

main().catch((e) => {
  console.error('Error fatal en la importación:', e);
  process.exit(1);
});
