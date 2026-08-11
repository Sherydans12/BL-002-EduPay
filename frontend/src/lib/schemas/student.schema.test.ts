import { describe, expect, it } from "vitest";
import { studentSchema } from "./student.schema";

const validStudent = {
  rut: "12.345.678-5",
  firstName: "María José",
  lastName: "Pérez Soto",
  courseId: 1,
  guardianId: 1,
  status: "ACTIVE" as const,
};

describe("studentSchema", () => {
  it("requires both validated structured name fields", () => {
    expect(studentSchema.safeParse(validStudent).success).toBe(true);
    expect(
      studentSchema.safeParse({ ...validStudent, firstName: "" }).success,
    ).toBe(false);
    expect(
      studentSchema.safeParse({ ...validStudent, lastName: "   " }).success,
    ).toBe(false);
  });

  it("trims structured names before submission", () => {
    const result = studentSchema.parse({
      ...validStudent,
      firstName: "  María José ",
      lastName: " Pérez Soto  ",
    });
    expect(result.firstName).toBe("María José");
    expect(result.lastName).toBe("Pérez Soto");
  });
});
