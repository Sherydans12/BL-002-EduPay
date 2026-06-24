"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { guardiansApi, downloadBlob } from "@/lib/api";
import type { Guardian, Student } from "@/lib/api";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FileSpreadsheet, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DropdownChevron } from "@/components/ui/dropdown-chevron";
import { Badge } from "@/components/ui/badge";
import { formatRut, sanitizeRutInput } from "@/lib/rut";
import {
  guardianSchema,
  type GuardianFormData,
} from "@/lib/schemas/guardian.schema";
import { fetchAllStudents } from "@/lib/fetch-all-pages";
import { cmdkPersonFilter } from "@/lib/flexible-search";

const LIMIT = 20;

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const prevDebouncedSearch = useRef<string | null>(null);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: LIMIT,
    lastPage: 1,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<GuardianFormData>({
    resolver: zodResolver(guardianSchema),
    defaultValues: { rut: "", name: "", email: "", phone: "", studentIds: [] },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const searchChanged =
      prevDebouncedSearch.current !== null &&
      prevDebouncedSearch.current !== debouncedSearch;

    if (searchChanged && page !== 1) {
      setPage(1);
      return;
    }

    prevDebouncedSearch.current = debouncedSearch;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await guardiansApi.getAll(
          page,
          LIMIT,
          debouncedSearch || undefined,
        );
        if (cancelled) return;
        setGuardians(res.data);
        setMeta({
          total: res.meta.total,
          page: res.meta.page,
          limit: res.meta.limit,
          lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Error al cargar apoderados",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  const reloadCurrent = async () => {
    setLoading(true);
    try {
      const res = await guardiansApi.getAll(
        page,
        LIMIT,
        debouncedSearch || undefined,
      );
      setGuardians(res.data);
      setMeta({
        total: res.meta.total,
        page: res.meta.page,
        limit: res.meta.limit,
        lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
      });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar apoderados",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isDialogOpen) return;
    let cancelled = false;
    (async () => {
      setStudentsLoading(true);
      try {
        const students = await fetchAllStudents();
        if (!cancelled) setAllStudents(students);
        if (editingGuardian) {
          const full = await guardiansApi.getOne(editingGuardian.id);
          if (!cancelled) {
            setValue("studentIds", full.students?.map((s) => s.id) ?? []);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Error al cargar alumnos",
          );
        }
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, editingGuardian, setValue]);

  const openCreateDialog = () => {
    setEditingGuardian(null);
    reset({ rut: "", name: "", email: "", phone: "", studentIds: [] });
    setIsDialogOpen(true);
  };

  const openEditDialog = (g: Guardian) => {
    setEditingGuardian(g);
    reset({
      rut: g.rut ? formatRut(g.rut) : "",
      name: g.name,
      email: g.email || "",
      phone: g.phone || "",
      studentIds: [],
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: GuardianFormData) => {
    setIsSubmitting(true);
    const payload = {
      rut: data.rut ? formatRut(data.rut) : undefined,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      studentIds: data.studentIds ?? [],
    };
    try {
      if (editingGuardian) {
        await guardiansApi.update(editingGuardian.id, payload);
        toast.success("Apoderado actualizado exitosamente");
        await reloadCurrent();
      } else {
        await guardiansApi.create(payload);
        toast.success("Apoderado creado exitosamente");
        setPage(1);
        if (page === 1) await reloadCurrent();
      }
      setIsDialogOpen(false);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
        message?: string;
      };
      const raw = error.response?.data?.message;
      const backendMsg = Array.isArray(raw) ? raw.join(". ") : raw;
      toast.error(
        backendMsg ||
          (err instanceof Error ? err.message : undefined) ||
          "Error al guardar",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await guardiansApi.delete(deleteId);
      toast.success("Apoderado eliminado exitosamente");
      await reloadCurrent();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Error al eliminar. Puede tener alumnos asociados.",
      );
    } finally {
      setDeleteId(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel...");
    try {
      const blob = await guardiansApi.export();
      downloadBlob(
        blob,
        `apoderados_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Descarga completada", { id: toastId });
    } catch {
      toast.error("Error al exportar", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Apoderados</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Gestión de apoderados / tutores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-all disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isExporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <button
            onClick={openCreateDialog}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
          >
            + Nuevo Apoderado
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar apoderado por nombre o RUT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/2 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all text-sm"
        />
        <span className="text-sm text-[var(--color-text-muted)]">
          {meta.total} apoderados en total
        </span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : guardians.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            No hay apoderados que coincidan con la búsqueda
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                    <th className="px-6 py-4 whitespace-nowrap">RUT</th>
                    <th className="px-6 py-4">Nombre</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Teléfono</th>
                    <th className="px-6 py-4">Grupo Familiar</th>
                    <th className="px-6 py-4">Deuda Familiar</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {guardians.map((g) => (
                    <tr
                      key={g.id}
                      className="hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-mono tabular-nums text-[var(--color-text-secondary)] whitespace-nowrap">
                        {g.rut || "—"}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        {g.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                        {g.email || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                        {g.phone || "—"}
                      </td>
                      <td className="px-6 py-4 min-w-[280px]">
                        {g.students.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {g.students.map((student) => (
                              <Link
                                key={student.id}
                                href={`/alumnos/${student.id}/finanzas`}
                                className="block"
                              >
                                <Badge
                                  variant="outline"
                                  className="flex justify-between w-full gap-3 hover:bg-[var(--color-surface-hover)]"
                                >
                                  <span className="truncate">
                                    {student.name} - {student.course.name}
                                  </span>
                                  {student.overdueDebt > 0 && (
                                    <span className="shrink-0 font-semibold text-red-500">
                                      $
                                      {student.overdueDebt.toLocaleString(
                                        "es-CL",
                                      )}
                                    </span>
                                  )}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-[var(--color-text-muted)]">
                            Sin alumnos asociados
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {g.familyOverdueDebt > 0 ? (
                          <span className="text-lg text-red-600 font-bold">
                            ${g.familyOverdueDebt.toLocaleString("es-CL")}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--color-text-muted)]">
                            Familia al día
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditDialog(g)}
                          className="text-sm text-[var(--color-primary)] hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteId(g.id)}
                          className="text-sm text-red-400 hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={meta.page}
              totalPages={meta.lastPage}
              total={meta.total}
              limit={meta.limit}
              onPrev={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          </>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingGuardian ? "Editar Apoderado" : "Nuevo Apoderado"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  RUT
                </label>
                <input
                  {...register("rut")}
                  placeholder="12.345.678-9"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none"
                  onChange={(e) => {
                    const sanitized = sanitizeRutInput(e.target.value);
                    setValue("rut", sanitized, { shouldValidate: false });
                  }}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    setValue("rut", val ? formatRut(val) : "", {
                      shouldValidate: true,
                    });
                  }}
                />
                {errors.rut && (
                  <p className="text-red-400 text-xs mt-1">
                    {errors.rut.message}
                  </p>
                )}
              </div>
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Nombre *
                </label>
                <input
                  {...register("name")}
                  placeholder="Nombre completo"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none"
                />
                {errors.name && (
                  <p className="text-red-400 text-xs mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Email
                </label>
                <input
                  {...register("email")}
                  type="email"
                  placeholder="correo@ejemplo.cl"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none"
                />
                {errors.email && (
                  <p className="text-red-400 text-xs mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Teléfono
                </label>
                <input
                  {...register("phone")}
                  placeholder="+56 9 1234 5678"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none"
                />
                {errors.phone && (
                  <p className="text-red-400 text-xs mt-1">
                    {errors.phone.message}
                  </p>
                )}
              </div>
              <div className="col-span-full">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Alumnos Asociados
                </label>
                <Controller
                  name="studentIds"
                  control={control}
                  render={({ field }) => {
                    const selectedIds = field.value ?? [];
                    const selectedSet = new Set(selectedIds);
                    const studentById = new Map(
                      allStudents.map((s) => [s.id, s]),
                    );

                    return (
                      <div className="space-y-2">
                        <Popover
                          open={studentPickerOpen}
                          onOpenChange={setStudentPickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              disabled={studentsLoading}
                              className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex items-center gap-2 disabled:opacity-50"
                            >
                              <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                                {studentsLoading
                                  ? "Cargando alumnos..."
                                  : "Buscar alumno por nombre o RUT..."}
                              </span>
                              <DropdownChevron />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[min(450px,calc(100vw-2rem))] p-0 z-[60]"
                            align="start"
                          >
                            <Command
                              filter={cmdkPersonFilter}
                              className="bg-transparent"
                            >
                              <CommandInput placeholder="Nombre o RUT del alumno..." />
                              <CommandList>
                                <CommandEmpty>
                                  No se encontró el alumno.
                                </CommandEmpty>
                                <CommandGroup>
                                  {allStudents.map((s) => (
                                    <CommandItem
                                      key={s.id}
                                      value={`${s.name}\t${s.rut}`}
                                      disabled={selectedSet.has(s.id)}
                                      className="cursor-pointer"
                                      onSelect={() => {
                                        if (!selectedSet.has(s.id)) {
                                          field.onChange([
                                            ...selectedIds,
                                            s.id,
                                          ]);
                                        }
                                        setStudentPickerOpen(false);
                                      }}
                                    >
                                      <div className="flex flex-col">
                                        <span>{s.name}</span>
                                        <span className="text-xs text-[var(--color-text-muted)]">
                                          {s.rut} — {s.course.name}
                                          {selectedSet.has(s.id)
                                            ? " (ya asociado)"
                                            : ""}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {selectedIds.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedIds.map((id) => {
                              const student = studentById.get(id);
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                >
                                  <span className="max-w-[200px] truncate">
                                    {student
                                      ? `${student.name} (${student.rut})`
                                      : `Alumno #${id}`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      field.onChange(
                                        selectedIds.filter((sid) => sid !== id),
                                      )
                                    }
                                    className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-300 transition-colors"
                                    title="Quitar alumno"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
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

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción no se puede deshacer. Se eliminará permanentemente
              este apoderado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
