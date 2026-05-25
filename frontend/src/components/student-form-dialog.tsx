"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { studentsApi } from "@/lib/api";
import type { Student, Course, Guardian, StudentStatus } from "@/lib/api";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownChevron } from "@/components/ui/dropdown-chevron";
import { cmdkCourseFilter, cmdkPersonFilter } from "@/lib/flexible-search";
import { formatRut, isValidRut, sanitizeRutInput } from "@/lib/rut";

const studentSchema = z.object({
  rut: z
    .string()
    .min(1, "El RUT es requerido")
    .refine((val) => isValidRut(val), "RUT inválido (formato: 12.345.678-9)"),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  courseId: z.number().min(1, "Seleccione un curso"),
  guardianId: z.number().min(1, "Seleccione un apoderado"),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED"]),
});

export type StudentFormData = z.infer<typeof studentSchema>;

export type StudentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  guardians: Guardian[];
  /** null = crear alumno */
  editingStudent: Student | null;
  /** Si se crea desde la vista de un curso, preselecciona el curso */
  defaultCourseId?: number;
  onSaved: () => void | Promise<void>;
};

export function StudentFormDialog({
  open,
  onOpenChange,
  courses,
  guardians,
  editingStudent,
  defaultCourseId,
  onSaved,
}: StudentFormDialogProps) {
  const [courseOpen, setCourseOpen] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
  });

  useEffect(() => {
    if (!open) return;
    if (editingStudent) {
      reset({
        rut: formatRut(editingStudent.rut),
        name: editingStudent.name,
        courseId: editingStudent.courseId,
        guardianId: editingStudent.guardianId,
        status: editingStudent.status ?? "ACTIVE",
      });
    } else {
      reset({
        rut: "",
        name: "",
        courseId: defaultCourseId && defaultCourseId >= 1 ? defaultCourseId : undefined,
        guardianId: undefined,
        status: "ACTIVE" as StudentStatus,
      });
    }
  }, [open, editingStudent, defaultCourseId, reset]);

  const onSubmit = async (data: StudentFormData) => {
    setIsSubmitting(true);
    const payload = { ...data, rut: formatRut(data.rut) };
    try {
      if (editingStudent) {
        await studentsApi.update(editingStudent.id, payload);
        toast.success("Alumno actualizado exitosamente");
      } else {
        await studentsApi.create(payload);
        toast.success("Alumno creado exitosamente");
      }
      await onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{editingStudent ? "Editar Alumno" : "Nuevo Alumno"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-visible">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full md:col-span-1">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">RUT *</label>
              <input
                {...register("rut")}
                placeholder="12.345.678-9"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none"
                onChange={(e) => {
                  const sanitized = sanitizeRutInput(e.target.value);
                  setValue("rut", sanitized, { shouldValidate: false });
                }}
                onBlur={(e) => {
                  const formatted = formatRut(e.target.value);
                  setValue("rut", formatted, { shouldValidate: true });
                }}
              />
              {errors.rut && <p className="text-red-400 text-xs mt-1">{errors.rut.message}</p>}
            </div>
            <div className="col-span-full md:col-span-1">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre *</label>
              <input
                {...register("name")}
                placeholder="Nombre completo"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="col-span-full">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Curso *</label>
              <Controller
                name="courseId"
                control={control}
                render={({ field }) => (
                  <Popover open={courseOpen} onOpenChange={setCourseOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex items-center gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {field.value ? courses.find((c) => c.id === field.value)?.name : "Seleccionar curso..."}
                        </span>
                        <DropdownChevron />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[450px] p-0 z-[60]">
                      <Command filter={cmdkCourseFilter} className="bg-transparent">
                        <CommandInput placeholder="Buscar curso..." className="border-none focus:ring-0" />
                        <CommandList>
                          <CommandEmpty>No se encontró el curso.</CommandEmpty>
                          <CommandGroup>
                            {courses.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => {
                                  field.onChange(c.id);
                                  setCourseOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                {c.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.courseId && <p className="text-red-400 text-xs mt-1">{errors.courseId.message}</p>}
            </div>

            <div className="col-span-full">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Apoderado *</label>
              <Controller
                name="guardianId"
                control={control}
                render={({ field }) => (
                  <Popover open={guardianOpen} onOpenChange={setGuardianOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex items-center gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {field.value ? guardians.find((g) => g.id === field.value)?.name : "Seleccionar apoderado..."}
                        </span>
                        <DropdownChevron />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[450px] p-0 z-[60]">
                      <Command filter={cmdkPersonFilter} className="bg-transparent">
                        <CommandInput placeholder="Buscar apoderado por nombre o RUT..." className="border-none focus:ring-0" />
                        <CommandList>
                          <CommandEmpty>No se encontró el apoderado.</CommandEmpty>
                          <CommandGroup>
                            {guardians.map((g) => (
                              <CommandItem
                                key={g.id}
                                value={`${g.name}\t${g.rut ?? ""}`}
                                onSelect={() => {
                                  field.onChange(g.id);
                                  setGuardianOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <div className="flex flex-col">
                                  <span>{g.name}</span>
                                  {g.rut && <span className="text-xs text-[var(--color-text-muted)]">{g.rut}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.guardianId && <p className="text-red-400 text-xs mt-1">{errors.guardianId.message}</p>}
            </div>

            <div className="col-span-full">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Estado</label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <NativeSelectField>
                    <select
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value as StudentStatus)}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="INACTIVE">Inactivo</option>
                      <option value="GRADUATED">Egresado</option>
                    </select>
                  </NativeSelectField>
                )}
              />
              {errors.status && <p className="text-red-400 text-xs mt-1">{errors.status.message}</p>}
            </div>
          </div>

          <DialogFooter className="mt-6 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Guardando..." : "Guardar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
