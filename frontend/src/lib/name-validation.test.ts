import { describe, it, expect } from "vitest";
import { validateNameTokenPreservation } from "./name-validation";

describe("frontend validateNameTokenPreservation", () => {
  it("validates correct 3-token partition", () => {
    const res = validateNameTokenPreservation(
      "VICENTE ESCOBAR MARIN",
      "Vicente",
      "Escobar Marin"
    );
    expect(res.valid).toBe(true);
  });

  it("validates correct 2-token partition", () => {
    const res = validateNameTokenPreservation(
      "Nicolas Sena",
      "Nicolas",
      "Sena"
    );
    expect(res.valid).toBe(true);
  });

  it("rejects token omission", () => {
    const res = validateNameTokenPreservation(
      "VICENTE ESCOBAR MARIN",
      "Vicente",
      "Escobar"
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("El número de palabras no coincide");
  });

  it("rejects altered spelling", () => {
    const res = validateNameTokenPreservation(
      "VICENTE ESCOBAR MARIN",
      "Vicente",
      "Escobar Marina"
    );
    expect(res.valid).toBe(false);
  });
});
