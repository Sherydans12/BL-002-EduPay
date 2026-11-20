import { describe, expect, it } from "vitest";

import { ApiRequestError } from "./api";
import {
  academicAuthorityState,
  canManageAcademicRecords,
} from "./academic-authority";

describe("academic authority (ADR-0028)", () => {
  it("maps the BACK answer to who manages students and courses", () => {
    expect(academicAuthorityState({ managedByAcademico: true })).toBe(
      "academico",
    );
    expect(academicAuthorityState({ managedByAcademico: false })).toBe("local");
  });

  it("keeps BL management only when the BACK lacks the route", () => {
    expect(academicAuthorityState(new ApiRequestError("Not Found", 404))).toBe(
      "local",
    );
    expect(academicAuthorityState(new ApiRequestError("Error", 500))).toBe(
      "academico",
    );
    expect(academicAuthorityState(new Error("network"))).toBe("academico");
  });

  it("shows academic actions only for BL-managed tenants", () => {
    expect(canManageAcademicRecords("local")).toBe(true);
    expect(canManageAcademicRecords("academico")).toBe(false);
    expect(canManageAcademicRecords("loading")).toBe(false);
  });
});
