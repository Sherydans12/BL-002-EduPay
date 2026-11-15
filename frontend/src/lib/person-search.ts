/**
 * Búsqueda de alumnos y apoderados en el servidor, con resultados acotados.
 * Evita descargar el padrón completo para alimentar selectores.
 */
import { guardiansApi, studentsApi } from "@/lib/api";
import type { Guardian, Student } from "@/lib/api";

/** Caracteres mínimos antes de consultar al servidor. */
export const PERSON_SEARCH_MIN_LENGTH = 2;
/** Resultados por búsqueda; el selector muestra solo esta cantidad. */
export const PERSON_SEARCH_LIMIT = 20;
/** Espera tras la última tecla antes de consultar. */
export const PERSON_SEARCH_DEBOUNCE_MS = 300;
/** Página máxima aceptada por el BACK (ver common/pagination en backend). */
const FAMILY_PAGE_LIMIT = 200;
/** Tope defensivo de páginas al cargar los alumnos de un apoderado. */
const FAMILY_MAX_PAGES = 5;

export interface PersonSearchResult<T> {
  items: T[];
  /** Total de coincidencias informado por el servidor. */
  total: number;
}

/** Devuelve la consulta normalizada o null si es demasiado corta. */
export function normalizePersonQuery(raw: string): string | null {
  const query = raw.trim().replace(/\s+/g, " ");
  return query.length >= PERSON_SEARCH_MIN_LENGTH ? query : null;
}

export async function searchStudents(
  query: string,
  options: { courseId?: number } = {},
): Promise<PersonSearchResult<Student>> {
  const res = await studentsApi.getAll({
    search: query,
    page: 1,
    limit: PERSON_SEARCH_LIMIT,
    ...(options.courseId ? { courseId: options.courseId } : {}),
  });
  return { items: res.data, total: res.meta.total };
}

export async function searchGuardians(
  query: string,
): Promise<PersonSearchResult<Guardian>> {
  const res = await guardiansApi.getAll(1, PERSON_SEARCH_LIMIT, query);
  return { items: res.data, total: res.meta.total };
}

/** Carga los alumnos de un apoderado (hermanos) sin recorrer el padrón. */
export async function fetchGuardianStudents(
  guardianId: number,
): Promise<Student[]> {
  const all: Student[] = [];
  for (let page = 1; page <= FAMILY_MAX_PAGES; page += 1) {
    const res = await studentsApi.getAll({
      guardianId,
      page,
      limit: FAMILY_PAGE_LIMIT,
    });
    all.push(...res.data);
    const lastPage = res.meta.lastPage ?? res.meta.totalPages ?? 1;
    if (page >= lastPage || res.data.length === 0) break;
  }
  return all;
}

/** Incorpora alumnos al caché local por id, sin perder los ya conocidos. */
export function mergeStudents(
  current: Record<number, Student>,
  students: Student[],
): Record<number, Student> {
  if (students.length === 0) return current;
  const next = { ...current };
  for (const student of students) next[student.id] = student;
  return next;
}

/** Texto de apoyo para el selector según el estado de la búsqueda. */
export function personSearchStatusText(state: {
  query: string | null;
  loading: boolean;
  error: string | null;
  shown: number;
  total: number;
}): string {
  if (!state.query) {
    return `Escribe al menos ${PERSON_SEARCH_MIN_LENGTH} caracteres para buscar.`;
  }
  if (state.loading) return "Buscando…";
  if (state.error) return state.error;
  if (state.total === 0) return "No se encontraron resultados.";
  if (state.total > state.shown) {
    return `Mostrando ${state.shown} de ${state.total}. Escribe más para acotar.`;
  }
  return state.total === 1 ? "1 resultado." : `${state.total} resultados.`;
}
