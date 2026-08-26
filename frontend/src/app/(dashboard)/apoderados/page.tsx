"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { guardiansApi, downloadBlob } from "@/lib/api";
import type { Guardian, Student } from "@/lib/api";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  UserCheck,
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Mail,
  Phone,
  ArrowUpRight,
  Loader2,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { formatRut, sanitizeRutInput } from "@/lib/rut";
import {
  guardianSchema,
  type GuardianFormData,
} from "@/lib/schemas/guardian.schema";
import { fetchAllStudents } from "@/lib/fetch-all-pages";
import { cmdkPersonFilter } from "@/lib/flexible-search";
import { formatCLP } from "@/lib/currency-utils";

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const prevDebouncedSearch = useRef<string | null>(null);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: 20,
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

  const loadGuardians = async () => {
    setLoading(true);
    try {
      const res = await guardiansApi.getAll(
        page,
        pageSize,
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
    const searchChanged =
      prevDebouncedSearch.current !== null &&
      prevDebouncedSearch.current !== debouncedSearch;

    if (searchChanged && page !== 1) {
      setPage(1);
      return;
    }

    prevDebouncedSearch.current = debouncedSearch;
    void loadGuardians();
  }, [page, pageSize, debouncedSearch]);

  const loadStudentsForPicker = async () => {
    if (allStudents.length > 0) return;
    setStudentsLoading(true);
    try {
      const data = await fetchAllStudents();
      setAllStudents(data);
    } catch {
      toast.error("Error al cargar lista de alumnos");
    } finally {
      setStudentsLoading(false);
    }
  };

  const openCreateDialog = async () => {
    setEditingGuardian(null);
    reset({ rut: "", name: "", email: "", phone: "", studentIds: [] });
    setIsDialogOpen(true);
    void loadStudentsForPicker();
  };

  const openEditDialog = async (g: Guardian) => {
    setEditingGuardian(g);
    try {
      const detail = await guardiansApi.getOne(g.id);
      const studentIds = (detail.students ?? []).map((s) => s.id);
      reset({
        rut: g.rut ? formatRut(g.rut) : "",
        name: g.name,
        email: g.email ?? "",
        phone: g.phone ?? "",
        studentIds,
      });
    } catch {
      reset({
        rut: g.rut ? formatRut(g.rut) : "",
        name: g.name,
        email: g.email ?? "",
        phone: g.phone ?? "",
        studentIds: g.students.map((s) => Number(s.id)),
      });
    }
    setIsDialogOpen(true);
    void loadStudentsForPicker();
  };

  const onSubmit = async (data: GuardianFormData) => {
    setIsSubmitting(true);
    const payload = {
      ...data,
      rut: data.rut ? formatRut(data.rut) : undefined,
      email: data.email?.trim() || undefined,
      phone: data.phone?.trim() || undefined,
    };
    try {
      if (editingGuardian) {
        await guardiansApi.update(editingGuardian.id, payload);
        toast.success("Apoderado actualizado con éxito");
      } else {
        await guardiansApi.create(payload);
        toast.success("Apoderado creado con éxito");
      }
      setIsDialogOpen(false);
      await loadGuardians();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar apoderado",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await guardiansApi.delete(deleteId);
      toast.success("Apoderado eliminado con éxito");
      await loadGuardians();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar apoderado",
      );
    } finally {
      setDeleteId(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel con lista de apoderados...");
    try {
      const blob = await guardiansApi.export();
      downloadBlob(
        blob,
        `apoderados_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Descarga completada con éxito", { id: toastId });
    } catch {
      toast.error("Error al exportar apoderados", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // KPIs
  const multiChildFamilies = useMemo(
    () => guardians.filter((g) => g.students.length > 1).length,
    [guardians],
  );
  const totalFamilyDebt = useMemo(
    () => guardians.reduce((sum, g) => sum + (g.familyOverdueDebt ?? 0), 0),
    [guardians],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
      {/* Cabecera Superior */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <UserCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Directorio de Apoderados
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Gestión de tutores, grupos familiares y control de deuda consolidada
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="gap-2 text-xs border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)]"
          >
            {isExporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5 text-emerald-400" />
            )}
            Exportar Excel
          </Button>

          <Button
            onClick={openCreateDialog}
            className="gap-2 text-xs bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-blue-600/20"
          >
            <Plus className="size-3.5" />
            Nuevo Apoderado
          </Button>
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Total Apoderados Registrados
          </span>
          <p className="mt-2 text-2xl font-bold text-white">{meta.total}</p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Tutores en el sistema
          </p>
        </div>

        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-blue-300">
            Familias con Hermanos
          </span>
          <p className="mt-2 text-2xl font-bold text-blue-400">
            {multiChildFamilies}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Con 2 o más alumnos a cargo
          </p>
        </div>

        <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-4 shadow-sm">
          <span className="text-xs font-medium text-red-300">
            Deuda Familiar Visible
          </span>
          <p className="mt-2 font-mono text-2xl font-bold text-red-400">
            {formatCLP(totalFamilyDebt)}
          </p>
          <p className="mt-1 text-[11px] text-red-300/80">
            Morosidad acumulada en pantalla
          </p>
        </div>

        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-emerald-300">
            Canales de Cobranza
          </span>
          <div className="mt-2 flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-white">
              <Mail className="size-3.5 text-blue-400" /> Email
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-white">
              <Phone className="size-3.5 text-emerald-400" /> Teléfono
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Notificaciones activas
          </p>
        </div>
      </div>

      {/* Buscador y Paginación */}
      <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar apoderado por nombre o RUT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-9 pr-3 text-xs text-white placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] outline-none"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>Mostrar:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-white outline-none"
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
        </div>
      </div>

      {/* Tabla de Apoderados */}
      <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-[var(--color-text-muted)]">
            <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
            <p className="mt-2 text-xs">Cargando directorio de apoderados...</p>
          </div>
        ) : guardians.length === 0 ? (
          <div className="py-20 text-center text-[var(--color-text-muted)]">
            <UserCheck className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
            <p className="mt-3 text-sm font-semibold text-white">
              No se encontraron apoderados
            </p>
            <p className="mt-1 text-xs">
              Prueba modificando los términos de búsqueda.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full min-w-[950px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--color-bg)] shadow-sm">
                  <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-6 py-3.5">Apoderado Titular</th>
                    <th className="px-6 py-3.5 whitespace-nowrap">RUT</th>
                    <th className="px-6 py-3.5">Contacto</th>
                    <th className="px-6 py-3.5">Alumnos a Cargo (Grupo Familiar)</th>
                    <th className="px-6 py-3.5 text-right">Deuda Familiar</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {guardians.map((g) => (
                    <tr
                      key={g.id}
                      className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                    >
                      {/* Nombre */}
                      <td className="px-6 py-4">
                        <span className="font-bold text-white text-sm">
                          {g.name}
                        </span>
                      </td>

                      {/* RUT */}
                      <td className="px-6 py-4 font-mono text-[var(--color-text-secondary)] whitespace-nowrap">
                        {g.rut ? formatRut(g.rut) : "—"}
                      </td>

                      {/* Contacto */}
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {g.email ? (
                            <div className="flex items-center gap-1.5 text-white">
                              <Mail className="size-3 text-blue-400 shrink-0" />
                              <span className="truncate max-w-[180px]">{g.email}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[var(--color-text-muted)] italic">
                              Sin email
                            </span>
                          )}
                          {g.phone && (
                            <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                              <Phone className="size-3 text-emerald-400 shrink-0" />
                              <span>{g.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Grupo Familiar / Alumnos a cargo */}
                      <td className="px-6 py-4">
                        {g.students.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                            {g.students.map((student) => (
                              <Link
                                key={student.id}
                                href={`/alumnos/${student.id}/finanzas`}
                                className="group/student inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-white hover:border-blue-400 hover:bg-blue-500/15 transition-all"
                              >
                                <span>{student.name}</span>
                                {student.course && (
                                  <span className="text-[10px] text-blue-300 font-normal">
                                    ({student.course.name})
                                  </span>
                                )}
                                {student.overdueDebt > 0 && (
                                  <span className="font-mono text-[10px] text-red-400 font-bold ml-1">
                                    {formatCLP(student.overdueDebt)}
                                  </span>
                                )}
                                <ArrowUpRight className="size-2.5 text-blue-400 opacity-0 group-hover/student:opacity-100 transition-opacity" />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--color-text-muted)] italic">
                            Sin alumnos asignados
                          </span>
                        )}
                      </td>

                      {/* Deuda Familiar */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {g.familyOverdueDebt > 0 ? (
                          <span className="font-mono font-bold text-red-400 text-sm">
                            {formatCLP(g.familyOverdueDebt)}
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-400 text-xs">
                            Al día
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(g)}
                            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-white transition-colors"
                            title="Editar apoderado"
                          >
                            <Pencil className="size-3.5 text-blue-400" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteId(g.id)}
                            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/15 hover:text-red-300 transition-colors"
                            title="Eliminar apoderado"
                          >
                            <Trash2 className="size-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta.lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4 text-xs">
                <span className="text-[var(--color-text-muted)]">
                  Mostrando página {meta.page} de {meta.lastPage} ({meta.total} apoderados en total)
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[var(--color-border)] text-white"
                  >
                    ← Anterior
                  </Button>
                  <Button
                    disabled={page >= meta.lastPage}
                    onClick={() => setPage((p) => p + 1)}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[var(--color-border)] text-white"
                  >
                    Siguiente →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Crear / Editar Apoderado */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl">
          <DialogHeader className="border-b border-[var(--color-border)]/80 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <UserCheck className="size-5 text-emerald-400" />
              <span>{editingGuardian ? "Editar Apoderado" : "Nuevo Apoderado"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                  Nombre Completo *
                </label>
                <input
                  {...register("name")}
                  placeholder="Ej: Carolina Fuentes Morales"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                />
                {errors.name && (
                  <p className="mt-1 text-[11px] text-red-400">{errors.name.message}</p>
                )}
              </div>

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
                {errors.rut && (
                  <p className="mt-1 text-[11px] text-red-400">{errors.rut.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                  Teléfono de Contacto
                </label>
                <input
                  {...register("phone")}
                  placeholder="+56 9 1234 5678"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                  Correo Electrónico (Para notificaciones de cobranza y boletas)
                </label>
                <input
                  {...register("email")}
                  type="email"
                  placeholder="ejemplo@apoderado.cl"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                />
              </div>

              {/* Selector de Alumnos a Cargo */}
              <div className="sm:col-span-2 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Alumnos a Cargo (Grupo Familiar)
                </label>

                <Controller
                  name="studentIds"
                  control={control}
                  render={({ field }) => {
                    const selectedIds = field.value ?? [];
                    const selectedStudents = allStudents.filter((s) =>
                      selectedIds.includes(s.id),
                    );

                    const toggleStudent = (id: number) => {
                      const exists = selectedIds.includes(id);
                      const next = exists
                        ? selectedIds.filter((x) => x !== id)
                        : [...selectedIds, id];
                      field.onChange(next);
                    };

                    return (
                      <div className="space-y-2">
                        <Popover
                          open={studentPickerOpen}
                          onOpenChange={setStudentPickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-left text-xs text-white focus:border-[var(--color-primary)] outline-none flex items-center justify-between"
                            >
                              <span className="text-[var(--color-text-muted)]">
                                {studentsLoading
                                  ? "Cargando alumnos..."
                                  : "Buscar e incorporar alumnos a este apoderado..."}
                              </span>
                              <DropdownChevron />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0 z-[60] bg-[var(--color-surface)] border-[var(--color-border)] text-white">
                            <Command
                              filter={cmdkPersonFilter}
                              className="bg-transparent"
                            >
                              <CommandInput
                                placeholder="Buscar alumno por nombre o RUT..."
                                className="border-none focus:ring-0 text-xs"
                              />
                              <CommandList className="max-h-56">
                                <CommandEmpty>No se encontró el alumno.</CommandEmpty>
                                <CommandGroup>
                                  {allStudents.map((s) => {
                                    const isSelected = selectedIds.includes(s.id);
                                    return (
                                      <CommandItem
                                        key={s.id}
                                        value={`${s.name}\t${s.rut ?? ""}`}
                                        onSelect={() => toggleStudent(s.id)}
                                        className="cursor-pointer text-xs"
                                      >
                                        <div className="flex items-center justify-between w-full">
                                          <div>
                                            <span className="font-semibold text-white">{s.name}</span>
                                            <span className="text-[10px] text-blue-300 ml-1.5">
                                              ({s.course?.name})
                                            </span>
                                          </div>
                                          {isSelected && (
                                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                                              Asignado
                                            </Badge>
                                          )}
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {/* Chips de Alumnos Seleccionados */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedStudents.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/20 px-2.5 py-1 text-xs font-semibold text-white"
                            >
                              {s.name} ({s.course?.name})
                              <button
                                type="button"
                                onClick={() => toggleStudent(s.id)}
                                className="ml-1 text-blue-300 hover:text-white"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            </div>

            <DialogFooter className="border-t border-[var(--color-border)]/80 pt-4 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
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
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserCheck className="size-3.5" />
                )}
                {editingGuardian ? "Guardar Cambios" : "Crear Apoderado"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alerta de Eliminación */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent className="bg-[var(--color-surface)] border-[var(--color-border)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              ¿Eliminar apoderado?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción eliminará al apoderado del sistema. Si tiene alumnos a cargo, deberán ser reasignados a otro tutor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--color-border)] bg-[var(--color-surface)] text-white hover:bg-[var(--color-surface-hover)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
