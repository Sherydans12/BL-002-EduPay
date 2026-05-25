import { z } from "zod";

// ─── RUT Chileno ──────────────────────────────────────────────
const rutRegex = /^(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])$/;

function isValidRut(rut: string): boolean {
  const clean = rut.replace(/\./g, "").replace("-", "");
  if (clean.length < 8 || clean.length > 9) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();

  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }

  const expected = 11 - (sum % 11);
  const expectedDv =
    expected === 11 ? "0" : expected === 10 ? "K" : expected.toString();

  return dv === expectedDv;
}

const PAYMENT_METHODS = ["CASH", "DEBIT", "CREDIT", "CHECK", "TRANSFER"] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_PDF_TYPE = "application/pdf";

export const paymentAllocationSchema = z.object({
  studentId: z
    .number({ error: "Alumno requerido" })
    .int()
    .positive("Alumno inválido"),
  conceptId: z
    .number({ error: "Debe seleccionar un concepto" })
    .int()
    .positive("Debe seleccionar un concepto"),
  amount: z
    .number({ error: "Monto requerido" })
    .int("El monto debe ser un número entero")
    .positive("El monto debe ser mayor a 0"),
});

export const paymentSchema = z
  .object({
    totalAmount: z
      .number({ error: "El monto total es requerido" })
      .int("El monto total debe ser un número entero")
      .positive("El monto total debe ser mayor a 0"),

    allocations: z
      .array(paymentAllocationSchema)
      .min(1, "Debe incluir al menos un alumno en el pago"),

    method: z.enum(PAYMENT_METHODS, {
      error: "Método de pago inválido",
    }),

    paymentDate: z
      .string({ error: "La fecha de pago es requerida" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (use YYYY-MM-DD)")
      .refine((val) => !isNaN(Date.parse(val)), "Fecha inválida"),

    referenceCode: z.string().max(100, "Máximo 100 caracteres").optional().or(z.literal("")),
    notes: z.string().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),

    useAltPayer: z.boolean().default(false),

    payerName: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),

    payerRut: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (val) => {
          if (!val || val === "") return true;
          return rutRegex.test(val) && isValidRut(val);
        },
        { message: "RUT del pagador inválido (formato: 12.345.678-9)" }
      ),

    guardianName: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),

    guardianRut: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (val) => {
          if (!val || val === "") return true;
          return rutRegex.test(val) && isValidRut(val);
        },
        { message: "RUT del apoderado inválido (formato: 12.345.678-9)" }
      ),

    guardianEmail: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),

    guardianPhone: z.string().max(50, "Máximo 50 caracteres").optional().or(z.literal("")),

    boletaNumber: z.string().max(50, "Máximo 50 caracteres").optional().or(z.literal("")),

    boleta: z
      .instanceof(File)
      .optional()
      .refine(
        (file) => {
          if (!file) return true;
          return file.type === ACCEPTED_PDF_TYPE;
        },
        { message: "Solo se permiten archivos PDF" }
      )
      .refine(
        (file) => {
          if (!file) return true;
          return file.size <= MAX_FILE_SIZE;
        },
        { message: "El archivo no debe superar los 10 MB" }
      ),
  })
  .superRefine((data, ctx) => {
    const sum = data.allocations.reduce((acc, row) => acc + row.amount, 0);
    if (sum !== data.totalAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La suma de los montos por alumno debe coincidir con el monto total",
        path: ["totalAmount"],
      });
    }

    if (data.useAltPayer && (!data.payerName || data.payerName.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El nombre del pagador es requerido cuando paga un tercero",
        path: ["payerName"],
      });
    }

    if (!data.useAltPayer && data.allocations.length > 0) {
      const gName = data.guardianName?.trim();
      if (!gName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El nombre del apoderado es requerido",
          path: ["guardianName"],
        });
      }
      const gEmail = data.guardianEmail?.trim();
      if (gEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Correo del apoderado inválido",
          path: ["guardianEmail"],
        });
      }
    }
  });

export type PaymentFormData = z.input<typeof paymentSchema>;
export type PaymentAllocationFormData = z.infer<typeof paymentAllocationSchema>;
