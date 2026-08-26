"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { studentsApi, downloadBlob } from "@/lib/api";
import type { StudentStatus } from "@/lib/api";
import { fetchAllCourses, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Student, Course, Guardian } from "@/lib/api";
import { toast } from "sonner";
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  FileText,
  Sparkles,
  TriangleAlert,
  Loader2,
  ArrowUpRight,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { StudentFormDialog } from "@/components/student-form-dialog";
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
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRut } from "@/lib/rut";
import { formatCLP } from "@/lib/currency-utils";

const STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  GRADUATED: "Egresado",
};

const STATUS_BADGE_VARIANT: Record<
  StudentStatus,
  "success" | "destructive" | "secondary"
> = {
  ACTIVE: "success",
  INACTIVE: "destructive",
  GRADUATED: "secondary",
};

function needsGuardianAlert(student: Student): boolean {
  if (!student.guardian) return true;
  return student.guardian.name.includes("Apoderado de");
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const prevDebouncedSearch = useRef<string | null>(null);
  const prevFilters = useRef<{ course: string; status: string } | null>(null);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: 20,
    lastPage: 1,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    Promise.all([fetchAllCourses(), fetchAllGuardians()])
      .then(([cRes, gRes]) => {
        setCourses(cRes);
        setGuardians(gRes);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getAll({
        courseId: courseFilter ? Number(courseFilter) : undefined,
        status: (statusFilter as StudentStatus) || undefined,
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
      });
      setStudents(res.data);
      setMeta({
        total: res.meta.total,
        page: res.meta.page,
        limit: res.meta.limit,
        lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
      });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar alumnos",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const searchChanged =
      prevDebouncedSearch.current !== null &&
      prevDebouncedSearch.current !== debouncedSearch;
    const filtersChanged =
      prevFilters.current !== null &&
      (prevFilters.current.course !== courseFilter ||
        prevFilters.current.status !== statusFilter);

    if ((searchChanged || filtersChanged) && page !== 1) {
      setPage(1);
      return;
    }

    prevDebouncedSearch.current = debouncedSearch;
    prevFilters.current = { course: courseFilter, status: statusFilter };
    void loadStudents();
  }, [page, pageSize, debouncedSearch, courseFilter, statusFilter]);

  const openCreateDialog = () => {
    setEditingStudent(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (s: Student) => {
    setEditingStudent(s);
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) setEditingStudent(null);
  };

  const handleStudentSaved = async () => {
    if (editingStudent) {
      await loadStudents();
    } else {
      setPage(1);
      await loadStudents();
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await studentsApi.delete(deleteId);
      toast.success("Alumno eliminado exitosamente");
      await loadStudents();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar alumno",
      );
    } finally {
      setDeleteId(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel con lista de alumnos...");
    try {
      const blob = await studentsApi.export(
        courseFilter ? Number(courseFilter) : undefined,
      );
      downloadBlob(
        blob,
        `alumnos_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Descarga completada con éxito", { id: toastId });
    } catch {
      toast.error("Error al exportar alumnos", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Quick stats
  const activeCount = useMemo(
    () => students.filter((s) => s.status === "ACTIVE" || !s.status).length,
    [students],
  );
  const setupOkCount = useMemo(
    () => students.filter((s) => s.financialSetup === "CONFIGURED").length,
    [students],
  );
  const totalOverdue = useMemo(
    () => students.reduce((sum, s) => sum + (s.overdueDebt ?? 0), 0),
    [students],
  );

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
        {/* Cabecera Superior */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                <Users className="size-5" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Directorio de Alumnos
                </h1>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Registro académico, apoderados titulares y acceso a fichas financieras
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/alumnos/pendientes"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
            >
              <Sparkles className="size-3.5" />
              Pendientes Académico
            </Link>

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
              Nuevo Alumno
            </Button>
          </div>
        </div>

        {/* KPIs Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Total Alumnos Registrados
            </span>
            <p className="mt-2 text-2xl font-bold text-white">{meta.total}</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Matrícula escolar
            </p>
          </div>

          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-emerald-300">
              Alumnos Activos
            </span>
            <p className="mt-2 text-2xl font-bold text-emerald-400">
              {activeCount}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              En ciclo escolar actual
            </p>
          </div>

          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-blue-300">
              Plan Financiero Configurado
            </span>
            <p className="mt-2 text-2xl font-bold text-blue-400">
              {setupOkCount}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Con cuotas generadas
            </p>
          </div>

          <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-4 shadow-sm">
            <span className="text-xs font-medium text-red-300">
              Morosidad Visible
            </span>
            <p className="mt-2 font-mono text-2xl font-bold text-red-400">
              {formatCLP(totalOverdue)}
            </p>
            <p className="mt-1 text-[11px] text-red-300/80">
              Cuotas vencidas en pantalla
            </p>
          </div>
        </div>

        {/* Filtros y Buscador */}
        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_200px_160px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Buscar por nombre, RUT o apoderado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-9 pr-3 text-xs text-white placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] outline-none"
              />
            </div>

            <NativeSelectField>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-white outline-none"
              >
                <option value="">Todos los cursos</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </NativeSelectField>

            <NativeSelectField>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-white outline-none"
              >
                <option value="">Todos los estados</option>
                <option value="ACTIVE">Activos</option>
                <option value="INACTIVE">Inactivos</option>
                <option value="GRADUATED">Egresados</option>
              </select>
            </NativeSelectField>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">
                Mostrar:
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-white outline-none"
              >
                <option value={10}>10 por pág.</option>
                <option value={20}>20 por pág.</option>
                <option value={50}>50 por pág.</option>
                <option value={100}>100 por pág.</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabla de Alumnos */}
        <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[var(--color-text-muted)]">
              <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
              <p className="mt-2 text-xs">Cargando directorio de alumnos...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="py-20 text-center text-[var(--color-text-muted)]">
              <Users className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
              <p className="mt-3 text-sm font-semibold text-white">
                No hay alumnos que coincidan con la búsqueda
              </p>
              <p className="mt-1 text-xs">
                Prueba ajustando los filtros de curso o estado.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full min-w-[950px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--color-bg)] shadow-sm">
                    <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      <th className="px-6 py-3.5">Alumno</th>
                      <th className="px-6 py-3.5 whitespace-nowrap">RUT</th>
                      <th className="px-6 py-3.5">Curso</th>
                      <th className="px-6 py-3.5">Apoderado Titular</th>
                      <th className="px-6 py-3.5 text-center">Estado Matrícula</th>
                      <th className="px-6 py-3.5">Situación Financiera</th>
                      <th className="px-6 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {students.map((s) => (
                      <tr
                        key={s.id}
                        className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                      >
                        {/* Nombre del Alumno */}
                        <td className="px-6 py-4">
                          <Link
                            href={`/alumnos/${s.id}/finanzas`}
                            className="group/link inline-flex items-center gap-1 font-semibold text-white hover:text-[var(--color-primary)] transition-colors"
                          >
                            <span>{s.name}</span>
                            <ArrowUpRight className="size-3 opacity-0 group-hover/link:opacity-100 text-[var(--color-primary)] transition-opacity" />
                          </Link>
                          {!s.integrationReady && (
                            <p className="mt-0.5 text-[10px] font-medium text-amber-300">
                              Completar nombres para Académico
                            </p>
                          )}
                        </td>

                        {/* RUT */}
                        <td className="px-6 py-4 font-mono text-[var(--color-text-secondary)] whitespace-nowrap">
                          {s.rut ? formatRut(s.rut) : "—"}
                        </td>

                        {/* Curso */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className="border-blue-500/30 bg-blue-500/15 text-[11px] text-blue-300">
                            {s.course.name}
                          </Badge>
                        </td>

                        {/* Apoderado */}
                        <td className="px-6 py-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-white">
                              {s.guardian?.name ?? "—"}
                            </span>
                            {needsGuardianAlert(s) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-amber-400 cursor-help">
                                    <TriangleAlert className="size-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Falta regularizar datos del apoderado
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {s.guardian?.phone && (
                            <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                              {s.guardian.phone}
                            </p>
                          )}
                        </td>

                        {/* Estado Matrícula */}
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <Badge
                            variant={
                              STATUS_BADGE_VARIANT[s.status ?? "ACTIVE"]
                            }
                            className="text-[10px]"
                          >
                            {STATUS_LABELS[s.status ?? "ACTIVE"]}
                          </Badge>
                        </td>

                        {/* Situación Financiera */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge
                              variant={
                                s.financialSetup === "CONFIGURED"
                                  ? "success"
                                  : "warning"
                              }
                              className="px-2 py-0 text-[10px]"
                            >
                              {s.financialSetup === "CONFIGURED"
                                ? "Plan Configurado"
                                : "Plan Pendiente"}
                            </Badge>
                            {s.overdueDebt > 0 ? (
                              <span className="font-mono font-bold text-red-400 text-xs">
                                {formatCLP(s.overdueDebt)}
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-medium text-[11px]">
                                Al día
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Acciones */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <Link
                              href={`/alumnos/${s.id}/finanzas`}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                            >
                              <FileText className="size-3.5" />
                              Ficha Financiera
                            </Link>

                            <button
                              type="button"
                              onClick={() => openEditDialog(s)}
                              className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-white transition-colors"
                              title="Editar datos del alumno"
                            >
                              <Pencil className="size-3.5 text-blue-400" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteId(s.id)}
                              className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/15 hover:text-red-300 transition-colors"
                              title="Eliminar alumno"
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
                    Mostrando página {meta.page} de {meta.lastPage} ({meta.total} alumnos en total)
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

        <StudentFormDialog
          open={isDialogOpen}
          onOpenChange={handleDialogOpenChange}
          courses={courses}
          guardians={guardians}
          editingStudent={editingStudent}
          onSaved={handleStudentSaved}
        />

        <AlertDialog
          open={!!deleteId}
          onOpenChange={(open) => !open && setDeleteId(null)}
        >
          <AlertDialogContent className="bg-[var(--color-surface)] border-[var(--color-border)] text-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                ¿Eliminar alumno?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[var(--color-text-secondary)]">
                Esta acción dará de baja al alumno del sistema. Su historial de pagos y cobros quedará archivado de forma segura.
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
    </TooltipProvider>
  );
}
