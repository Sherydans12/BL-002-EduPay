"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { formatRut, sanitizeRutInput, isValidRut } from "@/lib/rut";
import { studentsApi } from "@/lib/api";
import type { Student, Course, Guardian, StudentStatus } from "@/lib/api";
import {
  User,
  GraduationCap,
  ShieldCheck,
  Users,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface EditStudentFinancialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  courses: Course[];
  guardians: Guardian[];
  onSaved: () => void | Promise<void>;
}

interface StudentFormValues {
  firstName: string;
  lastName: string;
  rut: string;
  courseId: number;
  guardianId: number;
  status: StudentStatus;
}

export function EditStudentFinancialDialog({
  open,
  onOpenChange,
  student,
  courses,
  guardians,
  onSaved,
}: EditStudentFinancialDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StudentFormValues>();

  const selectedGuardianId = watch("guardianId");

  useEffect(() => {
    if (!open || !student) return;

    // Split name if firstName/lastName not available
    let fName = student.firstName ?? "";
    let lName = student.lastName ?? "";
    if (!fName && !lName && student.name) {
      const parts = student.name.trim().split(/\s+/);
      if (parts.length > 2) {
        fName = parts.slice(0, -2).join(" ");
        lName = parts.slice(-2).join(" ");
      } else if (parts.length === 2) {
        fName = parts[0];
        lName = parts[1];
      } else {
        fName = student.name;
      }
    }

    reset({
      firstName: fName,
      lastName: lName,
      rut: student.rut ? formatRut(student.rut) : "",
      courseId: student.courseId,
      guardianId: student.guardianId,
      status: student.status ?? "ACTIVE",
    });
  }, [open, student, reset]);

  // Siblings calculation
  const siblings = (student?.guardian?.students ?? []).filter(
    (s) => Number(s.id) !== Number(student?.id),
  );

  const selectedGuardian = guardians.find((g) => g.id === Number(selectedGuardianId));

  const onSubmit = async (values: StudentFormValues) => {
    if (!student) return;

    const formattedRut = formatRut(values.rut);
    if (formattedRut && !isValidRut(formattedRut)) {
      toast.error("El RUT ingresado no es válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      await studentsApi.update(student.id, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        rut: formattedRut,
        courseId: Number(values.courseId),
        guardianId: Number(values.guardianId),
        status: values.status,
      });

      toast.success("Información del alumno actualizada con éxito");
      await onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar alumno",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl">
        <DialogHeader className="border-b border-[var(--color-border)]/80 pb-3.5">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-white">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <User className="size-5" />
            </div>
            <span>Editar Información del Alumno</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Alerta de Contexto Familiar */}
          {siblings.length > 0 && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 text-xs text-blue-200 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-blue-300">
                <Users className="size-4" />
                <span>Grupo Familiar / Hermanos en el Colegio ({siblings.length})</span>
              </div>
              <p className="text-[11px] text-blue-200/90">
                Este alumno comparte apoderado ({student.guardian?.name}) con los siguientes estudiantes:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {siblings.map((sib) => (
                  <span
                    key={sib.id}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-500/20 px-2 py-0.5 font-medium text-white border border-blue-500/40 text-[11px]"
                  >
                    {sib.name}
                    {sib.course && (
                      <span className="text-blue-300">({sib.course.name})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Nombres */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Nombres *
              </label>
              <input
                {...register("firstName", { required: "Nombres requeridos" })}
                placeholder="Ej: Tomás Ignacio"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.firstName && (
                <p className="mt-1 text-[11px] text-red-400">
                  {errors.firstName.message}
                </p>
              )}
            </div>

            {/* Apellidos */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Apellidos *
              </label>
              <input
                {...register("lastName", { required: "Apellidos requeridos" })}
                placeholder="Ej: Fuentes Castro"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.lastName && (
                <p className="mt-1 text-[11px] text-red-400">
                  {errors.lastName.message}
                </p>
              )}
            </div>

            {/* RUT */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                RUT del Alumno *
              </label>
              <input
                {...register("rut", { required: "RUT requerido" })}
                placeholder="12.345.678-9"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs font-mono text-white focus:border-[var(--color-primary)] outline-none"
                onChange={(e) => {
                  const val = sanitizeRutInput(e.target.value);
                  setValue("rut", val);
                }}
                onBlur={(e) => {
                  const val = formatRut(e.target.value);
                  setValue("rut", val, { shouldValidate: true });
                }}
              />
              {errors.rut && (
                <p className="mt-1 text-[11px] text-red-400">
                  {errors.rut.message}
                </p>
              )}
            </div>

            {/* Curso */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Curso *
              </label>
              <NativeSelectField>
                <select
                  {...register("courseId", { required: "Curso requerido" })}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
              {errors.courseId && (
                <p className="mt-1 text-[11px] text-red-400">
                  {errors.courseId.message}
                </p>
              )}
            </div>

            {/* Apoderado Asignado */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Apoderado Titular / Tutor *
              </label>
              <NativeSelectField>
                <select
                  {...register("guardianId", { required: "Apoderado requerido" })}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white outline-none"
                >
                  {guardians.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} {g.rut ? `(RUT: ${g.rut})` : ""}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
              {selectedGuardian && (
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  Contacto: {selectedGuardian.email || "Sin email"} &bull; {selectedGuardian.phone || "Sin teléfono"}
                </p>
              )}
            </div>

            {/* Estado de Matrícula */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Estado de Matrícula
              </label>
              <NativeSelectField>
                <select
                  {...register("status")}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white outline-none"
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo / Retirado</option>
                  <option value="GRADUATED">Egresado</option>
                </select>
              </NativeSelectField>
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--color-border)]/80 pt-4 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="gap-2 text-xs bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
