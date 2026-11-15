import { beforeEach, describe, expect, it, vi } from "vitest";

const { studentsGetAll, guardiansGetAll } = vi.hoisted(() => ({
  studentsGetAll: vi.fn(),
  guardiansGetAll: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  studentsApi: { getAll: studentsGetAll },
  guardiansApi: { getAll: guardiansGetAll },
}));

import type { Student } from "@/lib/api";
import {
  fetchGuardianStudents,
  mergeStudents,
  normalizePersonQuery,
  PERSON_SEARCH_LIMIT,
  personSearchStatusText,
  searchGuardians,
  searchStudents,
} from "./person-search";

function syntheticStudent(id: number, guardianId = 1): Student {
  return { id, guardianId, name: `Alumno Sintético ${id}` } as Student;
}

function page<T>(data: T[], total: number, pageNumber = 1, lastPage = 1) {
  return {
    data,
    meta: { total, page: pageNumber, limit: 200, lastPage },
  };
}

describe("person search", () => {
  beforeEach(() => {
    studentsGetAll.mockReset();
    guardiansGetAll.mockReset();
  });

  it("does not query with fewer than two meaningful characters", () => {
    expect(normalizePersonQuery("")).toBeNull();
    expect(normalizePersonQuery("  a ")).toBeNull();
    expect(normalizePersonQuery("  ana   maría ")).toBe("ana maría");
    expect(normalizePersonQuery("12.345")).toBe("12.345");
  });

  it("asks the server for a bounded page of students, optionally by course", async () => {
    studentsGetAll.mockResolvedValue(page([syntheticStudent(1)], 37));

    const result = await searchStudents("ana", { courseId: 4 });

    expect(studentsGetAll).toHaveBeenCalledWith({
      search: "ana",
      page: 1,
      limit: PERSON_SEARCH_LIMIT,
      courseId: 4,
    });
    expect(result).toEqual({ items: [syntheticStudent(1)], total: 37 });

    await searchStudents("ana");
    expect(studentsGetAll).toHaveBeenLastCalledWith({
      search: "ana",
      page: 1,
      limit: PERSON_SEARCH_LIMIT,
    });
  });

  it("asks the server for a bounded page of guardians", async () => {
    guardiansGetAll.mockResolvedValue(page([], 0));

    await expect(searchGuardians("pérez")).resolves.toEqual({
      items: [],
      total: 0,
    });
    expect(guardiansGetAll).toHaveBeenCalledWith(1, PERSON_SEARCH_LIMIT, "pérez");
  });

  it("loads a family by guardian without walking the whole roster", async () => {
    studentsGetAll
      .mockResolvedValueOnce(page([syntheticStudent(1, 9)], 2, 1, 2))
      .mockResolvedValueOnce(page([syntheticStudent(2, 9)], 2, 2, 2));

    const family = await fetchGuardianStudents(9);

    expect(family.map((student) => student.id)).toEqual([1, 2]);
    expect(studentsGetAll).toHaveBeenNthCalledWith(1, {
      guardianId: 9,
      page: 1,
      limit: 200,
    });
    expect(studentsGetAll).toHaveBeenCalledTimes(2);
  });

  it("stops loading a family after a bounded number of pages", async () => {
    studentsGetAll.mockResolvedValue(page([syntheticStudent(1)], 9999, 1, 999));

    await fetchGuardianStudents(1);

    expect(studentsGetAll).toHaveBeenCalledTimes(5);
  });

  it("merges students into the cache without dropping known ones", () => {
    const cache = mergeStudents({}, [syntheticStudent(1), syntheticStudent(2)]);
    const updated = { ...syntheticStudent(2), name: "Actualizado" };
    const next = mergeStudents(cache, [updated, syntheticStudent(3)]);

    expect(Object.keys(next).map(Number)).toEqual([1, 2, 3]);
    expect(next[2]?.name).toBe("Actualizado");
    expect(mergeStudents(next, [])).toBe(next);
  });

  it("explains search progress, limits and errors in plain text", () => {
    const base = { loading: false, error: null, shown: 0, total: 0 };
    expect(personSearchStatusText({ ...base, query: null })).toMatch(
      /al menos 2 caracteres/,
    );
    expect(
      personSearchStatusText({ ...base, query: "an", loading: true }),
    ).toBe("Buscando…");
    expect(personSearchStatusText({ ...base, query: "an" })).toBe(
      "No se encontraron resultados.",
    );
    expect(
      personSearchStatusText({ ...base, query: "an", shown: 20, total: 134 }),
    ).toBe("Mostrando 20 de 134. Escribe más para acotar.");
    expect(
      personSearchStatusText({ ...base, query: "an", shown: 1, total: 1 }),
    ).toBe("1 resultado.");
    expect(
      personSearchStatusText({
        ...base,
        query: "an",
        error: "No se pudo buscar.",
      }),
    ).toBe("No se pudo buscar.");
  });
});
