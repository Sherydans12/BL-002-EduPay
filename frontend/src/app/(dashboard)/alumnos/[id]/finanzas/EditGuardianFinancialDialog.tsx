"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatRut, sanitizeRutInput, isValidRut } from "@/lib/rut";
import { guardiansApi } from "@/lib/api";
import type { Guardian, Student } from "@/lib/api";
import {
  UserCheck,
  Mail,
  Phone,
  Users,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface EditGuardianFinancialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guardian: Guardian | null;
  currentStudent: Student | null;
  onSaved: () => void | Promise<void>;
}

interface GuardianFormValues {
  name: string;
  rut: string;
  email: string;
  phone: string;
}

export function EditGuardianFinancialDialog({
  open,
  onOpenChange,
  guardian,
  currentStudent,
  onSaved,
}: EditGuardianFinancialDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<GuardianFormValues>();

  useEffect(() => {
    if (!open || !guardian) return;

    reset({
      name: guardian.name ?? "",
      rut: guardian.rut ? formatRut(guardian.rut) : "",
      email: guardian.email ?? "",
      phone: guardian.phone ?? "",
    });
  }, [open, guardian, reset]);

  // All students belonging to this guardian
  const linkedStudents = guardian?.students ?? [];

  const onSubmit = async (values: GuardianFormValues) => {
    if (!guardian) return;

    const formattedRut = formatRut(values.rut);
    if (formattedRut && !isValidRut(formattedRut)) {
      toast.error("El RUT ingresado no es válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      await guardiansApi.update(guardian.id, {
        name: values.name.trim(),
        rut: formattedRut || undefined,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
      });

      toast.success(
        "Datos del apoderado actualizados para todo el grupo familiar",
      );
      await onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar apoderado",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!guardian) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl">
        <DialogHeader className="border-b border-[var(--color-border)]/80 pb-3.5">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-white">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <UserCheck className="size-5" />
            </div>
            <span>Editar Datos del Apoderado Titular</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Tarjeta Informativa de Impacto en Alumnos / Hermanos */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-300">
              <Users className="size-4" />
              <span>
                Alumnos a cargo en el colegio ({linkedStudents.length || 1})
              </span>
            </div>
            <p className="text-[11px] text-emerald-100/90 leading-relaxed">
              Los cambios en el <strong>correo electrónico</strong> o <strong>teléfono</strong> se actualizarán inmediatamente para todas las fichas financieras y notificaciones de cobranza de los siguientes alumnos:
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {linkedStudents.length > 0 ? (
                linkedStudents.map((s) => {
                  const isCurrent = Number(s.id) === Number(currentStudent?.id);
                  return (
                    <span
                      key={s.id}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium border text-[11px] ${
                        isCurrent
                          ? "bg-emerald-500/25 border-emerald-400 text-white font-semibold"
                          : "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                      }`}
                    >
                      {s.name}
                      {s.course && (
                        <span className="text-emerald-300">({s.course.name})</span>
                      )}
                      {isCurrent && (
                        <span className="ml-0.5 text-[10px] text-emerald-300">
                          (Actual)
                        </span>
                      )}
                    </span>
                  );
                })
              ) : currentStudent ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/25 border border-emerald-400 px-2 py-0.5 font-semibold text-white text-[11px]">
                  {currentStudent.name} ({currentStudent.course?.name})
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Nombre Completo */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Nombre Completo del Apoderado *
              </label>
              <input
                {...register("name", { required: "Nombre requerido" })}
                placeholder="Ej: Carolina Fuentes Morales"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.name && (
                <p className="mt-1 text-[11px] text-red-400">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* RUT */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                RUT del Apoderado
              </label>
              <input
                {...register("rut")}
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
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Teléfono de Contacto
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  {...register("phone")}
                  placeholder="+56 9 1234 5678"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-8.5 pr-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                />
              </div>
            </div>

            {/* Email */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Correo Electrónico (Para envío de comprobantes y cobranza)
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  {...register("email")}
                  type="email"
                  placeholder="ejemplo@apoderado.cl"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-8.5 pr-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                />
              </div>
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
              className="gap-2 text-xs bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Guardar Apoderado
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
