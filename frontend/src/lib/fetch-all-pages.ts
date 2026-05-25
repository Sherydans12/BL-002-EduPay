/**
 * Carga listados paginados por API hasta obtener todos los registros (para combos / filtros).
 */
import { coursesApi, guardiansApi, studentsApi } from "@/lib/api";
import type { Course, Guardian, Student } from "@/lib/api";

const PAGE_LIMIT = 200;

function lastPage(meta: { lastPage?: number; totalPages?: number }): number {
  return meta.lastPage ?? meta.totalPages ?? 1;
}

export async function fetchAllCourses(): Promise<Course[]> {
  const all: Course[] = [];
  let page = 1;
  for (;;) {
    const res = await coursesApi.getAll(page, PAGE_LIMIT);
    all.push(...res.data);
    const lp = lastPage(res.meta);
    if (page >= lp || res.data.length === 0) break;
    page += 1;
    if (page > 500) break;
  }
  return all;
}

export async function fetchAllGuardians(): Promise<Guardian[]> {
  const all: Guardian[] = [];
  let page = 1;
  for (;;) {
    const res = await guardiansApi.getAll(page, PAGE_LIMIT);
    all.push(...res.data);
    const lp = lastPage(res.meta);
    if (page >= lp || res.data.length === 0) break;
    page += 1;
    if (page > 500) break;
  }
  return all;
}

export async function fetchAllStudents(): Promise<Student[]> {
  const all: Student[] = [];
  let page = 1;
  for (;;) {
    const res = await studentsApi.getAll({ page, limit: PAGE_LIMIT });
    all.push(...res.data);
    const lp = lastPage(res.meta);
    if (page >= lp || res.data.length === 0) break;
    page += 1;
    if (page > 500) break;
  }
  return all;
}
