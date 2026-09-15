import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantsApi } from "./api";

describe("tenantsApi platform context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no envía el tenant seleccionado al consultar operaciones de plataforma", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
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
    });
  });
});
