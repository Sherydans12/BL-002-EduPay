import { afterEach, describe, expect, it, vi } from "vitest";

import {
  academicIntakeApi,
  ApiRequestError,
  type AcademicIntakeItem,
} from "./api";
import {
  intakeCanCreate,
  intakeLoadErrorMessage,
  intakeNationalIdLabel,
  intakeYearLabel,
} from "./academic-intake";

const item: AcademicIntakeItem = {
  academicStudentId: "00000000-0000-4000-8000-000000000001",
  firstName: "Nuevo",
  lastName: "Ingreso",
  nationalIdType: "RUN",
  nationalId: "11.111.111-1",
  courseLabel: "1° Básico A",
  academicYearLabel: "2027",
  academicYearStatus: "DRAFT",
  possibleMatch: null,
};

describe("academic intake helpers", () => {
  it("describe el año y el identificador", () => {
    expect(intakeYearLabel(item)).toBe("2027 · en preparación");
    expect(intakeNationalIdLabel(item)).toBe("RUN 11.111.111-1");
    expect(intakeCanCreate(item)).toBe(true);
    const sinId = { ...item, nationalId: null, nationalIdType: null };
    expect(intakeNationalIdLabel(sinId)).toBe("Sin RUN ni IPE");
    expect(intakeCanCreate(sinId)).toBe(false);
  });

  it("explica los errores de carga sin exponer detalles técnicos", () => {
    expect(
      intakeLoadErrorMessage(new ApiRequestError("Forbidden", 403)),
    ).toMatch(/Tu rol no permite/);
    expect(
      intakeLoadErrorMessage(new ApiRequestError("Not Found", 404)),
    ).toMatch(/aún no tiene habilitada/);
  });
});

describe("academicIntakeApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("incorpora con el apoderado elegido en el colegio activo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { studentId: 7 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });

    await expect(
      academicIntakeApi.accept(item.academicStudentId, { guardianId: 3 }),
    ).resolves.toEqual({ studentId: 7 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(
      /\/academic-intake\/00000000-0000-4000-8000-000000000001\/accept$/,
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ guardianId: 3 });
  });
});
