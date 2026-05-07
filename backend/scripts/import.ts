/**
 * ============================================================
 *  CLI — Importación Masiva desde Excel
 *  Uso: npm run db:import  (desde la carpeta backend/)
 *
 *  Coloca tu archivo Excel en:
 *    backend/uploads/importacion.xlsx
 *
 *  Ajusta el bloque COLUMN MAP más abajo antes de ejecutar.
 * ============================================================
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

// ─── COLUMN MAP ──────────────────────────────────────────────────────────────
// Ajusta los números de columna según tu Excel (1 = columna A, 2 = B, etc.)
// Si tu Excel tiene encabezados en la fila 1, el script los saltará automáticamente.

const COLUMN_MAP = {
  /** Nombre del curso (ej. "1° Básico A") */
  CURSO: 1,

  /** RUT del alumno (ej. "12.345.678-9") */
  RUT_ALUMNO: 2,

  /** Nombre completo del alumno */
  NOMBRE_ALUMNO: 3,

  /** RUT del apoderado */
  RUT_APODERADO: 4,

  /** Nombre completo del apoderado */
  NOMBRE_APODERADO: 5,

  /** Email del apoderado (puede estar vacío) */
  EMAIL_APODERADO: 6,

  /** Teléfono del apoderado (puede estar vacío) */
  TELEFONO_APODERADO: 7,
};

/** Número de la fila de encabezados (se omite). Por defecto: 1 */
const HEADER_ROW = 1;

/** Ruta al archivo Excel, relativa a la raíz del backend */
const EXCEL_FILE_PATH = path.resolve(__dirname, '..', 'uploads', 'importacion.xlsx');
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lee el valor de una celda como string limpio */
function cellText(row: ExcelJS.Row, colIndex: number): string {
  const cell = row.getCell(colIndex);
  const raw = cell.text ?? String(cell.value ?? '');
  return raw.trim();
}

/**
 * Normaliza un RUT chileno eliminando puntos y guión.
 * "12.345.678-9"  →  "123456789"
 * Ya normalizado: "123456789"  →  "123456789"
 */
function normalizeRut(rut: string): string {
  return rut.replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Importación Masiva — Cursos, Apoderados, Alumnos');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Archivo: ${EXCEL_FILE_PATH}`);
  console.log('');

  // Validar que el archivo Excel exista antes de levantar el contexto de Nest
  if (!fs.existsSync(EXCEL_FILE_PATH)) {
    console.error(`ERROR: No se encontró el archivo Excel en:\n  ${EXCEL_FILE_PATH}`);
    console.error('Asegúrate de copiar tu Excel como: backend/uploads/importacion.xlsx');
    process.exit(1);
  }

  // Levantar contexto NestJS para acceder a PrismaService correctamente configurado
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  // Cargar el workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE_PATH);

  // Usar la primera hoja
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    console.error('ERROR: No se encontró ninguna hoja en el archivo Excel.');
    await app.close();
    process.exit(1);
  }
  console.log(`  Hoja activa: "${worksheet.name}"`);
  console.log(`  Total de filas (incluye cabecera): ${worksheet.rowCount}`);
  console.log('');

  let studentsCreated = 0;
  let studentsUpdated = 0;
  let guardiansCreated = 0;
  let coursesCreated = 0;
  let errorsCount = 0;

  // Caché en memoria para evitar consultas repetidas por curso (name → id)
  const courseCache = new Map<string, number>();

  for (let rowNumber = HEADER_ROW + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);

    // Ignorar filas completamente vacías
    const rawRutAlumno = cellText(row, COLUMN_MAP.RUT_ALUMNO);
    if (!rawRutAlumno) continue;

    try {
      // ── Extracción y limpieza ──────────────────────────────────────────────
      const nombreAlumno = cellText(row, COLUMN_MAP.NOMBRE_ALUMNO);
      const rutAlumno = normalizeRut(rawRutAlumno);

      const rawRutApoderado = cellText(row, COLUMN_MAP.RUT_APODERADO);
      const rutApoderado = normalizeRut(rawRutApoderado);
      const nombreApoderado = cellText(row, COLUMN_MAP.NOMBRE_APODERADO);
      const emailApoderado = cellText(row, COLUMN_MAP.EMAIL_APODERADO) || null;
      const telefonoApoderado = cellText(row, COLUMN_MAP.TELEFONO_APODERADO) || null;

      const nombreCurso = cellText(row, COLUMN_MAP.CURSO);

      if (!rutAlumno || !nombreAlumno || !rutApoderado || !nombreApoderado || !nombreCurso) {
        console.warn(
          `  [FILA ${rowNumber}] Datos incompletos — omitida. ` +
          `(RUT alumno="${rawRutAlumno}", Nombre="${nombreAlumno}", Curso="${nombreCurso}")`,
        );
        errorsCount++;
        continue;
      }

      // ── 1. Buscar o crear Curso ───────────────────────────────────────────
      // Course.name no tiene @unique en el esquema, se usa findFirst + create
      // con caché en memoria para evitar duplicados dentro de la misma ejecución.
      let courseId = courseCache.get(nombreCurso);
      if (courseId === undefined) {
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
          coursesCreated++;
          console.log(`  [FILA ${rowNumber}] Curso nuevo creado: "${nombreCurso}" (id=${courseId})`);
        }
        courseCache.set(nombreCurso, courseId);
      }

      // ── 2. Upsert Apoderado ───────────────────────────────────────────────
      const guardianBefore = await prisma.guardian.findUnique({
        where: { rut: rutApoderado },
        select: { id: true },
      });
      const guardianResult = await prisma.guardian.upsert({
        where: { rut: rutApoderado },
        update: {
          name: nombreApoderado,
          ...(emailApoderado && { email: emailApoderado }),
          ...(telefonoApoderado && { phone: telefonoApoderado }),
        },
        create: {
          rut: rutApoderado,
          name: nombreApoderado,
          email: emailApoderado,
          phone: telefonoApoderado,
        },
        select: { id: true },
      });
      if (!guardianBefore) guardiansCreated++;

      // ── 3. Upsert Alumno ──────────────────────────────────────────────────
      const existingStudent = await prisma.student.findUnique({
        where: { rut: rutAlumno },
        select: { id: true },
      });

      if (existingStudent) {
        await prisma.student.update({
          where: { rut: rutAlumno },
          data: {
            name: nombreAlumno,
            courseId: courseId,
            guardianId: guardianResult.id,
          },
        });
        studentsUpdated++;
      } else {
        await prisma.student.create({
          data: {
            rut: rutAlumno,
            name: nombreAlumno,
            courseId: courseId,
            guardianId: guardianResult.id,
          },
        });
        studentsCreated++;
      }

      console.log(
        `  Fila ${rowNumber} procesada — Alumno: ${nombreAlumno} (${rutAlumno}) | ` +
        `Curso: ${nombreCurso} | Apoderado: ${nombreApoderado}`,
      );
    } catch (error) {
      errorsCount++;
      console.error(`  [FILA ${rowNumber}] ERROR:`, (error as Error).message);
    }
  }

  // ── Resumen final ──────────────────────────────────────────────────────────
  console.log('');
  console.log('───────────────────────────────────────────────────');
  console.log('  IMPORTACIÓN FINALIZADA');
  console.log(`  Cursos creados   : ${coursesCreated}`);
  console.log(`  Apoderados nuevos: ${guardiansCreated}`);
  console.log(`  Alumnos creados  : ${studentsCreated}`);
  console.log(`  Alumnos actualizados: ${studentsUpdated}`);
  console.log(`  Filas con error  : ${errorsCount}`);
  console.log('───────────────────────────────────────────────────');
  console.log('');

  await app.close();
}

main().catch((e) => {
  console.error('Error fatal en la importación:', e);
  process.exit(1);
});
