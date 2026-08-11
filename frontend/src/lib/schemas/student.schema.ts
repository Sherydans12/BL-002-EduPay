import * as z from "zod";
import { isValidRut } from "@/lib/rut";

export const studentSchema = z.object({
  rut: z
    .string()
    .min(1, "El RUT es requerido")
    .refine(
      (value) => isValidRut(value),
      "RUT inválido (formato: 12.345.678-9)",
    ),
  firstName: z
    .string()
    .trim()
    .min(1, "Los nombres son requeridos")
    .max(100, "Máximo 100 caracteres"),
  lastName: z
    .string()
    .trim()
    .min(1, "Los apellidos son requeridos")
    .max(100, "Máximo 100 caracteres"),
  courseId: z.number().min(1, "Seleccione un curso"),
  guardianId: z.number().min(1, "Seleccione un apoderado"),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED"]),
});

export type StudentFormData = z.infer<typeof studentSchema>;
