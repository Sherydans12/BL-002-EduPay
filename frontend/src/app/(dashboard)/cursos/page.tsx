"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { coursesApi, downloadBlob } from "@/lib/api";
import type { CourseWithStats } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  GraduationCap,
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/currency-utils";

const courseSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "Máximo 100 caracteres"),
});

type CourseFormData = z.infer<typeof courseSchema>;

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
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
  const [editingCourse, setEditingCourse] = useState<CourseWithStats | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const res = await coursesApi.getAll(
        page,
        pageSize,
        debouncedSearch || undefined,
      );
      setCourses(res.data);
      setMeta({
        total: res.meta.total,
        page: res.meta.page,
        limit: res.meta.limit,
        lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
      });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar los cursos",
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
    void loadCourses();
  }, [page, pageSize, debouncedSearch]);

  const openCreateDialog = () => {
    setEditingCourse(null);
    reset({ name: "" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (course: CourseWithStats) => {
    setEditingCourse(course);
    reset({ name: course.name });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: CourseFormData) => {
    setIsSubmitting(true);
    try {
      if (editingCourse) {
        await coursesApi.update(editingCourse.id, data);
        toast.success("Curso actualizado con éxito");
      } else {
        await coursesApi.create(data);
        toast.success("Curso creado con éxito");
      }
      setIsDialogOpen(false);
      await loadCourses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el curso");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await coursesApi.delete(deleteId);
      toast.success("Curso eliminado con éxito");
      setDeleteId(null);
      await loadCourses();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar el curso",
      );
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await coursesApi.export();
      const date = new Date().toISOString().split("T")[0];
      downloadBlob(blob, `cursos_${date}.xlsx`);
      toast.success("Archivo descargado correctamente");
    } catch {
      toast.error("Error al exportar los cursos");
    } finally {
      setIsExporting(false);
    }
  };

  // KPIs aggregation
  const totals = useMemo(() => {
    const totalStudents = courses.reduce((s, c) => s + c.activeStudents, 0);
    const totalExpected = courses.reduce((s, c) => s + c.expectedRevenue, 0);
    const totalCollected = courses.reduce(
      (s, c) => s + (c.collectedRevenue ?? 0),
      0,
    );
    const totalOverdue = courses.reduce((s, c) => s + c.overdueDebt, 0);
    const overallRate =
      totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 100;

    return { totalStudents, totalExpected, totalCollected, totalOverdue, overallRate };
  }, [courses]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
      {/* Cabecera Superior */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <GraduationCap className="size-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Gestión de Cursos
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Organización de niveles académicos, métricas de recaudación y nóminas de alumnos
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={handleExport}
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
            Nuevo Curso
          </Button>
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Total de Cursos Activos
          </span>
          <p className="mt-2 text-2xl font-bold text-white">
            {meta.total}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            {totals.totalStudents} alumnos en total
          </p>
        </div>

        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Facturación Proyectada
          </span>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {formatCLP(totals.totalExpected)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Compromiso anual de cursos
          </p>
        </div>

        <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
          <span className="text-xs font-medium text-emerald-300">
            Recaudación en Caja
          </span>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-400">
            {formatCLP(totals.totalCollected)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${totals.overallRate}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold text-emerald-300">
              {totals.overallRate}%
            </span>
          </div>
        </div>

        <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-4 shadow-sm">
          <span className="text-xs font-medium text-red-300">
            Morosidad Global
          </span>
          <p className="mt-2 font-mono text-2xl font-bold text-red-400">
            {formatCLP(totals.totalOverdue)}
          </p>
          <p className="mt-1 text-[11px] text-red-300/80">
            Cuotas vencidas pendientes
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por nombre de curso..."
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
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-white outline-none"
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
        </div>
      </div>

      {/* Tabla de Cursos */}
      <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-[var(--color-text-muted)]">
            <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
            <p className="mt-2 text-xs">Cargando cursos y métricas...</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="py-20 text-center text-[var(--color-text-muted)]">
            <GraduationCap className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
            <p className="mt-3 text-sm font-semibold text-white">
              No se encontraron cursos
            </p>
            <p className="mt-1 text-xs">
              Prueba modificando el término de búsqueda o crea un nuevo curso.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--color-bg)] shadow-sm">
                  <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-6 py-3.5">Nombre del Curso</th>
                    <th className="px-6 py-3.5 text-center">Alumnos</th>
                    <th className="px-6 py-3.5 text-right">Facturado Proyectado</th>
                    <th className="px-6 py-3.5 text-right text-emerald-400">Recaudado</th>
                    <th className="px-6 py-3.5 text-right text-red-400">Morosidad</th>
                    <th className="px-6 py-3.5 text-center">Tasa Cobranza</th>
                    <th className="px-6 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {courses.map((course) => {
                    const rate =
                      course.collectionRate ??
                      (course.expectedRevenue > 0
                        ? Math.round(
                            ((course.collectedRevenue ?? 0) /
                              course.expectedRevenue) *
                              100,
                          )
                        : 100);

                    return (
                      <tr
                        key={course.id}
                        className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`/cursos/${course.id}`}
                            className="inline-flex items-center gap-1.5 font-bold text-white hover:text-[var(--color-primary)] transition-colors"
                          >
                            <span>{course.name}</span>
                            <ArrowUpRight className="size-3 text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <Badge className="border-blue-500/30 bg-blue-500/15 text-[11px] text-blue-300">
                            {course.activeStudents} alumno(s)
                          </Badge>
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-medium text-[var(--color-text-secondary)]">
                          {formatCLP(course.expectedRevenue)}
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                          {formatCLP(course.collectedRevenue ?? 0)}
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-red-400">
                          {course.overdueDebt > 0
                            ? formatCLP(course.overdueDebt)
                            : "$0"}
                        </td>

                        <td className="px-6 py-4">
                          <div className="mx-auto flex max-w-[120px] items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-white">
                              {rate}%
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/cursos/${course.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--color-surface-hover)]"
                            >
                              Ver Alumnos
                            </Link>

                            <button
                              type="button"
                              onClick={() => openEditDialog(course)}
                              className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-white transition-colors"
                              title="Editar curso"
                            >
                              <Pencil className="size-3.5 text-blue-400" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteId(course.id)}
                              className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/15 hover:text-red-300 transition-colors"
                              title="Eliminar curso"
                            >
                              <Trash2 className="size-3.5 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {meta.lastPage > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4 text-xs">
                <span className="text-[var(--color-text-muted)]">
                  Mostrando página {meta.page} de {meta.lastPage} ({meta.total} cursos en total)
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

      {/* Modal Crear / Editar Curso */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl">
          <DialogHeader className="border-b border-[var(--color-border)]/80 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <GraduationCap className="size-5 text-blue-400" />
              <span>{editingCourse ? "Editar Curso" : "Nuevo Curso"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Nombre del Curso *
              </label>
              <input
                {...register("name")}
                placeholder="Ej: 1° Básico A"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.name && (
                <p className="mt-1 text-[11px] text-red-400">{errors.name.message}</p>
              )}
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
                  <CheckCircle2 className="size-3.5" />
                )}
                {editingCourse ? "Guardar Cambios" : "Crear Curso"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alerta de Confirmación de Eliminación */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-[var(--color-surface)] border-[var(--color-border)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">¿Eliminar curso?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción no se puede deshacer. Los alumnos asociados deberán ser reasignados.
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
