import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantsApi } from "./api";

describe("tenantsApi platform context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no envía el tenant seleccionado en la consulta de mapping", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          tenantId: "colegio-seleccionado",
          canonicalTenantId: "00000000-0000-4000-8000-000000000000",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", {
      cookie: "auth_token=header.eyJyb2xlIjoiU1VQRVJfQURNSU4ifQ.signature",
    });
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "colegio-seleccionado" },
    });

    await tenantsApi.getCanonicalMapping("colegio-seleccionado");

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.headers).toEqual({
      Authorization: "Bearer header.eyJyb2xlIjoiU1VQRVJfQURNSU4ifQ.signature",
      "Content-Type": "application/json",
    });
  });

  it("conserva el tenant seleccionado para el listado normal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", {
      cookie: "auth_token=header.eyJyb2xlIjoiU1VQRVJfQURNSU4ifQ.signature",
    });
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "colegio-seleccionado" },
    });

    await tenantsApi.getAll();

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.headers).toEqual({
      Authorization: "Bearer header.eyJyb2xlIjoiU1VQRVJfQURNSU4ifQ.signature",
      "Content-Type": "application/json",
      "x-tenant-id": "colegio-seleccionado",
    });
  });
});
