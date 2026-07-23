import { describe, expect, it } from "vitest";
import { paymentSchema } from "./payment.schema";

const baseAllocation = {
  studentId: 1,
  conceptId: 1,
  chargeId: 1,
  amount: 75000,
};

describe("paymentSchema", () => {
  it("valida un pago simple con una allocation", () => {
    const result = paymentSchema.safeParse({
      totalAmount: 75000,
      allocations: [baseAllocation],
      method: "CASH",
      paymentDate: "2026-06-01",
      useAltPayer: false,
      guardianName: "María Pérez",
      guardianRut: "",
      guardianEmail: "",
      guardianPhone: "",
      payerName: "",
      payerRut: "",
      referenceCode: "",
      notes: "",
      boletaNumber: "",
    });

    expect(result.success).toBe(true);
  });

  it("rechaza cuando la suma de allocations no coincide con totalAmount", () => {
    const result = paymentSchema.safeParse({
      totalAmount: 80000,
      allocations: [baseAllocation],
      method: "CASH",
      paymentDate: "2026-06-01",
      useAltPayer: false,
      guardianName: "María Pérez",
    });

    expect(result.success).toBe(false);
  });

  it("exige nombre de pagador alternativo si useAltPayer es true", () => {
    const result = paymentSchema.safeParse({
      totalAmount: 75000,
      allocations: [baseAllocation],
      method: "CASH",
      paymentDate: "2026-06-01",
      useAltPayer: true,
      payerName: "",
      payerRut: "",
    });

    expect(result.success).toBe(false);
  });

  it("valida cobro agrupado de dos alumnos", () => {
    const result = paymentSchema.safeParse({
      totalAmount: 150000,
      allocations: [
        baseAllocation,
        { studentId: 2, conceptId: 1, chargeId: 2, amount: 75000 },
      ],
      method: "TRANSFER",
      paymentDate: "2026-06-01",
      useAltPayer: false,
      guardianName: "Apoderado",
    });

    expect(result.success).toBe(true);
  });
});
