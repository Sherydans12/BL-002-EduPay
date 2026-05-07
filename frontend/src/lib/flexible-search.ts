/**
 * Búsqueda flexible alineada con el backend (tokens en nombre, RUT sin formato fijo).
 */

export function normalizeChileanRut(input: string): string {
  return input.replace(/[^0-9Kk]/g, "").toUpperCase();
}

export function looksLikeWholeRutQuery(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const compact = t.replace(/\s+/g, "");
  if (!/^[\d.\-\skK]+$/.test(compact)) return false;
  const norm = normalizeChileanRut(compact);
  const digits = norm.slice(0, -1);
  const dv = norm.slice(-1);
  if (!/^\d+$/.test(digits)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;
  return digits.length >= 7 && digits.length <= 8 && norm.length >= 8;
}

export function splitFlexibleSearchTokens(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (looksLikeWholeRutQuery(t)) {
    return [t.replace(/\s+/g, "")];
  }
  return t.split(/\s+/).filter(Boolean);
}

/** Cada token debe coincidir con nombre (contains) o con RUT normalizado (substring). */
export function matchesPersonFields(name: string, rut: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const tokens = splitFlexibleSearchTokens(q);
  const rutNorm = normalizeChileanRut(rut);
  const nameLower = name.toLowerCase();
  return tokens.every((tok) => {
    const tNorm = normalizeChileanRut(tok);
    if (nameLower.includes(tok.toLowerCase())) return true;
    if (tNorm.length >= 4 && rutNorm.includes(tNorm)) return true;
    return false;
  });
}

export function matchesCourseName(courseName: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const tokens = splitFlexibleSearchTokens(q);
  const lower = courseName.toLowerCase();
  return tokens.every((tok) => lower.includes(tok.toLowerCase()));
}

/** Alumno + apoderado (vista curso). */
export function matchesStudentRow(
  row: { name: string; rut: string; guardian: { name: string; rut: string } },
  query: string,
): boolean {
  const q = query.trim();
  if (!q) return true;
  return (
    matchesPersonFields(row.name, row.rut, q) ||
    matchesPersonFields(row.guardian.name, row.guardian.rut ?? "", q)
  );
}

/** cmdk: value = "nombre\\trut" */
export function cmdkPersonFilter(value: string, search: string): number {
  const q = search.trim();
  if (!q) return 1;
  const sep = value.indexOf("\t");
  const name = sep >= 0 ? value.slice(0, sep) : value;
  const rut = sep >= 0 ? value.slice(sep + 1) : "";
  return matchesPersonFields(name, rut, q) ? 1 : 0;
}

/** cmdk: solo nombre de curso */
export function cmdkCourseFilter(value: string, search: string): number {
  const q = search.trim();
  if (!q) return 1;
  return matchesCourseName(value, q) ? 1 : 0;
}
