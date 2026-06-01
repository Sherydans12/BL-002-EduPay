import { describe, expect, it } from "vitest";
import { buildPaymentBatchFormData } from "./api";

describe("buildPaymentBatchFormData", () => {
  it("serializa allocations como JSON y montos como string", () => {
    const fd = buildPaymentBatchFormData({
      totalAmount: 150000,
      method: "CASH",
      paymentDate: "2026-06-01",
      allocations: [
        { studentId: 1, conceptId: 2, amount: 75000 },
        { studentId: 3, conceptId: 2, amount: 75000 },
      ],
      boletaNumber: " BOL-001 ",
      notes: " Mensualidad ",
    });

    expect(fd.get("totalAmount")).toBe("150000");
    expect(fd.get("method")).toBe("CASH");
    expect(fd.get("paymentDate")).toBe("2026-06-01");
    expect(fd.get("boletaNumber")).toBe("BOL-001");
    expect(fd.get("notes")).toBe("Mensualidad");

    const allocations = JSON.parse(fd.get("allocations") as string) as Array<{
      studentId: number;
      conceptId: number;
      amount: number;
    }>;

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toEqual({
      studentId: 1,
      conceptId: 2,
      amount: 75000,
    });
  });

  it("omite boletaNumber y notes vacíos", () => {
    const fd = buildPaymentBatchFormData({
      totalAmount: 75000,
      method: "DEBIT",
      paymentDate: "2026-06-01",
      allocations: [{ studentId: 1, conceptId: 1, amount: 75000 }],
      boletaNumber: "   ",
      notes: "",
    });

    expect(fd.has("boletaNumber")).toBe(false);
    expect(fd.has("notes")).toBe(false);
  });
});
