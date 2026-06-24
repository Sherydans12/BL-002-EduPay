/**
 * ============================================================
 *  CLI — Importación Masiva desde Excel (Datos Sucios)
 *  Uso: npm run db:import  (desde la carpeta backend/)
 *
 *  Coloca tu archivo Excel en:
 *    backend/uploads/importacion.xlsx
 *
 *  El script detecta automáticamente POR CADA HOJA:
 *   1. La fila del encabezado buscando las keywords "RUT" y "NOMBRE"
 *   2. El nombre del curso en la última fila no-vacía antes del encabezado
 *   3. Los índices de columnas RUT, NOMBRE y CORREO desde el encabezado
 *   4. Los datos a partir de la fila inmediatamente posterior al encabezado
 *   5. El nombre completo del alumno concatenando columnas adyacentes entre
 *      NOMBRE y CORREO (maneja tanto nombres completos como nombres separados)
 * ============================================================
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

/** Ruta al archivo Excel, relativa a la raíz del backend */
const EXCEL_FILE_PATH = path.resolve(
  __dirname,
  '..',
  'uploads',
  'importacion.xlsx',
);
const PRIMARY_TENANT_ID = 'colegio-conquistadores';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lee el valor de una celda como string limpio */
function cellText(row: ExcelJS.Row, colIndex: number): string {
  const cell = row.getCell(colIndex);
  const raw = cell.text ?? String(cell.value ?? '');
  return raw.trim();
}

/**
 * Limpieza AGRESIVA de RUT chileno.
 * Elimina absolutamente todo excepto dígitos y la letra K.
 * "27,.206.121-1"  →  "272061211"
 * "12.345.678-K"   →  "12345678K"
 * "23.789.135-k"   →  "23789135K"
 */
function normalizeRut(rut: string): string {
  return rut.replace(/[^0-9kK]/gi, '').toUpperCase();
}

/** Valida que el RUT normalizado tenga longitud plausible (7-9 chars) */
function isValidRut(rut: string): boolean {
  return /^[0-9]{6,8}[0-9K]$/.test(rut);
}

/** Detecta si un string parece un email válido */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ─── Detección dinámica de estructura ────────────────────────────────────────

interface SheetLayout {
  /** Índice de la fila de encabezados (1-based) */
  headerRowIndex: number;
  /** Nombre del curso extraído de la fila anterior al encabezado */
  nombreCurso: string;
  /** Índice de columna del RUT del alumno */
  colRut: number;
  /** Índice de la primera columna de nombre */
  colNombre: number;
  /** Índice de columna del correo (del apoderado), undefined si no existe */
  colCorreo: number | undefined;
  /** Índice de columna del teléfono, undefined si no existe */
  colTelefono: number | undefined;
}

/**
 * Analiza una hoja completa y devuelve su layout:
 * - Busca la fila que contenga ambas keywords "RUT" y "NOMBRE" → headerRow
 * - Toma el texto de la última fila no-vacía antes del encabezado → curso
 * - Extrae los índices de columna del encabezado detectado
 */
function analyzeSheet(worksheet: ExcelJS.Worksheet): SheetLayout | null {
  let headerRowIndex = -1;
  let courseRowIndex = -1;

  for (let i = 1; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const texts: string[] = [];

    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = (cell.text ?? String(cell.value ?? '')).trim().toUpperCase();
      if (t) texts.push(t);
    });

    if (texts.length === 0) continue;

    // Una fila de encabezado tiene simultáneamente "RUT" y "NOMBRE"
    const hasRut = texts.some((t) => t === 'RUT' || t.startsWith('RUT '));
    const hasNombre = texts.some(
      (t) => t.includes('NOMBRE') || t.includes('ALUMNO'),
    );

    if (hasRut && hasNombre) {
      headerRowIndex = i;
      break;
    }

    // Guardamos el índice de la última fila con datos antes del encabezado
    courseRowIndex = i;
  }

  if (headerRowIndex === -1) return null;

  // ── Extraer nombre del curso ──────────────────────────────────────────────
  let nombreCurso = '';
  if (courseRowIndex > 0) {
    const courseRow = worksheet.getRow(courseRowIndex);
    courseRow.eachCell({ includeEmpty: false }, (cell) => {
      if (nombreCurso) return; // solo la primera celda con texto
      const t = (cell.text ?? String(cell.value ?? '')).trim();
      // Saltar marcadores de N° y números sueltos
      if (t && !/^[Nn][°º]?$/.test(t) && !/^\d{1,3}$/.test(t)) {
        nombreCurso = t;
      }
    });
  }

  // Fallback al nombre de la pestaña
  if (!nombreCurso) nombreCurso = worksheet.name;

  // ── Detectar columnas desde la fila de encabezado ────────────────────────
  const headerRow = worksheet.getRow(headerRowIndex);
  let colRut: number | undefined;
  let colNombre: number | undefined;
  let colCorreo: number | undefined;
  let colTelefono: number | undefined;

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const t = (cell.text ?? String(cell.value ?? '')).trim().toUpperCase();
    if (!t) return;

    if ((t === 'RUT' || t.startsWith('RUT ')) && colRut === undefined) {
      colRut = colNumber;
    } else if (
      (t.includes('NOMBRE') || t.includes('ALUMNO')) &&
      colNombre === undefined
    ) {
      colNombre = colNumber;
    } else if (
      (t.includes('CORREO') || t.includes('EMAIL') || t.includes('MAIL')) &&
      colCorreo === undefined
    ) {
      colCorreo = colNumber;
    } else if (
      (t.includes('TELÉFONO') ||
        t.includes('TELEFONO') ||
        t.includes('FONO') ||
        t.includes('CELULAR')) &&
      colTelefono === undefined
    ) {
      colTelefono = colNumber;
    }
  });

  // Si no encontramos RUT o NOMBRE, la hoja no es procesable
  if (colRut === undefined || colNombre === undefined) return null;

  return {
    headerRowIndex,
    nombreCurso,
    colRut,
    colNombre,
    colCorreo,
    colTelefono,
  };
}

/**
 * Extrae el nombre completo del alumno desde una fila de datos.
 *
 * Concatena todas las columnas entre colNombre (inclusive) y el límite derecho
 * (colCorreo o colRut, lo que esté primero DESPUÉS de colNombre).
 * Esto maneja automáticamente:
 *   - Formato A: nombre completo en una sola celda
 *   - Formato B: primer nombre + apellido paterno + apellido materno en celdas separadas
 *     (aunque los apellidos no tengan encabezado propio, como en la Hoja 1)
 */
function extractStudentName(row: ExcelJS.Row, layout: SheetLayout): string {
  // Determinar el límite derecho: primera columna "especial" que esté a la DERECHA de colNombre
  const rightBoundary = Math.min(
    layout.colRut > layout.colNombre ? layout.colRut : Infinity,
    layout.colCorreo !== undefined && layout.colCorreo > layout.colNombre
      ? layout.colCorreo
      : Infinity,
  );

  const parts: string[] = [];

  for (let col = layout.colNombre; col < rightBoundary; col++) {
    const cell = row.getCell(col);

    // Las celdas de fecha (Date object o string de fecha) interrumpen la lectura
    if (cell.value instanceof Date) break;
    const text = (cell.text ?? String(cell.value ?? '')).trim();
    if (!text) continue;
    if (looksLikeEmail(text)) break;
    // Fechas como string (ej. "Sun Oct 28 2018...")
    if (/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/.test(text)) break;

    parts.push(text);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  Importación Masiva — Cursos, Apoderados, Alumnos');
  console.log('  Modo: auto-detección de layout + sanitización agresiva');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Archivo: ${EXCEL_FILE_PATH}`);
  console.log('');

  if (!fs.existsSync(EXCEL_FILE_PATH)) {
    console.error(`ERROR: Archivo no encontrado:\n  ${EXCEL_FILE_PATH}`);
    console.error('Copia tu Excel como: backend/uploads/importacion.xlsx');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE_PATH);

  console.log(`  Hojas encontradas: ${workbook.worksheets.length}`);

  let totalStudentsCreated = 0;
  let totalStudentsUpdated = 0;
  let totalGuardiansCreated = 0;
  let totalCoursesCreated = 0;
  let totalErrors = 0;

  for (const worksheet of workbook.worksheets) {
    console.log(
      `\n── Hoja: "${worksheet.name}" (${worksheet.rowCount} filas) ─────────────`,
    );

    // ── Analizar el layout de la hoja ────────────────────────────────────────
    const layout = analyzeSheet(worksheet);

    if (!layout) {
      console.warn(`  No se detectó fila de encabezados — hoja omitida.`);
      continue;
    }

    console.log(`  Curso: "${layout.nombreCurso}"`);
    console.log(
      `  Encabezado en fila ${layout.headerRowIndex} | ` +
        `RUT=col${layout.colRut} | NOMBRE=col${layout.colNombre}` +
        (layout.colCorreo
          ? ` | CORREO=col${layout.colCorreo}`
          : ' | CORREO=N/A'),
    );
    console.log(`  Datos desde fila ${layout.headerRowIndex + 1}`);

    // ── Upsert del Curso ──────────────────────────────────────────────────────
    let courseId: number;
    const existingCourse = await prisma.course.findFirst({
      where: { tenantId: PRIMARY_TENANT_ID, name: layout.nombreCurso },
      select: { id: true },
    });
    if (existingCourse) {
      courseId = existingCourse.id;
    } else {
      const newCourse = await prisma.course.create({
        data: { tenantId: PRIMARY_TENANT_ID, name: layout.nombreCurso },
        select: { id: true },
      });
      courseId = newCourse.id;
      totalCoursesCreated++;
      console.log(
        `  Curso creado en BD: "${layout.nombreCurso}" (id=${courseId})`,
      );
    }

    let sheetCreated = 0;
    let sheetUpdated = 0;

    // ── Procesar filas de datos ───────────────────────────────────────────────
    for (
      let rowNumber = layout.headerRowIndex + 1;
      rowNumber <= worksheet.rowCount;
      rowNumber++
    ) {
      const row = worksheet.getRow(rowNumber);
      const rawRut = cellText(row, layout.colRut);

      if (!rawRut) continue;

      const rutAlumno = normalizeRut(rawRut);

      if (!isValidRut(rutAlumno)) {
        console.warn(
          `  [FILA ${rowNumber}] RUT inválido: "${rawRut}" → "${rutAlumno}" — omitida.`,
        );
        totalErrors++;
        continue;
      }

      try {
        const nombreAlumno = extractStudentName(row, layout);

        if (!nombreAlumno) {
          console.warn(
            `  [FILA ${rowNumber}] Nombre vacío para RUT "${rutAlumno}" — omitida.`,
          );
          totalErrors++;
          continue;
        }

        // ── Apoderado Placeholder ─────────────────────────────────────────────
        // Se extrae el correo de la fila (campo del apoderado según el colegio).
        // Si no hay correo válido, se genera un placeholder único por RUT.
        const rawEmail = layout.colCorreo
          ? cellText(row, layout.colCorreo)
          : '';
        const emailApoderado = looksLikeEmail(rawEmail)
          ? rawEmail.toLowerCase()
          : `sin-correo-${rutAlumno}@placeholder.com`;

        const rawTelefono = layout.colTelefono
          ? cellText(row, layout.colTelefono)
          : '';
        const telefonoApoderado = rawTelefono || null;

        // RUT placeholder temporal — formato "RUT-<rutAlumno>" garantiza unicidad.
        // Debe reemplazarse con el RUT real del apoderado cuando se disponga de él.
        const rutApoderadoPlaceholder = `RUT-${rutAlumno}`;
        const nombreApoderado = `Apoderado de ${nombreAlumno}`;

        const guardianBefore = await prisma.guardian.findUnique({
          where: {
            tenantId_rut: {
              tenantId: PRIMARY_TENANT_ID,
              rut: rutApoderadoPlaceholder,
            },
          },
          select: { id: true },
        });

        const guardian = await prisma.guardian.upsert({
          where: {
            tenantId_rut: {
              tenantId: PRIMARY_TENANT_ID,
              rut: rutApoderadoPlaceholder,
            },
          },
          update: {
            email: emailApoderado,
            ...(telefonoApoderado && { phone: telefonoApoderado }),
          },
          create: {
            tenantId: PRIMARY_TENANT_ID,
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
          where: {
            tenantId_rut: {
              tenantId: PRIMARY_TENANT_ID,
              rut: rutAlumno,
            },
          },
          select: { id: true },
        });

        if (existingStudent) {
          await prisma.student.update({
            where: {
              tenantId_rut: {
                tenantId: PRIMARY_TENANT_ID,
                rut: rutAlumno,
              },
            },
            data: { name: nombreAlumno, courseId, guardianId: guardian.id },
          });
          sheetUpdated++;
          totalStudentsUpdated++;
        } else {
          await prisma.student.create({
            data: {
              tenantId: PRIMARY_TENANT_ID,
              rut: rutAlumno,
              name: nombreAlumno,
              courseId,
              guardianId: guardian.id,
            },
          });
          sheetCreated++;
          totalStudentsCreated++;
        }

        console.log(`  Fila ${rowNumber} OK — ${nombreAlumno} (${rutAlumno})`);
      } catch (error) {
        totalErrors++;
        console.error(
          `  [FILA ${rowNumber}] ERROR: ${(error as Error).message}`,
        );
      }
    }

    console.log(
      `  Hoja "${worksheet.name}" — ${sheetCreated} creados, ${sheetUpdated} actualizados.`,
    );
  }

  // ── Resumen final ────────────────────────────────────────────────────────────
  console.log('');
  console.log('──────────────────────────────────────────────────────────');
  console.log('  IMPORTACIÓN FINALIZADA');
  console.log(`  Cursos creados       : ${totalCoursesCreated}`);
  console.log(`  Apoderados creados   : ${totalGuardiansCreated}`);
  console.log(`  Alumnos creados      : ${totalStudentsCreated}`);
  console.log(`  Alumnos actualizados : ${totalStudentsUpdated}`);
  console.log(`  Filas con error      : ${totalErrors}`);
  console.log('──────────────────────────────────────────────────────────');
  console.log('');

  await app.close();
}

main().catch((e) => {
  console.error('Error fatal en la importación:', e);
  process.exit(1);
});
