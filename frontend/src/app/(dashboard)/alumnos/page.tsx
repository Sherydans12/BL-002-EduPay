"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { studentsApi, downloadBlob } from "@/lib/api";
import type { StudentStatus } from "@/lib/api";
import { fetchAllCourses, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Student, Course, Guardian } from "@/lib/api";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, TriangleAlert } from "lucide-react";
import { StudentFormDialog } from "@/components/student-form-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LIMIT = 20;

const STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  GRADUATED: "Egresado",
};

const STATUS_BADGE_VARIANT: Record<StudentStatus, "success" | "destructive" | "secondary"> = {
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
  const prevDebouncedSearch = useRef<string | null>(null);
  const prevFilters = useRef<{ course: string; status: string } | null>(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: LIMIT, lastPage: 1 });

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

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await studentsApi.getAll({
          courseId: courseFilter ? Number(courseFilter) : undefined,
          status: (statusFilter as StudentStatus) || undefined,
          page,
          limit: LIMIT,
          search: debouncedSearch || undefined,
        });
        if (cancelled) return;
        setStudents(res.data);
        setMeta({
          total: res.meta.total,
          page: res.meta.page,
          limit: res.meta.limit,
          lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Error al cargar alumnos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, courseFilter, statusFilter]);

  const reloadCurrentStudents = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getAll({
        courseId: courseFilter ? Number(courseFilter) : undefined,
        status: (statusFilter as StudentStatus) || undefined,
        page,
        limit: LIMIT,
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
      toast.error(err instanceof Error ? err.message : "Error al cargar alumnos");
    } finally {
      setLoading(false);
    }
  };

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
      await reloadCurrentStudents();
    } else {
      setPage(1);
      if (page === 1) await reloadCurrentStudents();
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await studentsApi.delete(deleteId);
      toast.success("Alumno eliminado exitosamente");
      await reloadCurrentStudents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar alumno");
    } finally {
      setDeleteId(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel...");
    try {
      const blob = await studentsApi.export(courseFilter ? Number(courseFilter) : undefined);
      downloadBlob(blob, `alumnos_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("Descarga completada", { id: toastId });
    } catch {
      toast.error("Error al exportar", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Alumnos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de alumnos del colegio</p>
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
            + Nuevo Alumno
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
        <input
          type="text"
          placeholder="Buscar alumno por nombre o RUT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:flex-1 md:min-w-[200px] px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all text-sm"
        />
        <NativeSelectField className="w-full md:w-52">
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
          >
            <option value="">Todos los cursos</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </NativeSelectField>
        <NativeSelectField className="w-full md:w-44">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
        </NativeSelectField>
        <span className="text-sm text-[var(--color-text-muted)] shrink-0">{meta.total} alumnos en total</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay alumnos que coincidan con la búsqueda</div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                  <th className="px-6 py-4 whitespace-nowrap">RUT</th>
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Curso</th>
                  <th className="px-6 py-4">Apoderado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                    <td className="px-6 py-4 text-sm font-mono tabular-nums text-[var(--color-text-secondary)] whitespace-nowrap">{s.rut}</td>
                    <td className="px-6 py-4 font-medium text-white">{s.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={STATUS_BADGE_VARIANT[s.status ?? "ACTIVE"]}>
                        {STATUS_LABELS[s.status ?? "ACTIVE"]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-300 whitespace-nowrap">
                        {s.course.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                      <span className="inline-flex items-center gap-2">
                        {s.guardian?.name ?? "—"}
                        {needsGuardianAlert(s) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-amber-400 cursor-help">
                                <TriangleAlert className="w-4 h-4" aria-hidden />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Falta regularizar apoderado</TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/alumnos/${s.id}/finanzas`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 px-2.5 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                              aria-label={`Ver ficha financiera de ${s.name}`}
                            >
                              <FileText className="h-4 w-4" />
                              Ficha
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>Ver Ficha Financiera</TooltipContent>
                        </Tooltip>
                        <button onClick={() => openEditDialog(s)} className="text-sm text-[var(--color-primary)] hover:underline">
                          Editar
                        </button>
                        <button onClick={() => setDeleteId(s.id)} className="text-sm text-red-400 hover:underline">
                          Eliminar
                        </button>
                      </div>
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

      <StudentFormDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        courses={courses}
        guardians={guardians}
        editingStudent={editingStudent}
        onSaved={handleStudentSaved}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción no se puede deshacer. Se eliminará permanentemente este alumno y sus pagos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white border-0">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
