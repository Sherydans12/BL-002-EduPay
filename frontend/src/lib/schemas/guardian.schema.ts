import * as z from "zod";
import { isValidRut } from "@/lib/rut";

export const guardianSchema = z.object({
  rut: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (val) => !val || isValidRut(val),
      "RUT inválido (formato: 12.345.678-9)",
    ),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  studentIds: z.array(z.number()).optional(),
});

export type GuardianFormData = z.infer<typeof guardianSchema>;
