import { Prisma } from '@prisma/client';

/** Solo dígitos + dígito verificador (0-9 o K). */
export function normalizeChileanRut(input: string): string {
  return input.replace(/[^0-9Kk]/g, '').toUpperCase();
}

/**
 * Detecta si todo el texto parece un RUT chileno (solo separadores y dígitos).
 */
export function looksLikeWholeRutQuery(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const compact = t.replace(/\s+/g, '');
  if (!/^[\d.\-\skK]+$/.test(compact)) return false;
  const norm = normalizeChileanRut(compact);
  const digits = norm.slice(0, -1);
  const dv = norm.slice(-1);
  if (!/^\d+$/.test(digits)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;
  return digits.length >= 7 && digits.length <= 8 && norm.length >= 8;
}

/**
 * Parte la consulta en tokens: si parece un solo RUT (con o sin espacios), un solo token;
 * si no, palabras separadas por espacio (orden flexible en nombres vía AND).
 */
export function splitFlexibleSearchTokens(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (looksLikeWholeRutQuery(t)) {
    return [t.replace(/\s+/g, '')];
  }
  return t.split(/\s+/).filter(Boolean);
}

function studentTokenWhere(token: string): Prisma.StudentWhereInput {
  const norm = normalizeChileanRut(token);
  const ors: Prisma.StudentWhereInput[] = [
    { name: { contains: token, mode: 'insensitive' } },
  ];
  if (norm.length >= 4) {
    ors.push({
      rutNormalized: { contains: norm, mode: 'insensitive' },
    });
  }
  return { OR: ors };
}

function guardianTokenWhere(token: string): Prisma.GuardianWhereInput {
  const norm = normalizeChileanRut(token);
  const ors: Prisma.GuardianWhereInput[] = [
    { name: { contains: token, mode: 'insensitive' } },
  ];
  if (norm.length >= 4) {
    ors.push({
      rutNormalized: { contains: norm, mode: 'insensitive' },
    });
  }
  return { OR: ors };
}

/** Filtro para listados de alumnos (nombre por tokens AND, RUT flexible). */
export function buildStudentSearchWhere(
  search: string | undefined,
): Prisma.StudentWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  const tokens = splitFlexibleSearchTokens(q);
  if (tokens.length === 0) return undefined;
  return { AND: tokens.map((tok) => studentTokenWhere(tok)) };
}

/** Filtro para listados de apoderados. */
export function buildGuardianSearchWhere(
  search: string | undefined,
): Prisma.GuardianWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  const tokens = splitFlexibleSearchTokens(q);
  if (tokens.length === 0) return undefined;
  return { AND: tokens.map((tok) => guardianTokenWhere(tok)) };
}

/** Nombre de curso: cada token debe aparecer en el nombre (orden libre). */
export function buildCourseSearchWhere(
  search: string | undefined,
): Prisma.CourseWhereInput | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  const tokens = splitFlexibleSearchTokens(q);
  if (tokens.length === 0) return undefined;
  return {
    AND: tokens.map((tok) => ({
      name: { contains: tok, mode: 'insensitive' },
    })),
  };
}
